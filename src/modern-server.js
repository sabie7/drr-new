const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Server } = require('socket.io');

const config = require('./config');
const logger = require('./logger');
const helpers = require('./utils/helpers');
const { getDb, connect, getAdminCredentials, healthCheck, close } = require('./db');

const SALT_ROUNDS = 10;

// ── Security hardening ────────────────────────────────────────────────────
// Uploaded files may only carry these safe extensions. Anything else (SVG
// embedded scripts, HTML, executables, etc.) is rejected outright.
const ALLOWED_UPLOAD_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'avif',
  'mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'wma', 'weba',
]);
const ALLOWED_BASE64_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);

// Canonical sniff family per user-visible extension, so magic-byte checks
// accept legit aliases (jpeg==jpg, mov/m4v/m4a==mp4, oga==ogg, weba==webm).
const SNIFF_FAMILY = {
  jpg: 'jpg', jpeg: 'jpg',
  png: 'png', gif: 'gif', webp: 'webp',
  mp4: 'mp4', m4v: 'mp4', mov: 'mp4', m4a: 'mp4',
  webm: 'webm', weba: 'webm',
  ogg: 'ogg', oga: 'ogg',
  wav: 'wav', mp3: 'mp3',
};

// Simple in-memory rate limiter (login/register/guest + CP login + getstate).
const rateBuckets = new Map(); // key:ip -> { count, reset }
function rateLimit(ip, opts, route) {
  if (!ip) return null;
  const now = Date.now();
  const def = { max: 8, windowMs: 60000 };
  const { max = def.max, windowMs = def.windowMs } = opts || {};
  const key = String(ip) + '|' + (route || 'default');
  let b = rateBuckets.get(key);
  if (!b || (now - b.reset) > windowMs) {
    b = { count: 0, reset: now + windowMs };
    rateBuckets.set(key, b);
  }
  b.count += 1;
  return { blocked: b.count > max, remaining: Math.max(0, max - b.count), reset: b.reset };
}
function cleanRateBuckets() {
  const now = Date.now();
  rateBuckets.forEach((b, k) => { if ((now - b.reset) > 60000) rateBuckets.delete(k); });
}
setInterval(cleanRateBuckets, 60000).unref();

// Only trust X-Forwarded-For when explicitly behind a proxy; otherwise the
// header is attacker-controlled and would let clients spoof rate-limit keys.
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
function clientIp(req) {
  if (TRUST_PROXY) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  }
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function socketIp(socket) {
  const h = (socket.handshake || {}).headers || {};
  if (TRUST_PROXY) {
    return (h['x-forwarded-for'] || '').split(',')[0].trim() || (socket.handshake ? socket.handshake.address : '') || 'unknown';
  }
  return (socket.handshake && socket.handshake.address) || 'unknown';
}

// Verify a Control-Panel password against the seeded admin account. The weak
// "admin123" value is no longer a code default (config.js default is ''), so an
// explicitly-configured ADMIN_PASS is honored here via its bcrypt hash.
function verifyCPPassword(pass) {
  if (!pass) return false;
  const p = String(pass);
  // Try bcrypt match against the real seeded admin hash first.
  const adminDoc = db && db.users ? (db.users.findOne({ topic: config.adminUser }) || db.users.find({}).find((u) => String(u.topic).toLowerCase() === String(config.adminUser).toLowerCase())) : null;
  if (adminDoc && adminDoc.password) {
    try { return bcrypt.compareSync(p, adminDoc.password); } catch (e) { /* fall through */ }
  }
  // Fallback to the config value (used when no admin doc exists yet).
  return config.adminPass ? p === config.adminPass : false;
}

// Allow CP access with either the admin password OR a live chat login token that
// belongs to an admin account (so opening the panel while logged in as the owner
// auto-authenticates — "ترتبط بالحساب مباشرة").
function cpAccessAllowed(pass) {
  if (verifyCPPassword(pass)) return true;
  if (!pass) return false;
  try {
    const u = findUserByToken(String(pass));
    if (!u) return false;
    return !!(u.power === 'admin' || u.isAdmin);
  } catch (e) { return false; }
}

// Strores only URLs that can be rendered safely. Everything else (quotes,
// angle brackets, backticks, javascript: URIs, control chars) is dropped.
// Relative /assets paths, https?:// URLs and bare YouTube IDs are allowed.
function sanitizeMediaUrl(raw) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw);
  s = s.replace(/[<>"'`\\]/g, '');
  s = Array.from(s).filter((ch) => ch.charCodeAt(0) > 31).join('');
  s = s.trim();
  if (!s) return null;
  if (s.length > 500) s = s.slice(0, 500);
  const lower = s.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:text/html') || lower.startsWith('vbscript:')) return null;
  if (s.startsWith('/')) return s;
  if (lower.startsWith('https://') || lower.startsWith('http://')) return s;
  // Bare conservative YouTube ID (only word/dash chars)
  if (/^[\w-]{4,40}$/.test(s)) return s;
  return null;
}
function safeMediaType(s) {
  const t = String(s || '');
  if (t === 'image' || t === 'video' || t === 'audio' || t === 'youtube' || t === 'file') return t;
  return null;
}

// Validate a username/nickname: strip control chars, forbid HTML/script that
// could break out of the message DOM, forbid reserved admin login, and cap length.
function sanitizeUsername(raw, maxLen) {
  let s = String(raw || '').replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '').trim();
  if (!s) return '';
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  if (String(s).toLowerCase() === String(config.adminUser || 'admin').toLowerCase()) return '';
  return s;
}

// Room names are rendered into innerHTML by the client, so they must never
// carry markup or attribute-breaking characters. Strip control chars, then
// encode the remaining HTML-significant characters as inert text.
function sanitizeRoomName(raw, maxLen) {
  let s = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  return escapeStoredText(s);
}

// Colors embedded into inline style="" attributes must never carry quote/semi-
// colon chars that could break out of the attribute. Accept only plain hex or
// simple rgb/hsl color tokens; anything else is dropped.
function sanitizeColor(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.length > 40) return '';
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^(rgb|rgba|hsl|hsla)\(\s*[\d.%\s,]+\)$/.test(s)) return s;
  if (/^[a-zA-Z]{1,20}$/.test(s)) return s;
  return '';
}

// URLs stored on the user profile (avatar, cover, membership assets) must stay
// safe to embed in src="" / url('...'). Only same-origin paths and https URLs;
// drop quotes, angle brackets, and script/data schemes.
function sanitizeCosmeticUrl(raw) {
  let s = String(raw || '').replace(/[<>"'`\\\u0000-\u001f\u007f]/g, '').trim();
  if (!s) return '';
  if (s.length > 500) s = s.slice(0, 500);
  const lower = s.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:') || lower.startsWith('file:')) return '';
  if (s.startsWith('/')) return s;
  if (lower.startsWith('https://') || lower.startsWith('http://')) return s;
  return '';
}

const ROOT_DIR = path.join(__dirname, '..');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const WALL_PERSIST_FILE = path.join(DATA_DIR, 'wall-posts.json');
const STORY_PERSIST_FILE = path.join(DATA_DIR, 'stories.json');
const STORY_TTL_MS = 24 * 60 * 60 * 1000; // Instagram-like: stories auto-expire after 24h
const STORY_MAX = 300;                     // keep RAM light: cap live stories
const PORT = process.env.PORT || config.port || 3000;
const GENERAL_ROOM_ID = 1;
const WAITING_ROOM_ID = 0;

const app = express();
const server = http.createServer(app);

// ── Security response headers ─────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  if (config.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Performance: gzip all compressible responses (classic client bundle
// ~630KB raw ships at ~150KB over the wire). Zero behavioral change.
let compression = null;
try { compression = require('compression'); } catch (e) {}
if (compression) app.use(compression({ threshold: 1024 }));

// Long-lived caching for versioned static assets (?v=N is the bust mechanism).
const STATIC_CACHE = 'public, max-age=2592000';

// ── Static (same surface as the original server) ─────────────────────────
const INDEX_HTML = path.join(ROOT_DIR, 'index.html');
const CP_HTML = path.join(ROOT_DIR, 'cp.html');

app.get(['/', '/index.html'], (req, res) => {
  try {
    const html = fs.readFileSync(INDEX_HTML, 'utf8');
    // Dynamic page: never let proxies/browsers serve a stale copy (uploaded
    // banner/favicon/SEO must appear immediately on next visit).
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.type('html').send(applySeoToHtml(html, seoSettings()));
  } catch (e) {
    res.sendFile(INDEX_HTML);
  }
});

app.get('/robots.txt', (req, res) => {
  const seo = seoSettings();
  if (!seo.enableRobotsTxt) {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
    return;
  }
  const canon = (seo.canonicalUrl || '').replace(/\/+$/, '');
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /client/cp.html', 'Disallow: /cp'];
  if (canon) lines.push('', 'Sitemap: ' + canon + '/sitemap.xml');
  res.type('text/plain').send(lines.join('\n') + '\n');
});

app.get('/sitemap.xml', (req, res) => {
  const seo = seoSettings();
  const canon = (seo.canonicalUrl || '').replace(/\/+$/, '');
  const base = canon || req.protocol + '://' + req.get('host');
  let lastmod = new Date().toISOString().slice(0, 10);
  try { lastmod = new Date(fs.statSync(INDEX_HTML).mtime).toISOString().slice(0, 10); } catch (e) {}
  const urls = [`  <url>\n    <loc>${base}/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>`];
  const chunks = urls.map((u) => u).join('\n');
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${chunks}\n</urlset>\n`
  );
});
app.get(['/cp', '/cp.html', '/client/cp.html'], (req, res) => {
  const cpIndex = path.join(ROOT_DIR, 'cp-dist', 'index.html');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (fs.existsSync(cpIndex)) return res.sendFile(cpIndex);
  return res.sendFile(CP_HTML);
});
app.get('/cp-classic', (req, res) => res.sendFile(CP_HTML));
app.use('/cp-assets', express.static(path.join(ROOT_DIR, 'cp-dist'), { maxAge: '7d', immutable: true }));
// /js/config.js is generated live from the DB (SEO + appearance) so the client
// fallback config always matches the latest control-panel edits — no redeploy
// or cache-bust needed after panel changes. Same guard semantics as the static
// file: only fills window.domainConfig when the inline block is missing/empty.
app.get('/js/config.js', (req, res) => {
  const cfg = loadDomainConfig();
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  if (!cfg || !Object.keys(cfg).length) {
    res.sendFile(path.join(CLIENT_DIR, 'js', 'config.js'));
    return;
  }
  res.send('if (!window.domainConfig || !Object.keys(window.domainConfig).length) { window.domainConfig = ' + JSON.stringify(cfg) + '; }');
});
app.use('/client', express.static(CLIENT_DIR, { index: false }));
app.use('/js', express.static(path.join(CLIENT_DIR, 'js'), { index: false, setHeaders: (res) => res.setHeader('Cache-Control', STATIC_CACHE) }));
app.use('/css', express.static(path.join(CLIENT_DIR, 'css'), { index: false, setHeaders: (res) => res.setHeader('Cache-Control', STATIC_CACHE) }));
app.use('/dist', express.static(path.join(CLIENT_DIR, 'dist'), { index: false }));
app.use('/vendor', express.static(path.join(CLIENT_DIR, 'vendor'), { index: false, setHeaders: (res) => res.setHeader('Cache-Control', STATIC_CACHE) }));
app.use('/uploads', express.static(path.join(CLIENT_DIR, 'uploads'), { index: false }));
app.use('/assets', express.static(path.join(ROOT_DIR, 'assets')));
app.use('/flags', express.static(path.join(ROOT_DIR, 'assets', 'flag')));
app.get('/emoii.gif', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'emoii.gif')));
app.get('/mic.png', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'mic.png')));
app.get('/verified-badge.svg', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'verified-badge.svg')));
app.get('/keepalive', (req, res) => res.status(204).end());
app.get('/manifest.json', (req, res) => {
  try {
    // PWA manifest is generated from live settings so a swapped favicon/banner
    // is reflected automatically without touching the static file.
    const seo = seoSettings();
    const canon = String(seo.canonicalUrl || '').replace(/\/+$/, '');
    const absolutize = (u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : canon + (u.charAt(0) === '/' ? '' : '/') + u);
    const name = seo.siteName || seo.siteTitle || 'شات درر';
    const fav = absolutize(seo.faviconUrl || seo.bannerUrl || '');
    const banner = absolutize(seo.bannerUrl || seo.ogImage || fav || '');
    const typeOfUrl = (u) => { const e = String(u).toLowerCase(); if (e.endsWith('.png')) return 'image/png'; if (e.endsWith('.webp')) return 'image/webp'; if (e.endsWith('.gif')) return 'image/gif'; if (e.endsWith('.jpg') || e.endsWith('.jpeg')) return 'image/jpeg'; return 'image/png'; };
    const manifest = {
      name,
      short_name: name,
      description: seo.siteDescription || '',
      lang: 'ar',
      dir: 'rtl',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#3b3a3a',
      theme_color: seo.themeColor || '#794e4e',
      icons: [
        { src: fav, sizes: '192x192', type: typeOfUrl(fav), purpose: 'any' },
        { src: fav, sizes: '512x512', type: typeOfUrl(fav), purpose: 'maskable' },
        { src: banner, sizes: '1200x424', type: typeOfUrl(banner), purpose: 'any' }
      ]
    };
    res.type('application/manifest+json').send(JSON.stringify(manifest, null, 2));
  } catch (e) {
    res.sendFile(path.join(CLIENT_DIR, 'manifest.json'));
  }
});
app.get('/sw.js', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'sw.js')));

// ── In-memory presence/session stores (rebuilt per boot) ─────────────────
let db = null;
let presenceVersion = 0;
const onlineSockets = new Map();   // socketId -> userObj (presence entry)
const socketSession = new Map();   // socketId -> clientSessionId (to tell reconnect from new login)
const tokenToUser = new Map();     // token -> { uid, username, type, ... }
const roomHistory = new Map();     // roomId -> [ {id,user,userId,text,createdAt,replyTo,mediaUrl,mediaType}, ... ]
const roomBans = new Map();        // roomId -> [ {id,userId,username,reason,until} ]
const connSlots = new Map();       // ip -> open socket count (flood guard)
const likeGiven = new Set();       // "uid::like::target" - one like per target per user
const repGiven = new Set();        // "uid::rep::target" - one rep per target per user
const wallPosts = [];              // {id,userId,user,text,likes:[],comments:[],createdAt}
const stories = [];                // {id,userId,user,text,img,createdAt}
const memberSessions = new Map();  // uid -> { token, clientSessionId, socketId, online:bool }
const activeSessions = new Map();  // clientSessionId -> { uid, token, ts }
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // active-session entries expire after 30 days
function setActiveSession(clientSessionId, v) {
  activeSessions.set(clientSessionId, { ...v, ts: Date.now() });
}
function pruneActiveSessions() {
  const now = Date.now();
  activeSessions.forEach((v, k) => { if (!v.ts || (now - v.ts) > SESSION_TTL_MS) activeSessions.delete(k); });
}
setInterval(pruneActiveSessions, 6 * 60 * 60 * 1000).unref();
const privateMessages = new Map(); // usernameKey -> [ {id,from,to,text,type,fileUrl,replyTo,timestamp,status} ]
const quickChatMsgs = [];          // {id,sender,text,mediaUrl,mediaType,createdAt}
const voiceMics = new Map();       // roomId(string) -> { [index]: {socketId, voiceSessionId, username, userId, isMutedSelf} }
const voiceUsers = new Map();      // socketId -> { roomId, micIndex, voiceSessionId }
const zajelApproved = [];          // {id:number, message}
const zajelPending = [];           // {id:number, username, message, createdAt}
const zajelIdSeq = { approved: 1, pending: 1 };
const sessionStartedAt = new Map(); // clientSessionId -> ms when that client session began

// ── Feature-protocol stores (discrete chat/moderator/voice/music features) ─
const roomModerators = new Map();   // roomId(string) -> Map(userId) -> { userId, username, permissions: [] }
const roomMutes = new Map();        // roomId(string) -> Map(username) -> { until }
const globalMutes = new Map();      // username -> { until }
const roomMicLocks = new Map();     // roomId(string) -> Map(micIndex) -> username (locked slot)
const pendingReports = [];          // { id, from, fromUsername, targetUsername, reason, proofImage, createdAt }
const battleSessions = new Map();   // roomId(string) -> battle object
const battleInvites = new Map();    // roomId(string) -> { senderId, senderName, receiverId, roomId }
const roomMusic = new Map();        // roomId(string) -> music state object
const privateCalls = new Map();     // callId -> { callerId, calleeId, status }
const liveBroadcasts = new Map();   // roomId(string) -> { socketId, userId, username, sourceType, scope, viewers:Set }
const cameraSessions = new Map();   // ownerUserId -> Set(viewerUserId)
const pendingOfflineAlerts = new Map(); // token -> [alertId]
const BATTLE_GIFTS = [
  { key: 'flower', name: 'وردة', icon: '🌸', price: 1 },
  { key: 'heart', name: 'قلب', icon: '❤️', price: 2 },
  { key: 'thinking', name: 'تفكير', icon: '🤔', price: 5 },
  { key: 'star', name: 'نجمة', icon: '⭐', price: 10 },
  { key: 'trophy', name: 'كأس', icon: '🏆', price: 20 },
  { key: 'diamond', name: 'ألماسة', icon: '💎', price: 50 },
  { key: 'rocket', name: 'صاروخ', icon: '🚀', price: 100 },
  { key: 'crown', name: 'تاج', icon: '👑', price: 200 },
];

// Normalise whatever is stored for a room's moderators (a Map of entries, or a
// legacy/CP-written array of usernames) into a Map keyed by userId-or-username.
function roomModeratorsFor(roomId) {
  const raw = roomModerators.get(String(roomId));
  if (!raw) return new Map();
  if (raw instanceof Map) return raw;
  const out = new Map();
  if (Array.isArray(raw)) {
    raw.forEach((e) => {
      const eo = e && typeof e === 'object' ? e : { username: e };
      const name = String(eo.username || eo.topic || '').toLowerCase();
      if (!name) return;
      const key = String(eo.userId || eo.id || name);
      out.set(key, { userId: eo.userId || eo.id || '', username: eo.username || eo.topic || '', permissions: Array.isArray(eo.permissions) ? eo.permissions : [] });
    });
  }
  return out;
}
function roomModeratorList(roomId) {
  return Array.from(roomModeratorsFor(roomId).values());
}
function setRoomModerators(roomId, entries) {
  const m = new Map();
  entries.forEach((e) => {
    const name = String(e.username || e.topic || '').toLowerCase();
    if (!name) return;
    const key = String(e.userId || e.id || name);
    m.set(key, { userId: e.userId || e.id || '', username: e.username || e.topic || '', permissions: Array.isArray(e.permissions) ? e.permissions : [] });
  });
  roomModerators.set(String(roomId), m);
}
function isRoomModerator(roomId, u) {
  if (!u) return false;
  const m = roomModeratorsFor(roomId);
  if (!m.size) return false;
  const uid = String(u.uid || u.guestId || u.userId || '');
  const uname = String(u.username || u.topic || '').toLowerCase();
  if (uid && (m.has(uid) || m.has(uid.toLowerCase()))) return true;
  for (const entry of m.values()) {
    if (entry && String(entry.username || '').toLowerCase() && uname && String(entry.username).toLowerCase() === uname) return true;
    if (entry && entry.userId && uid && String(entry.userId) === uid) return true;
  }
  return false;
}
function isRoomMuted(roomId, username) {
  const m = roomMutes.get(String(roomId));
  const e = m && m.get(String(username).toLowerCase());
  if (!e) return false;
  if (e.until && Date.now() > e.until) { m.delete(String(username).toLowerCase()); return false; }
  return true;
}
function isGloballyMuted(username) {
  const e = globalMutes.get(String(username).toLowerCase());
  if (!e) return false;
  if (e.until && Date.now() > e.until) { globalMutes.delete(String(username).toLowerCase()); return false; }
  return true;
}

// Replace every admin-configured banned word (noletters) with '***'. Matches
// the legacy chat filter behaviour: type 'bmsgs'/'amsgs' apply to public chat.
function filterNoLetters(text, type) {
  const list = db.noletters ? db.noletters.getAll() : [];
  if (!list.length) return String(text || '');
  let out = String(text || '');
  for (const n of list) {
    const v = n && (n.v || n.value || n);
    if (!v) continue;
    if (n.type && n.type !== 'bmsgs' && n.type !== 'amsgs' && String(type || 'bmsgs') !== 'noletters') continue;
    try { out = out.replace(new RegExp(helpers.escapeRegex(String(v)), 'gi'), '***'); } catch (e) { /* skip */ }
  }
  return out;
}

// Story text and story comments are injected into innerHTML by the client
// without escaping, so encode them as inert text here (keep newlines).
function escapeStoredText(raw) {
  return String(raw || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// True when the given ip/fp/hw-fp match an admin-issued global ban (db.bands).
// Mirrors the legacy auth checks: match full fingerprint, its last 15 chars,
// the client IP, plus the hardware fingerprint (device_band2) so a banned
// device keeps being blocked even when the user switches browsers/profiles.
function isBannedByIpOrFp(ip, fp, fp2) {
  try {
    if (!db.bands) return false;
    const all = db.bands.getAll() || [];
    if (!all.length) return false;
    const needFp = fp || '';
    const shortFp = needFp.slice(-15);
    const needHw = fp2 || '';
    const shortHw = needHw.slice(-15);
    return all.some((b) => {
      const bfp = String(b.device_band || '');
      const bhf = String(b.device_band2 || '');
      const bip = String(b.ip_band || '');
      if (bip && ip && bip === String(ip)) return true;
      if (bfp && needFp && (bfp === needFp || bfp === shortFp)) return true;
      if (bhf && needHw && (bhf === needHw || bhf === shortHw)) return true;
      return false;
    });
  } catch (e) { return false; }
}
// Browser / OS detection + ban enforcement (panel: banssystems). Unknown
// browsers/OS map to the *_other keys so admins can block anything not listed.
function detectClientBrowserKey(ua) {
  const s = String(ua || '');
  if (/edg\//i.test(s)) return 'browser6';
  if (/opr\/|opera/i.test(s)) return 'browser4';
  if (/firefox|fxios/i.test(s)) return 'browser2';
  if (/chrome|crios/i.test(s)) return 'browser1';
  if (/safari/i.test(s)) return 'browser3';
  return 'browser_other';
}
function detectClientOsKey(ua) {
  const s = String(ua || '');
  if (/android/i.test(s)) return 'system3';
  if (/iphone|ipad|ipod/i.test(s)) return 'system4';
  if (/mac os x|macintosh/i.test(s)) return 'system5';
  if (/windows/i.test(s)) return 'system1';
  if (/linux|cros/i.test(s)) return 'system2';
  return 'system_other';
}
function isBannedByClientEnv(ua) {
  try {
    // NOTE: cpBanSystems()/cpSettingsDoc() are nested inside the CP handler
    // scope and NOT reachable here — read moduleSettings() directly.
    const doc = moduleSettings() || {};
    const bs = (doc && doc.banssystems) || {};
    const br = bs.browsers || {};
    const sy = bs.systems || {};
    if (br.browser_all === true) return { banned: true, why: 'browser' };
    if (sy.system_all === true) return { banned: true, why: 'os' };
    const bk = detectClientBrowserKey(ua);
    if (br[bk] === true) return { banned: true, why: 'browser' };
    const osk = detectClientOsKey(ua);
    if (sy[osk] === true) return { banned: true, why: 'os' };
    return { banned: false, why: '' };
  } catch (e) {
    logger.warn('cp', 'isBannedByClientEnv failed', { error: e.message });
    return { banned: false, why: '' };
  }
}
function envBanMessage(why) {
  return why === 'browser' ? 'متصفحك محظور من الدخول إلى الدردشة' : 'نظام التشغيل لديك محظور من الدخول إلى الدردشة';
}

// ── Global message-length limits (CP-controllable) ──
const GLOBAL_LIMITS_DEFAULTS = { public: 300, private: 300 };
function globalLimitsGet() {
  const doc = moduleSettings();
  const g = (doc && doc.globalLimits && typeof doc.globalLimits === 'object') ? doc.globalLimits : {};
  const clamp = (v, d) => Math.min(2000, Math.max(50, parseInt(v, 10) || d));
  return { public: clamp(g.public, GLOBAL_LIMITS_DEFAULTS.public), private: clamp(g.private, GLOBAL_LIMITS_DEFAULTS.private) };
}
function globalLimitsSet(patch) {
  if (!db || !db.settings) return globalLimitsGet();
  const doc = moduleSettings();
  const cur = globalLimitsGet();
  if (patch && patch.public !== undefined) cur.public = Math.min(2000, Math.max(50, parseInt(patch.public, 10) || GLOBAL_LIMITS_DEFAULTS.public));
  if (patch && patch.private !== undefined) cur.private = Math.min(2000, Math.max(50, parseInt(patch.private, 10) || GLOBAL_LIMITS_DEFAULTS.private));
  if (doc) doc.globalLimits = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { globalLimits: cur } });
  return cur;
}

function canModerateRoom(roomId, u) {  if (!u) return false;
  if (permissionsFor(u).isAdmin) return true;
  const room = findRoomByAnyId(roomId);
  if (room && (String(room.ownerId) === String(u.uid || u.guestId || u.userId) || (room.owner && String(room.owner) === String(u.username)))) return true;
  return isRoomModerator(roomId, u);
}
function socketIdForUsername(name) {
  let sid = null;
  onlineSockets.forEach((u, k) => { if (String(u.username).toLowerCase() === String(name).toLowerCase() && !sid) sid = k; });
  return sid;
}
function emitRoomUpdated(roomId) {
  const room = findRoomByAnyId(roomId);
  if (!room) return;
  io.to('room:' + roomId).emit('room-updated', roomToClient(room));
  socketModeratorSync(roomId);
}
function socketModeratorSync(roomId) {
  const room = findRoomByAnyId(roomId);
  if (!room) return;
  room.moderators = roomModeratorList(roomId);
  room.lockedMics = Array.from((roomMicLocks.get(String(roomId)) || new Map()).keys());
  db.rooms.updateOne({ id: String(room.id) }, { $set: { moderators: room.moderators, lockedMics: room.lockedMics } });
  io.emit('rooms-stats', roomStats());
}
function spectrumUpdate() {
  const games = [];
  battleSessions.forEach((b) => {
    if (b.status === 'countdown' || b.status === 'active' || b.status === 'break') {
      games.push({
        gameId: b.battleId, type: 'battle', roomId: b.roomId, status: b.status,
        player1: publicUserSafe(b.player1Obj), player2: publicUserSafe(b.player2Obj),
        player1Name: b.player1Name, player2Name: b.player2Name,
        startedAt: b.startedAt,
      });
    }
  });
  liveBroadcasts.forEach((lb) => {
    games.push({ gameId: 'lb_' + lb.userId, type: 'live', roomId: lb.roomId, status: 'live', broadcaster: lb.username, userId: lb.userId, startedAt: lb.startedAt });
  });
  io.emit('game:spectate:list:update', games);
}
function publicUserSafe(u) {
  try { return u && typeof u === 'object' ? u : { id: u, userId: u, username: String(u || '') }; } catch (e) { return { id: u, userId: u, username: String(u || '') }; }
}

function ensureSessionStart(clientSessionId) {
  if (!clientSessionId) return 0;
  // Every connection (login, reconnect, refresh) starts a brand-new session:
  // bump the start time so old room + private messages are not replayed to it.
  sessionStartedAt.set(clientSessionId, Date.now());
  return sessionStartedAt.get(clientSessionId);
}
function sessionStartFromReq(req) {
  const cid = req && (req.query && req.query.clientSessionId) ? String(req.query.clientSessionId) : '';
  // A REST call with a session id we've never seen (e.g. brand-new client) also starts fresh.
  return cid ? (sessionStartedAt.get(cid) || Date.now()) : 0;
}

function nextId(prefix) {
  return prefix + Math.random().toString(36).substring(2, 10) + Date.now().toString(36).substring(-4);
}

function permissionsFor(u) {
  const isAdmin = u.isAdmin === true || u.rank === 'admin' || u.power === 'admin' || (u.group && u.group.isAdmin);
  const p = {};
  const all = [
    'canAccessAdminPanel', 'canAccessLockedAndFullRooms', 'canAssignSuperIcon', 'canBanUsers',
    'canChangeCountry', 'canChangeUserNicknames', 'canCreateRooms', 'canDeletePublicMessages',
    'canDeleteUserCoverPicture', 'canDeleteUserMembershipBg', 'canDeleteUserMembershipFrame',
    'canDeleteUserProfilePicture', 'canDeleteWallPosts', 'canDesignMembership', 'canEditUserLikes',
    'canEditUserRep', 'canEditUserWallPoints', 'canEditUsers', 'canKickUsers', 'canManageAddons',
    'canManageAllRoomsInChat', 'canManageMembershipUpgrades', 'canManageRooms', 'canManageUsers',
    'canMuteUsers', 'canOpenPrivateMessages', 'canReplyToPublicMessages', 'canRequestMusic',
    'canSendBroadcastMessages', 'canSendFiles', 'canSendGifts', 'canSendNotifications',
    'canStartLiveBroadcast', 'canUseAddons', 'canUseCamera', 'canUseRoomMusic',
    'canViewFilterMonitorMessages', 'canViewNicknameHistory', 'canViewReports', 'canWriteAsBot',
    'canviewsvisitprofile', 'manageZajelMessages', 'sendZajelMessage', 'canSendPrivateMessages'
  ];
  for (const perm of all) p[perm] = isAdmin ? true : false;
  // Guests can always speak on the wall and use quick chat.
  p.canSendFiles = true;
  p.canUseAddons = true;
  p.sendZajelMessage = true;
  if (u.type === 'guest') {
    p.canOpenPrivateMessages = true;
    p.canSendPrivateMessages = true;
  }
  // All logged-in members may create rooms ONLY when their assigned power has
  // the `createroom` flag (e.g. admin/vip). Plain members and guests cannot.
  if (u.type !== 'guest') {
    p.canCreateRooms = userCanCreateRooms(u);
    p.canSendGifts = true;
    p.canOpenPrivateMessages = true;
    p.canSendPrivateMessages = true;
    p.canReplyToPublicMessages = true;
  }
  return { isAdmin, permissions: p };
}

// Reads the `powers` config (single doc { powers: [...] }) from db.powers.
function powerConfigArray() {
  try {
    const doc = db.powers ? db.powers.getAll()[0] : null;
    return doc && Array.isArray(doc.powers) ? doc.powers : [];
  } catch (e) { return []; }
}

// Returns the matching power entry (admin/vip/user/...) for a user or db doc.
function powerEntryFor(u) {
  if (!u) return null;
  const list = powerConfigArray();
  const name = String(u.power || u.rank || (u.group && u.group.name) || 'user').toLowerCase();
  for (let i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].name || '').toLowerCase() === name) return list[i];
  }
  return null;
}

// Only admins and users whose assigned power carries `createroom: 1` may
// create new rooms. Guests and regular members are always denied.
function userCanCreateRooms(u) {
  if (!u) return false;
  if (u.isAdmin === true || u.power === 'admin' || u.rank === 'admin' || (u.group && Number(u.group.roleRank) >= 999)) return true;
  const p = powerEntryFor(u);
  return !!(p && (p.createroom === 1 || p.createroom === true));
}

// D5: like-unlock gates. Each feature (wall / private / story / call / mic)
// unlocks once a member's like count reaches the configured threshold. Values
// configured from the panel (settings siteweb.likeGates). 0 or empty disables
// the gate. Admins / rank>=900 powers and guests are always allowed through.
const LIKE_GATE_DEFAULTS = { wall: 100, private: 200, story: 300, call: 400, mic: 500 };
const LIKE_GATE_NAMES = {
  wall: 'الانتقال إلى الجدار ونشر المنشورات',
  private: 'إرسال الرسائل الخاصة',
  story: 'نشر القصص',
  call: 'إجراء المكالمات الخاصة',
  mic: 'رفع المايك',
};
function likeGate(u, feature) {
  if (!LIKE_GATE_NAMES[feature]) return { ok: true };
  let gates = {};
  try {
    const sw = (db.settings ? db.settings.find({})[0] : null);
    gates = (sw && sw.siteweb && sw.siteweb.likeGates) || {};
  } catch (e) {}
  const threshold = parseInt(gates[feature], 10);
  const need = Number.isFinite(threshold) && threshold >= 0 ? threshold : (LIKE_GATE_DEFAULTS[feature] || 0);
  if (need <= 0) return { ok: true };
  if (!u) return { ok: false, need, has: 0 };
  if (u.type === 'guest') return { ok: true };
  if (u.isAdmin === true || u.power === 'admin' || u.rank === 'admin' || (u.group && Number(u.group.roleRank) >= 999)) return { ok: true };
  const power = powerEntryFor(u);
  if (power && power.rank >= 900) return { ok: true };
  const has = (u.likes || 0);
  if (has >= need) return { ok: true };
  return { ok: false, need, has };
}
function likeGateMessage(feature, gate) {
  return 'تحتاج إلى ' + gate.need + ' إعجاباً لـ' + LIKE_GATE_NAMES[feature];
}

function publicUser(u) {
  const isGuest = u.type === 'guest';
  return {
    id: isGuest ? u.guestId : u.uid,
    userId: isGuest ? u.guestId : u.uid,
    guestId: isGuest ? u.guestId : null,
    username: u.username,
    topic: u.username,
    type: u.type,
    pic: u.pic || 'pic.png',
    ucol: u.ucol || '#000000',
    mcol: u.mcol || '#6c757d',
    bg: u.bg || '#ffffff',
    msg: u.msg || '',
    co: u.co || 'us',
    country: u.co || '',
    isOnline: true,
    isGhost: !!u.stealth,
    isHidden: !!u.isHidden,
    isIdle: !!u.isIdle,
    presenceState: u.isIdle ? 'idle' : 'active',
    roleRank: (u.group && u.group.roleRank) || (u.rank === 'admin' ? 999 : 0),
    group: u.group || { id: 0, name: '', roleRank: u.rank === 'admin' ? 999 : 0 },
    permissions: permissionsFor(u).permissions,
    ...permissionsFor(u).permissions,
    rep: u.rep || 0,
    likes: u.likes || 0,
    wallPoints: u.wallPoints || 0,
    coins: u.coins || 0,
    cover: u.cover || '',
    membershipBg: u.membershipBg || '',
    membershipFrame: u.membershipFrame || '',
    allowPrivate: u.allowPrivate !== false,
    superIcon: u.superIcon || '',
    gifts: u.gifts || [],
    joinTime: u.joinTime || Date.now(),
    roomid: u.roomid || GENERAL_ROOM_ID,
    roomId: u.roomid || GENERAL_ROOM_ID,
    room: (function () {
      const rr = db.rooms.findOne({ id: String(u.roomid || GENERAL_ROOM_ID) });
      return rr ? rr.name : '';
    })(),
    isBotOrVirtual: false,
    isVirtualUser: false,
    isAdmin: u.isAdmin === true || u.rank === 'admin',
    verified: !!u.verified,
    isVerified: !!u.verified,
  };
}

function presenceKey(u) {
  if (u.type === 'guest') return 'guest:' + (u.guestId || u.id);
  return 'member:' + (u.uid || u.userId || u.id);
}

function serializeAllPresence() {
  const users = [];
  onlineSockets.forEach((u) => users.push(publicUser(u)));
  return users;
}

function broadcastPresence() {
  presenceVersion += 1;
  io.emit('users-snapshot', { version: presenceVersion, users: serializeAllPresence() });
  io.emit('rooms-stats', roomStats());
}

// Keep live presence entries in sync with the persisted stats after an admin
// edit. Without this, the next users-snapshot would broadcast the pre-edit
// values and the client would re-render the stale numbers over the fresh ones.
function syncPresenceStatsFor(u) {
  if (!u) return;
  onlineSockets.forEach((o) => {
    const sameMember = o && !o.guest && (String(o.uid || o.userId || o.id || '') === String(u.id || u.userId || u.uid || ''));
    const sameName = o && o.username && (String(o.username).toLowerCase() === String(u.topic || u.username || '').toLowerCase());
    if (sameMember || sameName) {
      if (u.rep !== undefined) o.rep = u.rep;
      if (u.likes !== undefined) o.likes = u.likes;
      if (u.coins !== undefined) o.coins = u.coins;
      if (u.wallPoints !== undefined) o.wallPoints = u.wallPoints;
      if (u.verified !== undefined) o.verified = u.verified;
      if (u.power !== undefined) { o.power = u.power; o.rank = u.power; }
      if (u.topic !== undefined) { o.username = u.topic; o.topic = u.topic; }
    }
  });
}

function roomStats() {
  const rooms = (db.rooms.getAll() || []);
  const mics = roomMicLocks || new Map();
  const out = {};
  rooms.forEach((r) => {
    let online = 0;
    onlineSockets.forEach((u) => { if (String(u.roomid) === String(r.id)) online++; });
    out[r.id] = { id: r.id, name: r.name, online, currentUsersCount: online, micsEnabled: false, micLocks: (mics.get(String(r.id)) || new Map()).size };
  });
  return out;
}

function systemMessageFor(roomId, user, kind) {
  const roomName = (() => {
    try {
      const r = findRoomByAnyId(roomId);
      return r && r.name ? r.name : '';
    } catch (e) { return ''; }
  })();
  const safeName = helpers.escapeHtml(user.username || '');
  const safeRoom = helpers.escapeHtml(roomName);
  const text = kind === 'leave'
    ? 'هذا المستخدم غادر غرفة ' + safeRoom
    : kind === 'move'
      ? 'هذا المستخدم إنتقل إلى غرفة ' + safeRoom
      : 'هذا المستخدم قد دخل إلى غرفة ' + safeRoom;
  // Kind-aware, theme-friendly colours (light & dark mode readable).
  const colors = kind === 'leave'
    ? { titleColor: '#c62828', bgColor: 'rgba(198,40,40,0.10)', textColor: '#c62828' }
    : kind === 'move'
      ? { titleColor: '#a16207', bgColor: 'rgba(241,196,15,0.14)', textColor: '#a16207' }
      : { titleColor: '#1f7a3d', bgColor: 'rgba(46,204,113,0.12)', textColor: '#1f7a3d' };
  return {
    id: nextId('sys_'),
    title: safeName,
    content: text,
    image: null,
    titleColor: colors.titleColor,
    bgColor: colors.bgColor,
    textColor: colors.textColor,
    createdAt: new Date().toISOString(),
    roomId: roomId,
    kind: kind,
    user: {
      username: user.username, topic: user.username,
      userId: user.guest ? user.guestId : user.uid,
      id: user.guest ? user.guestId : user.uid,
      type: 'system',
      isSystemJoinMessage: kind === 'join',
      isSystemLeaveMessage: kind === 'leave',
      isSystemMoveMessage: kind === 'move',
    },
  };
}

function broadcastJoinLeave(user, kind, joinId) {
  try {
    if (!user || !user.username) return;
    const room = joinId !== undefined ? joinId : GENERAL_ROOM_ID;
    const msg = systemMessageFor(room, user, kind);
    io.to('room:' + room).emit('system-message', msg);
  } catch (e) { /* noop */ }
}

// A user switched from one room to another: announce a single "move" system
// message to the destination room instead of a leave+join pair (matches the
// original site's "انتقل إلى غرفة أخرى" behaviour).
function broadcastRoomMove(user, toRoomId) {
  try {
    if (!user || !user.username) return;
    const room = toRoomId !== undefined ? toRoomId : GENERAL_ROOM_ID;
    const msg = systemMessageFor(room, user, 'move');
    io.to('room:' + room).emit('system-message', msg);
  } catch (e) { /* noop */ }
}

// Parse the domainConfig block injected in index.html (source of truth for
// the live client's appearance/landing). Returns {} if not found.
function loadDomainConfig() {
  try {
    if (!fs.existsSync(INDEX_HTML)) return {};
    const html = fs.readFileSync(INDEX_HTML, 'utf8');
    const m = html.match(/window\.domainConfig\s*=\s*(\{[\s\S]*?\});/);
    if (!m) return {};
    const base = new Function('return ' + m[1])();
    // Merge live SEO/uploaded images over the static file so /api/settings/
    // appearance and the inline domainConfig always reflect DB updates (e.g.
    // banner/favicon/avatar uploaded from the CP).
    const seo = seoSettings();
    const out = Object.assign({}, base);
    if (seo && typeof seo === 'object') {
      if (seo.siteName) out.siteName = seo.siteName;
      if (seo.siteTitle) out.siteTitle = seo.siteTitle;
      if (seo.siteDescription) out.siteDescription = seo.siteDescription;
      if (seo.siteKeywords) out.siteKeywords = seo.siteKeywords;
      if (seo.canonicalUrl) out.canonicalUrl = seo.canonicalUrl;
      if (seo.bannerUrl) out.bannerUrl = seo.bannerUrl;
      if (seo.faviconUrl) out.faviconUrl = seo.faviconUrl;
      if (seo.defaultAvatarUrl) out.defaultAvatarUrl = seo.defaultAvatarUrl;
      if (seo.ogImage) out.ogImage = seo.ogImage;
      if (seo.themeColor) out.themeColor = seo.themeColor;
    }
    // Merge live appearance/color overrides (from the CP) over the static file.
    const ap = appearanceSettings();
    if (ap && typeof ap === 'object') {
      APPEARANCE_FIELDS.forEach((f) => {
        if (ap[f.key] !== undefined && ap[f.key] !== null && String(ap[f.key]) !== '') out[f.key] = ap[f.key];
      });
    }
    return out;
  } catch (e) {
    logger.warn('cfg', 'Could not parse domainConfig', { error: e.message });
    return {};
  }
}

// ── SEO settings (persisted in db.settings.seo, injected at serve time) ──
const SEO_DEFAULTS = {
  siteName: 'شات درر',
  siteTitle: 'شات درر',
  siteDescription: 'شات درر: وجهتك الأولى للدردشة الخليجية والعربية. تواصل مع أصدقاء جدد من عمان والسعودية وكافة الدول في بيئة آمنة وسريعة. انضم إلينا الآن وابدأ التواصل!',
  siteKeywords: 'شات درر , دردشة خليجية , شات عمان , شات كتابي , تعارف خليجي , شات السعودية , شات تعب , شات مسقط , شات الخليج , شات عربي',
  canonicalUrl: 'https://drr-chat.bonto.run',
  robotsMeta: 'index, follow',
  enableSitemap: true,
  enableRobotsTxt: true,
  ogImage: '/uploads/site/banner-1787149093493-d1868e0a.jpg',
  twitterCard: 'summary_large_image',
  themeColor: '#794e4e',
  noindex: false,
  faviconUrl: '/uploads/site/favicon-1787149110961-9e3b4707.png',
  bannerUrl: '/uploads/site/banner-1787149093493-d1868e0a.jpg',
  defaultAvatarUrl: '/uploads/site/pic-1787149117871-c2563702.png',
  googleSiteVerification: '',
  sameAs: []
};

function seoSettings() {
  const doc = moduleSettings();
  if (!doc) return Object.assign({}, SEO_DEFAULTS);
  if (doc.seo && typeof doc.seo === 'object' && Object.keys(doc.seo).length) return Object.assign({}, SEO_DEFAULTS, doc.seo);
  return Object.assign({}, SEO_DEFAULTS);
}

function seoSave(patch) {
  if (!db || !db.settings) return seoSettings();
  const doc = moduleSettings();
  const cur = Object.assign({}, SEO_DEFAULTS, (doc && doc.seo) || {});
  const keys = ['siteName', 'siteTitle', 'siteDescription', 'siteKeywords', 'canonicalUrl', 'robotsMeta', 'enableSitemap', 'enableRobotsTxt', 'ogImage', 'twitterCard', 'themeColor', 'noindex', 'faviconUrl', 'bannerUrl', 'defaultAvatarUrl', 'googleSiteVerification', 'sameAs'];
  keys.forEach((k) => { if (patch[k] !== undefined) cur[k] = patch[k]; });
  if (doc) doc.seo = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { seo: cur } });
  return cur;
}

// ── Appearance / colors (persisted in db.settings.appearance, injected at
//    serve time into the theme CSS vars + inline domainConfig) ──
const APPEARANCE_FIELDS = [
  { key: 'mainUiColor', css: '--main-ui-color' },
  { key: 'landingBgColor', css: '--landing-bg-color' },
  { key: 'chatInputBg', css: '--chat-input-bg' },
  { key: 'unifiedBtnBg', css: '--unified-btn-bg' },
  { key: 'unifiedBtnHoverBg', css: '--unified-btn-hover-bg' },
  { key: 'micIconColor', css: '--mic-icon-color' },
  { key: 'micBtnBgColor', css: '--mic-btn-bg-color' },
  { key: 'lineIconColor', css: '--line-icon-color' },
  { key: 'tickerBgColor', css: null },
  { key: 'tickerTextColor', css: null },
  { key: 'fontFamily', css: '--font-family' },
  { key: 'fontSize', css: '--font-size' },
  { key: 'fontWeight', css: '--font-weight' },
  { key: 'footerText', css: null },
  // Visibility flags + extra media consumed by client applySiteAppearance()
  { key: 'showBanner', css: null },
  { key: 'bannerWidth', css: null },
  { key: 'bannerHeight', css: null },
  { key: 'showFavicon', css: null },
  { key: 'showOverlayImage', css: null },
  { key: 'overlayImageUrl', css: null },
  { key: 'showPrivateTabBg', css: null },
  { key: 'privateTabBgUrl', css: null },
  { key: 'showDefaultAvatar', css: null },
  { key: 'defaultSystemMessageImageUrl', css: null },
  { key: 'showDefaultRoom', css: null },
  { key: 'defaultRoomUrl', css: null },
  { key: 'enableCustomCover', css: null },
  { key: 'defaultCoverUrl', css: null },
  { key: 'showStatusOnLanding', css: null }
];

function appearanceSettings() {
  const doc = moduleSettings();
  if (doc && doc.appearance && typeof doc.appearance === 'object') return Object.assign({}, doc.appearance);
  return {};
}

function appearanceSave(patch) {
  if (!db || !db.settings) return appearanceSettings();
  const doc = moduleSettings();
  const cur = Object.assign({}, (doc && doc.appearance) || {});
  APPEARANCE_FIELDS.forEach((f) => { if (patch[f.key] !== undefined) cur[f.key] = patch[f.key]; });
  if (doc) doc.appearance = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { appearance: cur } });
  return cur;
}

// ── Client feature toggles (persisted in db.settings.features; consumed by
//    main.js via GET /api/settings/features). Keys mirror exactly what the
//    live client reads off window.featuresSettings. ──
const FEATURES_DEFAULTS = {
  storiesEnabled: true, wallEnabled: true, privateTabEnabled: true, roomsEnabled: true,
  voiceEnabled: true, gamesEnabled: true, zajelEnabled: true, quickChatEnabled: true,
  profilesEnabled: true, giftsEnabled: true, liveBroadcastEnabled: false,
  battleChallengesEnabled: true, publicMessageDeletionEnabled: false, publicMessageReplyEnabled: true,
  statusColorEnabled: true, profileLightboxEnabled: true, mentionsEnabled: true,
  sidebarAddonsEnabled: true, sidebarMemberSearchEnabled: true, wallPostCommentsEnabled: true,
  wallPostLikesEnabled: true, wallYoutubeBarEnabled: true, disableCopy: false, disableRightClick: false,
  cameraEnabled: true, storySidebarIndicatorEnabled: true,
  likes_notifications: 20, likes_effects: 100
};
function featuresSettings() {
  const doc = moduleSettings();
  return Object.assign({}, FEATURES_DEFAULTS, (doc && doc.features && typeof doc.features === 'object') ? doc.features : {});
}
function featuresSave(patch) {
  if (!db || !db.settings) return featuresSettings();
  const doc = moduleSettings();
  const cur = Object.assign({}, FEATURES_DEFAULTS, (doc && doc.features) || {});
  Object.keys(FEATURES_DEFAULTS).forEach((k) => { if (patch && patch[k] !== undefined) cur[k] = patch[k]; });
  if (doc) doc.features = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { features: cur } });
  return cur;
}

// ── News ticker (landing/chat top bar; consumed via /api/settings/news-ticker) ──
const NEWS_TICKER_DEFAULTS = { enabled: false, text: '', bgColor: '#ff0000', textColor: '#ffffff' };
function newsTickerSettings() {
  const doc = moduleSettings();
  return Object.assign({}, NEWS_TICKER_DEFAULTS, (doc && doc.newsTicker && typeof doc.newsTicker === 'object') ? doc.newsTicker : {});
}
function newsTickerSave(patch) {
  if (!db || !db.settings) return newsTickerSettings();
  const doc = moduleSettings();
  const cur = Object.assign({}, NEWS_TICKER_DEFAULTS, (doc && doc.newsTicker) || {});
  Object.keys(NEWS_TICKER_DEFAULTS).forEach((k) => { if (patch && patch[k] !== undefined) cur[k] = patch[k]; });
  if (doc) doc.newsTicker = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { newsTicker: cur } });
  return cur;
}

// ── Admin ads ticker ({settings:{enabled,speed,bgColor,textColor}, ads:[{id,content,linkUrl}]}) ──
const ADS_TICKER_DEFAULTS = { settings: { enabled: false, speed: 30, bgColor: '#fff8e1', textColor: '#4b3600' }, ads: [] };
function adsTickerSettings() {
  const doc = moduleSettings();
  const d = (doc && doc.adsTicker && typeof doc.adsTicker === 'object') ? doc.adsTicker : {};
  return {
    settings: Object.assign({}, ADS_TICKER_DEFAULTS.settings, (d && d.settings && typeof d.settings === 'object') ? d.settings : {}),
    ads: Array.isArray(d.ads) ? d.ads : []
  };
}
function adsTickerSave(data) {
  if (!db || !db.settings) return adsTickerSettings();
  const doc = moduleSettings();
  const cur = adsTickerSettings();
  if (data && data.settings && typeof data.settings === 'object') {
    ['enabled', 'speed', 'bgColor', 'textColor'].forEach((k) => { if (data.settings[k] !== undefined) cur.settings[k] = data.settings[k]; });
  }
  if (data && Array.isArray(data.ads)) {
    cur.ads = data.ads.slice(0, 50)
      .map((a) => ({
        id: (a && a.id !== undefined && a.id !== '') ? String(a.id).substring(0, 40) : ('ad_' + Date.now() + '_' + Math.floor(Math.random() * 10000)),
        content: String((a && a.content) || '').trim().substring(0, 300),
        linkUrl: String((a && a.linkUrl) || '').trim().substring(0, 300)
      }))
      .filter((a) => a.content);
  }
  if (doc) doc.adsTicker = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { adsTicker: cur } });
  return cur;
}

// ── Profile badges (wallPoints tiers; shape {enabled, badges:{1:url..6:url}}) ──
const BADGE_LEVELS = [1, 2, 3, 4, 5, 6];
function badgeConfigGet() {
  const doc = moduleSettings();
  const b = (doc && doc.badgesCfg && typeof doc.badgesCfg === 'object') ? doc.badgesCfg : {};
  const out = { enabled: !!b.enabled, badges: {} };
  BADGE_LEVELS.forEach((lv) => { if (b.badges && b.badges[lv]) out.badges[lv] = String(b.badges[lv]).substring(0, 300); });
  return out;
}
function badgeConfigSave(patch) {
  if (!db || !db.settings) return badgeConfigGet();
  const doc = moduleSettings();
  const cur = badgeConfigGet();
  if (patch && patch.enabled !== undefined) cur.enabled = !!patch.enabled;
  if (patch && patch.badges && typeof patch.badges === 'object') {
    const clean = {};
    BADGE_LEVELS.forEach((lv) => {
      const u = String(patch.badges[lv] || '').trim();
      if (u) clean[lv] = u.substring(0, 300);
    });
    cur.badges = clean;
  }
  if (doc) doc.badgesCfg = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { badgesCfg: cur } });
  return cur;
}

// ── Login behavior (consumed via /api/settings/login-behavior) ──
const LOGIN_BEHAVIOR_DEFAULTS = { behavior: 'default_room', openUsersTabOnLogin: false, lowLikesRoomId: 0, lowLikesMaxLikes: 0 };
function loginBehaviorSettings() {
  const doc = moduleSettings();
  const l = (doc && doc.loginBehavior && typeof doc.loginBehavior === 'object') ? doc.loginBehavior : {};
  return {
    behavior: l.behavior === 'lobby' ? 'lobby' : 'default_room',
    openUsersTabOnLogin: !!l.openUsersTabOnLogin,
    lowLikesRoomId: parseInt(l.lowLikesRoomId, 10) || 0,
    lowLikesMaxLikes: parseInt(l.lowLikesMaxLikes, 10) || 0
  };
}
function loginBehaviorSave(patch) {
  if (!db || !db.settings) return loginBehaviorSettings();
  const doc = moduleSettings();
  const cur = loginBehaviorSettings();
  if (patch && patch.behavior !== undefined) cur.behavior = patch.behavior === 'lobby' ? 'lobby' : 'default_room';
  if (patch && patch.openUsersTabOnLogin !== undefined) cur.openUsersTabOnLogin = !!patch.openUsersTabOnLogin;
  if (patch && patch.lowLikesRoomId !== undefined) cur.lowLikesRoomId = parseInt(patch.lowLikesRoomId, 10) || 0;
  if (patch && patch.lowLikesMaxLikes !== undefined) cur.lowLikesMaxLikes = parseInt(patch.lowLikesMaxLikes, 10) || 0;
  if (doc) doc.loginBehavior = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { loginBehavior: cur } });
  return cur;
}

// Build the JSON-LD structured data from live settings so the logo/banner in
// the schema always match the currently uploaded favicon/banner.
function buildJsonLd(seo) {
  const canon = String(seo.canonicalUrl || '').replace(/\/+$/, '');
  const absolutize = (u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : canon + (u.charAt(0) === '/' ? '' : '/') + u);
  const name = seo.siteName || seo.siteTitle || 'شات درر';
  const altName = seo.siteTitle && seo.siteTitle !== name ? seo.siteTitle : 'DRR Chat';
  const desc = seo.siteDescription || '';
  const fav = absolutize(seo.faviconUrl || '');
  const banner = absolutize(seo.bannerUrl || seo.ogImage || '');
  const sameAs = Array.isArray(seo.sameAs) ? seo.sameAs.map(absolutize).filter(Boolean) : [];
  const add = (base, extra) => { const o = Object.assign({}, base); Object.keys(extra).forEach((k) => { if (extra[k]) o[k] = extra[k]; }); return o; };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      add({
        '@type': 'WebSite',
        '@id': canon + '/#website',
        url: canon + '/',
        name,
        alternateName: altName,
        description: desc,
        inLanguage: 'ar',
      }, { image: banner, publisher: { '@id': canon + '/#organization' } }),
      add({
        '@type': 'Organization',
        '@id': canon + '/#organization',
        name,
        url: canon + '/',
        description: desc,
        sameAs,
      }, { logo: fav ? { '@type': 'ImageObject', url: fav } : null, image: banner }),
      add({
        '@type': 'WebApplication',
        '@id': canon + '/#webapp',
        name,
        url: canon + '/',
        applicationCategory: 'CommunicationApplication',
        applicationSubCategory: 'Chat',
        operatingSystem: 'Any',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'OMR' },
        inLanguage: 'ar',
      }, { image: banner, publisher: { '@id': canon + '/#organization' } })
    ]
  };
}

// Rewrite the SEO-relevant <head> tags of the served HTML from settings.
function applySeoToHtml(html, seo) {
  if (!html || !seo) return html;
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escJson = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\u0000-\u001f\u007f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const title = seo.siteTitle || seo.siteName || '';
  const siteName = seo.siteName || seo.siteTitle || '';
  const desc = seo.siteDescription || '';
  const kw = seo.siteKeywords || '';
  const robots = seo.noindex ? 'noindex, nofollow' : (seo.robotsMeta || 'index, follow');
  const canon = String(seo.canonicalUrl || '').replace(/\/+$/, '');
  const absolutize = (u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : canon + (u.charAt(0) === '/' ? '' : '/') + u);
  const ogImg = absolutize(seo.ogImage || '');
  const favicon = seo.faviconUrl || '';
  const banner = seo.bannerUrl || '';
  const defaultAvatar = seo.defaultAvatarUrl || '';
  const gscCodes = String(seo.googleSiteVerification || '').split(',').map((s) => s.trim()).filter(Boolean);
  const sameAs = Array.isArray(seo.sameAs) ? seo.sameAs.map(absolutize).filter(Boolean) : [];
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  out = out.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}">`);
  out = out.replace(/<meta name="keywords"[^>]*>/, `<meta name="keywords" content="${esc(kw)}">`);
  out = out.replace(/<meta name="robots"[^>]*>/, (m) => `<meta name="robots" content="${esc(robots)}">` + (gscCodes.length ? '\n  ' + gscCodes.map((v) => `<meta name="google-site-verification" content="${esc(v)}">`).join('\n  ') : ''));
  out = out.replace(/<meta name="theme-color"[^>]*>/, `<meta name="theme-color" content="${esc(seo.themeColor || '')}">`);
  out = out.replace(/<meta name="msapplication-TileColor"[^>]*>/, `<meta name="msapplication-TileColor" content="${esc(seo.themeColor || '')}">`);
  out = out.replace(/<meta name="apple-mobile-web-app-title"[^>]*>/, `<meta name="apple-mobile-web-app-title" content="${esc(siteName)}">`);
  out = out.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(canon)}">`);
  out = out.replace(/<meta property="og:site_name"[^>]*>/, `<meta property="og:site_name" content="${esc(siteName)}">`);
  out = out.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}">`);
  out = out.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(desc)}">`);
  out = out.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(canon)}">`);
  if (ogImg) out = out.replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${esc(ogImg)}">`);
  out = out.replace(/<meta name="twitter:card"[^>]*>/, `<meta name="twitter:card" content="${esc(seo.twitterCard || 'summary_large_image')}">`);
  out = out.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(title)}">`);
  out = out.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(desc)}">`);
  if (ogImg) out = out.replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${esc(ogImg)}">`);
  out = out.replace(/<meta property="og:type"[^>]*>/, '<meta property="og:type" content="website">');
  out = out.replace(/<meta property="og:locale"[^>]*>/, '<meta property="og:locale" content="ar_AR">');
  // Live landing texts: H1 + intro paragraph follow the panel SEO values so
  // Google always sees exactly what the admin configured.
  if (title) out = out.replace(/(<h1 class="landing-title[^"]*">)[\s\S]*?(<\/h1>)/, `$1${esc(title)}$2`);
  if (desc) out = out.replace(/(<p class="landing-intro[^"]*">)[\s\S]*?(<\/p>)/, `$1${esc(desc)}$2`);
  // Footer text: inject the live value INTO the inline window.domainConfig so
  // the client-side footer script always sees it (config.js only fills gaps
  // and never overrides the inline object).
  try {
    const ap0 = appearanceSettings();
    const ft = String((ap0 && ap0.footerText) || '').trim();
    if (ft) {
      const escFt = ft.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      if (/\"footerText\"\s*:/.test(out)) {
        out = out.replace(/(\"footerText\"\s*:\s*\")[^\"]*(\")/, `$1${escFt}$2`);
      } else if (/\"domainId\"\s*:\s*\d+\s*\}/.test(out)) {
        out = out.replace(/(\"domainId\"\s*:\s*\d+)\s*(\})/, `$1,\"footerText\":\"${escFt}\"$2`);
      }
    }
  } catch (e) {}
  out = out.replace(/"sameAs"\s*:\s*\[[^\]]*\]/, `"sameAs": [${sameAs.map((u) => `"${esc(u)}"`).join(', ')}]`);
  const favAbs = absolutize(favicon);
  if (favAbs) {
    const base = favicon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('("url"\\s*:\\s*")' + base + '(")', 'g'), `$1${esc(favAbs)}$2`);
  }
  if (favicon) {
    out = out.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${esc(favicon)}">`);
    out = out.replace(/<link rel="shortcut icon"[^>]*>/, `<link rel="shortcut icon" href="${esc(favicon)}">`);
  }
  if (banner) {
    out = out.replace(/<link rel="preload" as="image"[^>]*>/, `<link rel="preload" as="image" href="${esc(banner)}">`);
    out = out.replace(/<img id="site-logo"[^>]*src="[^"]*"/, `<img id="site-logo" src="${esc(favicon || banner)}"`);
    out = out.replace(/<img([^>]*)class="[^"]*site-banner[^"]*"[^>]*>/, (m, beforeClass) => {
      return m.replace(/src="[^"]*"/, `src="${esc(banner)}"`);
    });
  }
  const rewriteConfigKey = (src, key, value) => {
    if (!value) return src;
    return src.replace(new RegExp('("' + key + '"\\s*:\\s*")[^"]*(")'), `$1${escJson(value)}$2`);
  };
  if (defaultAvatar) {
    out = rewriteConfigKey(out, 'defaultAvatarUrl', defaultAvatar);
  }
  if (banner) {
    out = rewriteConfigKey(out, 'bannerUrl', banner);
    out = rewriteConfigKey(out, 'ogImage', ogImg || banner);
  }
  if (favicon) {
    out = rewriteConfigKey(out, 'faviconUrl', favicon);
  }
  // Text SEO (name/title/description/keywords/canonical) must also reach the
  // inline domainConfig so the live client reflects panel edits automatically.
  out = rewriteConfigKey(out, 'siteName', siteName);
  out = rewriteConfigKey(out, 'siteTitle', title);
  out = rewriteConfigKey(out, 'siteDescription', desc);
  out = rewriteConfigKey(out, 'siteKeywords', kw);
  out = rewriteConfigKey(out, 'canonicalUrl', canon || siteName);
  out = rewriteConfigKey(out, 'themeColor', seo.themeColor || '');
  // Structured data (JSON-LD) must follow uploaded images automatically.
  out = out.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    '<script type="application/ld+json">\n' + JSON.stringify(buildJsonLd(seo), (k, v) => (v === undefined ? undefined : v), 2).replace(/<\//g, '<\\/') + '\n</script>'
  );
  // Landing visible texts (site name in header bar, h1 title, intro paragraph)
  // stay in sync with the CP edits so the served page is SEO-consistent.
  out = out.replace(/<span class="small fw-bold" id="header-site-name">[\s\S]*?<\/span>/, `<span class="small fw-bold" id="header-site-name">${esc(siteName)}</span>`);
  out = out.replace(/<h1 class="landing-title mb-1">[\s\S]*?<\/h1>/, `<h1 class="landing-title mb-1">${esc(title)}</h1>`);
  out = out.replace(/<p class="landing-intro mb-0">[\s\S]*?<\/p>/, `<p class="landing-intro mb-0">${esc(desc)}</p>`);
  // Live appearance/colors → rewrite theme-root-vars CSS and inline domainConfig.
  const ap = appearanceSettings();
  if (ap && typeof ap === 'object') {
    APPEARANCE_FIELDS.forEach((f) => {
      const raw = ap[f.key];
      if (raw === undefined || raw === null || String(raw) === '') return;
      let v = String(raw);
      if (f.css) {
        let cssVal = v;
        if (f.key === 'fontSize' && !/px$/i.test(cssVal)) cssVal += 'px';
        const cssVar = f.css;
        out = out.replace(new RegExp('(' + cssVar.replace(/-/g, '\\-') + '\\s*:\\s*)[^;]+;'), `$1${cssVal};`);
      }
      out = rewriteConfigKey(out, f.key, v);
    });
  }
  return out;
}

// ── REST helpers ──────────────────────────────────────────────────────────
function bearerToken(req) {
  const h = req.headers['authorization'] || '';
  if (h.indexOf('Bearer ') === 0) return h.slice(7).trim();
  return req.headers['x-chat-token'] || '';
}

function findUserByToken(token) {
  if (!token) return null;
  return db.users.findOne({ token: token });
}

function dbUserToAuthUser(doc, type) {
  return {
    id: doc.id,
    userId: doc.id,
    username: doc.topic || doc.username,
    topic: doc.topic || doc.username,
    pic: doc.pic || 'pic.png',
    ucol: doc.ucol || '#000000',
    mcol: doc.mcol || '#6c757d',
    bg: doc.bg || '#ffffff',
    fontColor: doc.fontColor || '#000000',
    msg: doc.msg || '',
    co: doc.co || 'us',
    country: doc.co || '',
    rep: doc.rep || 0,
    likes: doc.likes || 0,
    wallPoints: doc.wallPoints || 0,
    coins: doc.coins || 0,
    cover: doc.cover || '',
    membershipBg: doc.membershipBg || '',
    membershipFrame: doc.membershipFrame || '',
    group: doc.group || { id: 0, name: '', roleRank: doc.power === 'admin' ? 999 : 0 },
    rank: doc.power || '',
    power: doc.power || '',
    verified: !!doc.verified,
    isVerified: !!doc.verified,
    isAdmin: !!doc.isAdmin || doc.power === 'admin',
    type: type || 'member',
    mustChooseRoom: false,
    allowPrivate: doc.allowPrivate !== false,
    ...permissionsFor(doc).permissions,
    isActive: true,
  };
}

function makeToken() {
  // Always use a CSPRNG for session/auth tokens (helpers.stringGen uses Math.random).
  return crypto.randomBytes(64).toString('hex') + crypto.randomBytes(16).toString('base64url');
}

// ── Wall-posts persistence (keep wall across restarts; private/room chats clear) ──
function persistWall() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(WALL_PERSIST_FILE, JSON.stringify(wallPosts.slice(0, 500)), 'utf8');
  } catch (e) { logger.warn('wall.persist', 'Write failed', { error: e.message }); }
}

function loadWall() {
  try {
    if (fs.existsSync(WALL_PERSIST_FILE)) {
      const arr = JSON.parse(fs.readFileSync(WALL_PERSIST_FILE, 'utf8'));
      if (Array.isArray(arr)) { wallPosts.length = 0; wallPosts.push(...arr.slice(0, 500)); }
    }
  } catch (e) { logger.warn('wall.load', 'Load failed', { error: e.message }); }
}

// ── Story persistence + lifecycle (Instagram-style: 24h TTL, capped, pruned) ──
function persistStories() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORY_PERSIST_FILE, JSON.stringify(stories.slice(0, STORY_MAX)), 'utf8');
  } catch (e) { logger.warn('story.persist', 'Write failed', { error: e.message }); }
}

function loadStories() {
  try {
    if (fs.existsSync(STORY_PERSIST_FILE)) {
      const arr = JSON.parse(fs.readFileSync(STORY_PERSIST_FILE, 'utf8'));
      if (Array.isArray(arr)) { stories.length = 0; stories.push(...arr.slice(0, STORY_MAX)); }
    }
  } catch (e) { logger.warn('story.load', 'Load failed', { error: e.message }); }
}

// Remove expired stories (and orphaned story files) so RAM/disk stay light.
function pruneStories() {
  const now = Date.now();
  const kept = [];
  const dropFiles = new Set();
  let changed = false;
  for (const s of stories) {
    const t = new Date(s.createdAt).getTime();
    if (!Number.isFinite(t) || (now - t) > STORY_TTL_MS) { changed = true; if (s.mediaUrl) dropFiles.add(s.mediaUrl); continue; }
    kept.push(s);
  }
  if (kept.length > STORY_MAX) { changed = true; kept.slice(STORY_MAX).forEach((s) => { if (s.mediaUrl) dropFiles.add(s.mediaUrl); }); }
  if (changed) {
    stories.length = 0; stories.push(...kept.slice(0, STORY_MAX));
    persistStories();
  }
  // Best-effort cleanup of orphaned story files (only owned, recorded uploads).
  if (dropFiles.size) {
    dropFiles.forEach((url) => {
      try {
        if (!uploadOwners.has(String(url).split('?')[0])) return;
        const f = path.basename(String(url).split('?')[0]);
        const full = path.join(uploadDir, f);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch (e) { /* noop */ }
    });
  }
}

// ── Voice mesh helpers ────────────────────────────────────────────────────
function roomMicState(roomId) {
  return voiceMics.get(String(roomId)) || {};
}
function broadcastRoomState(roomId) {
  const mics = roomMicState(roomId);
  io.to('room:' + roomId).emit('voice:state', { roomId: Number(roomId), mics });
}
function freeMicFor(roomId, micIndex) {
  const mics = roomMicState(roomId);
  const entry = mics[micIndex];
  if (entry) { delete mics[micIndex]; voiceUsers.delete(entry.socketId); broadcastRoomState(roomId); }
}
function freeMic(roomId, micIndex) { freeMicFor(roomId, micIndex); }
function freeAllMicsForSocket(socketId) {
  const u = voiceUsers.get(socketId);
  if (u) freeMic(u.roomId, u.micIndex);
}

// ── REST: /api/auth/* ─────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const rl = rateLimit(clientIp(req), { max: 5, windowMs: 60000 }, 'register');
  if (rl.blocked) return res.status(429).json({ success: false, message: 'محاولات كثيرة، حاول بعد قليل' });
  try {
    const { username, password, fp, fp2, deviceInfo, clientSessionId } = req.body || {};
    const siteweb = (db.settings.find({})[0] || {}).siteweb || {};
    if (!siteweb.allowreg) return res.status(400).json({ success: false, message: 'لا يمكنك تسجيل عضوية حالياً' });
    if (!username || !password) return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    const uname = sanitizeUsername(username, 30);
    if (!uname) return res.status(400).json({ success: false, message: 'اسم المستخدم غير صالح' });
    if (isBannedByIpOrFp(req.ip, fp, fp2)) return res.status(403).json({ success: false, message: 'تم حظرك من الدردشة' });
    {
      const envBan = isBannedByClientEnv(req.headers['user-agent']);
      if (envBan.banned) return res.status(403).json({ success: false, message: envBanMessage(envBan.why) });
    }
    // Case-insensitive uniqueness: "Bob"/"bob" must not become two accounts.
    if ((db.users.find({}) || []).some((x) => x && String(x.topic || x.username || '').toLowerCase() === uname.toLowerCase())) return res.status(400).json({ success: false, message: 'هذا المستخدم مسجل من قبل' });
    if (String(password).trim().length < 4) return res.status(400).json({ success: false, message: 'كلمة المرور قصيرة جداً (4 أحرف على الأقل)' });
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const all = db.users.find({});
    const token = makeToken();
    const doc = {
      topic: uname, username: uname, topic1: uname,
      password: hash, id: helpers.stringGen(15), lid: helpers.stringGen(31),
      idreg: '#' + (all.length + 1), token: token, fp: fp || '', ip: req.ip || '',
      fp2: fp2 || '', deviceInfo: (typeof deviceInfo === 'string' ? deviceInfo.substring(0, 2000) : '') || '',
      co: 'us', code: 'us', pic: 'pic.png', ucol: '#000000', mcol: '#000000',
      bg: '#ffffff', fontColor: '#000000', rep: 0, msg: '', power: '',
      evaluation: 0, stat: 1, loginG: false, documentationc: 0,
      created: new Date().toISOString(),
    };
    db.users.create(doc);
    logger.info('auth.register', 'Registered', { username: uname });
    if (clientSessionId) setActiveSession(clientSessionId, { uid: doc.id, token });
    res.json({ success: true, user: dbUserToAuthUser(doc, 'member'), token });
  } catch (e) {
    logger.error('auth.register', 'Error', { error: e.message });
    res.status(500).json({ success: false, message: 'خطأ في التسجيل' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const rl = rateLimit(clientIp(req), { max: 10, windowMs: 60000 }, 'login');
  if (rl.blocked) return res.status(429).json({ success: false, message: 'محاولات دخول كثيرة، حاول بعد قليل' });
  try {
    const { username, password, fp, fp2, deviceInfo, clientSessionId } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    // Strip control/injection chars but allow the reserved admin name here so
    // the owner can actually sign in (the reserved-name block applies to register/guest).
    const uname = String(username).replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '').trim().slice(0, 30);
    if (!uname) return res.status(400).json({ success: false, message: 'اسم المستخدم غير صالح' });
    if (isBannedByIpOrFp(req.ip, fp, fp2)) return res.status(403).json({ success: false, message: 'تم حظرك من الدردشة' });
    {
      const envBan = isBannedByClientEnv(req.headers['user-agent']);
      if (envBan.banned) return res.status(403).json({ success: false, message: envBanMessage(envBan.why) });
    }
    const doc = db.users.findOne({ topic: uname }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === uname.toLowerCase());
    if (!doc) return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    const ok = await bcrypt.compare(password, doc.password);
    if (!ok) return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    const token = doc.token || makeToken();
    const upd = { token };
    if (fp) upd.fp = fp;
    if (fp2) upd.fp2 = fp2;
    if (deviceInfo) upd.deviceInfo = String(deviceInfo).substring(0, 2000);
    if (req.ip) upd.ip = req.ip;
    if (Object.keys(upd).length > 1 || !doc.token) db.users.updateOne({ topic: uname }, { $set: upd });
    logger.info('auth.login', 'Logged in', { username: uname });
    if (clientSessionId) setActiveSession(clientSessionId, { uid: doc.id, token });
    res.json({ success: true, user: dbUserToAuthUser(doc, 'member'), token });
  } catch (e) {
    logger.error('auth.login', 'Error', { error: e.message });
    res.status(500).json({ success: false, message: 'خطأ في الدخول' });
  }
});

app.post('/api/auth/guest', (req, res) => {
  const rl = rateLimit(clientIp(req), { max: 10, windowMs: 60000 }, 'guest');
  if (rl.blocked) return res.status(429).json({ success: false, message: 'محاولات كثيرة، حاول بعد قليل' });
  try {
    const { nickname, fp, fp2, deviceInfo, clientSessionId } = req.body || {};
    const siteweb = (db.settings.find({})[0] || {}).siteweb || {};
    if (!siteweb.allowg) return res.status(400).json({ success: false, message: 'الزوار غير مسموح لهم حالياً' });
    if (!nickname || String(nickname).trim().length < 3) return res.status(400).json({ success: false, message: 'يرجى إدخال اسم الزائر (3 أحرف على الأقل)' });
    const name = sanitizeUsername(nickname, 24);
    if (name.length < 3) return res.status(400).json({ success: false, message: 'يرجى إدخال اسم زائر صالح (3 أحرف على الأقل)' });
    if (isBannedByIpOrFp(req.ip, fp, fp2)) return res.status(403).json({ success: false, message: 'تم حظرك من الدردشة' });
    {
      const envBan = isBannedByClientEnv(req.headers['user-agent']);
      if (envBan.banned) return res.status(403).json({ success: false, message: envBanMessage(envBan.why) });
    }
    const nameLc = name.toLowerCase();
    if ((db.users.find({}) || []).some((x) => x && String(x.topic || x.username || '').toLowerCase() === nameLc)) return res.status(400).json({ success: false, message: 'لا يمكنك الدخول باسم مسجل' });
    let takenByGuest = false;
    guestRegistry.forEach((g) => { if (g && String(g.username || '').toLowerCase() === nameLc) takenByGuest = true; });
    onlineSockets.forEach((o) => { if (o && o.guest && String(o.username || '').toLowerCase() === nameLc) takenByGuest = true; });
    if (takenByGuest) return res.status(400).json({ success: false, message: 'لا يمكنك الدخول بهذا الاسم' });
    const guest = {
      id: 'g_' + helpers.stringGen(12),
      guestId: 'g_' + helpers.stringGen(12),
      userId: 'g_' + helpers.stringGen(12),
      uid: '',
      username: name, topic: name, type: 'guest', guest: true,
      pic: 'pic.png', ucol: '#000000', mcol: '#6c757d', bg: '#ffffff',
      msg: '', co: 'us', country: 'us', rep: 0, likes: 0, coins: 0, wallPoints: 0,
      token: makeToken(), fp: fp || '', fp2: fp2 || '', ip: req.ip || '',
      deviceInfo: (typeof deviceInfo === 'string' ? deviceInfo.substring(0, 2000) : '') || '',
      stealth: false, isHidden: false, isIdle: false, rank: '',
      group: { id: 0, name: '', roleRank: 0 },
      isAdmin: false, verified: false, allowPrivate: true,
      joinTime: Date.now(),
    };
    // Keep a lightweight DB-less guest registry: store in a dedicated map.
    guestRegistry.set(guest.guestId, guest);
    if (clientSessionId) setActiveSession(clientSessionId, { uid: guest.guestId, token: guest.token, guest: true });
    logger.info('auth.guest', 'Guest entered', { nickname: name });
    res.json({
      success: true,
      user: {
        id: guest.guestId, userId: guest.guestId, guestId: guest.guestId,
        username: name, topic: name, type: 'guest',
        pic: 'pic.png', ucol: '#000000', mcol: '#6c757d', bg: '#ffffff',
        msg: '', co: 'us', country: 'us', rep: 0, likes: 0, coins: 0, wallPoints: 0,
        group: { id: 0, name: '', roleRank: 0 },
        permissions: permissionsFor({ type: 'guest' }).permissions,
        isOnline: true, isGhost: false, isHidden: false, isIdle: false,
        allowPrivate: true, mustChooseRoom: false, isAdmin: false, verified: false,
      },
      token: guest.token,
    });
  } catch (e) {
    logger.error('auth.guest', 'Error', { error: e.message });
    res.status(500).json({ success: false, message: 'خطأ في دخول الزائر' });
  }
});

app.get('/api/check-env', (req, res) => {
  const b = isBannedByClientEnv(req.headers['user-agent'] || '');
  res.json({ banned: !!b.banned, why: b.why || '' });
});
app.post('/api/auth/logout', (req, res) => {
  const token = bearerToken(req);
  if (token) {
    const sess = tokenToUser.get(token);
    const username = (sess && sess.username) || '';
    if (sess && sess.socketId && onlineSockets.has(sess.socketId)) {
      onlineSockets.delete(sess.socketId);
    }
    tokenToUser.delete(token);
    purgeGuestRegistryForToken(token);
    // remove from activeSessions
    activeSessions.forEach((v, k) => { if (v.token === token) activeSessions.delete(k); });
    if (sess && sess.socketId) {
      const targetSocket = io.sockets.sockets.get(sess.socketId);
      if (targetSocket) targetSocket.disconnect(true);
    }
    // Rotate the stored DB token so a leaked token stops authenticating after
    // logout — but only when no other live socket is using this account, so
    // concurrent devices are not broken.
    try {
      if (sess) {
        const others = [];
        onlineSockets.forEach((u) => { if (String(u.uid) === String(sess.uid) || String(u.username).toLowerCase() === String(sess.username || '').toLowerCase()) others.push(1); });
        if (others.length === 0) {
          const doc = findUserByToken(token);
          if (doc) db.users.updateOne({ token }, { $set: { token: makeToken() } });
        }
      }
    } catch (e) { /* best effort */ }
    // Do NOT destroy private threads here — logout should never erase PMs.
    io.emit('user-left', { name: username });
    broadcastPresence();
  }
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = bearerToken(req);
  const doc = findUserByToken(token);
  if (!doc) {
    // guest fallback: check the guest registry directly by token
    let guestUser = null;
    guestRegistry.forEach((u) => { if (u.token === token) guestUser = u; });
    if (guestUser) {
      return res.json({ success: true, user: { ...publicUser(guestUser), mustChooseRoom: false } });
    }
    return res.status(401).json({ success: false, message: 'Session expired, please login again' });
  }
  res.json({ success: true, user: dbUserToAuthUser(doc, 'member') });
});

app.post('/api/presence/terminal-exit', (req, res) => {
  const { token } = req.body || {};
  const sess = token ? tokenToUser.get(token) : null;
  if (token && sess) {
    const username = sess.username || '';
    if (sess.socketId && onlineSockets.has(sess.socketId)) {
      onlineSockets.delete(sess.socketId);
    }
    tokenToUser.delete(token);
    purgeGuestRegistryForToken(token);
    if (sess.socketId) {
      const targetSocket = io.sockets.sockets.get(sess.socketId);
      if (targetSocket) targetSocket.disconnect(true);
    }
    io.emit('user-left', { name: username });
    broadcastPresence();
  }
  // Invalid/unknown tokens are ignored — this endpoint never destroys PMs and
  // never affects sessions it cannot positively attribute to the caller.
  res.json({ success: true });
});

// ── REST: settings & misc ─────────────────────────────────────────────────
app.get('/api/settings/features', (req, res) => {
  res.json(featuresSettings());
});

app.get('/api/settings/news-ticker', (req, res) => {
  res.json(newsTickerSettings());
});

app.get('/api/settings/admin-ads-ticker', (req, res) => {
  res.json(adsTickerSettings());
});

app.get('/api/settings/badges', (req, res) => {
  res.json(badgeConfigGet());
});

app.get('/api/settings/appearance', (req, res) => {
  res.json(loadDomainConfig());
});

app.get('/api/settings/login-behavior', (req, res) => {
  res.json(loginBehaviorSettings());
});

// Public list of currently online users (landing page / guest presence). The
// live client's landing list (public-online-users.js) polls this endpoint.
app.get('/api/public/online-users', (req, res) => {
  res.json(serializeAllPresence());
});

// Module-level accessor for CP-managed settings (shared by REST + socket).
// The per-socket cp* helpers below use this same function.
function moduleSettings() {
  if (!db || !db.settings) return null;
  let doc = db.settings.getAll()[0];
  if (!doc) {
    doc = { siteweb: { name: 'TigerHost Chat', title: 'TigerHost Chat', bg: '#40404f', buttons: '#f93634', background: '#40404f', msgst: 5, allowg: true, allowreg: true }, dro3: [], emo: [], sico: [], shrt: [], msgs: [], banssystems: { browsers: {}, systems: {} } };
    db.settings.create(doc);
  }
  return doc;
}

app.get('/api/shortcuts', (req, res) => {
  const doc = moduleSettings();
  const shrt = doc && Array.isArray(doc.shrt) ? doc.shrt : [];
  res.json(shrt.filter((s) => s && s.name));
});

app.get('/api/smileys', (req, res) => {
  const doc = moduleSettings();
  const emo = doc && Array.isArray(doc.emo) ? doc.emo : [];
  res.json(emo);
});

app.get('/api/membership-assets', (req, res) => {
  res.json([]);
});

app.get('/api/chat/allowed-promotion-groups', (req, res) => {
  res.json([]);
});

app.get('/api/profile-visits/top', (req, res) => res.json([]));
app.get('/api/profile-visits/me', (req, res) => res.json([]));

app.post('/api/ban-cookie/set', (req, res) => res.json({ success: true }));

// ── Admin Control Panel (REST API) ────────────────────────────────────────
const cpSessions = new Map(); // cpToken -> { username, role, at }
const cpToken = () => crypto.randomBytes(24).toString('hex');

function cpAuthed(req) {
  const t = (req.headers.cookie || '')
    .split(';').map((s) => s.trim())
    .find((c) => c.indexOf('cp_token=') === 0);
  if (!t) return null;
  const token = decodeURIComponent(t.slice('cp_token='.length));
  return cpSessions.get(token) || null;
}
function cpEnd(req, res) {
  const s = cpAuthed(req);
  if (!s) return res.status(401).json({ ok: false, message: 'غير مصرح' });
  return s;
}

// Site roles (owner / founder / management) drive the VIP badges shown in the
// profile modal. They are configured from the CP and consumed by the client
// via GET /api/site-roles.
function getSiteRoles() {
  const doc = db.settings.find({})[0] || {};
  const r = doc.siteRoles || {};
  return {
    owner: typeof r.owner === 'string' && r.owner ? r.owner : config.adminUser,
    founders: Array.isArray(r.founders) ? r.founders : [],
    managers: Array.isArray(r.managers) ? r.managers : [],
  };
}
function saveSiteRoles(roles) {
  const doc = db.settings.findOne({}) || db.settings.getAll()[0];
  const target = doc || {};
  target.siteRoles = {
    owner: String(roles.owner || config.adminUser).trim(),
    founders: (Array.isArray(roles.founders) ? roles.founders : []).map((x) => String(x).trim()).filter(Boolean),
    managers: (Array.isArray(roles.managers) ? roles.managers : []).map((x) => String(x).trim()).filter(Boolean),
  };
  if (doc) db.settings.updateOne({}, { $set: { siteRoles: target.siteRoles } });
  else db.settings.create(target);
  return target.siteRoles;
}

// Public roles config for the client badge script.
app.get('/api/site-roles', (req, res) => res.json(getSiteRoles()));

app.post('/cp/login', (req, res) => {
  const rl = rateLimit(clientIp(req), { max: 5, windowMs: 60000 }, 'cplogin');
  if (rl.blocked) return res.status(429).json({ ok: false, message: 'محاولات كثيرة، حاول بعد قليل' });
  try {
    const username = String((req.body || {}).username || '').trim();
    const password = String((req.body || {}).password || '');
    if (!username || !password) return res.status(400).json({ ok: false, message: 'أدخل اسم المستخدم وكلمة المرور' });

    // The CP owner is the configured admin account (seeded from .env). Also
    // allow any persistent member marked admin in the DB (power/isAdmin).
    const candidates = db.users.find({}).filter((x) => x && String(x.topic || x.username || '').toLowerCase() === username.toLowerCase());
    const authenticated =
      username.toLowerCase() === String(config.adminUser).toLowerCase() &&
      (password === config.adminPass || (candidates[0] && candidates[0].password && bcrypt.compareSync(password, candidates[0].password))) ||
      (candidates.some((x) => x.power === 'admin' || x.isAdmin) && candidates.some((x) => x.password && bcrypt.compareSync(password, x.password)));
    if (!authenticated) {
      return res.status(401).json({ ok: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة أو لا تملك صلاحية الإدارة' });
    }
    const token = cpToken();
    const adminName = candidates[0] ? candidates[0].topic || candidates[0].username : config.adminUser;
    cpSessions.set(token, { username: adminName, role: 'admin', at: Date.now() });
    res.setHeader('Set-Cookie', 'cp_token=' + token + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400');
    res.json({ ok: true, admin: { username: adminName } });
  } catch (e) {
    logger.error('cp.login', 'Error', { error: e.message });
    res.status(500).json({ ok: false, message: 'خطأ في الخادم' });
  }
});

app.post('/cp/logout', (req, res) => {
  const s = cpAuthed(req);
  if (s) for (const [k, v] of cpSessions) if (v.username === s.username) cpSessions.delete(k);
  res.setHeader('Set-Cookie', 'cp_token=; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/cp/data', (req, res) => {
  const s = cpEnd(req, res);
  if (s === null) return;
  let onlineCount = 0;
  onlineSockets.forEach(() => { onlineCount++; });
  const members = (db.users.find({}) || []).filter((u) => u && !u.guest && u.type !== 'guest');
  const users = members.map((u) => {
    const isOnline = (() => {
      let on = false;
      onlineSockets.forEach((o) => { if (String(o.uid || o.userId || o.id) === String(u.id) || String(o.username).toLowerCase() === String(u.username || u.topic || '').toLowerCase()) on = true; });
      return on;
    })();
    const role = (u.power === 'admin' || u.isAdmin) ? 'admin' : (u.power ? 'mod' : 'user');
    return {
      id: u.id, username: u.username || u.topic, nickname: u.topic || u.username,
      country: u.co || u.country || '', role,
      online: isOnline, points: u.rep || u.points || 0, coins: u.coins || 0, createdAt: u.created,
    };
  });
  let msgCount = 0;
  roomHistory.forEach((arr) => { msgCount += (arr || []).length; });
  msgCount += wallPosts.length + quickChatMsgs.length;
  const bans = (db.bans ? db.bans.getAll() : []).map((b) => ({
    key: b.key || b.userId || b.id || '', name: b.name || b.username || b.topic || '',
    reason: b.reason || '', at: b.at || b.createdAt || b.date || '',
  }));
  res.json({
    ok: true,
    admin: s,
    stats: { users: members.length, online: onlineCount, rooms: (db.rooms.getAll() || []).length, messages: msgCount },
    rooms: (db.rooms.getAll() || []).map((r) => ({ id: r.id, name: r.name, order: r.order || 0 })),
    users,
    bans,
    roles: getSiteRoles(),
  });
});

app.post('/cp/room', (req, res) => {
  const s = cpEnd(req, res);
  if (s === null) return;
  const b = req.body || {};
  const action = b.action;
  const roomsCol = db.rooms;
  if (action === 'add') {
    const name = String(b.name || '').trim().slice(0, 30);
    if (!name) return res.json({ ok: false, message: 'أدخل اسم الغرفة' });
    const all = roomsCol.getAll() || [];
    const room = { id: nextId('room_'), name, thumb: '', order: all.length, created: new Date().toISOString(), password: '', isActive: true, isLocked: false, capacity: 0, roomLevel: 0 };
    roomsCol.create(room);
    io.emit('rooms-stats', roomStats());
    return res.json({ ok: true, room: { id: room.id, name: room.name } });
  }
  if (action === 'rename') {
    const room = roomsCol.findOne({ id: String(b.id) });
    if (!room) return res.json({ ok: false, message: 'الغرفة غير موجودة' });
    roomsCol.updateOne({ id: room.id }, { $set: { name: String(b.name || '').trim().slice(0, 30) || room.name } });
    io.emit('rooms-stats', roomStats());
    return res.json({ ok: true, name: room.name });
  }
  if (action === 'delete') {
    const room = roomsCol.findOne({ id: String(b.id) });
    if (!room) return res.json({ ok: false, message: 'الغرفة غير موجودة' });
    if (String(room.id) === 'general' || String(room.id) === String(GENERAL_ROOM_ID)) return res.json({ ok: false, message: 'لا يمكن حذف الغرفة العامة' });
    roomsCol.deleteOne({ id: room.id });
    roomHistory.delete(String(room.id));
    io.emit('rooms-stats', roomStats());
    return res.json({ ok: true });
  }
  res.json({ ok: false, message: 'إجراء غير معروف' });
});

app.post('/cp/user', (req, res) => {
  const s = cpEnd(req, res);
  if (s === null) return;
  const b = req.body || {};
  const reason = String(b.reason || '').slice(0, 120);
  const findDoc = () => db.users.findOne({ id: String(b.targetId) });
  const findOnlineSocket = (u) => {
    let sid = null;
    onlineSockets.forEach((o, k) => {
      if (o && u && (String(o.uid || o.userId || o.id) === String(u.id) || String(o.username).toLowerCase() === String(u.username || u.topic || '').toLowerCase())) sid = k;
    });
    return sid;
  };

  if (b.action === 'kick') {
    const target = findDoc();
    if (!target) return res.json({ ok: false, message: 'المستخدم غير موجود' });
    const sid = findOnlineSocket(target);
    if (sid) { const sk = io.sockets.sockets.get(sid); if (sk) sk.emit('kicked', { reason }); }
    return res.json({ ok: true });
  }
  if (b.action === 'ban') {
    const target = findDoc();
    if (!target) return res.json({ ok: false, message: 'المستخدم غير موجود' });
    const nick = target.topic || target.username || '';
    if (db.bans) db.bans.create({ key: String(target.id), name: nick, reason, at: Date.now() });
    const sid = findOnlineSocket(target);
    if (sid) { const sk = io.sockets.sockets.get(sid); if (sk) sk.emit('banned', { reason: 'تم حظرك: ' + reason, expiresAt: null }); }
    io.emit('system-message', { message: 'تم حظر العضو ' + nick + ' (' + reason + ')', content: 'تم حظر العضو ' + nick + ' (' + reason + ')', title: 'حظر' });
    return res.json({ ok: true });
  }
  if (b.action === 'banName') {
    const target = findDoc();
    if (!target) return res.json({ ok: false, message: 'المستخدم غير موجود' });
    const nick = target.topic || target.username || '';
    if (db.bans) db.bans.create({ key: 'name:' + nick.toLowerCase(), name: nick, reason, at: Date.now() });
    return res.json({ ok: true });
  }
  if (b.action === 'unban') {
    const key = String(b.key || '');
    if (db.bans) db.bans.deleteOne({ key });
    return res.json({ ok: true });
  }
  if (b.action === 'setrole') {
    const target = findDoc();
    if (!target) return res.json({ ok: false, message: 'المستخدم غير موجود' });
    const meName = String(s.username || '').toLowerCase();
    const targetName = String(target.topic || target.username || '').toLowerCase();
    if (meName === targetName && b.role !== 'admin') {
      return res.json({ ok: false, message: 'لا يمكن إزالة صلاحية الأدمن من نفسك' });
    }
    db.users.updateOne({ id: target.id }, { $set: { power: b.role === 'admin' ? 'admin' : (b.role || 'user') } });
    onlineSockets.forEach((o) => { if (String(o.username).toLowerCase() === targetName) { o.power = b.role; o.isAdmin = b.role === 'admin'; } });
    broadcastPresence();
    return res.json({ ok: true });
  }
  res.json({ ok: false, message: 'إجراء غير معروف' });
});

// Save site roles (owner/founder/managers) from the CP.
app.post('/cp/roles', (req, res) => {
  const s = cpEnd(req, res);
  if (s === null) return;
  const b = req.body || {};
  const roles = saveSiteRoles(b);
  res.json({ ok: true, roles });
});

// ── REST: private chat archive ────────────────────────────────────────────
function privateKey(a, b) {
  return [String(a).toLowerCase(), String(b).toLowerCase()].sort().join('::');
}
function getPrivateThread(a, b) {
  const key = privateKey(a, b);
  if (!privateMessages.has(key)) privateMessages.set(key, []);
  return privateMessages.get(key);
}
function pmInvolved(m, name) {
  return String(m.from || '').toLowerCase() === String(name || '').toLowerCase() || String(m.to || '').toLowerCase() === String(name || '').toLowerCase();
}

// Find an online user by username (member or guest)
function findUserByUsername(username) {
  let found = null;
  onlineSockets.forEach((u) => { if (String(u.username).toLowerCase() === String(username).toLowerCase()) found = u; });
  return found;
}

// Single active session per account: disconnect any existing socket for the same
// user (same member uid, or same guest identity/nickname) and broadcast presence.
// - Existing socket with a DIFFERENT clientSessionId  -> true second login: kick with
//   session-expired so the old tab shows "logged in elsewhere".
// - Existing socket with the SAME clientSessionId     -> socket.io reconnect of the
//   same tab: the new socket silently supersedes the old one (no modal).
function kickExistingSessionsForUser(user, excludeSocketId, clientSessionId) {
  const kicks = [];   // different session -> session-expired modal
  const superseders = []; // same session -> silent takeover
  onlineSockets.forEach((u, sid) => {
    if (sid === excludeSocketId) return;
    const sameMember = !user.guest && !u.guest && user.uid && String(user.uid) === String(u.uid);
    const sameGuest = (user.guest || u.guest) && user.username && String(user.username).toLowerCase() === String(u.username).toLowerCase();
    const sameIdentity = sameMember || sameGuest;
    if (!sameIdentity) return;
    if (clientSessionId && socketSession.get(sid) === clientSessionId) superseders.push(sid);
    else kicks.push(sid);
  });

  const drop = (sid, withModal) => {
    const old = onlineSockets.get(sid);
    onlineSockets.delete(sid);
    socketSession.delete(sid);
    tokenToUser.forEach((v, k) => { if (v.socketId === sid) tokenToUser.delete(k); });
    activeSessions.forEach((v, k) => { if (v.token && old && v.token === old.token) activeSessions.delete(k); });
    const oldSocket = io.sockets.sockets.get(sid);
    if (oldSocket) {
      if (withModal) {
        oldSocket.emit('session-expired', { reason: 'logged-in-elsewhere', message: 'تم تسجيل دخولك في جلسة أخرى، تم إغلاق هذه الجلسة' });
      }
      oldSocket.disconnect(true);
    }
  };

  kicks.forEach((sid) => drop(sid, true));
  superseders.forEach((sid) => drop(sid, false));

  if (kicks.length + superseders.length > 0) {
    broadcastPresence();
  }
}

// Destroy all private threads involving `username` and notify surviving peers
// that the conversation is closed/deleted (used when a member leaves the chat).
function destroyPrivateThreadsForUser(username) {
  if (!username) return [];
  const name = String(username).toLowerCase();
  const affectedPeers = [];
  privateMessages.forEach((msgs, key) => {
    const [a, b] = key.split('::');
    if (a === name || b === name) {
      const peer = a === name ? b : a;
      if (!affectedPeers.includes(peer)) affectedPeers.push(peer);
    }
  });
  if (affectedPeers.length === 0) {
    // Still clean up any key where the name appears
    privateMessages.forEach((msgs, key) => {
      const [a, b] = key.split('::');
      if (a === name || b === name) privateMessages.delete(key);
    });
    return [];
  }
  affectedPeers.forEach((peer) => {
    privateMessages.delete(privateKey(username, peer));
  });
  // Notify each online peer that their conversation with this user has been deleted
  affectedPeers.forEach((peer) => {
    const target = findUserByUsername(peer);
    if (target) {
      let targetSocket = null;
      onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
      if (targetSocket) {
        io.to(targetSocket).emit('private-conversation-deleted', {
          fromUsername: username,
          peerUsername: peer,
        });
      }
    }
  });
  return affectedPeers;
}

// Force-remove every thread keyed by the given user (legacy/sweep fallback)
function clearAllPrivateThreadsForUser(username) {
  if (!username) return;
  const name = String(username).toLowerCase();
  privateMessages.forEach((msgs, key) => {
    const [a, b] = key.split('::');
    if (a === name || b === name) privateMessages.delete(key);
  });
}

// GET /api/private/conversations → array of { user, messages, lastMessageTime }
app.get('/api/private/conversations', (req, res) => {
  const token = bearerToken(req);
  const me = findUserByToken(token);
  const myName = me ? me.topic : null;
  const sessionStart = sessionStartFromReq(req);
  const convs = [];
  privateMessages.forEach((msgs, key) => {
    if (!myName) return;
    const [nameA, nameB] = key.split('::');
    const peerName = String(nameA).toLowerCase() === String(myName).toLowerCase() ? nameB : nameA;
    const peerMsgs = msgs.filter((m) => pmInvolved(m, myName))
      .filter((m) => !sessionStart || !m.timestamp || new Date(m.timestamp).getTime() >= sessionStart);
    if (peerMsgs.length === 0) return;
    const last = peerMsgs[peerMsgs.length - 1];
    const peer = findUserByUsername(peerName);
    convs.push({
      user: peer ? publicUser(peer) : { username: peerName, topic: peerName, type: 'user', id: peerName, userId: peerName },
      messages: peerMsgs,
      lastMessageTime: last.timestamp,
    });
  });
  convs.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
  res.json(convs);
});

app.get('/api/private/messages/:peerType/:peerId', (req, res) => {
  const token = bearerToken(req);
  const me = findUserByToken(token);
  const myName = me ? me.topic : null;
  if (!myName) return res.json([]);
  const peerName = req.params.peerId;
  const sessionStart = sessionStartFromReq(req);
  const thread = getPrivateThread(myName, peerName).filter((m) => pmInvolved(m, myName))
    .filter((m) => !sessionStart || !m.timestamp || new Date(m.timestamp).getTime() >= sessionStart);
  res.json(thread);
});

app.get('/api/private/messages-by-username/:username', (req, res) => {
  const token = bearerToken(req);
  const me = findUserByToken(token);
  const myName = me ? me.topic : null;
  if (!myName) return res.json([]);
  const peerName = req.params.username;
  const sessionStart = sessionStartFromReq(req);
  const thread = getPrivateThread(myName, peerName).filter((m) => pmInvolved(m, myName))
    .filter((m) => !sessionStart || !m.timestamp || new Date(m.timestamp).getTime() >= sessionStart);
  res.json(thread);
});

app.post('/api/private/conversations/delete', (req, res) => {
  const token = bearerToken(req);
  const me = findUserByToken(token);
  const myName = me ? me.topic : null;
  const target = req.body && (req.body.username || req.body.peerId);
  if (myName && target) {
    privateMessages.delete(privateKey(myName, target));
  } else {
    // legacy: delete all matching target occurrences
    privateMessages.forEach((msgs, key) => {
      if (!myName) return;
      const [a, b] = key.split('::');
      if (String(a) === String(target) || String(b) === String(target)) privateMessages.delete(key);
    });
  }
  res.json({ success: true });
});

// ── REST: rooms ───────────────────────────────────────────────────────────
function roomToClient(r) {
  let online = 0;
  onlineSockets.forEach((u) => { if (String(u.roomid) === String(r.id)) online++; });
  return {
    id: r.id, name: r.name, owner: r.owner, ownerId: r.ownerId || '',
    roomOwner: r.owner, hasPassword: !!r.password, created: r.created,
    online, disableChat: !!r.disableChat, allowModsWriteInClosedChat: r.allowModsWriteInClosedChat !== false,
    moderators: Array.isArray(r.moderators) ? r.moderators : [],
    lockedMics: Array.isArray(r.lockedMics) ? r.lockedMics : [],
    isActive: r.isActive !== false,
    isLocked: !!r.password,
    openedTime: r.openedTime || '',
    capacity: r.capacity || 0,
    roomLevel: r.roomLevel || 0,
    useBanner: !!r.useBanner,
    roomBackgroundImage: r.roomBackgroundImage || '',
    roomBackgroundColor: r.roomBackgroundColor || '',
    useThumbnail: !!r.useThumbnail,
    roomThumbnail: r.roomThumbnail || '',
    roomNameColor: r.roomNameColor || '',
    roomMessageColor: r.roomMessageColor || '',
    roomDescription: r.roomDescription || '',
    roomWelcomeMessage: r.roomWelcomeMessage || '',
    requiredLikes: r.requiredLikes || 0,
    roomMaxMicSlots: r.roomMaxMicSlots || 4,
    allowCamera: !!r.allowCamera,
    allowVoiceMics: r.allowVoiceMics !== false,
    allowBroadcast: !!r.allowBroadcast,
    preventHiddenUsers: !!r.preventHiddenUsers,
    allowRoomMusic: r.allowRoomMusic !== false,
    moderatorsCanManageMusic: r.moderatorsCanManageMusic !== false,
    membersCanRequestMusic: r.membersCanRequestMusic !== false,
  };
}

function findRoomByAnyId(rawId) {
  const strId = String(rawId);
  return (db.rooms.getAll() || []).find((r) => String(r.id) === strId || Number(r.id) === Number(rawId)) || null;
}

function roomBoolField(req, key) {
  const v = req.body && req.body[key];
  return v === true || v === 'true' || v === 'on' || v === '1';
}

function roomApplyCommonFields(req, room, files) {
  const b = req.body || {};
  if (b.name !== undefined && b.name !== null) room.name = sanitizeRoomName(b.name, 30);
  if (b.roomDescription !== undefined) room.roomDescription = sanitizeRoomName(b.roomDescription, 500);
  if (b.roomWelcomeMessage !== undefined) room.roomWelcomeMessage = sanitizeRoomName(b.roomWelcomeMessage, 1000);
  if (b.requiredLikes !== undefined && b.requiredLikes !== '') room.requiredLikes = parseInt(b.requiredLikes, 10) || 0;
  if (b.capacity !== undefined && b.capacity !== '') room.capacity = parseInt(b.capacity, 10) || 0;
  if (b.roomMaxMicSlots !== undefined && b.roomMaxMicSlots !== '') room.roomMaxMicSlots = parseInt(b.roomMaxMicSlots, 10) || 4;
  if (b.roomNameColor !== undefined) room.roomNameColor = sanitizeColor(b.roomNameColor);
  if (b.roomMessageColor !== undefined) room.roomMessageColor = sanitizeColor(b.roomMessageColor);
  if (b.roomBackgroundColor !== undefined) room.roomBackgroundColor = sanitizeColor(b.roomBackgroundColor);
  if (b.roomNameColorHex !== undefined && String(b.roomNameColorHex).charAt(0) === '#') room.roomNameColor = sanitizeColor(b.roomNameColorHex);
  if (b.roomMessageColorHex !== undefined && String(b.roomMessageColorHex).charAt(0) === '#') room.roomMessageColor = sanitizeColor(b.roomMessageColorHex);
  if (b.roomBackgroundColorHex !== undefined && String(b.roomBackgroundColorHex).charAt(0) === '#') room.roomBackgroundColor = sanitizeColor(b.roomBackgroundColorHex);
  if (b.removePassword === 'true' || b.removePassword === true || b.removePassword === 'on') {
    room.password = '';
  } else if (b.roomPassword !== undefined && b.roomPassword !== '') {
    room.password = String(b.roomPassword);
  }
  room.isLocked = !!room.password;
  room.allowCamera = roomBoolField(req, 'allowCamera');
  room.allowBroadcast = roomBoolField(req, 'allowBroadcast');
  room.preventHiddenUsers = roomBoolField(req, 'preventHiddenUsers');
  room.useBanner = roomBoolField(req, 'useBanner');
  room.useThumbnail = roomBoolField(req, 'useThumbnail');
  room.disableChat = roomBoolField(req, 'disableChat');
  room.allowVoiceMics = !roomBoolField(req, 'disableVoiceMics') && b.allowVoiceMics !== 'false';
  room.allowRoomMusic = b.allowRoomMusic !== 'false';
  room.moderatorsCanManageMusic = b.moderatorsCanManageMusic !== 'false';
  room.membersCanRequestMusic = b.membersCanRequestMusic !== 'false';
  room.allowModsWriteInClosedChat = b.allowModsWriteInClosedChat !== 'false';
  if (files) {
    // Reject non-image content that slipped past the fileFilter (e.g. a renamed
    // HTML payload) so room thumbnails/banners can never become stored XSS.
    const safeUrl = (f) => {
      const file = f && f[0];
      if (!file) return '';
      let ok = false;
      try {
        const sniffed = helpers.sniffExt(fs.readFileSync(file.path));
        const ext = path.extname(file.originalname || '').toLowerCase().replace(/^\./, '');
        const fam = SNIFF_FAMILY[ext];
        ok = fam && sniffed === fam;
      } catch (e) { ok = false; }
      if (!ok) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        return '';
      }
      return '/assets/uploads/' + file.filename;
    };
    const thumb = safeUrl(files.thumbnail);
    const banner = safeUrl(files.banner);
    if (thumb) room.roomThumbnail = thumb;
    if (banner) room.roomBackgroundImage = banner;
  }
  return room;
}

// ── Uploads (cover / membership / room images) ────────────────────────────
const uploadDir = path.join(ROOT_DIR, 'assets', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Track which upload filenames were created by which authenticated user, so a
// story can never be used to delete another user's (or the server's) files.
const uploadOwners = new Map(); // filename -> ownerId
function recordUploadOwner(filename, uid) {
  try { if (filename && uid) uploadOwners.set(String(filename).split('?')[0], String(uid)); } catch (e) {}
}
function canDeleteUploadedFile(filename, uid) {
  try {
    if (!filename) return false;
    const base = String(filename).split('?')[0];
    const owner = uploadOwners.get(base);
    // Files we never recorded are not deletable via the story lifecycle.
    return owner != null && owner === String(uid);
  } catch (e) { return false; }
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers['cookie'] || '';
  raw.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Multer for multipart file uploads (wall files, avatars, covers, etc.)
const storage = multer.diskStorage({
  destination(req, file, cb) { cb(null, uploadDir); },
  filename(req, file, cb) {
    const safe = path.extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + safe);
  },
});
const uploadSingle = multer({ storage, limits: { fileSize: config.maxUploadBytes || 50 * 1024 * 1024 } }).single('file');
// Room thumbnails/banners are rendered as <img> src by the client, so only raster
// image extensions are accepted and content is validated by magic bytes below.
const ROOM_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
const imageFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase().replace(/^\./, '');
  if (ROOM_IMAGE_EXTS.has(ext)) return cb(null, true);
  cb(null, false);
};
const uploadRoomImages = multer({ storage, limits: { fileSize: config.maxUploadBytes || 50 * 1024 * 1024 }, fileFilter: imageFileFilter }).fields([{ name: 'thumbnail', maxCount: 1 }, { name: 'banner', maxCount: 1 }]);

app.get('/api/rooms', (req, res) => {
  res.json((db.rooms.getAll() || []).map(roomToClient));
});

app.get('/api/rooms/:id', (req, res) => {
  const r = findRoomByAnyId(req.params.id);
  if (!r) return res.status(404).json({ error: 'Room not found' });
  res.json(roomToClient(r));
});

app.post('/api/rooms', uploadRoomImages, (req, res) => {
  const rl = rateLimit(clientIp(req), { max: 5, windowMs: 60000 }, 'room-create');
  if (rl.blocked) return res.status(429).json({ error: 'محاولات كثيرة، حاول بعد قليل' });
  const name = sanitizeRoomName((req.body && req.body.name) || '', 30);
  if (!name) return res.status(400).json({ error: 'Name required' });
  const owner = findUserByToken(bearerToken(req));
  if (!owner) return res.status(401).json({ error: 'قم بتسجيل الدخول أولاً لإنشاء غرفة' });
  if (!userCanCreateRooms(owner)) return res.status(403).json({ error: 'إنشاء الغرف متاح فقط للمشرف أو لمن لديه صلاحية إنشاء الغرف' });
  const room = {
    id: helpers.stringGen(15), name,
    owner: owner.topic || owner.username || 'guest',
    ownerId: owner.id || '',
    password: (req.body && req.body.roomPassword) || '',
    created: new Date().toISOString(), online: 0,
    isActive: true, isLocked: false, capacity: 0, roomLevel: 0,
    moderators: [], lockedMics: [],
  };
  roomApplyCommonFields(req, room, req.files);
  db.rooms.create(room);
  io.emit('rooms-stats', roomStats());
  io.emit('room-updated', roomToClient(room));
  res.json(roomToClient(room));
});

app.put('/api/rooms/:id', uploadRoomImages, (req, res) => {
  const targetId = String(req.params.id);
  const room = findRoomByAnyId(targetId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const owner = findUserByToken(bearerToken(req));
  const isOwner = owner && (room.ownerId ? String(room.ownerId) === String(owner.id) : String(room.owner) === String(owner.topic || owner.username));
  const isGlobalAdmin = owner && (owner.power === 'admin' || owner.isAdmin);
  if (!isOwner && !isGlobalAdmin) return res.status(403).json({ error: 'You are not allowed to edit this room' });
  roomApplyCommonFields(req, room, req.files);
  db.rooms.setAll((db.rooms.getAll() || []).map((r) => (String(r.id) === targetId || Number(r.id) === Number(targetId) ? room : r)));
  io.emit('rooms-stats', roomStats());
  io.emit('room-updated', roomToClient(room));
  res.json(roomToClient(room));
});

app.delete('/api/rooms/:id', (req, res) => {
  const targetId = String(req.params.id);
  const room = findRoomByAnyId(targetId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (String(targetId) === String(GENERAL_ROOM_ID)) return res.status(400).json({ error: 'Cannot delete the general room' });
  const owner = findUserByToken(bearerToken(req));
  const isOwner = owner && (room.ownerId ? String(room.ownerId) === String(owner.id) : String(room.owner) === String(owner.topic || owner.username));
  const isGlobalAdmin = owner && (owner.power === 'admin' || owner.isAdmin);
  if (!isOwner && !isGlobalAdmin) return res.status(403).json({ error: 'You are not allowed to delete this room' });
  db.rooms.deleteOne({ id: targetId });
  // Clean up in-memory room state so a deleted room doesn't linger.
  roomModerators.delete(String(targetId));
  roomMutes.delete(String(targetId));
  roomMicLocks.delete(String(targetId));
  roomHistory.delete(String(targetId));
  roomBans.delete(String(targetId));
  battleSessions.delete(String(targetId));
  battleInvites.delete(String(targetId));
  roomMusic.delete(String(targetId));
  io.emit('rooms-stats', roomStats());
  io.emit('room-deleted', { id: targetId });
  res.json({ ok: true });
});

// ── REST: posts (wall) ────────────────────────────────────────────────────
function wallAuthor(u, isGuest) {
  if (isGuest) {
    return { id: u.guestId, username: u.username, ucol: u.ucol, fontColor: u.fontColor || u.mcol, pic: u.pic, bg: u.bg };
  }
  return {
    id: u.uid, userId: u.uid, username: u.username, topic: u.username,
    ucol: u.ucol, fontColor: u.fontColor || u.mcol, mcol: u.mcol, pic: u.pic, bg: u.bg,
  };
}
function toClientPost(p) {
  return {
    id: p.id, msg: p.msg || p.text || '', mediaUrl: p.mediaUrl || null, mediaType: p.mediaType || null,
    userId: p.userId, user: p.user, guestInfo: p.guestInfo || null,
    wallLikes: p.wallLikes || [], isLiked: false, likeCount: (p.wallLikes || []).length,
    commentCount: (p.comments || []).length, comments: p.comments || [], createdAt: p.createdAt,
  };
}
app.get('/api/posts', (req, res) => {
  const list = [...wallPosts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
  res.json(list.map(toClientPost));
});
app.get('/api/posts/:postId', (req, res) => {
  const p = wallPosts.find((x) => String(x.id) === String(req.params.postId));
  if (!p) return res.status(404).json({ error: 'Post not found' });
  res.json(toClientPost(p));
});
app.post('/api/posts', (req, res) => {
  const rl = rateLimit(clientIp(req), { max: 20, windowMs: 60000 }, 'post');
  if (rl.blocked) return res.status(429).json({ success: false, message: 'محاولات كثيرة، حاول بعد قليل' });
  const au = authUserForReq(req);
  if (!au) return res.status(401).json({ success: false, message: 'Session expired, please login again' });
  const gate = likeGate(au.doc || (au.guest || null), 'wall');
  if (!gate.ok) return res.status(403).json({ success: false, error: 'LikeGate', message: likeGateMessage('wall', gate), need: gate.need, has: gate.has });
  const doc = au.doc || null;
  const guest = au.guest || null;
  const body = req.body || {};
  const msg = filterNoLetters(String(body.msg ?? ''), 'bmsgs').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().substring(0, 4000);
  const mediaUrl = body.mediaUrl || null;
  const mediaType = body.mediaType || (mediaUrl ? 'image' : null);
  let userId, member, guestInfo;
  if (guest) {
    userId = guest.guestId;
    member = publicUser(guest);
    guestInfo = { id: guest.guestId, username: guest.username, pic: guest.pic, ucol: guest.ucol, mcol: guest.mcol };
  } else {
    userId = doc.id;
    member = dbUserToAuthUser(doc, 'member');
    guestInfo = null;
  }
  const post = { id: nextId('post_'), userId, user: member, guestInfo, msg, mediaUrl: sanitizeMediaUrl(mediaUrl), mediaType: safeMediaType(mediaType || (mediaUrl ? 'image' : null)), wallLikes: [], comments: [], createdAt: new Date().toISOString() };
  wallPosts.unshift(post);
  if (wallPosts.length > 500) wallPosts.length = 500;
  persistWall();
  io.emit('wall-update', { type: 'new-post', post: toClientPost(post) });
  res.json(toClientPost(post));
});
app.post('/api/posts/:postId/comments', (req, res) => {
  const au = authUserForReq(req);
  if (!au) return res.status(401).json({ success: false, message: 'Session expired, please login again' });
  const rl = rateLimit(clientIp(req), { max: 15, windowMs: 60000 }, 'wall-comment');
  if (rl.blocked) return res.status(429).json({ success: false, message: 'تعليقات كثيرة، حاول بعد قليل' });
  const doc = au.doc || null;
  const guest = au.guest || null;
  const p = wallPosts.find((x) => String(x.id) === String(req.params.postId));
  if (!p) return res.status(404).json({ error: 'Post not found' });
  const who = guest
    ? { id: guest.guestId, userId: guest.guestId, username: guest.username, ucol: guest.ucol, fontColor: guest.mcol, pic: guest.pic, bg: guest.bg }
    : { id: doc.id, userId: doc.id, username: doc.topic || doc.username, ucol: doc.ucol, fontColor: doc.fontColor || doc.mcol, pic: doc.pic, bg: doc.bg };
  const cleanMsg = filterNoLetters(String(req.body.msg || ''), 'bmsgs').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().substring(0, 1000);
  if (!cleanMsg) return res.status(400).json({ error: 'Empty comment' });
  const comment = { id: nextId('c_'), msg: cleanMsg, user: who, createdAt: new Date().toISOString() };
  p.comments = p.comments || [];
  p.comments.push(comment);
  persistWall();
  io.emit('wall-update', { type: 'comment', postId: p.id, commentCount: p.comments.length, comment });
  res.json({ success: true });
});
app.post('/api/posts/:id/like', (req, res) => {
  const rl = rateLimit(clientIp(req), { max: 40, windowMs: 60000 }, 'wall-like');
  if (rl.blocked) return res.status(429).json({ error: 'Too many requests', message: 'محاولات كثيرة، حاول بعد قليل' });
  const au = authUserForReq(req);
  if (!au) return res.status(401).json({ error: 'Unauthorized', message: 'يجب تسجيل الدخول لإعجاب المنشور' });
  const doc = au.doc || null;
  const p = wallPosts.find((x) => String(x.id) === String(req.params.id));
  if (!p) return res.status(404).json({ error: 'Post not found' });
  const likes = p.wallLikes || (p.wallLikes = []);
  const uid = doc ? doc.id : (au.guest ? au.guest.guestId : '');
  const i = likes.findIndex((l) => String(l.userId) === String(uid));
  if (i === -1) likes.push({ userId: uid });
  else likes.splice(i, 1);
  persistWall();
  io.emit('wall-update', { type: 'like', postId: p.id, likeCount: likes.length });
  res.json({ success: true, likes: likes.length });
});
app.delete('/api/posts/:id', (req, res) => {
  const au = authUserForReq(req);
  if (!au) return res.status(401).json({ error: 'Unauthorized', message: 'يجب تسجيل الدخول' });
  const doc = au.doc || null;
  const guest = au.guest || null;
  const p = wallPosts.find((x) => String(x.id) === String(req.params.id));
  if (!p) return res.status(404).json({ error: 'Post not found' });
  const myId = doc ? String(doc.id) : (guest ? String(guest.guestId) : '');
  const isOwner = myId && String(p.userId) === myId;
  const isAdmin = permissionsFor(doc || { type: guest ? 'guest' : 'user' }).isAdmin;
  if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
  wallPosts.splice(wallPosts.indexOf(p), 1);
  persistWall();
  io.emit('wall-update', { type: 'delete', postId: p.id });
  res.json({ success: true });
});

// ── REST: users settings ──────────────────────────────────────────────────
app.post('/api/users/settings', (req, res) => {
  const au = authUserForReq(req);
  if (!au) return res.status(401).json({ success: false, message: 'Session expired, please login again' });
  const rl = rateLimit(clientIp(req), { max: 20, windowMs: 60000 }, 'user-settings');
  if (rl.blocked) return res.status(429).json({ success: false, message: 'محاولات كثيرة، حاول بعد قليل' });
  const doc = au.doc || null;
  const guest = au.guest || null;
  const allowed = ['topic', 'msg', 'ucol', 'mcol', 'bg', 'fontColor', 'co', 'country', 'profileCountry', 'pic', 'cover', 'membershipBg', 'membershipFrame', 'allowPrivate', 'allowAlerts', 'allowCamera', 'muteNotificationSounds', 'gender', 'birthday', 'email'];
  const updates = {};
  (Object.keys(req.body || {})).forEach((k) => { if (allowed.indexOf(k) >= 0 && req.body[k] !== undefined) updates[k] = req.body[k]; });
  if (updates.profileCountry) updates.co = updates.profileCountry;
  // Protect against identity hijack: users may not rename themselves to an
  // existing member's name or to the reserved admin login. The reserved admin
  // login itself may keep its own name (otherwise the owner can never save
  // their settings).
  if (updates.topic) {
    const rawTopic = String(updates.topic).trim();
    const ownTopic = String((doc && (doc.topic || doc.username)) || (guest && (guest.topic || guest.username)) || '');
    const isRootKeepingOwnName = ownTopic && rawTopic.toLowerCase() === ownTopic.toLowerCase() && rawTopic.toLowerCase() === String(config.adminUser || 'admin').toLowerCase();
    const newName = sanitizeUsername(updates.topic, 30);
    if (!newName && !isRootKeepingOwnName) return res.status(400).json({ success: false, message: 'لا يمكنك اتخاذ هذا الاسم' });
    updates.topic = newName || rawTopic;
  }
  // Cosmetic fields are echoed into inline style="" / <img src=""> by the
  // client, so they must be reduced to safe CSS colors or sanitised URLs.
  ['ucol', 'mcol', 'bg', 'fontColor'].forEach((c) => { if (updates[c] !== undefined) updates[c] = sanitizeColor(updates[c]); });
  ['pic', 'cover', 'membershipBg', 'membershipFrame'].forEach((f) => { if (updates[f] !== undefined) updates[f] = sanitizeCosmeticUrl(updates[f]); });
  if (updates.co !== undefined) updates.co = String(updates.co).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 10);
  if (updates.country !== undefined) updates.country = String(updates.country).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 10);
  if (updates.gender !== undefined) updates.gender = /^(male|female|m|f|ذكر|أنثى)$/i.test(String(updates.gender)) ? String(updates.gender) : undefined;
  if (updates.email !== undefined) updates.email = String(updates.email).replace(/[^a-zA-Z0-9.@_+-]/g, '').slice(0, 120);
  if (updates.birthday !== undefined) updates.birthday = String(updates.birthday).replace(/[^0-9-/:.TZ ]/g, '').slice(0, 24);
  // profileCountry was folded into co above; drop the raw duplicate.
  delete updates.profileCountry;
  const clash = (db.users.find({}) || []).find((u) => {
    if (u.topic === undefined) return false;
    const isMe = doc && String(u.id) === String(doc.id);
    return !isMe && String(u.topic || u.username || '').toLowerCase() === String(updates.topic || '').toLowerCase();
  });
  if (updates.topic && clash) return res.status(400).json({ success: false, message: 'لا يمكنك اتخاذ هذا الاسم' });
  let me, fresh = null;
  if (guest) {
    // Guests: apply non-persistent in-memory changes to their registry entry.
    const g = guest;
    Object.keys(updates).forEach((k) => { if (updates[k] !== undefined) g[k] = updates[k]; });
    me = publicUser(g);
  } else {
    if (Object.keys(updates).length > 0) db.users.updateOne({ token: (doc && doc.token) }, { $set: updates });
    fresh = findUserByToken(doc.token);
    me = dbUserToAuthUser(fresh, 'member');
  }
  // Push any applied changes (rename OR cosmetic: pic/cover/bg/ucol/mcol/...) onto
  // the live presence entry so online peers see updated avatars/colors instantly,
  // then broadcast presence so the change reaches every client (not just the
  // user's own tab).
  if (Object.keys(updates).length > 0) {
    const myDocId = (doc && doc.id) || (fresh && fresh.id) || (guest && guest.guestId) || '';
    onlineSockets.forEach((live, sid) => {
      const liveId = String(live.uid || live.userId || live.id || live.guestId || '');
      const matches = myDocId && liveId && liveId === String(myDocId);
      if (matches) {
        if (updates.topic) {
          live.username = updates.topic;
          live.topic = updates.topic;
        }
        if (updates.pic) live.pic = String(updates.pic);
        if (updates.cover !== undefined) live.cover = String(updates.cover || '');
        if (updates.membershipBg !== undefined) live.membershipBg = String(updates.membershipBg || '');
        if (updates.membershipFrame !== undefined) live.membershipFrame = String(updates.membershipFrame || '');
        if (updates.bg !== undefined) live.bg = String(updates.bg);
        if (updates.ucol !== undefined) live.ucol = String(updates.ucol);
        if (updates.mcol !== undefined) live.mcol = String(updates.mcol);
        if (updates.fontColor !== undefined) live.fontColor = String(updates.fontColor);
        const sess = tokenToUser.get(doc && doc.token);
        if (sess && updates.topic) sess.username = updates.topic;
        emitUserSnapshotTo(io.sockets.sockets.get(sid));
      }
    });
    broadcastPresence();
  }
  io.emit('user_updated', { ...me, id: me.id || me.userId, userId: me.id || me.userId });
  res.json({ success: true, user: me });
});

const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');

function detectMediaKind(filename, mimetype) {
  const name = String(filename || '').toLowerCase();
  const mt = String(mimetype || '').toLowerCase();
  if (mt.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?|avif|heic|heif|svg)$/.test(name)) return 'image';
  if (mt.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|avi|flv|wmv|3gp|ogv|mts|m2ts)$/.test(name)) return 'video';
  if (mt.startsWith('audio/') || /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|wma|weba)$/.test(name)) return 'audio';
  return 'other';
}

function compressImage(inputPath, outPath) {
  return sharp(inputPath, { failOn: 'none', limitInputPixels: 256 * 1024 * 1024 })
    .rotate()
    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, effort: 6 })
    .toFile(outPath);
}

// Control-panel site images (favicon/banner/default avatar) are compressed
// before hitting the disk: webp for banner/avatar, optimized png for favicon.
// Returns { data, ext } or null when the input format should be kept as-is.
function compressSiteImageBuffer(buf, kind) {
  const img = sharp(buf, { failOn: 'none', limitInputPixels: 256 * 1024 * 1024 }).rotate();
  if (kind === 'favicon') {
    return img.resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true }).toBuffer()
      .then((d) => ({ data: d, ext: 'png' }));
  }
  const small = kind === 'emoji' || kind === 'badge' ? 128 : (kind === 'dro3' || kind === 'sico' || kind === 'addon_icon' || kind === 'addon_gift') ? 256 : 0;
  if (small) {
    return img.resize({ width: small, height: small, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85, effort: 6 }).toBuffer()
      .then((d) => ({ data: d, ext: 'webp' }));
  }
  const max = kind === 'pic' ? 512 : 1920;
  return img.resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 }).toBuffer()
    .then((d) => ({ data: d, ext: 'webp' }));
}

function compressVideo(inputPath, outPath, cb) {
  const args = [
    '-y', '-i', inputPath,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
    '-vf', 'scale=min(1920\\,iw):-2',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    '-max_muxing_queue_size', '1024',
    outPath,
  ];
  execFile(ffmpegPath, args, { timeout: 300000, maxBuffer: 1024 * 1024 * 64 }, (err) => cb(err));
}

function uploadFileHandler(req, res) {
  const au = authUserForReq(req);
  if (!au) return res.status(401).json({ error: 'Unauthorized', message: 'يجب تسجيل الدخول' });
  const ownerId = au.guest ? au.guest.guestId : (au.doc && au.doc.id);
  const rl = rateLimit(clientIp(req), { max: 40, windowMs: 60000 }, 'upload');
  if (rl.blocked) return res.status(429).json({ error: 'Too many requests', message: 'محاولات رفع كثيرة، حاول بعد قليل' });
  uploadSingle(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const rawExt = path.extname(req.file.originalname || '').toLowerCase().replace(/^\./, '');
    if (!ALLOWED_UPLOAD_EXTS.has(rawExt)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({ error: 'This file type is not allowed' });
    }
    // Verify magic bytes match the claimed extension (reject polyglot files).
    const sniffed = helpers.sniffExt ? helpers.sniffExt(fs.readFileSync(req.file.path)) : null;
    const fam = SNIFF_FAMILY[rawExt];
    if (fam && sniffed && fam !== sniffed) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({ error: 'File content does not match its extension' });
    }
    const srcPath = req.file.path;
    const srcName = req.file.filename;
    const rawUrl = '/assets/uploads/' + srcName;
    const kind = detectMediaKind(req.file.originalname, req.file.mimetype);

    try {
      if (kind === 'image' && !/\.(gif|svg)$/i.test(String(req.file.originalname || ''))) {
        const outName = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.webp';
        const outPath = path.join(uploadDir, outName);
        await compressImage(srcPath, outPath);
        const outStats = fs.statSync(outPath);
        if (outStats.size > 0 && outStats.size < fs.statSync(srcPath).size) {
          try { fs.unlinkSync(srcPath); } catch (e) {}
          const mime = 'image/webp';
          recordUploadOwner(outName, ownerId);
          return res.json({
            url: '/assets/uploads/' + outName,
            name: outName,
            mimetype: mime,
            mediaType: 'image',
            compressed: true,
            format: 'webp',
            originalUrl: rawUrl,
          });
        } else {
          fs.unlinkSync(outPath);
        }
      } else if (kind === 'video') {
        const hostName = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.mp4';
        const hostPath = path.join(uploadDir, hostName);
        await new Promise((resolve, reject) => {
          compressVideo(srcPath, hostPath, (e) => (e ? reject(e) : resolve()));
        });
        const outSize = fs.statSync(hostPath).size;
        if (outSize > 0) {
          try { fs.unlinkSync(srcPath); } catch (e) {}
          recordUploadOwner(hostName, ownerId);
          return res.json({ ok: true, url: '/assets/uploads/' + hostName, name: hostName, mimetype: 'video/mp4', mediaType: 'video', compressed: true, format: 'mp4' });
        }
      }
    } catch (e) {
      // Compression failed — serve original file as-is.
      try {
        const orig = '/assets/uploads/' + srcName;
        recordUploadOwner(srcName, ownerId);
        return res.json({ ok: true, url: orig, name: srcName, mimetype: req.file.mimetype || '', mediaType: detectMediaKind(req.file.originalname, req.file.mimetype) });
      } catch (e2) {}
    }

    // Default: return original (only reachable when compression skipped/failed)
    recordUploadOwner(srcName, ownerId);
    res.json({
      ok: true,
      url: '/assets/uploads/' + srcName,
      name: srcName,
      mimetype: req.file.mimetype || '',
      mediaType: detectMediaKind(req.file.originalname, req.file.mimetype),
      compressed: false,
    });
  });
}

app.post('/api/upload/wallfiles', (req, res) => uploadFileHandler(req, res));
app.post('/api/upload/quickchatfiles', (req, res) => uploadFileHandler(req, res));
app.post('/api/upload/publicfiles', (req, res) => uploadFileHandler(req, res));
app.post('/api/upload/avatar', (req, res) => uploadFileHandler(req, res));
app.post('/api/upload/stories', (req, res) => uploadFileHandler(req, res));
app.post('/api/upload/voice', (req, res) => uploadFileHandler(req, res));
app.post('/api/upload/pmfiles', (req, res) => uploadFileHandler(req, res));
app.post('/api/upload/report', (req, res) => uploadFileHandler(req, res));
app.post('/api/upload/mics', (req, res) => uploadFileHandler(req, res));
app.post('/api/upload/Membership', (req, res) => uploadFileHandler(req, res));

function saveBase64Image(b64, res, req) {
  const au = req ? authUserForReq(req) : null;
  if (!au) return res.status(401).json({ error: 'Unauthorized', message: 'يجب تسجيل الدخول' });
  const ownerId = au.guest ? au.guest.guestId : (au.doc && au.doc.id) || '';
  const rl = rateLimit(clientIp(req), { max: 20, windowMs: 60000 }, 'base64img');
  if (rl && rl.blocked) return res.status(429).json({ error: 'Too many requests', message: 'رفع كثير جداً، حاول بعد قليل' });
  try {
    const m = String(b64 || '').match(/^data:image\/([\w]+);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Invalid image data' });
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Invalid image data' });
    sharp(buffer, { failOn: 'none', limitInputPixels: 256 * 1024 * 1024 })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 })
      .toBuffer()
      .then((outBuf) => {
        if (outBuf.length && outBuf.length < buffer.length) {
          const filename = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.webp';
          fs.writeFileSync(path.join(uploadDir, filename), outBuf);
          recordUploadOwner(filename, ownerId);
          res.json({ url: '/assets/uploads/' + filename, name: filename, mediaType: 'image', format: 'webp' });
        } else {
          writeRawBase64(buffer, m[1], res, ownerId);
        }
      })
      .catch(() => writeRawBase64(buffer, m[1], res, ownerId));
  } catch (e) {
    res.status(400).json({ error: 'Invalid image' });
  }
}

function writeRawBase64(buffer, extRaw, res, ownerId) {
  const ext = extRaw === 'jpeg' ? 'jpg' : extRaw === 'jpg' ? 'jpg' : extRaw;
  if (!ALLOWED_BASE64_EXTS.has(String(ext).toLowerCase())) return res.status(400).json({ error: 'Invalid image type' });
  // Magic-byte check: reject truncated/polyglot payloads parked under an image
  // extension (mirrors the /api/uploadbase64 guard; includes bmp/avif headers).
  const SNIFF_MAGIC = { png: ['89504e47'], jpg: ['ffd8ff'], jpeg: ['ffd8ff'], gif: ['47494638'], bmp: ['424d'] };
  const expected = SNIFF_MAGIC[ext];
  const isWebp = ext === 'webp' && buffer.length > 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP';
  // avif is an ISO-BMFF box: "ftyp" brand sits at offset 4 (ftypavif / ftypavis).
  const isAvif = ext === 'avif' && buffer.length > 12 && buffer.toString('latin1', 4, 8) === 'ftyp' && (buffer.toString('latin1', 8, 12) === 'avif' || buffer.toString('latin1', 8, 12) === 'avis');
  const headerOk = ext === 'webp' ? isWebp : ext === 'avif' ? isAvif : expected && expected.some((hex) => {
    const magic = Buffer.from(hex, 'hex');
    return magic.length <= buffer.length && buffer.slice(0, magic.length).equals(magic);
  });
  if (!headerOk) return res.status(400).json({ error: 'المحتوى لا يطابق نوع الملف' });
  const filename = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(uploadDir, filename), buffer);
  recordUploadOwner(filename, ownerId);
  res.json({ url: '/assets/uploads/' + filename, name: filename });
}

app.post('/api/upload/cover', (req, res) => {
  // Client sends multipart FormData; older clients may send base64 JSON.
  if (req.headers['content-type'] && String(req.headers['content-type']).indexOf('multipart/form-data') !== -1) {
    return uploadFileHandler(req, res);
  }
  return saveBase64Image(req.body && req.body.image, res, req);
});
app.post('/api/upload/membership-bg', (req, res) => {
  if (req.headers['content-type'] && String(req.headers['content-type']).indexOf('multipart/form-data') !== -1) {
    return uploadFileHandler(req, res);
  }
  return saveBase64Image(req.body && req.body.image, res, req);
});
app.post('/api/upload/membership-frame', (req, res) => {
  if (req.headers['content-type'] && String(req.headers['content-type']).indexOf('multipart/form-data') !== -1) {
    return uploadFileHandler(req, res);
  }
  return saveBase64Image(req.body && req.body.image, res, req);
});

app.post('/api/upload', (req, res) => {
  const au = authUserForReq(req);
  if (!au) return res.status(401).json({ error: 'Unauthorized', message: 'يجب تسجيل الدخول' });
  const rl = rateLimit(clientIp(req), { max: 40, windowMs: 60000 }, 'upload');
  if (rl.blocked) return res.status(429).json({ error: 'Too many requests', message: 'محاولات رفع كثيرة، حاول بعد قليل' });
  if (req.headers['content-type'] && String(req.headers['content-type']).indexOf('multipart/form-data') !== -1) {
    return uploadFileHandler(req, res);
  }
  if (!req.body || !req.body.image) return res.status(400).json({ error: 'No image data' });
  saveBase64Image(req.body.image, res, req);
});

// ── REST: stories (Instagram-style) ───────────────────────────────────────
function resolveRESTUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const guest = guestRegistryForToken(token);
  if (guest) return guest;
  const doc = findUserByToken(token);
  if (!doc) return null;
  return {
    uid: doc.id, username: doc.topic || doc.username, type: 'member',
    pic: doc.pic || 'pic.png', ucol: doc.ucol || '#000000', mcol: doc.mcol || '#6c757d',
    bg: doc.bg || '#ffffff', msg: doc.msg || '', co: doc.co || 'us',
    rep: doc.rep || 0, likes: doc.likes || 0, rank: doc.power || '',
    group: doc.group || { id: 0, name: '', roleRank: doc.power === 'admin' ? 999 : 0 },
    stealth: false, isHidden: false, isIdle: false, isAdmin: !!doc.isAdmin || doc.power === 'admin',
    verified: !!doc.verified, token, guest: false,
    roomid: GENERAL_ROOM_ID, joinTime: Date.now(), isActive: true,
  };
}

// Resolve a DB member OR a live guest for REST auth. Returns {doc, guest} or null.
function authUserForReq(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const guest = guestRegistryForToken(token);
  if (guest) return { guest };
  const doc = findUserByToken(token);
  if (!doc) return null;
  return { doc };
}

function viewerKey(u) { return u ? String(u.guest ? u.guestId : u.uid) : null; }

const STORY_BANS_FILE = path.join(ROOT_DIR, 'data', 'story-bans.json');
const storyBans = new Set();
function loadStoryBans() {
  try {
    const a = JSON.parse(fs.readFileSync(STORY_BANS_FILE, 'utf8'));
    if (Array.isArray(a)) { storyBans.clear(); a.forEach((id) => storyBans.add(String(id))); }
  } catch (e) { storyBans.clear(); }
}
function persistStoryBans() {
  try { fs.mkdirSync(path.dirname(STORY_BANS_FILE), { recursive: true }); fs.writeFileSync(STORY_BANS_FILE, JSON.stringify([...storyBans]), 'utf8'); } catch (e) {}
}

function toClientStories(story, viewerUid) {
  const isOwner = viewerUid != null && String(story.userId) === String(viewerUid);
  const likedByMe = viewerUid != null && (story.likes || []).some((l) => String(l.userId) === String(viewerUid));
  const base = {
    id: story.id,
    userId: story.userId,
    user: story.user || { id: story.userId, username: story.username || 'guest' },
    text: story.text || '',
    mediaUrl: story.mediaUrl || null,
    img: story.mediaUrl || null,
    textColor: story.textColor || '#ffffff',
    textBackgroundColor: story.textBackgroundColor || 'transparent',
    backgroundColor: story.bg || '#000000',
    mediaType: story.mediaType || (story.mediaUrl ? detectMediaKind(story.mediaUrl.split('?')[0] || story.mediaUrl || '', '') : null),
    createdAt: story.createdAt,
    likedByMe,
    isOwner,
    commentsCount: (story.comments || []).length,
    comments: (story.comments || []).slice(0, 100),
  };
  if (isOwner) {
    base.likesCount = (story.likes || []).length;
    base.likes = (story.likes || []).slice(0, 100);
    base.viewsCount = (story.views || []).length;
    base.views = (story.views || []).slice(0, 100);
  }
  return base;
}

app.get('/api/stories', (req, res) => {
  pruneStories();
  const viewer = resolveRESTUser(req, false);
  const viewerUid = viewer ? (viewer.guest ? viewer.guestId : viewer.uid) : null;
  const list = stories
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((s) => toClientStories(s, viewerUid));
  res.json(list);
});

app.post('/api/stories', (req, res) => {
  const rl = rateLimit(clientIp(req), { max: 15, windowMs: 60000 }, 'story');
  if (rl.blocked) return res.status(429).json({ error: 'Too many requests', message: 'محاولات كثيرة، حاول بعد قليل' });
  const au = authUserForReq(req);
  if (!au) return res.status(401).json({ error: 'Unauthorized', message: 'المستخدم غير مصرح' });
  const u = au.guest || au.doc;
  const uid = u.guest ? u.guestId : (u.id || u.uid || u.userId);
  if (storyBans.has(String(uid))) {
    return res.status(403).json({ error: 'StoryBanned', message: 'تم منعك من نشر الستوريات من قبل الإدارة' });
  }
  const gate = likeGate(u, 'story');
  if (!gate.ok) return res.status(403).json({ error: 'LikeGate', message: likeGateMessage('story', gate), need: gate.need, has: gate.has });
const mediaUrl = sanitizeMediaUrl((req.body && (req.body.mediaUrl || req.body.img || '')) || '') || '';
  const text = escapeStoredText(filterNoLetters(String((req.body && req.body.text) || ''), 'bmsgs').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().substring(0, 300));
  const mediaType = safeMediaType((req.body && req.body.mediaType) ||
    (mediaUrl ? detectMediaKind(mediaUrl.split('?')[0] || mediaUrl, '') : null));
  const story = {
    id: nextId('story_'),
    userId: uid,
    user: {
      id: uid,
      userId: uid,
      username: u.username, topic: u.username, type: u.type || 'member',
      pic: u.pic || 'pic.png', ucol: u.ucol || '#000000', mcol: u.mcol || '#6c757d',
    },
    text: text,
    textColor: sanitizeColor((req.body && req.body.textColor) || '#ffffff') || '#ffffff',
    textBackgroundColor: sanitizeColor((req.body && req.body.textBackgroundColor) || '') || '',
    bg: sanitizeColor((req.body && req.body.bg) || ''),
    img: mediaUrl, mediaUrl: mediaUrl, mediaType: mediaType,
    createdAt: new Date().toISOString(),
    views: [],
    likes: [],
    comments: [],
  };
  stories.push(story);
  if (stories.length > STORY_MAX) { const old = stories.shift(); if (old && old.mediaUrl && canDeleteUploadedFile(old.mediaUrl, uid)) { try { fs.unlinkSync(path.join(uploadDir, path.basename(old.mediaUrl.split('?')[0]))); } catch (e) {} } }
  persistStories();
  io.emit('new-story', { id: story.id, userId: story.userId, user: story.user, createdAt: story.createdAt });
  res.json(toClientStories(story, uid));
});

// Notify every online socket of a given uid/guestId (story owner).
function socketsForUserId(uid) {
  const out = [];
  if (uid == null) return out;
  onlineSockets.forEach((u, sid) => {
    const candidate = u.uid || u.guestId || u.id || u.userId;
    if (candidate != null && String(candidate) === String(uid)) out.push(sid);
  });
  return out;
}

app.post('/api/stories/:id/view', (req, res) => {
  const u = resolveRESTUser(req, false);
  const story = stories.find((s) => String(s.id) === String(req.params.id));
  if (!story) return res.status(404).json({ error: 'Story not found' });
  const rl = rateLimit(clientIp(req), { max: 30, windowMs: 60000 }, 'story-view');
  if (rl.blocked) return res.status(429).json({ error: 'Too many requests' });
  let addedView = null;
  if (u) {
    const vid = u.guest ? u.guestId : u.uid;
    const isOwner = String(story.userId) === String(vid);
    if (!isOwner && !story.views.some((v) => String(v.userId) === String(vid))) {
      addedView = { userId: vid, username: u.username, pic: u.pic || 'pic.png', at: new Date().toISOString() };
      story.views.push(addedView);
      if (story.views.length > 500) story.views = story.views.slice(-500);
      persistStories();
      io.emit('story:view', { storyId: story.id, view: addedView, viewsCount: story.views.length, ownerUserId: story.userId });
    }
  }
  const isOwner = u ? String(story.userId) === (u.guest ? String(u.guestId) : String(u.uid)) : false;
  res.json({ success: true, isOwner, views: isOwner ? story.views.slice(0, 100) : [], viewsCount: isOwner ? story.views.length : 0 });
});

app.post('/api/stories/:id/like', (req, res) => {
  const rl = rateLimit(clientIp(req), { max: 20, windowMs: 60000 }, 'story-like');
  if (rl.blocked) return res.status(429).json({ error: 'Too many requests' });
  const u = resolveRESTUser(req, false);
  const story = stories.find((s) => String(s.id) === String(req.params.id));
  if (!story) return res.status(404).json({ error: 'Story not found' });
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const uid = u.guest ? u.guestId : u.uid;
  if (String(story.userId) === String(uid)) {
    return res.status(403).json({ error: 'لا يمكنك الإعجاب بقصتك' });
  }
  let likes = story.likes || (story.likes = []);
  const i = likes.findIndex((l) => String(l.userId) === String(uid));
  let likedByMe = false;
  let likeEntry = null;
  if (i === -1) { likeEntry = { userId: uid, username: u.username, pic: u.pic || 'pic.png', at: new Date().toISOString() }; likes.push(likeEntry); likedByMe = true; }
  else { likeEntry = likes[i]; likes.splice(i, 1); likedByMe = false; }
  persistStories();
  io.emit('story:like', { storyId: story.id, liked: likedByMe, likesCount: likes.length, like: likeEntry, byUserId: uid, byUsername: u.username, ownerUserId: story.userId });
  if (likedByMe) {
    const ownerSockets = socketsForUserId(story.userId);
    if (ownerSockets.length) {
      const nid = 'sn-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const likeFrom = { username: u.username, id: uid, pic: (u.pic && u.pic !== 'pic.png') ? u.pic : null, ucol: u.ucol || null };
      const note = { id: nid, type: 'story_like', createdAt: new Date(), message: 'أعجب بقصتك', senderUsername: u.username, senderAvatar: likeFrom.pic || '/uploads/site/default.png', senderDisplayName: u.username, senderUcol: u.ucol || null, suppressSound: false };
      ownerSockets.forEach((sid) => {
        io.to(sid).emit('session-notification', note);
        io.to(sid).emit('new-notification', { id: nid, type: 'story_like', fromUser: likeFrom, message: 'أعجب بقصتك', createdAt: new Date().toISOString(), read: false });
      });
    }
  }
  res.json({ success: true, liked: likedByMe, likesCount: likes.length, likes: likes.slice(0, 100) });
});

app.post('/api/stories/:id/comment', (req, res) => {
  const rl = rateLimit(clientIp(req), { max: 15, windowMs: 60000 }, 'story-comment');
  if (rl.blocked) return res.status(429).json({ error: 'Too many requests' });
  const u = resolveRESTUser(req, false);
  const story = stories.find((s) => String(s.id) === String(req.params.id));
  if (!story) return res.status(404).json({ error: 'Story not found' });
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const msg = escapeStoredText(filterNoLetters(String((req.body && req.body.msg) || ''), 'bmsgs').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().substring(0, 500));
  if (!msg) return res.status(400).json({ error: 'Comment empty' });
  const uid = u.guest ? u.guestId : u.uid;
  const comment = {
    id: nextId('sc_'),
    userId: uid,
    user: { id: uid, userId: uid, username: u.username, topic: u.username, pic: u.pic || 'pic.png', ucol: u.ucol || '#000000' },
    msg, createdAt: new Date().toISOString(),
  };
  let comments = story.comments || (story.comments = []);
  comments.push(comment);
  if (comments.length > 500) comments = comments.slice(-500);
  story.comments = comments;
  persistStories();
  io.emit('story:comment', { storyId: story.id, comment, commentsCount: comments.length, ownerUserId: story.userId });
  if (String(story.userId) !== String(uid)) {
    const ownerSockets = socketsForUserId(story.userId);
    if (ownerSockets.length) {
      const nid = 'sc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const from = { username: u.username, id: uid, pic: (u.pic && u.pic !== 'pic.png') ? u.pic : null, ucol: u.ucol || null };
      const note = { id: nid, type: 'story_comment', createdAt: new Date(), message: 'علّق على قصتك', senderUsername: u.username, senderAvatar: from.pic || '/uploads/site/default.png', senderDisplayName: u.username, senderUcol: u.ucol || null, suppressSound: false };
      ownerSockets.forEach((sid) => {
        io.to(sid).emit('session-notification', note);
        io.to(sid).emit('new-notification', { id: nid, type: 'story_comment', fromUser: from, message: 'علّق على قصتك', createdAt: new Date().toISOString(), read: false });
      });
    }
  }
  res.json(comment);
});

app.delete('/api/stories/:id', (req, res) => {
  const u = resolveRESTUser(req, false);
  const idx = stories.findIndex((s) => String(s.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Story not found' });
  const isOwner = !!u && String(stories[idx].userId) === String(u.guest ? u.guestId : u.uid);
  const canDelete = u && permissionsFor(u).isAdmin;
  if (!isOwner && !canDelete) return res.status(403).json({ error: 'Forbidden' });
  const story = stories[idx];
  stories.splice(idx, 1);
  if (story && story.mediaUrl && canDeleteUploadedFile(story.mediaUrl, isOwner ? (u.guest ? u.guestId : u.uid) : '')) {
    try { fs.unlinkSync(path.join(uploadDir, path.basename(story.mediaUrl.split('?')[0]))); } catch (e) {}
  } else if (story && story.mediaUrl && canDelete) {
    // Admin override: still only delete files that were recorded as uploads.
    try { if (uploadOwners.has(String(story.mediaUrl).split('?')[0])) fs.unlinkSync(path.join(uploadDir, path.basename(story.mediaUrl.split('?')[0]))); } catch (e) {}
  }
  persistStories();
  io.emit('story:delete', { storyId: story.id });
  res.json({ ok: true });
});

app.get('/api/admin/stories/bans', (req, res) => {
  const u = resolveRESTUser(req, false);
  if (!u || !permissionsFor(u).isAdmin) return res.status(403).json({ error: 'Forbidden' });
  res.json({ banned: [...storyBans] });
});

app.post('/api/admin/stories/ban', (req, res) => {
  const u = resolveRESTUser(req, false);
  if (!u || !permissionsFor(u).isAdmin) return res.status(403).json({ error: 'Forbidden' });
  const userId = String((req.body && (req.body.userId || req.body.id)) || '');
  const banned = !!(req.body && req.body.banned);
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  if (banned) storyBans.add(userId); else storyBans.delete(userId);
  persistStoryBans();
  res.json({ ok: true, userId, banned, bannedList: [...storyBans] });
});

// ── Feature / admin REST routes (change-password, profile-visits, youtube,
// wall creators, upload-base64, admin user mutations) ──────────────────────
app.post('/api/auth/change-password', async (req, res) => {
  const u = resolveRESTUser(req);
  if (!u) return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول أولاً' });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'يرجى إدخال كلمة المرور الحالية والجديدة' });
  if (String(newPassword).length < 4) return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة قصيرة جداً' });
  const rl = rateLimit(clientIp(req), { max: 5, windowMs: 60000 }, 'change-password');
  if (rl.blocked) return res.status(429).json({ success: false, message: 'محاولات كثيرة، حاول بعد قليل' });
  const doc = findUserByToken(u.token);
  if (!doc) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  const ok = await bcrypt.compare(String(currentPassword), doc.password);
  if (!ok) return res.status(400).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
  const hash = await bcrypt.hash(String(newPassword), SALT_ROUNDS);
  // Rotate the session token so any previously leaked token stops authenticating
  // the moment the password changes, and invalidate the old-token sessions.
  const newToken = makeToken();
  db.users.updateOne({ id: doc.id }, { $set: { password: hash, token: newToken } });
  const stale = [];
  tokenToUser.forEach((v, t) => {
    if (v && (String(v.uid) === String(doc.id) || String(v.username || '').toLowerCase() === String(doc.topic || '').toLowerCase())) stale.push(t);
  });
  stale.forEach((t) => {
    tokenToUser.delete(t);
    activeSessions.forEach((v, k) => { if (v && v.token === t) activeSessions.delete(k); });
  });
  res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح', token: newToken });
});

app.get('/api/profile-visits/:userId', (req, res) => {
  const u = resolveRESTUser(req);
  if (!u) return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول' });
  const userId = String(req.params.userId);
  const doc = db.users.findOne({ id: userId });
  res.json({
    userId,
    username: doc ? (doc.topic || doc.username) : userId,
    count: doc && doc.profileVisits ? (Array.isArray(doc.profileVisits) ? doc.profileVisits.length : Number(doc.profileVisits) || 0) : 0,
  });
});
// The live client sends POST /api/profile-visits/:userId when opening a profile.
// Persist the visit so the count in the profile header is meaningful.
app.post('/api/profile-visits/:userId', (req, res) => {
  const u = resolveRESTUser(req, false);
  if (!u) return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول' });
  const userId = String(req.params.userId);
  if (!userId) return res.json({ success: true });
  const doc = db.users.findOne({ id: userId });
  if (doc) {
    const rl = rateLimit(clientIp(req), { max: 60, windowMs: 60000 }, 'profile-visit');
    if (!rl.blocked) {
      const meId = u.guest ? u.guestId : (u.uid || u.id || '');
      const meName = u.username || u.topic || '';
      const visits = Array.isArray(doc.profileVisits) ? doc.profileVisits.slice() : [];
      const now = Date.now();
      visits.push({ visitorId: meId, visitorName: meName, at: now });
      // keep only the most recent 2000 visits
      if (visits.length > 2000) visits.splice(0, visits.length - 2000);
      db.users.updateOne({ id: doc.id }, { $set: { profileVisits: visits } });
    }
  }
  res.json({ success: true });
});

app.post('/api/auth/record-visit', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/wall/creators', (req, res) => {
  const u = resolveRESTUser(req, false);
  if (!u) return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول' });
  const counts = {};
  wallPosts.forEach((p) => {
    if (p && p.user && p.user.userId) {
      const key = String(p.user.userId);
      const ex = counts[key] || (counts[key] = { id: p.user.userId, userId: p.user.userId, username: p.user.username || p.user.topic, pic: p.user.pic || 'pic.png', ucol: p.user.ucol || '#000000', fontColor: p.user.fontColor || p.user.mcol || '#000000', mcol: p.user.mcol || '#6c757d', bg: p.user.bg || '#ffffff', wallPoints: 0, count: 0 });
      ex.count += 1;
    }
  });
  // Pull authoritative wallPoints from the live DB where available.
  (db.users.find({}) || []).forEach((d) => {
    const key = String(d.id);
    if (counts[key] && d.wallPoints) counts[key].wallPoints = d.wallPoints || 0;
  });
  const creators = Object.keys(counts).map((k) => counts[k]).sort((a, b) => (b.wallPoints || b.count) - (a.wallPoints || a.count)).slice(0, 50);
  res.json({ success: true, creators });
});

app.get('/api/youtube/search', async (req, res) => {
  const u = resolveRESTUser(req, false);
  if (!u) return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول' });
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const query = q.replace(/[^a-zA-Z0-9\u0600-\u06FF _-]/g, ' ').trim();
  if (!query) return res.json([]);
  try {
    let out = [];
    const isYtId = /^[a-zA-Z0-9_-]{11}$/.test(query);
    out.push({ id: query, title: query, thumbnail: 'https://i.ytimg.com/vi/' + query + '/mqdefault.jpg', duration: '0:00' });
    res.json(out.slice(0, 20));
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/youtube/info', async (req, res) => {
  const u = resolveRESTUser(req, false);
  if (!u) return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول' });
  const id = String(req.query.id || '');
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return res.json(null);
  res.json({ id, title: id, thumbnail: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg' });
});

// Admin user mutations (protected; used by CP + admin REST calls).
function requireRESTAdmin(req, res) {
  const u = resolveRESTUser(req, false);
  if (!u) return { error: res.status(401).json({ success: false, message: 'يجب تسجيل الدخول' }) };
  if (!permissionsFor(u).isAdmin) return { error: res.status(403).json({ success: false, message: 'غير مسموح' }) };
  return { u };
}
// The site owner / root admin account. Identified by user-id (not the mutable
// topic) so it can never be renamed-then-deleted or demoted via the REST API.
function rootAdminDoc() {
  if (!db || !db.users) return null;
  return db.users.findOne({ topic: config.adminUser }) || (db.users.find({}) || []).find((u) => String(u.topic || '').toLowerCase() === String(config.adminUser || 'admin').toLowerCase()) || null;
}
function isRootTarget(doc) {
  const rootDoc = rootAdminDoc();
  return (rootDoc && doc && String(doc.id) === String(rootDoc.id)) || (doc && String(doc.topic || '').toLowerCase() === String(config.adminUser || 'admin').toLowerCase());
}
function dbUserToAdminPayload(doc) {
  return {
    id: doc.id, username: doc.topic || doc.username, topic: doc.topic || doc.username,
    power: doc.power || 'user', ip: doc.ip || '', fp: doc.fp || '', idreg: doc.idreg || '',
    rep: doc.rep || 0, likes: doc.likes || 0, wallPoints: doc.wallPoints || 0,
    coins: doc.coins || 0, pic: doc.pic || 'pic.png', verified: !!doc.verified,
    memberShip: doc.memberShip || 'free', created: doc.created || '',
    lastSeen: doc.lastSeen || '', banned: !!doc.banned,
  };
}
app.get('/api/admin/users', (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const q = String(req.query.q || '').trim();
  let list = db.users.find({});
  if (q) list = list.filter((d) => String(d.topic || '').indexOf(q) !== -1 || String(d.username || '').indexOf(q) !== -1);
  res.json(list.slice(0, 200).map(dbUserToAdminPayload));
});
app.put('/api/admin/users/:userId', (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const doc = db.users.findOne({ id: String(req.params.userId) });
  if (!doc) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  const b = req.body || {};
  const set = {};
  // Root/owner account is protected: its power, admin flag and username can
  // never be changed through this endpoint (owner deletion is guarded below).
  const rootTarget = isRootTarget(doc);
  if (b.power !== undefined && !rootTarget) set.power = String(b.power) === 'admin' ? 'admin' : String(b.power || 'user');
  if (b.rep !== undefined) set.rep = Math.max(0, parseInt(b.rep, 10) || 0);
  if (b.likes !== undefined) set.likes = Math.max(0, parseInt(b.likes, 10) || 0);
  if (b.wallPoints !== undefined) set.wallPoints = Math.max(0, parseInt(b.wallPoints, 10) || 0);
  if (b.coins !== undefined) set.coins = Math.max(0, parseInt(b.coins, 10) || 0);
  if (b.isAdmin !== undefined && !rootTarget) set.isAdmin = !!b.isAdmin;
  if (b.verified !== undefined) set.verified = !!b.verified;
  if (b.memberShip !== undefined) set.memberShip = String(b.memberShip);
  if (b.topic !== undefined && !rootTarget) {
    const newTopic = sanitizeUsername(b.topic, 30);
    if (!newTopic) return res.status(400).json({ success: false, message: 'اسم المستخدم غير صالح' });
    if (!db.users.find({}).some((u) => u.id !== doc.id && String(u.topic || u.username || '').toLowerCase() === newTopic.toLowerCase())) {
      set.topic = newTopic;
      set.username = newTopic;
    }
  }
  if (b.groupId !== undefined) {
    const grp = db.groups ? db.groups.findOne({ id: Number(b.groupId) }) : null;
    set.group = { id: grp ? grp.id : (b.groupId === null || b.groupId === '' || b.groupId === '0' ? 0 : (Number(b.groupId) || 0)), name: grp ? grp.name || '' : '', roleRank: grp ? grp.roleRank || 0 : 0 };
  }
  if (Object.keys(set).length) db.users.updateOne({ id: doc.id }, { $set: set });
  const fresh = db.users.findOne({ id: doc.id });
  syncPresenceStatsFor(fresh);
  io.emit('user_updated', { ...dbUserToAdminPayload(fresh), id: fresh.id, userId: fresh.id, topic: fresh.topic || fresh.username, username: fresh.topic || fresh.username, wallPoints: fresh.wallPoints || 0, rep: fresh.rep || 0, likes: fresh.likes || 0, coins: fresh.coins || 0 });
  res.json({ success: true, user: dbUserToAdminPayload(fresh), rep: fresh.rep || 0, likes: fresh.likes || 0, wallPoints: fresh.wallPoints || 0, coins: fresh.coins || 0 });
});
// Dedicated profile admin endpoints used by the live profile modal.
const adminEditStat = (field) => (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const doc = db.users.findOne({ id: String(req.params.userId) });
  if (!doc) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  const value = Math.max(0, parseInt((req.body && req.body.value) || (req.body && req.body[field]) || 0, 10) || 0);
  db.users.updateOne({ id: doc.id }, { $set: { [field]: value } });
  const fresh = db.users.findOne({ id: doc.id });
  syncPresenceStatsFor(fresh);
  io.emit('user_updated', { ...dbUserToAdminPayload(fresh), id: fresh.id, userId: fresh.id, topic: fresh.topic || fresh.username, username: fresh.topic || fresh.username, [field]: value });
  res.json({ success: true, user: dbUserToAdminPayload(fresh), [field]: value, id: doc.id });
};
app.put('/api/admin/users/:userId/likes', adminEditStat('likes'));
app.put('/api/admin/users/:userId/rep', adminEditStat('rep'));
app.put('/api/admin/users/:userId/wall-points', adminEditStat('wallPoints'));
app.delete('/api/admin/users/:userId', (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const doc = db.users.findOne({ id: String(req.params.userId) });
  if (!doc) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  // Owner cannot be deleted — matched by user-id so a prior rename can't bypass it.
  if (isRootTarget(doc)) return res.status(400).json({ success: false, message: 'لا يمكن حذف حساب المدير' });
  // Only the root/owner may delete another admin account.
  const actor = r.u;
  const actorIsRoot = (rootAdminDoc() && actor && String(actor.id || actor.uid) === String(rootAdminDoc().id)) || String(actor.topic || actor.username || '').toLowerCase() === String(config.adminUser || 'admin').toLowerCase();
  const targetIsAdmin = !!doc.isAdmin || doc.power === 'admin';
  if (targetIsAdmin && !actorIsRoot) return res.status(403).json({ success: false, message: 'غير مسموح حذف حساب مشرف' });
  db.users.deleteOne({ id: doc.id });
  db.users.deleteOne({ topic: doc.topic });
  io.emit('user_updated', { id: doc.id, username: doc.topic, deleted: true });
  res.json({ success: true });
});
app.post('/api/admin/users/assign-cosmetic', (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const userId = String((req.body && req.body.userId) || '');
  const cosmetic = (req.body && req.body.cosmetic) || {};
  const doc = db.users.findOne({ id: userId });
  if (!doc) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  const key = ['frame', 'bg', 'link'].indexOf(cosmetic.type) !== -1 ? cosmetic.type : 'frame';
  const val = typeof cosmetic.value === 'string' ? cosmetic.value.substring(0, 300) : '';
  const memberAssets = doc.memberShipAssets ? JSON.parse(JSON.stringify(doc.memberShipAssets)) : {};
  memberAssets[key] = val;
  db.users.updateOne({ id: doc.id }, { $set: { memberShipAssets: memberAssets } });
  res.json({ success: true });
});
app.post('/api/admin/users/delete-cosmetic', (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const doc = db.users.findOne({ id: String((req.body && req.body.userId) || '') });
  if (!doc) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  db.users.updateOne({ id: doc.id }, { $set: { frame: '', bg: '', link: '' } });
  res.json({ success: true });
});

const defaultSuperIcons = [
  { url: '👑', type: 'super_icon', name: 'تاج' },
  { url: '⭐', type: 'super_icon', name: 'نجمة' },
  { url: '💎', type: 'super_icon', name: 'الماس' },
  { url: '🔥', type: 'super_icon', name: 'نار' },
  { url: '💫', type: 'super_icon', name: 'شرارة' },
  { url: '🎯', type: 'super_icon', name: 'هدف' },
  { url: '🦁', type: 'super_icon', name: 'أسد' },
  { url: '🚀', type: 'super_icon', name: 'صاروخ' },
  { url: '❤️', type: 'gift', name: 'قلب' },
  { url: '🌹', type: 'gift', name: 'وردة' },
  { url: '🎁', type: 'gift', name: 'هدية' },
  { url: '💐', type: 'gift', name: 'باقة' },
];
function addonAssets() {
  // Addons live in the settings doc (doc.addons) — there is no dedicated
  // collection. First access seeds the built-in defaults so the manager can
  // delete/rename them like any custom entry.
  try {
    const doc = moduleSettings();
    if (!Array.isArray(doc.addons)) {
      const seeded = defaultSuperIcons.slice();
      if (db && db.settings) db.settings.updateOne({}, { $set: { addons: seeded } });
      if (doc) doc.addons = seeded;
      return seeded;
    }
    return doc.addons;
  } catch (e) { return []; }
}
app.get('/api/admin/addons', (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const custom = addonAssets().filter((a) => a && a.url).map((a) => ({ url: a.url, type: a.type === 'gift' ? 'gift' : 'super_icon', name: a.name || '' }));
  res.json(custom.length ? custom : defaultSuperIcons);
});

function emitUserAddonsUpdated(doc) {
  io.emit('user-addons-updated', { userId: String(doc.id || ''), username: doc.topic, superIcon: doc.superIcon || '', gifts: Array.isArray(doc.gifts) ? doc.gifts : [] });
}

app.post('/api/admin/addons/assign-super-icon', (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const body = req.body || {};
  const idKey = String(body.userId || '');
  const doc = db.users.findOne({ id: idKey }) || db.users.findOne({ topic: idKey });
  if (!doc) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  const iconUrl = String(body.iconUrl || '').substring(0, 300);
  if (!iconUrl) return res.status(400).json({ success: false, message: 'رابط الأيقونة مطلوب' });
  db.users.updateOne({ id: doc.id }, { $set: { superIcon: iconUrl } });
  emitUserAddonsUpdated({ ...doc, superIcon: iconUrl });
  res.json({ success: true });
});
app.post('/api/admin/addons/remove-super-icon', (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const body = req.body || {};
  const idKey = String(body.userId || '');
  const doc = db.users.findOne({ id: idKey }) || db.users.findOne({ topic: idKey });
  if (!doc) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  db.users.updateOne({ id: doc.id }, { $set: { superIcon: '' } });
  emitUserAddonsUpdated({ ...doc, superIcon: '' });
  res.json({ success: true });
});
app.post('/api/admin/addons/assign-gift', (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const body = req.body || {};
  const idKey = String(body.userId || '');
  const doc = db.users.findOne({ id: idKey }) || db.users.findOne({ topic: idKey });
  if (!doc) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  const giftUrl = String(body.giftUrl || '').substring(0, 300);
  if (!giftUrl) return res.status(400).json({ success: false, message: 'رابط الهدية مطلوب' });
  const gifts = Array.isArray(doc.gifts) ? doc.gifts.slice() : [];
  if (gifts.indexOf(giftUrl) === -1) gifts.push(giftUrl);
  db.users.updateOne({ id: doc.id }, { $set: { gifts } });
  emitUserAddonsUpdated({ ...doc, gifts });
  res.json({ success: true });
});
app.post('/api/admin/addons/remove-gift', (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const body = req.body || {};
  const idKey = String(body.userId || '');
  const doc = db.users.findOne({ id: idKey }) || db.users.findOne({ topic: idKey });
  if (!doc) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  const giftUrl = String(body.giftUrl || '');
  const gifts = Array.isArray(doc.gifts) ? doc.gifts.filter((g) => g !== giftUrl) : [];
  db.users.updateOne({ id: doc.id }, { $set: { gifts } });
  emitUserAddonsUpdated({ ...doc, gifts });
  res.json({ success: true });
});

const cosmeticTypeMap = { pic: 'pic', cover: 'cover', membershipFrame: 'membershipFrame', membershipBg: 'membershipBg' };
app.post('/api/admin/users/:userId/upload-cosmetic', uploadSingle, (req, res) => {
  const r = requireRESTAdmin(req, res);
  if (r.error) return;
  const doc = db.users.findOne({ id: String(req.params.userId) });
  if (!doc) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  const type = cosmeticTypeMap[String((req.body && req.body.cosmeticType) || '')];
  if (!type) return res.status(400).json({ success: false, message: 'نوع التصميم غير صالح' });
  if (!req.file) return res.status(400).json({ success: false, message: 'لم يتم رفع ملف' });
  const url = '/assets/uploads/' + req.file.filename;
  db.users.updateOne({ id: doc.id }, { $set: { [type]: url } });
  res.json({ success: true, url });
});

app.post('/api/uploadbase64', (req, res) => {
  const u = resolveRESTUser(req, false);
  if (!u) return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول' });
  const ownerId = u.guest ? u.guestId : (u.uid || u.id || '');
  const rl = rateLimit(clientIp(req), { max: 20, windowMs: 60000 }, 'uploadbase64');
  if (rl.blocked) return res.status(429).json({ success: false, message: 'رفع كثير جداً، حاول بعد قليل' });
  const data = (req.body && (req.body.data || req.body.file)) || '';
  const type = String((req.body && (req.body.type || req.body.mime)) || 'image/png');
  const m = String(data).match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/s);
  const raw = m ? m[2] : String(data).split(',').pop();
  const extMatch = type.match(/^\s*image\/(png|jpe?g|gif|webp)\s*$/i);
  if (!extMatch) return res.status(400).json({ success: false, message: 'نوع الملف غير مسموح' });
  const ext = type.toLowerCase().includes('jpeg') ? 'jpg' : (type.toLowerCase().split('/')[1] || 'png').replace('x-icon', 'ico');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return res.status(400).json({ success: false, message: 'ملف غير صالح' });
  // Magic-byte check: the decoded bytes must actually be the claimed image type
  // (rejects polyglot / arbitrary binary parked under an image extension).
  const SNIFF_MAGIC = { png: ['89504e47'], jpg: ['ffd8ff'], jpeg: ['ffd8ff'], gif: ['47494638'] };
  const expected = SNIFF_MAGIC[ext];
  // webp must be a RIFF container carrying a "WEBP" FourCC at offset 8 — a plain
  // RIFF file (WAV/AVI) with a .webp name must be rejected, not silently accepted.
  const isWebp = ext === 'webp' && buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  // headerOk is true when the leading magic bytes match the claimed extension.
  // jpg/jpeg magic is only 3 bytes, so compare against the magic's own length.
  const headerOk = ext === 'webp' ? isWebp : expected && expected.some((hex) => {
    const magic = Buffer.from(hex, 'hex');
    return magic.length <= buf.length && buf.slice(0, magic.length).equals(magic);
  });
  if (!headerOk) {
    return res.status(400).json({ success: false, message: 'المحتوى لا يطابق نوع الملف' });
  }
  const finishB64 = (dataBuf, ext2) => {
    const fname = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext2;
    fs.writeFileSync(path.join(uploadDir, fname), dataBuf);
    recordUploadOwner(fname, ownerId);
    res.json({ success: true, url: '/assets/uploads/' + fname });
  };
  // Animated gifs pass through untouched; other images are recompressed to webp
  // and the smaller of the two is kept.
  if (ext === 'gif') { finishB64(buf, ext); return; }
  sharp(buf, { failOn: 'none', limitInputPixels: 256 * 1024 * 1024 }).rotate()
    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 6 }).toBuffer()
    .then((d) => {
      if (d && d.length && d.length < buf.length) finishB64(d, 'webp');
      else finishB64(buf, ext);
    })
    .catch(() => {
      try { finishB64(buf, ext); } catch (e) { res.status(500).json({ success: false, message: 'تعذر حفظ الملف' }); }
    });
});

// ── Socket.io: modern protocol ────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

const guestRegistry = new Map(); // guestId -> guest

function findSocketUser(socketId) {
  return onlineSockets.get(socketId) || null;
}

function emitUserSnapshotTo(socket) {
  socket.emit('users-snapshot', { version: presenceVersion, users: serializeAllPresence() });
}

function resolveUserForSocket(socket) {
  const auth = (socket.handshake && socket.handshake.auth) || {};
  const token = auth.token || '';

  // Identity is resolved from a bearer token ONLY. The client always sends the
  // token alongside clientSessionId; clientSessionId is never an authenticator
  // on its own (removes the impersonation vector from a leaked session id).
  if (token) {
    const guest = guestRegistryForToken(token);
    if (guest) return guest;
    const doc = findUserByToken(token);
    if (doc) {
      const entry = {
        uid: doc.id, username: doc.topic || doc.username, type: 'member',
        pic: doc.pic || 'pic.png', ucol: doc.ucol || '#000000', mcol: doc.mcol || '#6c757d',
        bg: doc.bg || '#ffffff', msg: doc.msg || '', co: doc.co || 'us',
        rep: doc.rep || 0, likes: doc.likes || 0, coins: doc.coins || 0, wallPoints: doc.wallPoints || 0, rank: doc.power || '',
        fp: doc.fp || '', fp2: doc.fp2 || '', deviceInfo: doc.deviceInfo || '',
        group: doc.group || { id: 0, name: '', roleRank: doc.power === 'admin' ? 999 : 0 },
        stealth: false, isHidden: false, isIdle: false, isAdmin: !!doc.isAdmin || doc.power === 'admin',
        verified: !!doc.verified, token, guest: false,
        roomid: GENERAL_ROOM_ID, joinTime: Date.now(),
        isActive: true,
      };
      return entry;
    }
  }
  return null;
}

function guestRegistryForToken(token) {
  let found = null;
  guestRegistry.forEach((g) => { if (g.token === token) found = g; });
  return found;
}
function purgeGuestRegistryForToken(token) {
  if (!token) return;
  guestRegistry.forEach((g, gid) => { if (g && g.token === token) guestRegistry.delete(gid); });
}
function purgeGuestRegistryForUser(u) {
  if (!u || !u.guest || !u.guestId) return;
  let active = false;
  onlineSockets.forEach((o) => {
    if (o && o !== u && String(o.guestId || o.userId || '') === String(u.guestId || u.userId || '')) active = true;
  });
  if (!active) guestRegistry.delete(u.guestId);
}

io.on('connection', (socket) => {
  const auth = (socket.handshake && socket.handshake.auth) || {};
  const token = auth.token || '';
  const clientSessionId = auth.clientSessionId || '';

  // Connection flood guard: cap simultaneous sockets per client IP so a single
  // machine cannot exhaust the server's socket pool.
  const connIp = (socket.handshake && (socket.handshake.address || (socket.request && socket.request.socket && socket.request.socket.remoteAddress))) || '';
  const ipConnKey = 'sockconn:' + connIp;
  const ipCount = (connSlots.get(ipConnKey) || 0) + 1;
  if (ipCount > 8) {
    socket.emit('error-msg', { msg: 'تجاوزت حد الاتصالات المتزامنة' });
    socket.disconnect(true);
    return;
  }
  connSlots.set(ipConnKey, ipCount);
  const releaseConnCount = () => {
    const n = (connSlots.get(ipConnKey) || 1) - 1;
    if (n <= 0) connSlots.delete(ipConnKey); else connSlots.set(ipConnKey, n);
  };
  socket.once('disconnect', releaseConnCount);

  socket.sessionStartedMs = ensureSessionStart(clientSessionId);

  // Pre-connect: user already logged in via REST -> attach the presence entry now
  const user = resolveUserForSocket(socket);

  // Re-check bans on socket connect: a member/guest holding a token minted before
  // they were banned must not be able to keep chatting by simply reconnecting.
  // Also enforces browser/OS bans from the panel (applies to guests too).
  {
    const sockUa = (socket.handshake && socket.handshake.headers && socket.handshake.headers['user-agent']) || '';
    const envBan = isBannedByClientEnv(sockUa);
    if ((user && isBannedByIpOrFp(socketIp(socket), user.fp, user.fp2)) || envBan.banned) {
      socket.emit('banned', { reason: envBan.banned ? envBanMessage(envBan.why) : 'تم حظرك من الدردشة', expiresAt: null });
      socket.disconnect(true);
      return;
    }
  }

  // Single-session enforcement: the same account must not be online twice.
  // If this user already has an active socket, log that old session out (kick it).
  if (user) {
    socketSession.set(socket.id, clientSessionId);
    kickExistingSessionsForUser(user, socket.id, clientSessionId);
  }

  // Public/unauth connect: still emit config + snapshot (guest not yet created).
  socket.emit('init-config', { GENERAL_ROOM_ID, waitingRoomId: WAITING_ROOM_ID });

  if (user) {
    onlineSockets.set(socket.id, user);
    user.roomid = GENERAL_ROOM_ID;
    socket.join('room:' + GENERAL_ROOM_ID);
    tokenToUser.set(user.token, { socketId: socket.id, username: user.username, token: user.token, guest: user.guest });
    broadcastPresence();
    broadcastJoinLeave(user, 'join');
  }

  socket.emit('rooms-stats', roomStats());
  socket.emit('global-limits', globalLimitsGet());

  if (user) {
    emitUserSnapshotTo(socket);
  } else {
    socket.emit('users-snapshot', { version: presenceVersion, users: serializeAllPresence() });
  }

  // Deliver any offline private messages waiting for this user
  if (user && typeof user.username === 'string') {
    const offline = [];
    privateMessages.forEach((msgs) => {
      msgs.forEach((m) => {
        const t = m && m.timestamp ? new Date(m.timestamp).getTime() : 0;
        if (String(m.to).toLowerCase() === String(user.username).toLowerCase() && m.status !== 'read' && (!socket.sessionStartedMs || !t || t >= socket.sessionStartedMs)) offline.push({
          fromUser: { username: m.from, topic: m.from, type: 'user', id: m.from, userId: m.from },
          message: { id: m.id, text: m.text, type: m.type, fileUrl: m.fileUrl, replyTo: m.replyTo, timestamp: m.timestamp },
        });
      });
    });
    if (offline.length > 0) socket.emit('offline-private-messages', offline);
  }

  // ── join room ─────────────────────────────────────────────────────────
  function roomAccessCheck(socket, roomId, password) {
    const room = findRoomByAnyId(roomId);
    if (!room) return null;
    const u = findSocketUser(socket.id);
    if (u && isRoomBanned(roomId, u)) {
      socket.emit('room-ban-error', { roomId: String(room.id), msg: 'أنت محظور من هذه الغرفة' });
      return false;
    }
    if (room.isActive === false) {
      socket.emit('room-join-error', { roomId: String(room.id), msg: 'الغرفة غير متاحة حالياً' });
      return false;
    }
    if (room.password) {
      if (!password || String(password) !== String(room.password)) {
        socket.emit('needpass', { roomId: String(room.id), roomName: room.name });
        return false;
      }
    }
    // Membership gating: requiredLikes / roomLevel / capacity are enforced
    // server-side now (not just in the client UI).
    const adminPass = u && permissionsFor(u).permissions.canAccessLockedAndFullRooms;
    if (u && !adminPass) {
      if (room.requiredLikes && (u.likes || 0) < room.requiredLikes) {
        socket.emit('room-join-error', { roomId: String(room.id), msg: 'تحتاج إلى ' + room.requiredLikes + ' إعجاباً لدخول هذه الغرفة' });
        return false;
      }
      if (room.roomLevel && (u.roomLevel || 0) < room.roomLevel) {
        socket.emit('room-join-error', { roomId: String(room.id), msg: 'مستواك غير كافٍ لدخول هذه الغرفة' });
        return false;
      }
      if (room.capacity) {
        let live = 0;
        onlineSockets.forEach((ou) => { if (String(ou.roomid) === String(room.id)) live++; });
        if (live >= room.capacity) {
          socket.emit('room-join-error', { roomId: String(room.id), msg: 'الغرفة ممتلئة' });
          return false;
        }
      }
    }
    return true;
  }
  function isRoomBanned(roomId, u) {
    const list = roomBans.get(String(roomId)) || [];
    if (!list.length) return false;
    const now = Date.now();
    return list.some((b) => {
      if (b.until && now > b.until) return false;
      return (b.username && b.username.toLowerCase() === String(u.username || '').toLowerCase())
        || (b.userId && String(b.userId) === String(u.uid || u.userId || u.guestId || ''));
    });
  }
  socket.on('join', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const prevRoom = u.roomid;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (roomAccessCheck(socket, roomId, data && data.password) === false) return;
    u.roomid = roomId;
    socket.join('room:' + roomId);
    socket.emit('rejoin-success', {});
    socket.emit('room-changed', { roomId, room: roomToClient(findRoomByAnyId(roomId)) });
    const hist = (roomHistory.get(String(roomId)) || []).filter((m) => {
      const t = m && (m.createdAt ? new Date(m.createdAt).getTime() : (m.timestamp ? new Date(m.timestamp).getTime() : 0));
      return !socket.sessionStartedMs || !t || t >= socket.sessionStartedMs;
    });
    socket.emit('presence:room-history', { roomId, messages: hist, recovered: true });
    broadcastPresence();
    if (String(prevRoom) !== String(roomId)) {
      if (socket.rooms && prevRoom !== undefined && prevRoom !== null) socket.leave('room:' + prevRoom);
      if (prevRoom !== undefined && prevRoom !== null) broadcastJoinLeave(u, 'leave', prevRoom);
      broadcastRoomMove(u, roomId);
    }
  });

  socket.on('change-room', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const prevRoom = u.roomid;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (roomAccessCheck(socket, roomId, data && data.password) === false) return;
    u.roomid = roomId;
    socket.join('room:' + roomId);
    socket.emit('room-changed', { roomId, room: roomToClient(findRoomByAnyId(roomId)) });
    const hist = (roomHistory.get(String(roomId)) || []).filter((m) => {
      const t = m && (m.createdAt ? new Date(m.createdAt).getTime() : (m.timestamp ? new Date(m.timestamp).getTime() : 0));
      return !socket.sessionStartedMs || !t || t >= socket.sessionStartedMs;
    });
    socket.emit('presence:room-history', { roomId, messages: hist, recovered: true });
    broadcastPresence();
    if (String(prevRoom) !== String(roomId)) {
      if (socket.rooms && prevRoom !== undefined && prevRoom !== null) socket.leave('room:' + prevRoom);
      if (prevRoom !== undefined && prevRoom !== null) broadcastJoinLeave(u, 'leave', prevRoom);
      broadcastRoomMove(u, roomId);
    }
  });

  socket.on('leave-room', (data) => {
    const u = findSocketUser(socket.id);
    if (u) {
      const prevRoom = u.roomid;
      u.roomid = null;
      if (socket.rooms && prevRoom !== undefined && prevRoom !== null) socket.leave('room:' + prevRoom);
      broadcastPresence();
      broadcastJoinLeave(u, 'leave', prevRoom);
    }
  });

  socket.on('request-users-snapshot', () => {
    emitUserSnapshotTo(socket);
  });

  socket.on('message', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || typeof data.text !== 'string') return;
    const roomId = data.roomId !== undefined ? data.roomId : (u.roomid || GENERAL_ROOM_ID);
    if (isGloballyMuted(u.username) || isRoomMuted(roomId, u.username)) {
      socket.emit('error-msg', { msg: 'أنت مكتوم الصوت حالياً ولا يمكنك إرسال الرسائل' });
      return;
    }
    // Per-user flood control: cap public messages so a single account cannot
    // spam the whole room.
    const who = u.uid || u.guestId || u.userId || u.username || socket.id;
    const rl = rateLimit(socket.id + ':' + who, { max: 30, windowMs: 60000 }, 'message');
    if (rl.blocked) { socket.emit('error-msg', { msg: 'رسائلك كثيرة جداً، توقف قليلاً' }); return; }
    // Room membership gate: only allow sending to the room the user actually
    // joined (prevents injecting messages into other/password-locked rooms).
    const targetRoom = findRoomByAnyId(roomId);
    if (!targetRoom) return;
    if (String(targetRoom.id) !== String(u.roomid) && String(roomId) !== String(u.roomid)) {
      return;
    }
    if (targetRoom.disableChat && !permissionsFor(u).isAdmin) {
      socket.emit('error-msg', { msg: 'الدردشة معطلة في هذه الغرفة' });
      return;
    }
    const rawText = String(data.text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    const filteredText = filterNoLetters(rawText, 'bmsgs').trim();
    if (!filteredText) return;
    const msg = {
      id: nextId('m_'),
      user: publicUser(u),
      userId: u.guest ? u.guestId : u.uid,
      text: filteredText.substring(0, 300),
      createdAt: new Date().toISOString(),
      replyTo: (data.replyTo && typeof data.replyTo === 'object') ? {
        // Whitelist — never trust client-supplied cosmetic/identity fields here;
        // they are replayed to every viewer and rendered into style=""/attributes.
        id: String(data.replyTo.id || data.replyTo.userId || '').slice(0, 60),
        userId: String(data.replyTo.id || data.replyTo.userId || '').slice(0, 60),
        username: sanitizeUsername(String(data.replyTo.username || ''), 30),
        text: String(data.replyTo.text || '').substring(0, 300),
        mediaUrl: sanitizeMediaUrl(data.replyTo.mediaUrl),
        mediaType: safeMediaType(data.replyTo.mediaType),
      } : null,
      mediaUrl: sanitizeMediaUrl(data.mediaUrl),
      mediaType: safeMediaType(data.mediaType),
    };
    const hist = roomHistory.get(String(roomId)) || [];
    hist.push(msg);
    if (hist.length > 100) hist.splice(0, hist.length - 100);
    roomHistory.set(String(roomId), hist);
    io.to('room:' + roomId).emit('message', msg);
    // also store in db.messages if available
    try { if (db.messages) db.messages.create({ roomId, text: msg.text, userId: msg.userId, createdAt: msg.createdAt }); } catch (e) {}
  });

  socket.on('activity', () => {
    const u = findSocketUser(socket.id);
    if (u) { u.isIdle = false; broadcastPresence(); }
  });

  socket.on('presence:idle', () => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const rl = rateLimit(socket.id, { max: 4, windowMs: 60000 }, 'presence-enable');
    if (rl && rl.blocked) return;
    if (!u.isIdle) { u.isIdle = true; broadcastPresence(); }
  });

  socket.on('presence:active', () => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const rl = rateLimit(socket.id, { max: 4, windowMs: 60000 }, 'presence-active');
    if (rl && rl.blocked) return;
    if (u.isIdle) { u.isIdle = false; broadcastPresence(); }
  });

  socket.on('logout', () => {
    const u = findSocketUser(socket.id);
    if (u) {
      onlineSockets.delete(socket.id);
      socketSession.delete(socket.id);
      tokenToUser.delete(u.token);
      io.emit('user-left', { name: u.username });
      broadcastPresence();
    }
    socket.disconnect(true);
  });

  // ── Admin Control Panel (/cp) protocol ──────────────────────────────────
  // Thread-safe singleton helpers for CP-managed settings. All data is kept in
  // the `settings` doc (siteweb, dro3, emo, sico, shrt, msgs, banssystems),
  // `powers` (single doc { powers: [...] }), `subscriptions`, and `bans`.
  function cpSettingsDoc() {
    return moduleSettings();
  }
  function cpSettingsSet(patch) {
    const doc = cpSettingsDoc();
    Object.keys(patch).forEach((k) => { if (patch[k] !== undefined) doc[k] = patch[k]; });
    if (db.settings) db.settings.updateOne({}, { $set: patch });
    return doc;
  }
  function cpPowers() {
    const doc = db.powers ? db.powers.getAll()[0] : null;
    return doc && Array.isArray(doc.powers) ? doc.powers : [];
  }
  function cpSavePowers(list) {
    const arr = Array.isArray(list) ? list : [];
    if (db.powers) {
      const existing = db.powers.getAll()[0];
      if (existing) db.powers.updateOne({}, { $set: { powers: arr } });
      else db.powers.create({ powers: arr });
    }
  }
  function cpBanSystems() {
    return cpSettingsDoc().banssystems || { browsers: {}, systems: {} };
  }
  function cpShortcuts() {
    const shrt = cpSettingsDoc().shrt;
    return Array.isArray(shrt) ? shrt.filter((s) => s && s.name) : [];
  }
  function cpMsgs() {
    const msgs = cpSettingsDoc().msgs;
    return Array.isArray(msgs) ? msgs.filter((m) => m && m.adresse) : [];
  }
  function cpSubs() {
    return db.subscriptions ? db.subscriptions.getAll().map((s) => ({ iduser: s.iduser, topic: s.topic, topic1: s.topic1, sub: s.sub, time: s.time || (s.timeis ? new Date(s.timeis).toLocaleString('ar') : '') })) : [];
  }
  function cpAuditlog() {
    return db.auditlog ? db.auditlog.getAll() : [];
  }
  function cpRecordAudit(action, target, before, after, detail) {
    try {
      if (db.auditlog) db.auditlog.create({ when: new Date().toISOString(), actor: socket.isAdmin ? (socket.username || 'admin') : 'admin', action, target, before: before || null, after: after || null, detail: detail || null });
    } catch (e) {}
  }
  function cpReloadSite() {
    io.emit('reload_site', { at: Date.now() });
  }
  function cpBackupData() {
    const snap = {};
    // db is the collection map itself (see src/db/repository.js); there is no
    // `db.collections` property. Snapshot every real collection via getAll().
    Object.keys(db).forEach((k) => {
      try { if (db[k] && typeof db[k].getAll === 'function') snap[k] = db[k].getAll(); } catch (e) {}
    });
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, 'cp-backup-' + Date.now() + '.json');
    fs.writeFileSync(file, JSON.stringify(snap, null, 2), 'utf8');
    return file;
  }
  function cpRestoreData() {
    if (!fs.existsSync(DATA_DIR)) return false;
    const files = fs.readdirSync(DATA_DIR).filter((f) => /^cp-backup-.*\.json$/.test(f)).sort().reverse();
    if (files.length === 0) return false;
    const snap = JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[0]), 'utf8'));
    Object.keys(snap).forEach((k) => {
      try { if (db[k] && typeof db[k].setAll === 'function') db[k].setAll(snap[k]); } catch (e) {}
    });
    return true;
  }

  socket.on('msg', (data) => {
    if (!data || !data.cmd) return;
    // ── Legacy jawall protocol bridge ──
    if (data.cmd === 'mnnile') {
      const rawNick = String((data.data || {}).username || (data.data || {}).nick || '');
      const nick = rawNick.trim().length >= 3 ? sanitizeUsername(rawNick, 24) : ('زائر_' + Math.floor(1000 + Math.random() * 9000));
      const guestId = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const guest = {
        guestId, uid: '', username: nick, topic: nick, type: 'guest', guest: true,
        pic: 'pic.png', ucol: '#000000', mcol: '#6c757d', bg: '#ffffff',
        msg: '', co: 'us', country: 'us', rep: 0, likes: 0, coins: 0, wallPoints: 0,
        token: makeToken(), fp: '', fp2: '', ip: socket.handshake?.address || '',
        stealth: false, isHidden: false, isIdle: false, rank: '',
        group: { id: 0, name: '', roleRank: 0 },
        isAdmin: false, verified: false, allowPrivate: true, joinTime: Date.now(),
      };
      guestRegistry.set(guestId, guest);
      socket.guest = guest;
      socket.emit('message', { cmd: 'login_ok', data: guest });
      socket.emit('message', { cmd: 'getstate', data: { user: guest, roomId: 1 } });
      logger.info('legacy.guest', 'Guest via jawall bridge', { nick });
      return;
    }
    if (data.cmd === 'delBand' && data.data && (data.data.id || data.data.fp || data.data.ip)) {
      // Require an already-authenticated CP admin; otherwise verify the CP
      // password inline so the ban list can never be tampered with by anon.
      if (!socket.isAdmin) {
        // Throttle password attempts so an anonymous socket cannot brute-force
        // the CP password through this command (mirrors getstate/admin limits).
        const rl = rateLimit(socketIp(socket), { max: 5, windowMs: 60000 }, 'cp-delband');
        if (rl && rl.blocked) {
          socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'محاولات كثيرة، حاول بعد قليل' } });
          socket.disconnect(true);
          return;
        }
        const pass = data.data && data.data.password;
        if (!verifyCPPassword(pass)) {
          socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'صلاحية مطلوبة لحذف الحظر' } });
          return;
        }
        socket.isAdmin = true;
      }
      if (db.bands) {
        const all = db.bands.getAll() || [];
        // Match by _id/id first (strict), then by device/ip only when a value was supplied.
        const id = String(data.data.id || '');
        let target = null;
        if (id) target = all.find((b) => String(b._id || b.id || '') === id);
        if (!target) {
          target = all.find((b) =>
            (data.data.fp && String(b.device_band) === String(data.data.fp)) ||
            (data.data.ip && String(b.ip_band) === String(data.data.ip))
          );
        }
        if (target) {
          if (target._id) db.bands.deleteOne({ _id: target._id });
          else if (target.id) db.bands.deleteOne({ id: target.id });
          else if (target.device_band) db.bands.deleteMany({ device_band: target.device_band });
          else db.bands.deleteMany({ ip_band: target.ip_band });
        }
      }
      socket.emit('savedone', { msg: 'تم حذف الحظر' });
      return;
    }
    if (data.cmd === 'getstate') {
      const ip = socketIp(socket);
      const rl = socket.isAdmin ? null : rateLimit(ip, { max: 5, windowMs: 60000 }, 'getstate');
      if (rl && rl.blocked) {
        socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'محاولات كثيرة، حاول بعد قليل' } });
        socket.disconnect(true);
        return;
      }
      const pass = data.data && data.data.password;
      if (!cpAccessAllowed(pass)) {
        socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'كلمة المرور غير صحيحة' } });
        return;
      }
      socket.isAdmin = true;
      const siteweb = cpSettingsDoc().siteweb || { name: 'شات درر', title: 'لوحة التحكم', bg: '#40404f', buttons: '#f93634', background: '#40404f', allowg: true, allowreg: true };
      const s = cpSettingsDoc();
      socket.emit('message', { cmd: 'siteweb', data: siteweb });
      socket.emit('message', { cmd: 'dro3', data: Array.isArray(s.dro3) ? s.dro3 : [] });
      socket.emit('message', { cmd: 'emos', data: Array.isArray(s.emo) ? s.emo : [] });
      socket.emit('message', { cmd: 'sicos', data: Array.isArray(s.sico) ? s.sico : [] });
      socket.emit('message', { cmd: 'powers', data: cpPowers() });
      socket.emit('message', { cmd: 'noletters', data: db.noletters ? db.noletters.getAll() : [] });
      socket.emit('message', { cmd: 'zaker', data: db.zakrfa ? db.zakrfa.getAll() : [] });
      socket.emit('message', { cmd: 'users_data', data: (db.users.find({}) || []).map((u) => ({ id: u.id, topic: u.topic, username: u.username, power: u.power || 'user', ip: u.ip || '', fp: u.fp || '', fp2: u.fp2 || '', deviceInfo: u.deviceInfo || '', rep: u.rep || 0, likes: u.likes || 0, coins: u.coins || 0, wallPoints: u.wallPoints || 0, verified: !!u.verified, documentationc: u.documentationc || 0, created: u.created || '' })) });
      socket.emit('message', { cmd: 'rlist', data: (db.rooms.getAll() || []).map((r) => ({ ...roomToClient(r), hasPassword: !!r.password, owner: r.owner || '' })) });
      socket.emit('message', { cmd: 'band_list', data: db.bands ? db.bands.getAll() : [] });
      socket.emit('message', { cmd: 'setbansystem', data: { browsers: cpBanSystems().browsers || {}, systems: cpBanSystems().systems || {} } });
      socket.emit('message', { cmd: 'shrtlist', data: cpShortcuts() });
      socket.emit('message', { cmd: 'msgslist', data: cpMsgs() });
      socket.emit('message', { cmd: 'subslist', data: cpSubs() });
      socket.emit('message', { cmd: 'seo', data: seoSettings() });
      socket.emit('message', { cmd: 'appearance', data: appearanceSettings() });
      return;
    }
    if (data.cmd === 'admin') {
      const rl = socket.isAdmin ? null : rateLimit(socketIp(socket), { max: 5, windowMs: 60000 }, 'cpadmin');
      if (rl && rl.blocked) {
        socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'محاولات كثيرة، حاول بعد قليل' } });
        socket.disconnect(true);
        return;
      }
      const a = data.data || {};
      if (!a.cmd || !a.pass) return;
      if (!cpAccessAllowed(a.pass)) {
        socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'كلمة المرور غير صحيحة' } });
        return;
      }
      socket.isAdmin = true;
      const payload = a.data || {};
      switch (a.cmd) {
        case 'delete_user': {
          if (payload.name) {
            const target = db.users.findOne({ topic: payload.name }) || db.users.findOne({ username: payload.name }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(payload.name).toLowerCase());
            if (target) {
              if (String(target.topic).toLowerCase() === String(config.adminUser || 'admin').toLowerCase()) {
                socket.emit('savedone', { msg: 'لا يمكن حذف حساب المدير الرئيسي' });
                break;
              }
              db.users.deleteMany({ id: target.id });
              db.users.deleteMany({ topic: target.topic });
              const dead = [];
              onlineSockets.forEach((u, sid) => { if (String(u.uid || u.guestId || u.userId || '') === String(target.id)) dead.push({ sid, u }); });
              dead.forEach(({ sid, u }) => {
                try { io.sockets.sockets.get(sid) && io.sockets.sockets.get(sid).emit('kicked', { reason: 'تم حذف حسابك من لوحة التحكم' }); } catch (e) {}
                onlineSockets.delete(sid); socketSession.delete(sid); if (u.token) tokenToUser.delete(u.token);
              });
              io.emit('user-left', { name: target.topic });
              broadcastPresence();
              cpRecordAudit('delete_user', target.topic, null, null);
            }
          }
          socket.emit('savedone', { msg: 'تم حذف العضو' });
          break;
        }
        case 'save_band': {
          if (payload.fp || payload.ip) {
            const rec = { _id: crypto.randomBytes(8).toString('hex'), id: crypto.randomBytes(8).toString('hex'), device_band: payload.fp || '', device_band2: payload.fp2 || '', ip_band: payload.ip || '', date: new Date().toISOString(), name_band: payload.reason || 'حظر من لوحة التحكم' };
            db.bands.create(rec);
            cpRecordAudit('save_band', rec.device_band || rec.ip_band, null, rec.name_band);
          }
          socket.emit('done_band', {});
          break;
        }
        case 'delete_band': {
          if (payload.fp) db.bands.deleteMany({ device_band: payload.fp });
          if (payload.ip) db.bands.deleteMany({ ip_band: payload.ip });
          socket.emit('savedone', { msg: 'تم إلغاء الحظر' });
          break;
        }
        case 'add_room': {
          const name = sanitizeRoomName((payload && payload.name) || '', 30);
          if (!name) { socket.emit('error-msg', { msg: 'أدخل اسم الغرفة' }); break; }
          if (!db.rooms.getAll().some((r) => String(r.name) === name)) {
            const room = { id: nextId('room_'), name, owner: (payload && payload.owner) || '', order: db.rooms.getAll().length, created: new Date().toISOString(), password: '', isActive: true, isLocked: false, capacity: 0, roomLevel: 0 };
            db.rooms.create(room);
            io.emit('rooms-stats', roomStats());
            cpRecordAudit('add_room', name, null, null);
            socket.emit('message', { cmd: 'rlist', data: (db.rooms.getAll() || []).map((r) => ({ ...roomToClient(r), hasPassword: !!r.password, owner: r.owner || '' })) });
            socket.emit('savedone', { msg: 'تمت إضافة الغرفة' });
          } else {
            socket.emit('error-msg', { msg: 'الغرفة موجودة بالفعل' });
          }
          break;
        }
        case 'rename_room': {
          const room = payload && payload.id !== undefined ? findRoomByAnyId(payload.id) : null;
          const name = sanitizeRoomName((payload && payload.name) || '', 30);
          if (room && name) {
            db.rooms.updateOne({ id: room.id }, { $set: { name } });
            emitRoomUpdated(room.id);
            cpRecordAudit('rename_room', String(room.id), null, name);
            socket.emit('savedone', { msg: 'تمت إعادة تسمية الغرفة' });
          } else {
            socket.emit('error-msg', { msg: 'الغرفة غير موجودة أو الاسم فارغ' });
          }
          break;
        }
        case 'delete_room': {
          if (payload.id !== undefined) {
            const room = findRoomByAnyId(payload.id);
            if (!room) {
              socket.emit('savedone', { msg: 'الغرفة غير موجودة' });
              break;
            }
            if (String(room.id) === String(GENERAL_ROOM_ID)) {
              socket.emit('savedone', { msg: 'لا يمكن حذف الغرفة العامة' });
              break;
            }
            db.rooms.deleteMany({ id: room.id });
            roomModerators.delete(String(room.id));
            roomMutes.delete(String(room.id));
            roomMicLocks.delete(String(room.id));
            roomHistory.delete(String(room.id));
            roomBans.delete(String(room.id));
            io.emit('rooms-stats', roomStats());
            io.emit('room-deleted', { id: room.id });
            cpRecordAudit('delete_room', room.name || String(room.id), null, null);
            socket.emit('savedone', { msg: 'تم حذف الغرفة' });
          }
          break;
        }
        case 'setuserpower': {
          if (payload.name) {
            const target = db.users.findOne({ topic: payload.name }) || db.users.findOne({ username: payload.name }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(payload.name).toLowerCase());
            const power = String(payload.power || 'user');
            if (target) {
              const isRoot = String(target.topic).toLowerCase() === String(config.adminUser || 'admin').toLowerCase();
              if (isRoot && power !== 'admin') {
                socket.emit('savedone', { msg: 'لا يمكن تغيير صلاحية المدير الرئيسي' });
                break;
              }
              const before = target.power || 'user';
              (db.users.find({ id: target.id }) || []).forEach((row) => db.users.updateOne({ id: row.id }, { $set: { power } }));
              onlineSockets.forEach((u) => { if (String(u.uid || u.guestId || u.userId || '') === String(target.id)) { u.rank = power; u.power = power; } });
              io.emit('user_updated', { id: target.id, username: target.topic, power });
              cpRecordAudit('setuserpower', target.topic, before, power);
            }
          }
          socket.emit('savedone', { msg: 'تم تغيير الصلاحية' });
          break;
        }
        case 'save_state': {
          const siteweb = cpSettingsDoc().siteweb || {};
          ['name', 'title', 'bg', 'buttons', 'background', 'msgst'].forEach((k) => { if (payload[k] !== undefined) siteweb[k] = payload[k]; });
          if (payload.allowg !== undefined) siteweb.allowg = !!payload.allowg;
          if (payload.allowreg !== undefined) siteweb.allowreg = !!payload.allowreg;
          if (payload.likeGates && typeof payload.likeGates === 'object') {
            const gates = siteweb.likeGates || {};
            ['wall', 'private', 'story', 'call', 'mic'].forEach((k) => {
              const n = parseInt(payload.likeGates[k], 10);
              if (!isNaN(n) && n >= 0) gates[k] = n;
            });
            siteweb.likeGates = gates;
          }
          cpSettingsSet({ siteweb });
          socket.emit('savedone', { msg: 'تم حفظ الإعدادات' });
          io.emit('settings-updated', { siteweb });
          cpRecordAudit('save_state', 'site', null, { name: siteweb.name, allowg: siteweb.allowg, allowreg: siteweb.allowreg });
          break;
        }
        case 'get_seo': {
          socket.emit('message', { cmd: 'seo', data: seoSettings() });
          break;
        }
        case 'save_seo': {
          if (typeof payload !== 'object' || payload === null) { socket.emit('error-msg', { msg: 'بيانات غير صالحة' }); break; }
          const saved = seoSave(payload);
          socket.emit('message', { cmd: 'seo_saved', data: saved });
          socket.emit('savedone', { msg: 'تم حفظ إعدادات محركات البحث' });
          cpRecordAudit('save_seo', 'site', null, { title: saved.siteTitle, canonicalUrl: saved.canonicalUrl });
          break;
        }
        case 'get_appearance': {
          socket.emit('message', { cmd: 'appearance', data: appearanceSettings() });
          break;
        }
        case 'save_appearance': {
          if (typeof payload !== 'object' || payload === null) { socket.emit('error-msg', { msg: 'بيانات غير صالحة' }); break; }
          const savedAp = appearanceSave(payload);
          socket.emit('message', { cmd: 'appearance', data: savedAp });
          socket.emit('savedone', { msg: 'تم حفظ الألوان والمظهر' });
          io.emit('settings-updated', { appearance: savedAp });
          cpRecordAudit('save_appearance', 'site', null, { mainUiColor: savedAp.mainUiColor, landingBgColor: savedAp.landingBgColor });
          break;
        }
        case 'upload_site_image': {
          // payload: { kind, dataUrl, idx? }
          // kinds: favicon|banner|pic (SEO) · emoji|badge|addon_icon|addon_gift (assets)
          //        overlay_image|private_tab_bg|system_message_image|default_room|default_cover (appearance)
          const kind = String(payload.kind || '').trim();
          const ASSET_KINDS = ['emoji', 'badge', 'addon_icon', 'addon_gift'];
          const APPEARANCE_IMG_KINDS = {
            overlay_image: 'overlayImageUrl',
            private_tab_bg: 'privateTabBgUrl',
            system_message_image: 'defaultSystemMessageImageUrl',
            default_room: 'defaultRoomUrl',
            default_cover: 'defaultCoverUrl'
          };
          const appearanceKey = APPEARANCE_IMG_KINDS[kind];
          if (['favicon', 'banner', 'pic'].indexOf(kind) === -1 && ASSET_KINDS.indexOf(kind) === -1 && !appearanceKey) {
            socket.emit('error-msg', { msg: 'نوع الصورة غير صالح' });
            break;
          }
          const isAssetKind = ASSET_KINDS.indexOf(kind) !== -1;
          const assetIdx = payload.idx !== undefined ? payload.idx : null;
          const dataUrl = String(payload.dataUrl || '');
          const m = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i);
          if (!m) { socket.emit('error-msg', { msg: 'صورة غير صالحة' }); break; }
          const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
          const buf = Buffer.from(m[2], 'base64');
          if (!buf.length || buf.length > 8 * 1024 * 1024) { socket.emit('error-msg', { msg: 'حجم الصورة كبير جداً' }); break; }
          const siteUploadDir = path.join(CLIENT_DIR, 'uploads', 'site');
          if (!fs.existsSync(siteUploadDir)) fs.mkdirSync(siteUploadDir, { recursive: true });
          const seoBefore = seoSettings();
          const prevKey = kind === 'pic' ? 'defaultAvatarUrl' : kind + 'Url';
          const prev = isAssetKind
            ? ''
            : appearanceKey
              ? (appearanceSettings()[appearanceKey] || '')
              : ((seoBefore && seoBefore[prevKey]) || '');
          const finishSiteUpload = (dataBuf, ext2) => {
            const fname = kind + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext2;
            fs.writeFileSync(path.join(siteUploadDir, fname), dataBuf);
            const url = '/uploads/site/' + fname;
            if (isAssetKind) {
              // Asset uploads (emoji/badge/addon): URL only — the caller attaches
              // it to its own list via a follow-up *_item_add / set_badges cmd.
              socket.emit('message', { cmd: 'cp_image_uploaded', data: { kind, url, idx: assetIdx } });
              socket.emit('savedone', { msg: 'تم رفع الصورة' });
              cpRecordAudit('upload_site_image', kind, null, url);
              return;
            }
            if (appearanceKey) {
              // Appearance media: persist into db.settings.appearance and push live
              // to every connected client via site_appearance_updated.
              const savedAp = appearanceSave({ [appearanceKey]: url });
              if (prev && prev.indexOf('/uploads/site/') === 0 && prev !== url) {
                try { const p = path.join(siteUploadDir, path.basename(prev.split('?')[0])); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { logger.warn('cp', 'Old site image cleanup failed', { error: e.message }); }
              }
              io.emit('site_appearance_updated', savedAp);
              socket.emit('message', { cmd: 'appearance', data: savedAp });
              socket.emit('savedone', { msg: 'تم رفع الصورة وتحديث الموقع' });
              cpRecordAudit('upload_site_image', kind, null, url);
              return;
            }
            const savedImage = seoSave({ [kind === 'pic' ? 'defaultAvatarUrl' : kind + 'Url']: url, ...(kind === 'banner' ? { ogImage: url } : {}) });
            // Auto-cleanup: remove the previous file of the same kind once the new
            // one is persisted, so replaced images never accumulate on the disk.
            if (prev && prev.indexOf('/uploads/site/') === 0 && prev !== url) {
              try { const p = path.join(siteUploadDir, path.basename(prev.split('?')[0])); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { logger.warn('cp', 'Old site image cleanup failed', { error: e.message }); }
            }
            socket.emit('message', { cmd: 'seo_saved', data: savedImage });
            socket.emit('savedone', { msg: 'تم رفع الصورة وتحديث الموقع' });
            cpRecordAudit('upload_site_image', kind, null, url);
          };
          // Animated gifs pass through untouched (sharp would flatten them).
          if (ext === 'gif') { finishSiteUpload(buf, ext); break; }
          compressSiteImageBuffer(buf, kind)
            .then((out) => {
              if (out && out.data && out.data.length && out.data.length < buf.length) finishSiteUpload(out.data, out.ext);
              else finishSiteUpload(buf, ext);
            })
            .catch(() => {
              try { finishSiteUpload(buf, ext); } catch (e) { socket.emit('error-msg', { msg: 'تعذر رفع الصورة' }); }
            });
          break;
        }
        case 'save_as': {
          if (Array.isArray(payload.powers)) cpSavePowers(payload.powers);
          socket.emit('savedone', { msg: 'تم حفظ الصلاحيات' });
          socket.emit('message', { cmd: 'powers', data: cpPowers() });
          break;
        }
        case 'save_emo': {
          const arr = Array.isArray(payload) ? payload : (Array.isArray(payload && payload.data) ? payload.data : []);
          cpSettingsSet({ emo: arr });
          socket.emit('savedone', { msg: 'تم حفظ الابتسامات' });
          io.emit('smileys:updated', arr);
          break;
        }
        case 'save_dro3': {
          const arr = Array.isArray(payload) ? payload : (Array.isArray(payload && payload.data) ? payload.data : []);
          cpSettingsSet({ dro3: arr });
          socket.emit('savedone', { msg: 'تم حفظ الدروق' });
          break;
        }
        case 'save_sico': {
          const arr = Array.isArray(payload) ? payload : (Array.isArray(payload && payload.data) ? payload.data : []);
          cpSettingsSet({ sico: arr });
          socket.emit('savedone', { msg: 'تم حفظ الأيقونات الفائقة' });
          io.emit('sicos:updated', arr);
          break;
        }
        case 'save_browser_bans': {
          const cur = cpBanSystems();
          cur.browsers = Object.assign({}, cur.browsers, payload.browser || {});
          cpSettingsSet({ banssystems: cur });
          socket.emit('savedone', { msg: 'تم حفظ حظر المتصفحات' });
          io.emit('banssystem-updated', cur);
          break;
        }
        case 'save_system_bans': {
          const cur = cpBanSystems();
          cur.systems = Object.assign({}, cur.systems, payload.os || {});
          cpSettingsSet({ banssystems: cur });
          socket.emit('savedone', { msg: 'تم حفظ حظر الأنظمة' });
          io.emit('banssystem-updated', cur);
          break;
        }
        case 'shrt_add': {
          const list = cpShortcuts();
          const name = String(payload.name || '').trim();
          if (name && !list.some((x) => x.name === name)) list.push({ name, value: String(payload.value || '') });
          cpSettingsSet({ shrt: list });
          socket.emit('savedone', { msg: 'تمت إضافة الاختصار' });
          io.emit('shortcuts:updated', list);
          break;
        }
        case 'shrt_del': {
          const list = cpShortcuts().filter((x) => x.name !== String(payload.name || ''));
          cpSettingsSet({ shrt: list });
          socket.emit('savedone', { msg: 'تم حذف الاختصار' });
          io.emit('shortcuts:updated', list);
          break;
        }
        case 'subs_add': {
          if (db.subscriptions && payload.iduser) db.subscriptions.create({ iduser: String(payload.iduser), topic: String(payload.topic || ''), topic1: String(payload.topic1 || ''), sub: String(payload.sub || ''), time: String(payload.time || ''), timeis: payload.timeis || Date.now() });
          socket.emit('savedone', { msg: 'تمت إضافة الاشتراك' });
          socket.emit('message', { cmd: 'subslist', data: cpSubs() });
          break;
        }
        case 'subs_del': {
          if (db.subscriptions) db.subscriptions.deleteOne({ iduser: String(payload.iduser) });
          socket.emit('savedone', { msg: 'تم حذف الاشتراك' });
          socket.emit('message', { cmd: 'subslist', data: cpSubs() });
          break;
        }
        case 'msg_add': {
          const list = cpMsgs();
          list.push({ category: String(payload.category || 'w'), adresse: String(payload.adresse || ''), msg: String(payload.msg || '') });
          cpSettingsSet({ msgs: list });
          socket.emit('savedone', { msg: 'تمت إضافة الرسالة' });
          socket.emit('message', { cmd: 'msgslist', data: cpMsgs() });
          break;
        }
        case 'msg_del': {
          const list = cpMsgs().filter((m) => !(m.adresse === String(payload.adresse || '') && m.msg === String(payload.msg || '')));
          cpSettingsSet({ msgs: list });
          socket.emit('savedone', { msg: 'تم حذف الرسالة' });
          socket.emit('message', { cmd: 'msgslist', data: cpMsgs() });
          break;
        }
        case 'reload_site': { cpRecordAudit('reload_site', null); socket.emit('savedone', { msg: 'تم إعادة التشغيل' }); cpReloadSite(); break; }
        case 'backup': { cpRecordAudit('backup', null); socket.emit('savedone', { msg: 'تم إنشاء النسخة الاحتياطية' }); cpBackupData(); break; }
        case 'restore': { cpRecordAudit('restore', null); const ok = cpRestoreData(); socket.emit('savedone', { msg: ok ? 'تمت الاستعادة' : 'لا توجد نسخة احتياطية' }); if (ok) cpReloadSite(); break; }
        case 'delete_actions': { if (db.auditlog) db.auditlog.drop(); socket.emit('savedone', { msg: 'تم حذف سجل الإجراءات' }); break; }
        case 'get_system_health': {
          socket.emit('system_health', {
            connectedUsers: onlineSockets.size,
            onlineCount: onlineSockets.size,
            activeRooms: db.rooms.getAll().length,
            roomsOnline: db.rooms.getAll().length,
            dbStatus: 'memory',
            memory: { rss: process.memoryUsage().rss, heap: process.memoryUsage().heapUsed },
            uptime: Math.floor(process.uptime()),
            node: process.version,
          });
          break;
        }
        case 'get_auditlog': {
          socket.emit('auditlog', cpAuditlog().map((a) => ({ when: a.when, actor: a.actor, action: a.action, target: a.target, before: a.before, after: a.after })));
          break;
        }
        case 'get_user': {
          if (payload.topic) {
            const q = String(payload.topic);
            const u = db.users.findOne({ topic: q }) || db.users.findOne({ username: q }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === q.toLowerCase());
            socket.emit('user_data', u ? { topic: u.topic, username: u.username, ip: u.ip || '', fp: u.fp || '', power: u.power || 'user', rep: u.rep || 0, likes: u.likes || 0 } : null);
          } else {
            socket.emit('user_data', null);
          }
          break;
        }
        case 'get_fps': {
          const q = String((payload && payload.search) || '').trim().toLowerCase();
          let list = db.users ? (db.users.find({}) || []).filter((u) => u.fp) : [];
          if (q) list = list.filter((u) => String(u.topic || '').toLowerCase().indexOf(q) !== -1 || String(u.username || '').toLowerCase().indexOf(q) !== -1 || String(u.fp || '').indexOf(q) !== -1 || String(u.ip || '').indexOf(q) !== -1);
          socket.emit('fpslist', list.slice(0, 200).map((u) => ({ topic: u.topic, username: u.username, fp: u.fp || '', fp2: u.fp2 || '', deviceInfo: u.deviceInfo || '', ip: u.ip || '', rep: u.rep || 0, likes: u.likes || 0, time: u.lastSeen || u.created || '' })));
          break;
        }
        case 'delete_fps': {
          // FPS list is built from user fingerprints; clearing it clears fp on
          // every user (and drops the legacy logs collection when present).
          if (db.users) (db.users.find({}) || []).forEach((u) => { if (u.fp) db.users.updateOne({ id: u.id }, { $set: { fp: '' } }); });
          if (db.logs) db.logs.drop();
          socket.emit('savedone', { msg: 'تم حذف سجل الدخول' });
          break;
        }
        case 'fltr_add': {
          if (db.noletters && payload.value) db.noletters.create({ v: payload.value, type: payload.type || 'bmsgs' });
          socket.emit('savedone', { msg: 'تمت إضافة الكلمة' });
          socket.emit('message', { cmd: 'noletters', data: db.noletters ? db.noletters.getAll() : [] });
          break;
        }
        case 'fltr_del': {
          if (db.noletters) db.noletters.deleteOne({ v: payload.value });
          socket.emit('savedone', { msg: 'تم حذف الكلمة' });
          socket.emit('message', { cmd: 'noletters', data: db.noletters ? db.noletters.getAll() : [] });
          break;
        }

        // ── CP Group 1: Live user management (online list, kick, mute, ban) ──
        case 'get_online_users': {
          const users = [];
          onlineSockets.forEach((u, sid) => {
            users.push({
              sid,
              id: u.uid || u.guestId || u.userId || '',
              username: u.username,
              type: u.type,
              roomid: u.roomid || GENERAL_ROOM_ID,
              roomName: (() => { const rr = db.rooms.findOne({ id: String(u.roomid || GENERAL_ROOM_ID) }); return rr ? rr.name : ''; })(),
              ip: (() => { try { const sk = io.sockets.sockets.get(sid); return sk ? socketIp(sk) : ''; } catch (e) { return ''; } })(),
              power: u.rank || u.power || 'user',
              isAdmin: u.isAdmin === true || u.rank === 'admin',
              idle: !!u.isIdle,
              guest: u.type === 'guest',
            });
          });
          socket.emit('message', { cmd: 'online_usrs', data: users });
          break;
        }
        case 'cp_kick_user': {
          const name = String(payload.name || '').toLowerCase();
          let kicked = 0;
          onlineSockets.forEach((u, sid) => {
            if (u.username && String(u.username).toLowerCase() === name) {
              const sk = io.sockets.sockets.get(sid);
              if (sk) { try { sk.emit('kicked', { reason: String(payload.reason || 'تم طردك من قبل الإدارة') }); sk.disconnect(true); } catch (e) {} }
              onlineSockets.delete(sid); socketSession.delete(sid);
              kicked++;
            }
          });
          if (kicked) broadcastPresence();
          cpRecordAudit('kick_user', String(payload.name), null, { sockets: kicked });
          socket.emit('savedone', { msg: kicked ? 'تم طرد ' + payload.name + ' (' + kicked + ' جلسة)' : 'لا يوجد مستخدم متصل بهذا الاسم' });
          break;
        }
        case 'cp_mute_user': {
          const name = String(payload.name || '') || '';
          const roomId = String(payload.roomId || '').toLowerCase();
          const ms = Math.max(60 * 1000, parseInt(payload.ms, 10) || 60 * 1000);
          if (name) {
            const rm = roomMutes.get(roomId) || new Map();
            rm.set(String(name).toLowerCase(), { until: Date.now() + ms });
            roomMutes.set(roomId, rm);
            onlineSockets.forEach((u, sid) => { if (u.username && String(u.username).toLowerCase() === String(name).toLowerCase()) { const sk = io.sockets.sockets.get(sid); if (sk) sk.emit('muted', { seconds: Math.ceil(ms / 1000), reason: String(payload.reason || 'تم كتم صوتك') }); } });
            cpRecordAudit('mute_user', name, null, { room: roomId, ms });
            socket.emit('savedone', { msg: 'تم كتم ' + name });
          } else {
            socket.emit('error-msg', { msg: 'أدخل اسم المستخدم' });
          }
          break;
        }
        case 'cp_unmute_user': {
          const name = String(payload.name || '').toLowerCase();
          const roomId = String(payload.roomId || '').toLowerCase();
          if (roomMutes.has(roomId)) {
            const rm = roomMutes.get(roomId);
            rm.delete(name);
            if (rm.size === 0) roomMutes.delete(roomId);
          }
          onlineSockets.forEach((u, sid) => { if (u.username && String(u.username).toLowerCase() === name) { const sk = io.sockets.sockets.get(sid); if (sk) sk.emit('unmuted', {}); } });
          cpRecordAudit('unmute_user', String(payload.name));
          socket.emit('savedone', { msg: 'تم رفع الكتم' });
          break;
        }
        case 'cp_ban_online': {
          const name = String(payload.name || '') || '';
          const target = db.users.findOne({ topic: name }) || db.users.findOne({ username: name }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(name).toLowerCase());
          if (target) {
            const rec = { _id: crypto.randomBytes(8).toString('hex'), id: crypto.randomBytes(8).toString('hex'), device_band: target.fp || '', device_band2: target.fp2 || '', ip_band: target.ip || '', date: new Date().toISOString(), name_band: String(payload.reason || 'حظر من لوحة التحكم') };
            if (db.bands) db.bands.create(rec);
            cpRecordAudit('ban_user', name, null, rec.name_band);
          }
          onlineSockets.forEach((u, sid) => {
            if (u.username && String(u.username).toLowerCase() === String(name).toLowerCase()) {
              const sk = io.sockets.sockets.get(sid);
              if (sk) { try { sk.emit('banned', { reason: 'تم حظرك من قبل الإدارة' }); sk.disconnect(true); } catch (e) {} }
              onlineSockets.delete(sid); socketSession.delete(sid);
            }
          });
          broadcastPresence();
          socket.emit('savedone', { msg: 'تم حظر ' + name });
          break;
        }

        // ── CP Group 2: Full profile editing ─────────────────────────────
        case 'get_user_profile': {
          const q = String(payload.topic || payload.name || '');
          const u = db.users.findOne({ topic: q }) || db.users.findOne({ username: q }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(q).toLowerCase());
          if (!u) { socket.emit('message', { cmd: 'user_profile', data: null }); break; }
          socket.emit('message', { cmd: 'user_profile', data: {
            id: u.id, topic: u.topic, username: u.username, power: u.power || 'user',
            ip: u.ip || '', fp: u.fp || '', created: u.created || '', lastSeen: u.lastSeen || '',
            rep: u.rep || 0, likes: u.likes || 0, coins: u.coins || 0, wallPoints: u.wallPoints || 0,
            verified: !!u.verified, memberShip: u.memberShip || 'free', isAdmin: !!u.isAdmin,
            pic: u.pic || 'pic.png', co: u.co || '', country: u.country || '', msg: u.msg || '',
            ucol: u.ucol || '', mcol: u.mcol || '', bg: u.bg || '', email: u.email || '',
            gender: u.gender || '', birthdays: u.birthday || u.birthdates || '',
            group: u.group || { id: 0, name: '', roleRank: 0 },
          }});
          break;
        }
        case 'edit_user_profile': {
          const q = String(payload.original || payload.topic || payload.name || '');
          const u = db.users.findOne({ topic: q }) || db.users.findOne({ username: q }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(q).toLowerCase());
          if (!u) { socket.emit('error-msg', { msg: 'المستخدم غير موجود' }); break; }
          const isRoot = String(u.topic).toLowerCase() === String(config.adminUser || 'admin').toLowerCase();
          const set = {};
          if (payload.topic !== undefined) {
            const newTopic = sanitizeUsername(payload.topic, 30);
            if (newTopic && newTopic.toLowerCase() !== u.topic.toLowerCase()) {
              const clash = db.users.find({}).some((x) => x.id !== u.id && String(x.topic || '').toLowerCase() === newTopic.toLowerCase());
              if (clash) { socket.emit('error-msg', { msg: 'اسم المستخدم موجود مسبقاً' }); break; }
              set.topic = newTopic; set.username = newTopic;
            }
          }
          if (payload.power !== undefined && !isRoot) set.power = String(payload.power) === 'admin' ? 'admin' : String(payload.power || 'user');
          if (payload.isAdmin !== undefined && !isRoot) set.isAdmin = !!payload.isAdmin;
          if (payload.rep !== undefined) set.rep = Math.max(0, parseInt(payload.rep, 10) || 0);
          if (payload.likes !== undefined) set.likes = Math.max(0, parseInt(payload.likes, 10) || 0);
          if (payload.coins !== undefined) set.coins = Math.max(0, parseInt(payload.coins, 10) || 0);
          if (payload.wallPoints !== undefined) set.wallPoints = Math.max(0, parseInt(payload.wallPoints, 10) || 0);
          if (payload.verified !== undefined) set.verified = !!payload.verified;
          if (payload.memberShip !== undefined) set.memberShip = String(payload.memberShip || 'free');
          if (payload.co !== undefined) set.co = String(payload.co || '').substring(0, 3);
          if (payload.country !== undefined) set.country = String(payload.country || '').substring(0, 60);
          if (payload.msg !== undefined) set.msg = String(payload.msg || '').substring(0, 120);
          if (payload.gender !== undefined) set.gender = String(payload.gender || '');
          if (payload.email !== undefined) set.email = String(payload.email || '').substring(0, 120);
          if (payload.pic !== undefined) set.pic = String(payload.pic || 'pic.png').substring(0, 300);
          if (payload.password !== undefined && !isRoot) {
            const pw = String(payload.password || '').trim();
            if (pw.length >= 4) set.password = bcrypt.hashSync(pw, 10);
          }
          if (Object.keys(set).length) db.users.updateOne({ id: u.id }, { $set: set });
          syncPresenceStatsFor({ ...u, ...set });
          io.emit('user_updated', { id: u.id, username: set.topic || u.topic, topic: set.topic || u.topic, power: set.power || u.power, verified: set.verified !== undefined ? set.verified : !!u.verified, rep: set.rep !== undefined ? set.rep : (u.rep || 0), likes: set.likes !== undefined ? set.likes : (u.likes || 0), coins: set.coins !== undefined ? set.coins : (u.coins || 0), wallPoints: set.wallPoints !== undefined ? set.wallPoints : (u.wallPoints || 0) });
          broadcastPresence();
          cpRecordAudit('edit_user_profile', q, null, set);
          socket.emit('savedone', { msg: 'تم تحديث العضو' });
          break;
        }
        case 'cp_give_rep': {
          const q = String(payload.topic || payload.name || '');
          const val = parseInt(payload.value, 10) || 1;
          const u = db.users.findOne({ topic: q }) || db.users.findOne({ username: q }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(q).toLowerCase());
          if (!u) { socket.emit('error-msg', { msg: 'المستخدم غير موجود' }); break; }
          const r = Math.max(0, (u.rep || 0) + val);
          db.users.updateOne({ id: u.id }, { $set: { rep: r } });
          onlineSockets.forEach((o) => { if (o.username && String(o.username).toLowerCase() === String(u.topic || '').toLowerCase()) o.rep = r; });
          io.emit('user_updated', { id: u.id, username: u.topic, topic: u.topic, rep: r });
          socket.emit('savedone', { msg: 'تمت إضافة ' + val + ' نقاط شكر' });
          break;
        }

        // ── CP Group 3: Full room management ─────────────────────────────
        case 'get_room_profile': {
          const room = findRoomByAnyId(payload.id);
          if (!room) { socket.emit('message', { cmd: 'room_profile', data: null }); break; }
          socket.emit('message', { cmd: 'room_profile', data: { ...roomToClient(room), owner: room.owner || '', password: room.password || '', moderators: roomModeratorList(String(room.id)), roomBans: roomBans.get(String(room.id)) || [] } });
          break;
        }
        case 'edit_room_full': {
          const room = findRoomByAnyId(payload.id);
          if (!room) { socket.emit('error-msg', { msg: 'الغرفة غير موجودة' }); break; }
          const name = sanitizeRoomName(payload.name, 30);
          if (payload.name !== undefined && name) payload.name = name; else delete payload.name;
          roomApplyCommonFields({ body: payload }, room, null);
          if (payload.owner !== undefined) room.owner = String(payload.owner || '').substring(0, 30);
          if (payload.isActive !== undefined) room.isActive = !!payload.isActive;
          if (payload.isLocked !== undefined && payload.isLocked === false && !room.password) room.isLocked = false;
          db.rooms.updateOne({ id: room.id }, { $set: { ...room } });
          emitRoomUpdated(room.id);
          io.emit('rooms-stats', roomStats());
          cpRecordAudit('edit_room', room.name || String(room.id), null, payload);
          socket.emit('savedone', { msg: 'تم تحديث الغرفة' });
          break;
        }
        case 'add_room_moderator': {
          const room = findRoomByAnyId(payload.id);
          const modName = String(payload.username || '').trim();
          if (!room || !modName) { socket.emit('error-msg', { msg: 'بيانات غير مكتملة' }); break; }
          const list = roomModeratorList(String(room.id));
          if (!list.some((m) => String(m.username || m.topic || '').toLowerCase() === modName.toLowerCase())) {
            setRoomModerators(String(room.id), list.concat([{ userId: '', username: modName }]));
            socketModeratorSync(room.id);
            cpRecordAudit('room_add_mod', String(room.id), null, modName);
            socket.emit('savedone', { msg: 'تمت إضافة المشرف' });
          } else { socket.emit('savedone', { msg: 'المشرف موجود مسبقاً' }); }
          break;
        }
        case 'del_room_moderator': {
          const room = findRoomByAnyId(payload.id);
          const modName = String(payload.username || '').toLowerCase();
          if (!room || !modName) { socket.emit('error-msg', { msg: 'بيانات غير مكتملة' }); break; }
          const list = roomModeratorList(String(room.id)).filter((m) => String(m.username || m.topic || '').toLowerCase() !== modName);
          setRoomModerators(String(room.id), list);
          socketModeratorSync(room.id);
          cpRecordAudit('room_del_mod', String(room.id), null, payload.username);
          socket.emit('savedone', { msg: 'تمت إزالة المشرف' });
          break;
        }
        case 'clear_room_chat': {
          const room = findRoomByAnyId(payload.id);
          if (!room) { socket.emit('error-msg', { msg: 'الغرفة غير موجودة' }); break; }
          roomHistory.set(String(room.id), []);
          io.to('room:' + room.id).emit('room-chat-cleared', { roomId: String(room.id), username: 'admin', global: false });
          cpRecordAudit('clear_room_chat', room.name || String(room.id));
          socket.emit('savedone', { msg: 'تم مسح محادثة الغرفة' });
          break;
        }

        // ── CP Group 4: Content moderation (wall + stories) ──────────────
        case 'get_posts_moderation': {
          socket.emit('message', { cmd: 'posts_moderation', data: [...wallPosts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 120).map((p) => ({
            id: p.id, userId: p.userId, username: (p.user && (p.user.username || p.user.topic)) || ((p.guestInfo && p.guestInfo.username) || ''),
            text: (p.msg || p.text || '').substring(0, 120), mediaUrl: p.mediaUrl || '', likes: (p.wallLikes || []).length, comments: (p.comments || []).length, createdAt: p.createdAt,
          })) });
          break;
        }
        case 'get_stories_moderation': {
          socket.emit('message', { cmd: 'stories_moderation', data: [...stories].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 120).map((s) => ({
            id: s.id, userId: s.userId, username: (s.user && (s.user.username || s.user.topic)) || '', text: (s.text || '').substring(0, 80), img: s.img || s.mediaUrl || '', views: (s.views || []).length, likes: (s.likes || []).length, createdAt: s.createdAt,
          })) });
          break;
        }
        case 'del_post': {
          const idx = wallPosts.findIndex((p) => String(p.id) === String(payload.postId));
          if (idx === -1) { socket.emit('error-msg', { msg: 'المنشور غير موجود' }); break; }
          const p = wallPosts[idx];
          wallPosts.splice(idx, 1);
          persistWall();
          io.emit('wall-update', { type: 'delete', postId: p.id });
          if (p.mediaUrl && canDeleteUploadedFile(p.mediaUrl, p.userId)) { try { fs.unlinkSync(path.join(uploadDir, path.basename(p.mediaUrl.split('?')[0]))); } catch (e) {} }
          cpRecordAudit('del_post', p.id, null, (p.user && p.user.username) || '');
          socket.emit('savedone', { msg: 'تم حذف المنشور' });
          break;
        }
        case 'del_story': {
          const idx = stories.findIndex((s) => String(s.id) === String(payload.storyId));
          if (idx === -1) { socket.emit('error-msg', { msg: 'الستوري غير موجود' }); break; }
          const s = stories[idx];
          stories.splice(idx, 1);
          persistStories();
          if (s.img && canDeleteUploadedFile(s.img, s.userId)) { try { fs.unlinkSync(path.join(uploadDir, path.basename(s.img.split('?')[0]))); } catch (e) {} }
          io.emit('stories:updated', { stories: [...stories].slice(0, 20) });
          cpRecordAudit('del_story', s.id, null, (s.user && s.user.username) || '');
          socket.emit('savedone', { msg: 'تم حذف الستوري' });
          break;
        }
        case 'del_comment': {
          const p = wallPosts.find((x) => String(x.id) === String(payload.postId));
          if (!p) { socket.emit('error-msg', { msg: 'المنشور غير موجود' }); break; }
          p.comments = (p.comments || []).filter((c) => String(c.id) !== String(payload.commentId));
          persistWall();
          io.emit('wall-update', { type: 'comment', postId: p.id, commentCount: p.comments.length, comment: p.comments.length ? p.comments[p.comments.length - 1] : null });
          cpRecordAudit('del_comment', String(payload.postId), null, payload.commentId);
          socket.emit('savedone', { msg: 'تم حذف التعليق' });
          break;
        }

        // ── CP Group 6: Addons (super icons / gifts) + story bans ────────
        case 'get_addons': {
          const custom = addonAssets().filter((x) => x && x.url).map((x) => ({ url: x.url, type: x.type === 'gift' ? 'gift' : 'super_icon', name: x.name || '' }));
          socket.emit('message', { cmd: 'addons', data: custom.length ? custom : defaultSuperIcons });
          break;
        }
        case 'addon_add': {
          const type = payload.type === 'gift' ? 'gift' : 'super_icon';
          const url = String(payload.url || '').trim().substring(0, 300);
          if (!url) { socket.emit('error-msg', { msg: 'رابط الصورة مطلوب' }); break; }
          const name = String(payload.name || '').trim().substring(0, 60) || (type === 'gift' ? 'هدية' : 'أيقونة');
          const arr = addonAssets().slice();
          arr.push({ url, type, name });
          cpSettingsSet({ addons: arr });
          socket.emit('savedone', { msg: 'تمت إضافة الإضافة' });
          const custom2 = arr.filter((x) => x && x.url).map((x) => ({ url: x.url, type: x.type === 'gift' ? 'gift' : 'super_icon', name: x.name || '' }));
          socket.emit('message', { cmd: 'addons', data: custom2 });
          cpRecordAudit('addon_add', type, null, url);
          break;
        }
        case 'addon_del': {
          const url = String(payload.url || '');
          const arr = addonAssets().filter((x) => x && x.url !== url);
          cpSettingsSet({ addons: arr });
          socket.emit('savedone', { msg: 'تم حذف الإضافة' });
          const custom3 = arr.filter((x) => x && x.url).map((x) => ({ url: x.url, type: x.type === 'gift' ? 'gift' : 'super_icon', name: x.name || '' }));
          socket.emit('message', { cmd: 'addons', data: custom3 });
          cpRecordAudit('addon_del', url.substring(0, 80), null, null);
          break;
        }

        // ── CP Group 7: Feature toggles / tickers / badges / login behavior ──
        case 'get_features': {
          socket.emit('message', { cmd: 'features_data', data: featuresSettings() });
          break;
        }
        case 'set_features': {
          const savedF = featuresSave(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ الميزات' });
          socket.emit('message', { cmd: 'features_data', data: savedF });
          io.emit('features-updated', savedF);
          cpRecordAudit('set_features', '', null, payload);
          break;
        }
        case 'get_tickers': {
          socket.emit('message', { cmd: 'tickers_data', data: { news: newsTickerSettings(), ads: adsTickerSettings() } });
          break;
        }
        case 'set_news_ticker': {
          const savedN = newsTickerSave(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ الشريط الإخباري' });
          socket.emit('message', { cmd: 'tickers_data', data: { news: savedN, ads: adsTickerSettings() } });
          io.emit('news-ticker-updated', savedN);
          cpRecordAudit('set_news_ticker', '', null, payload);
          break;
        }
        case 'set_ads_ticker': {
          const savedA = adsTickerSave(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ شريط الإعلانات' });
          socket.emit('message', { cmd: 'tickers_data', data: { news: newsTickerSettings(), ads: savedA } });
          cpRecordAudit('set_ads_ticker', '', null, { enabled: !!(payload && payload.settings && payload.settings.enabled), count: Array.isArray(payload && payload.ads) ? payload.ads.length : null });
          break;
        }
        case 'get_badges_cp': {
          socket.emit('message', { cmd: 'badges_data', data: badgeConfigGet() });
          break;
        }
        case 'set_badges': {
          const savedB = badgeConfigSave(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ الأوسمة' });
          socket.emit('message', { cmd: 'badges_data', data: savedB });
          cpRecordAudit('set_badges', '', null, payload);
          break;
        }
        case 'get_login_behavior': {
          socket.emit('message', { cmd: 'login_behavior_data', data: loginBehaviorSettings() });
          break;
        }
        case 'set_login_behavior': {
          const savedL = loginBehaviorSave(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ سلوك الدخول' });
          socket.emit('message', { cmd: 'login_behavior_data', data: savedL });
          cpRecordAudit('set_login_behavior', '', null, payload);
          break;
        }

        case 'get_global_limits': {
          socket.emit('message', { cmd: 'global_limits_data', data: globalLimitsGet() });
          break;
        }
        case 'set_global_limits': {
          const savedGl = globalLimitsSet(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ حدود الرسائل' });
          socket.emit('message', { cmd: 'global_limits_data', data: savedGl });
          io.emit('global-limits', savedGl);
          cpRecordAudit('set_global_limits', '', null, savedGl);
          break;
        }

        // ── CP Group 8: Zajel management (in-memory lists) ─────────────────
        case 'zajel_cp_list': {
          socket.emit('message', { cmd: 'zajel_cp_data', data: { approved: zajelApproved.slice(0, 100), pending: zajelPending.slice(0, 200) } });
          break;
        }
        case 'zajel_cp_add': {
          const ztext = String(payload.message || payload.text || '').trim().substring(0, 150);
          if (!ztext) { socket.emit('error-msg', { msg: 'أدخل نص الرسالة' }); break; }
          const zApproved = { id: zajelIdSeq.approved++, message: ztext };
          zajelApproved.unshift(zApproved);
          if (zajelApproved.length > 100) zajelApproved.length = 100;
          io.emit('zajel:new', zApproved);
          socket.emit('savedone', { msg: 'تم نشر رسالة الزاجل' });
          socket.emit('message', { cmd: 'zajel_cp_data', data: { approved: zajelApproved.slice(0, 100), pending: zajelPending.slice(0, 200) } });
          cpRecordAudit('zajel_cp_add', '', null, ztext);
          break;
        }
        case 'zajel_cp_approve': {
          const zid1 = Number(payload.id);
          const zi = zajelPending.findIndex((p) => Number(p.id) === zid1);
          if (zi !== -1) {
            const zPending = zajelPending.splice(zi, 1)[0];
            const zAppr = { id: zajelIdSeq.approved++, message: zPending.message };
            zajelApproved.unshift(zAppr);
            if (zajelApproved.length > 100) zajelApproved.length = 100;
            io.emit('zajel:new', zAppr);
            io.emit('zajel:moderation-resolved', { id: zid1 });
            cpRecordAudit('zajel_cp_approve', String(zid1), null, zPending.message);
          }
          socket.emit('message', { cmd: 'zajel_cp_data', data: { approved: zajelApproved.slice(0, 100), pending: zajelPending.slice(0, 200) } });
          break;
        }
        case 'zajel_cp_del': {
          const zid2 = Number(payload.id);
          const zList = payload.list === 'pending' ? zajelPending : zajelApproved;
          const zi2 = zList.findIndex((mm) => Number(mm.id) === zid2);
          if (zi2 !== -1) zList.splice(zi2, 1);
          if (payload.list !== 'pending') io.emit('zajel:delete', { id: zid2 });
          socket.emit('message', { cmd: 'zajel_cp_data', data: { approved: zajelApproved.slice(0, 100), pending: zajelPending.slice(0, 200) } });
          cpRecordAudit('zajel_cp_del', (payload.list || 'approved') + ':' + zid2, null, null);
          break;
        }
        case 'zajel_cp_clear': {
          if (payload.list === 'pending') zajelPending.length = 0;
          else { zajelApproved.length = 0; io.emit('zajel:list', { messages: [] }); }
          socket.emit('savedone', { msg: 'تم المسح' });
          socket.emit('message', { cmd: 'zajel_cp_data', data: { approved: zajelApproved.slice(0, 100), pending: zajelPending.slice(0, 200) } });
          cpRecordAudit('zajel_cp_clear', String(payload.list || 'approved'), null, null);
          break;
        }

        // ── CP Group 9: Emoji item manager (per-item ops over doc.emo) ─────
        case 'emo_item_add': {
          const eshortcut = String(payload.shortcut || '').trim().substring(0, 12);
          const eurl = String(payload.url || '').trim().substring(0, 300);
          if (!eshortcut || !eurl) { socket.emit('error-msg', { msg: 'الاختصار والصورة مطلوبان' }); break; }
          const emoArr = (Array.isArray(cpSettingsDoc().emo) ? cpSettingsDoc().emo : []).filter((e) => e && String(e.shortcut || '') !== eshortcut);
          // Normalize legacy entries (missing type) so the picker can always
          // categorize items; new items default to smiley.
          const emoNorm = emoArr.map((e) => Object.assign({}, e, { type: e.type === 'sticker' ? 'sticker' : 'smiley' }));
          emoNorm.push({ shortcut: eshortcut, url: eurl, order: emoNorm.length + 1, type: String(payload.type || 'smiley') });
          cpSettingsSet({ emo: emoNorm });
          io.emit('smileys:updated', emoNorm);
          socket.emit('savedone', { msg: 'تمت إضافة الابتسامة' });
          socket.emit('message', { cmd: 'emos', data: emoNorm });
          cpRecordAudit('emo_item_add', eshortcut, null, eurl);
          break;
        }
        case 'emo_item_del': {
          const dshortcut = String(payload.shortcut || '');
          const emoArr2 = (Array.isArray(cpSettingsDoc().emo) ? cpSettingsDoc().emo : []).filter((e) => e && String(e.shortcut || '') !== dshortcut);
          cpSettingsSet({ emo: emoArr2 });
          io.emit('smileys:updated', emoArr2);
          socket.emit('savedone', { msg: 'تم حذف الابتسامة' });
          socket.emit('message', { cmd: 'emos', data: emoArr2 });
          cpRecordAudit('emo_item_del', dshortcut, null, null);
          break;
        }
        case 'assign_super_icon':
        case 'remove_super_icon':
        case 'assign_gift':
        case 'remove_gift': {
          const idKey = String(payload.userId || payload.topic || '');
          const doc = db.users.findOne({ id: idKey }) || db.users.findOne({ topic: idKey }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === idKey.toLowerCase());
          if (!doc) { socket.emit('error-msg', { msg: 'المستخدم غير موجود' }); break; }
          const isGiftCmd = a.cmd.indexOf('gift') !== -1;
          if (a.cmd === 'assign_super_icon') {
            const iconUrl = String(payload.iconUrl || '').substring(0, 300);
            if (!iconUrl) { socket.emit('error-msg', { msg: 'رابط الأيقونة مطلوب' }); break; }
            db.users.updateOne({ id: doc.id }, { $set: { superIcon: iconUrl } });
            emitUserAddonsUpdated({ ...doc, superIcon: iconUrl });
          } else if (a.cmd === 'remove_super_icon') {
            db.users.updateOne({ id: doc.id }, { $set: { superIcon: '' } });
            emitUserAddonsUpdated({ ...doc, superIcon: '' });
          } else if (a.cmd === 'assign_gift') {
            const giftUrl = String(payload.giftUrl || '').substring(0, 300);
            if (!giftUrl) { socket.emit('error-msg', { msg: 'رابط الهدية مطلوب' }); break; }
            const gifts = Array.isArray(doc.gifts) ? doc.gifts.slice() : [];
            if (gifts.indexOf(giftUrl) === -1) gifts.push(giftUrl);
            db.users.updateOne({ id: doc.id }, { $set: { gifts } });
            emitUserAddonsUpdated({ ...doc, gifts });
          } else {
            const giftUrl = String(payload.giftUrl || '');
            const gifts = Array.isArray(doc.gifts) ? doc.gifts.filter((g) => g !== giftUrl) : [];
            db.users.updateOne({ id: doc.id }, { $set: { gifts } });
            emitUserAddonsUpdated({ ...doc, gifts });
          }
          cpRecordAudit(a.cmd, doc.topic, null, isGiftCmd ? String(payload.giftUrl || '') : String(payload.iconUrl || ''));
          socket.emit('savedone', { msg: 'تم تحديث إضافات العضو' });
          break;
        }
        case 'get_story_bans': {
          socket.emit('message', { cmd: 'story_bans', data: [...storyBans] });
          break;
        }
        case 'set_story_ban': {
          const sid2 = String(payload.userId || '');
          if (sid2) {
            if (payload.banned) storyBans.add(sid2); else storyBans.delete(sid2);
            persistStoryBans();
            cpRecordAudit('set_story_ban', sid2, null, !!payload.banned);
          }
          socket.emit('savedone', { msg: payload.banned ? 'تم حظر القصص' : 'تم رفع حظر القصص' });
          socket.emit('message', { cmd: 'story_bans', data: [...storyBans] });
          break;
        }

        // ── CP Group 5: Broadcast / announcement ─────────────────────────
        case 'broadcast_msg': {
          const text = String(payload.msg || '').trim().substring(0, 500);
          if (!text) { socket.emit('error-msg', { msg: 'أدخل نص الإعلان' }); break; }
          io.emit('admin:broadcast', { msg: text });
          io.emit('alert:show', { text });
          cpRecordAudit('broadcast_msg', null, null, text.substring(0, 80));
          socket.emit('savedone', { msg: 'تم بث الإعلان للجميع' });
          break;
        }
        case 'reload_site':
        case 'clear_room_chat_legacy':
        default: {
          if (a.cmd === 'reload_site') { cpRecordAudit('reload_site', null); socket.emit('savedone', { msg: 'تم إعادة التشغيل' }); cpReloadSite(); break; }
          socket.emit('error-msg', { msg: 'أمر غير معروف: ' + String(a.cmd) });
          break;
        }
      }
      return;
    }
  });

  socket.on('getstate', () => {
    if (socket.isAdmin) {
      const siteweb = cpSettingsDoc().siteweb || {};
      const s = cpSettingsDoc();
      socket.emit('getstate', { siteweb, dro3: s.dro3 || [], emos: s.emo || [], sicos: s.sico || [], powers: cpPowers(), noletters: db.noletters ? db.noletters.getAll() : [], zaker: db.zakrfa ? db.zakrfa.getAll() : [], users_data: (db.users.find({}) || []).map((u) => ({ topic: u.topic, username: u.username, power: u.power || 'user', ip: u.ip || '', fp: u.fp || '', fp2: u.fp2 || '', deviceInfo: u.deviceInfo || '', rep: u.rep || 0, likes: u.likes || 0, verified: !!u.verified, coins: u.coins || 0, wallPoints: u.wallPoints || 0, id: u.id })), rlist: (db.rooms.getAll() || []).map(roomToClient), bandList: db.bands ? db.bands.getAll() : [], blockList: [], shrtlist: cpShortcuts(), msgslist: cpMsgs(), subslist: cpSubs() });
    }
  });

  // ── Admin member actions: kick / ban (from profile context menu) ────────
  const findOnlineByUsername = (name) => {
    if (!name) return null;
    const uname = String(name);
    let hit = null;
    onlineSockets.forEach((t) => { if (t.username === uname) hit = t; });
    return hit;
  };
  const socketIdForUser = (u) => { let sid = null; onlineSockets.forEach((v, k) => { if (v === u) sid = k; }); return sid; };
  const socketIdForTarget = (u) => socketIdForUser(u);
  const isGlobalAdminMe = () => { const me = findSocketUser(socket.id); return me ? permissionsFor(me).isAdmin : false; };

  socket.on('kick-user', (data) => {
    if (!isGlobalAdminMe()) return;
    const target = findOnlineByUsername(data && data.targetUsername);
    if (!target) return;
    const tSocket = socketIdForUser(target);
    if (tSocket) io.to(tSocket).emit('kicked', { reason: 'تم طردك من الشات بواسطة الإدارة' });
    io.emit('system-message', { message: 'تم طرد العضو ' + target.username + ' من الشات', content: 'تم طرد العضو ' + target.username + ' من الشات', title: 'طرد' });
  });

  socket.on('room-kick-user', (data) => {
    if (!isGlobalAdminMe()) return;
    const target = findOnlineByUsername(data && data.targetUsername);
    if (!target) return;
    const roomId = data && data.roomId !== undefined ? data.roomId : GENERAL_ROOM_ID;
    const previousRoom = target.roomid;
    target.roomid = null;
    broadcastPresence();
    const tSocket = socketIdForUser(target);
    if (tSocket) io.to(tSocket).emit('kicked', { reason: 'تم طردك من الغرفة' });
    if (previousRoom != null) broadcastJoinLeave(target, 'leave', previousRoom);
  });

  socket.on('ban-user', (data) => {
    if (!isGlobalAdminMe()) return;
    const name = (data && (data.username || data.targetUsername)) || '';
    const target = findOnlineByUsername(name);
    const reason = (data && data.reason) || 'مخالفة القوانين';
    if (target) {
      const tSocket = socketIdForUser(target);
      const isPermanent = (data && data.type) !== 'temporary';
      if (tSocket) io.to(tSocket).emit('banned', { reason, expiresAt: isPermanent ? null : new Date(Date.now() + 6 * 3600 * 1000).toISOString() });
      try { db.bands.create({ device_band: target.fp || '', device_band2: target.fp2 || '', ip_band: target.ip || '', date: new Date().toISOString(), name_band: reason }); } catch (e) {}
      io.emit('system-message', { message: 'تم حظر العضو ' + name + ' (' + reason + ')', content: 'تم حظر العضو ' + name + ' (' + reason + ')', title: 'حظر' });
    }
  });

  socket.on('room-ban-user', (data) => {
    if (!isGlobalAdminMe()) return;
    const target = findOnlineByUsername(data && data.targetUsername);
    const roomId = (data && data.roomId !== undefined ? data.roomId : GENERAL_ROOM_ID);
    if (!target) return;
    const previousRoom = target.roomid;
    const banId = nextId('rb_');
    const list = roomBans.get(String(roomId)) || [];
    list.push({ id: banId, userId: target.uid || target.guestId, username: target.username, reason: data && data.reason || 'مخالفة القوانين', until: null });
    roomBans.set(String(roomId), list);
    target.roomid = null;
    broadcastPresence();
    const tSocket = socketIdForTarget(target);
    if (tSocket) io.to(tSocket).emit('kicked', { reason: 'تم حظرك من الغرفة' });
    if (previousRoom) broadcastJoinLeave(target, 'leave', previousRoom);
    io.emit('room-bans-list', list);
  });

  // ── Voice mesh (mic raise/lower + WebRTC signaling) ─────────────────────
  const vuser = () => findSocketUser(socket.id);
  const vroom = () => (vuser() && vuser().roomid) || GENERAL_ROOM_ID;

  socket.emit('voice:config', { iceServers: config.buildIceServers(), maxSpeakers: config.maxVoiceSpeakers });

  socket.on('voice:state', (data) => {
    const rid = (data && data.roomId !== undefined) ? data.roomId : vroom();
    socket.emit('voice:state', { roomId: Number(rid), mics: roomMicState(rid) });
  });

  socket.on('voice:active-users', () => socket.emit('voice:active-users', { roomId: vroom(), speakers: Object.values(roomMicState(vroom())), max: config.maxVoiceSpeakers }));

  socket.on('voice:take-mic', (data, ack) => {
    const u = vuser();
    if (!u) { if (ack) ack({ ok: false, reason: 'unauthenticated' }); return; }
    const gate = likeGate(u, 'mic');
    if (!gate.ok) { if (ack) ack({ ok: false, reason: likeGateMessage('mic', gate) }); return; }
    const roomId = (data && data.roomId !== undefined) ? data.roomId : vroom();
    const micIndex = data && data.micIndex;
    if (micIndex === undefined || micIndex === null) { if (ack) ack({ ok: false, reason: 'bad-index' }); return; }
    const key = String(roomId);
    const mics = roomMicState(roomId);
    // Free previous slot under same socket
    const prev = voiceUsers.get(socket.id);
    if (prev) freeMicFor(prev.roomId, prev.micIndex);
    const existing = mics[micIndex];
    if (existing && existing.socketId !== socket.id) { if (ack) ack({ ok: false, reason: 'mic-busy' }); return; }
    if (!voiceMics.has(key)) voiceMics.set(key, {});
    const session = 'vs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    voiceMics.get(key)[micIndex] = { socketId: socket.id, voiceSessionId: session, username: u.username, userId: u.uid || u.guestId, isMutedSelf: false };
    voiceUsers.set(socket.id, { roomId: key, micIndex, voiceSessionId: session });
    broadcastRoomState(roomId);
    if (ack) ack({ ok: true, voiceSessionId: session });
  });

  socket.on('voice:move-mic', (data, ack) => {
    const u = vuser();
    if (!u) { if (ack) ack({ ok: false, reason: 'unauthenticated' }); return; }
    const roomId = (data && data.roomId !== undefined) ? data.roomId : vroom();
    const toMicIndex = data && data.toMicIndex;
    if (toMicIndex === undefined) { if (ack) ack({ ok: false, reason: 'bad-index' }); return; }
    const prev = voiceUsers.get(socket.id);
    if (!prev) { if (ack) ack({ ok: false, reason: 'not-on-mic' }); return; }
    const mics = voiceMics.get(String(roomId));
    if (mics && mics[toMicIndex] && mics[toMicIndex].socketId !== socket.id) { if (ack) ack({ ok: false, reason: 'mic-busy' }); return; }
    const session = prev.voiceSessionId;
    if (mics) { delete mics[prev.micIndex]; mics[toMicIndex] = { socketId: socket.id, voiceSessionId: session, username: u.username, userId: u.uid || u.guestId, isMutedSelf: false }; }
    voiceUsers.set(socket.id, { roomId: String(roomId), micIndex: toMicIndex, voiceSessionId: session });
    broadcastRoomState(roomId);
    if (ack) ack({ ok: true, voiceSessionId: session });
  });

  socket.on('voice:leave-mic', (data) => {
    const roomId = (data && data.roomId !== undefined) ? data.roomId : vroom();
    const micIndex = data && data.micIndex;
    freeMicFor(roomId, micIndex);
  });

  socket.on('voice:toggle-mute-self', (data) => {
    const micIndex = data && data.micIndex;
    const mics = roomMicState(data && data.roomId !== undefined ? data.roomId : vroom());
    if (mics[micIndex] && mics[micIndex].socketId === socket.id) { mics[micIndex].isMutedSelf = !!(data && data.isMuted); broadcastRoomState(data && data.roomId !== undefined ? data.roomId : vroom()); }
  });

  socket.on('voice:signal', (data) => {
    const u = vuser();
    if (!u || !data || !data.targetSocketId) return;
    const target = io.sockets.sockets.get(String(data.targetSocketId)) || null;
    const payload = { senderSocketId: socket.id, signalData: data.signalData, voiceSessionId: data.voiceSessionId };
    if (target) target.emit('voice:signal', payload);
  });

  socket.on('voice:kick-from-mic', (data) => {
    const me = vuser();
    if (!me || !permissionsFor(me).isAdmin) return;
    const micIndex = data && data.micIndex;
    const rid = (data && data.roomId !== undefined) ? data.roomId : vroom();
    const entry = roomMicState(rid)[micIndex];
    const targetSock = entry ? io.sockets.sockets.get(String(entry.socketId)) : null;
    if (targetSock) targetSock.emit('voice:cleanup');
    freeMicFor(rid, micIndex);
  });

  socket.on('voice:pull-from-mic', (data, ack) => {
    const me = vuser();
    const micIndex = data && data.micIndex;
    const rid = (data && data.roomId !== undefined) ? data.roomId : vroom();
    const entry = roomMicState(rid)[micIndex];
    if (entry && entry.socketId === socket.id) { if (ack) ack({ ok: false, reason: 'can\'t pull headset' }); return; }
    if (me && !permissionsFor(me).isAdmin) { if (ack) ack({ ok: false, reason: 'no-permission' }); return; }
    const target = entry ? io.sockets.sockets.get(String(entry.socketId)) : null;
    if (target) target.emit('voice:cleanup');
    freeMicFor(rid, micIndex);
    if (ack) ack({ ok: true });
  });

  // ── Like / rep / animations ─────────────────────────────────────────────
  socket.on('send-private-notification', (data, ack) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const who = u.uid || u.guestId || u.userId || u.username || socket.id;
    const rl = rateLimit(socket.id + ':' + who, { max: 30, windowMs: 60000 }, 'private-notif');
    if (rl.blocked) { if (ack) ack({ success: false }); return; }
    const name = (data && (data.targetUsername || data.name)) || '';
    let targetUser = null;
    onlineSockets.forEach((t) => { if (t.username === name) targetUser = t; });
    if (!targetUser) { if (ack) ack({ success: false }); return; }
    if (targetUser.allowPrivate === false && !permissionsFor(u).isAdmin && String(targetUser.username).toLowerCase() !== String(u.username).toLowerCase()) {
      if (ack) ack({ success: false });
      return;
    }
    const rawText = String((data && data.text) || '').replace(/[\u0000-\u001f\u007f]/g, '');
    const text = filterNoLetters(rawText, 'bmsgs').trim().substring(0, 300);
    if (!text) { if (ack) ack({ success: false }); return; }
    let tid = null;
    onlineSockets.forEach((t, sid) => { if (t === targetUser) tid = sid; });
    if (tid) io.to(tid).emit('private-notification', {
      id: 'man-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      sender: u.username,
      senderNickname: u.username,
      senderId: u.uid || u.guestId || u.userId,
      senderAvatar: u.pic && u.pic !== 'pic.png' ? u.pic : null,
      senderUcol: u.ucol || null,
      senderSuperIcon: u.superIcon || '',
      senderGifts: Array.isArray(u.gifts) ? u.gifts : [],
      text,
      type: (data && data.type) || 'info',
      createdAt: new Date().toISOString(),
    });
    if (ack) ack({ success: true });
  });

  socket.on('send:public-notification', (data, ack) => {
    const u = findSocketUser(socket.id);
    if (!u || !permissionsFor(u).isAdmin) return;
    const text = String((data && data.text) || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().substring(0, 300);
    if (!text) return;
    io.emit('notification', { text, type: 'info' });
    if (ack) ack({ success: true });
  });

  socket.on('like-user', (data, ack) => {
    try {
      const u = findSocketUser(socket.id);
      if (!u) { if (ack) ack({ ok: false, why: 'no-user' }); return; }
      const who = u.uid || u.guestId || u.userId || u.username;
      const rl = rateLimit(socket.id + ':' + who, { max: 20, windowMs: 60000 }, 'like');
      if (rl.blocked) { if (ack) ack({ ok: false, why: 'rate-limited' }); return; }
      const name = (data && (data.targetUsername || data.name)) || '';
      let targetUser = null;
      onlineSockets.forEach((t) => { if (t.username === name) targetUser = t; });
      let targetSocketId = null;
      onlineSockets.forEach((t, sid) => { if (t === targetUser) targetSocketId = sid; });
      if (!targetUser) { if (ack) ack({ ok: false, why: 'no-target', name }); return; }
      if (targetUser === u || (targetUser.uid && u.uid && String(targetUser.uid) === String(u.uid))) {
        if (ack) ack({ ok: false, why: 'self' });
        return;
      }
      // A user may like a given target at most once (no unbounded inflation).
      const tkey = String(who) + '::like::' + String(targetUser.uid || targetUser.guestId || targetUser.username);
      if (likeGiven.has(tkey)) { if (ack) ack({ ok: false, why: 'already' }); return; }
      likeGiven.add(tkey);
      const sender = publicUser(u);
      targetUser.likes = (targetUser.likes || 0) + 1;
      io.emit('likes-updated', { id: targetUser.uid || targetUser.guestId, userId: targetUser.uid || targetUser.guestId, username: targetUser.username, likes: targetUser.likes, sender, from: u.username });
      if (targetSocketId) {
        io.to(targetSocketId).emit('new-notification', { id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: 'like', fromUser: { username: u.username, id: u.uid || u.guestId, pic: u.pic || 'pic.png' }, message: 'أعطاك إعجاباً', createdAt: new Date().toISOString(), read: false });
        io.to(targetSocketId).emit('session-notification', {
          id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: 'like',
          createdAt: new Date(),
          message: 'أعطاك إعجاباً',
          senderUsername: u.username,
          senderAvatar: u.pic && u.pic !== 'pic.png' ? u.pic : null,
          senderDisplayName: u.username,
          senderBanner: null, senderDecoration: null, senderUcol: u.ucol || null,
        });
      }
      if (targetUser.type === 'member' && targetUser.uid) {
        db.users.updateOne({ id: targetUser.uid }, { $set: { likes: targetUser.likes } });
      }
      socket.emit('like-success', { targetUsername: targetUser.username, likes: targetUser.likes });
      if (ack) ack({ ok: true, likes: targetUser.likes, sid: targetSocketId });
    } catch (e) {
      if (ack) ack({ ok: false, why: 'err:' + e.message });
    }
  });

  socket.on('rep-user', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const who = u.uid || u.guestId || u.userId || u.username;
    const rl = rateLimit(socket.id + ':' + who, { max: 20, windowMs: 60000 }, 'rep');
    if (rl.blocked) return;
    const name = (data && (data.targetUsername || data.name)) || '';
    let targetUser = null;
    onlineSockets.forEach((t) => { if (t.username === name) targetUser = t; });
    let targetSocketId = null;
    onlineSockets.forEach((t, sid) => { if (t === targetUser) targetSocketId = sid; });
    if (!targetUser) return;
    if (targetUser === u) return;
    const tkey = String(who) + '::rep::' + String(targetUser.uid || targetUser.guestId || targetUser.username);
    if (repGiven.has(tkey)) return;
    repGiven.add(tkey);
    const amount = Math.min(Math.max(parseInt((data && data.amount) || 1, 10) || 1, 1), 5);
    targetUser.rep = (targetUser.rep || 0) + amount;
    io.emit('rep-updated', { rep: targetUser.rep, userId: targetUser.uid || targetUser.guestId, id: targetUser.uid || targetUser.guestId, targetUsername: targetUser.username, sender: publicUser(u), from: u.username });
    if (targetSocketId) {
      io.to(targetSocketId).emit('new-notification', { id: 'rn-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: 'rep', fromUser: { username: u.username, id: u.uid || u.guestId, pic: u.pic || 'pic.png' }, message: 'أعطاك ' + targetUser.rep + ' نقاط تقييم', createdAt: new Date().toISOString(), read: false });
      io.to(targetSocketId).emit('session-notification', {
        id: 'rn-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: 'rep',
        createdAt: new Date(),
        message: 'أعطاك ' + targetUser.rep + ' نقاط تقييم',
        senderUsername: u.username,
        senderAvatar: u.pic && u.pic !== 'pic.png' ? u.pic : null,
        senderDisplayName: u.username,
        senderBanner: null, senderDecoration: null, senderUcol: u.ucol || null,
      });
    }
    if (targetUser.type === 'member' && targetUser.uid) {
      db.users.updateOne({ id: targetUser.uid }, { $set: { rep: targetUser.rep } });
    }
    socket.emit('rep-success', { targetUsername: targetUser.username, rep: targetUser.rep });
  });

  const animEvents = {
    'kiss': { out: 'kiss-received', toast: 'kiss-sent', file: '/uploads/system/kiss.webp', action: 'بوسة', sound: '/sounds/kiss.mp3' },
    'hug': { out: 'hug-received', toast: null, file: '/uploads/system/hug.webp', action: 'عناق', sound: '/sounds/hug.mp3' },
    'slap': { out: 'slap-received', toast: null, file: '/uploads/system/slap.webp', action: 'صفعة', sound: '/sounds/slap.mp3' },
    'clap': { out: 'clap-received', toast: null, file: '/uploads/system/clap.webp', action: 'تصفيق', sound: '/sounds/clap.mp3' },
  };
  Object.keys(animEvents).forEach((ev) => {
    socket.on(ev, (data) => {
      const u = findSocketUser(socket.id);
      if (!u) return;
      const spec = animEvents[ev];
      const sender = publicUser(u);
      io.emit(spec.out, { sender, from: u.username, type: ev });
      if (spec.toast) socket.emit(spec.toast, { targetUsername: (data && data.targetUsername) || '' });
    });
  });

  socket.on('delete-message', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    const hist = roomHistory.get(String(roomId)) || [];
    const msgId = (data && data.messageId) || (data && data.id);
    const idx = hist.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    const authorId = hist[idx].userId;
    const isAuthor = String(authorId) === String(u.uid || u.guestId);
    if (!isAuthor && !permissionsFor(u).isAdmin) return;
    hist.splice(idx, 1);
    io.to('room:' + roomId).emit('delete-message', { messageId: msgId, id: msgId, userId: authorId });
  });

  socket.on('clear-room-chat', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    const room = findRoomByAnyId(roomId);
    const isOwner = u && room && (String(room.ownerId) === String(u.uid || u.guestId) || (room.owner && String(room.owner) === String(u.username)));
    if (!u || !(isOwner || permissionsFor(u).isAdmin)) return;
    roomHistory.set(String(roomId), []);
    io.emit('room-chat-cleared', { roomId });
  });

  // ── Wall posts via socket ───────────────────────────────────────────────
  socket.on('wallpost', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || (!data.text && !data.msg && !data.mediaUrl)) return;
    const who = u.uid || u.guestId || u.userId || u.username || socket.id;
    const rl = rateLimit(socket.id + ':' + who, { max: 8, windowMs: 60000 }, 'wallpost');
    if (rl.blocked) { socket.emit('error-msg', { msg: 'منشورات كثيرة جداً، توقف قليلاً' }); return; }
    const rawMsg = String(data.text || data.msg || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    const msg = filterNoLetters(rawMsg, 'bmsgs').trim().substring(0, 4000);
    if (!msg && !data.mediaUrl) return;
    const post = {
      id: nextId('post_'), userId: u.uid || u.guestId, user: { ...publicUser(u) }, guestInfo: null,
      msg, mediaUrl: sanitizeMediaUrl(data.mediaUrl), mediaType: safeMediaType(data.mediaType || (data.mediaUrl ? 'image' : null)),
      wallLikes: [], comments: [], createdAt: new Date().toISOString(),
    };
    wallPosts.unshift(post);
    if (wallPosts.length > 500) wallPosts.length = 500;
    persistWall();
    io.emit('wall-update', { type: 'new-post', post: toClientPost(post) });
  });

  // ── Private messaging ───────────────────────────────────────────────────
  socket.on('private_message', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const who = u.uid || u.guestId || u.userId || u.username || socket.id;
    const rl = rateLimit(socket.id + ':' + who, { max: 20, windowMs: 60000 }, 'private_message');
    if (rl.blocked) { socket.emit('error-msg', { msg: 'رسائل خاصة كثيرة جداً، توقف قليلاً' }); return; }
    const targetName = String(data.targetUsername).replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '').trim().slice(0, 50);
    if (!targetName) return;
    const gate = likeGate(u, 'private');
    if (!gate.ok) { socket.emit('error-msg', { msg: likeGateMessage('private', gate) }); return; }
    const target = findUserByUsername(targetName);
    if (target && target.allowPrivate === false && !permissionsFor(u).isAdmin && String(target.username).toLowerCase() !== String(u.username).toLowerCase()) {
      socket.emit('error-msg', { msg: 'هذا العضو لا يقبل الرسائل الخاصة' });
      return;
    }
    const msg = data.message || {};
    const rawText = String(typeof msg.text === 'string' ? msg.text : '');
    const filtered = filterNoLetters(rawText, 'bmsgs').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    const hasFile = typeof msg.fileUrl === 'string' && msg.fileUrl.trim().length > 0;
    if (!filtered && !hasFile) return;
    const stored = {
      id: msg.id || nextId('pm_'),
      from: u.username,
      to: targetName,
      text: filtered.substring(0, 300),
      type: msg.type || 'text',
      fileUrl: sanitizeMediaUrl(msg.fileUrl),
      replyTo: (msg.replyTo && typeof msg.replyTo === 'object') ? {
        id: String(msg.replyTo.id || msg.replyTo.userId || '').slice(0, 60),
        userId: String(msg.replyTo.id || msg.replyTo.userId || '').slice(0, 60),
        username: sanitizeUsername(String(msg.replyTo.username || ''), 30),
        text: String(msg.replyTo.text || '').substring(0, 300),
        fileUrl: sanitizeMediaUrl(msg.replyTo.fileUrl),
        mediaUrl: sanitizeMediaUrl(msg.replyTo.mediaUrl),
        mediaType: safeMediaType(msg.replyTo.mediaType),
      } : null,
      timestamp: new Date().toISOString(),
      status: 'sent',
    };
    const thread = getPrivateThread(u.username, targetName);
    thread.push(stored);
    if (thread.length > 200) thread.splice(0, thread.length - 200);
    const out = { id: stored.id, text: stored.text, type: stored.type, fileUrl: stored.fileUrl, replyTo: stored.replyTo, timestamp: stored.timestamp, status: stored.status };
    let targetSocket = null;
    onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
    if (targetSocket) {
      io.to(targetSocket).emit('private_message', { fromUser: publicUser(u), message: out });
    }
    socket.emit('private_message_sent', { toUsername: targetName, message: out, targetUser: target ? publicUser(target) : { username: targetName, topic: targetName, type: 'user', id: targetName, userId: targetName } });
  });

  socket.on('private_typing', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const target = findUserByUsername(data.targetUsername);
    if (target) {
      let targetSocket = null;
      onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
      if (targetSocket) io.to(targetSocket).emit('private_typing', { byUsername: u.username });
    }
  });

  socket.on('private_ping', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const target = findUserByUsername(data.targetUsername);
    if (target) {
      let targetSocket = null;
      onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
      if (targetSocket) io.to(targetSocket).emit('private_ping_received', { fromUser: publicUser(u) });
    }
  });

  socket.on('private_message_read', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const target = findUserByUsername(data.targetUsername);
    const ids = (data.messageIds || []).map(String);
    const thread = getPrivateThread(u.username, data.targetUsername);
    thread.forEach((m) => { if (ids.indexOf(String(m.id)) !== -1) m.status = 'read'; });
    if (target) {
      let targetSocket = null;
      onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
      if (targetSocket) io.to(targetSocket).emit('private_message_read', { byUsername: u.username, messageIds: ids });
    }
  });

  socket.on('private_message_edit', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const target = findUserByUsername(data.targetUsername);
    const thread = getPrivateThread(u.username, data.targetUsername);
    const msg = thread.find((m) => String(m.id) === String(data.messageId) && String(m.from).toLowerCase() === String(u.username).toLowerCase());
    if (!msg) return;
    msg.text = String(data.newText || '').substring(0, 300);
    if (target) {
      let targetSocket = null;
      onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
      if (targetSocket) io.to(targetSocket).emit('private_message_edited', { byUsername: u.username, messageId: msg.id, newText: msg.text });
    }
  });

  socket.on('private_message_delete', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const target = findUserByUsername(data.targetUsername);
    const thread = getPrivateThread(u.username, data.targetUsername);
    const idx = thread.findIndex((m) => String(m.id) === String(data.messageId) && String(m.from).toLowerCase() === String(u.username).toLowerCase());
    if (idx !== -1) thread.splice(idx, 1);
    if (target) {
      let targetSocket = null;
      onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
      if (targetSocket) io.to(targetSocket).emit('private_message_deleted', { byUsername: u.username, messageId: data.messageId });
    }
  });

  socket.on('disconnect', () => {
    freeAllMicsForSocket(socket.id);
    socketSession.delete(socket.id);
    const u = findSocketUser(socket.id);
    if (u) {
      const leaveRoom = u.roomid;
      onlineSockets.delete(socket.id);
      // Guests are transient: drop their registry entry once their socket is gone
      // (unless another socket still uses the same guest identity).
      if (u.guest) purgeGuestRegistryForUser(u);
      io.emit('user-left', { name: u.username });
      broadcastPresence();
      broadcastJoinLeave(u, 'leave', leaveRoom);
      // Close any private calls this user was part of: their peer must never be
      // stuck on a ringing/active screen just because this socket vanished.
      const goneId = u.uid || u.guestId || u.userId;
      if (goneId) {
        let stillOnline = false;
        onlineSockets.forEach((o) => { if (o && String(o.uid || o.guestId || o.userId) === String(goneId)) stillOnline = true; });
        if (!stillOnline) {
          const deadCalls = [];
          privateCalls.forEach((c, callId) => {
            if (String(c.callerId) === String(goneId) || String(c.calleeId) === String(goneId)) deadCalls.push(callId);
          });
          deadCalls.forEach((callId) => {
            const peerSid = pmcallPeer(callId, goneId);
            if (peerSid) io.to(peerSid).emit('pmcall:hangup', { callId, reason: 'disconnected' });
            privateCalls.delete(callId);
          });
        }
      }
    }
  });

  // ── Quick chat (الدردشة السريعة) ────────────────────────────────────────
  socket.on('quick-chat:request-history', (cb) => {
    const list = [...quickChatMsgs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
    socket.emit('quick-chat:history', list);
    if (typeof cb === 'function') cb(list);
  });
  socket.on('quick-chat:get history', () => {
    socket.emit('quick-chat:history', [...quickChatMsgs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100));
  });
  socket.on('quickchat', () => {
    socket.emit('quick-chat:history', [...quickChatMsgs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100));
  });
  socket.on('getquickchat', () => {
    socket.emit('quick-chat:history', [...quickChatMsgs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100));
  });
  socket.on('quick-chat:send', (data, ack) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || (!data.text && !data.mediaUrl)) {
      if (typeof ack === 'function') ack({ success: false, error: 'رسالة فارغة' });
      return;
    }
    const who = u.uid || u.guestId || u.userId || u.username || socket.id;
    const rl = rateLimit(socket.id + ':' + who, { max: 30, windowMs: 60000 }, 'quick-chat');
    if (rl.blocked) {
      if (typeof ack === 'function') ack({ success: false, error: 'رسائلك كثيرة جداً، توقف قليلاً' });
      return;
    }
    const rawText = String(data.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    const text = filterNoLetters(rawText, 'bmsgs').trim().substring(0, 500);
    if (!text && !data.mediaUrl) {
      if (typeof ack === 'function') ack({ success: false, error: 'رسالة فارغة' });
      return;
    }
    const msg = {
      id: nextId('qc_'),
      sender: publicUser(u),
      text,
      mediaUrl: sanitizeMediaUrl(data.mediaUrl),
      mediaType: safeMediaType(data.mediaType || (data.mediaUrl ? 'image' : null)),
      createdAt: new Date().toISOString(),
    };
    quickChatMsgs.unshift(msg);
    if (quickChatMsgs.length > 200) quickChatMsgs.length = 200;
    io.emit('quick-chat:new', msg);
    if (typeof ack === 'function') ack({ success: true });
  });
  socket.on('quick-chat:delete', (data) => {
    const u = findSocketUser(socket.id);
    const id = data && (data.id || data.messageId);
    const i = quickChatMsgs.findIndex((m) => String(m.id) === String(id));
    if (i === -1) return;
    const isOwner = u && quickChatMsgs[i].sender && String(quickChatMsgs[i].sender.userId) === String(u.uid || u.guestId);
    const isAdmin = u && (u.rank === 'admin' || u.isAdmin);
    if (!isOwner && !isAdmin) return;
    quickChatMsgs.splice(i, 1);
    io.emit('quick-chat:deleted', { id });
  });

  // ── Zajel (الزاجل) ───────────────────────────────────────────────────────
  function sendZajelApproved() {
    io.emit('zajel:list', { messages: zajelApproved.slice(0, 50) });
  }
  socket.on('zajel:get-approved', () => {
    socket.emit('zajel:list', { messages: zajelApproved.slice(0, 50) });
  });
  socket.on('zajel:moderation:get-pending', () => {
    socket.emit('zajel:moderation:pending-list', zajelPending.slice(0, 100));
  });
  socket.on('zajel:send', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const rl = rateLimit(socket.id + ':zajel', { max: 20, windowMs: 60000 }, 'zajel');
    if (rl.blocked) return;
    const text = String((data && (data.message || data.msg)) || '').substring(0, 150);
    if (!text) return;
    const pending = { id: zajelIdSeq.pending++, username: u.username, message: text, createdAt: new Date().toISOString() };
    zajelPending.push(pending);
    if (zajelPending.length > 200) zajelPending.length = 200;
    // Broadcast a moderation request to any admin/mod online.
    io.emit('zajel:moderation-request', pending);
    // For simplicity, auto-approve (common chat behavior) unless moderation is strict:
    const approved = { id: zajelIdSeq.approved++, message: text };
    zajelApproved.unshift(approved);
    if (zajelApproved.length > 100) zajelApproved.length = 100;
    io.emit('zajel:new', approved);
  });
  socket.on('zajel:moderate', (data, ack) => {
    const u = findSocketUser(socket.id);
    if (!u || !permissionsFor(u).isAdmin) return;
    const id = data && Number(data.id);
    const action = data && data.action;
    const i = zajelPending.findIndex((p) => Number(p.id) === Number(id));
    if (i === -1) {
      if (typeof ack === 'function') ack({ success: false, message: 'الرسالة غير موجودة' });
      return;
    }
    const pending = zajelPending[i];
    zajelPending.splice(i, 1);
    if (action === 'approve') {
      const approved = { id: zajelIdSeq.approved++, message: pending.message };
      zajelApproved.unshift(approved);
      if (zajelApproved.length > 100) zajelApproved.length = 100;
      io.emit('zajel:new', approved);
    }
    io.emit('zajel:moderation-resolved', { id });
    if (typeof ack === 'function') ack({ success: true });
  });
  socket.on('zajel:delete', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !permissionsFor(u).isAdmin) return;
    const id = data && (data.id !== undefined ? Number(data.id) : undefined);
    const i = zajelApproved.findIndex((m) => Number(m.id) === Number(id));
    if (i !== -1) { zajelApproved.splice(i, 1); }
    io.emit('zajel:delete', { id });
  });

  // ── Room moderation / user management (missing live-client events) ────────
  socket.on('get-room-bans', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    socket.emit('room-bans-list', roomBans.get(String(roomId)) || []);
  });
  socket.on('room-unban-user', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const list = roomBans.get(String(roomId)) || [];
    const i = list.findIndex((b) => String(b.id) === String(data && data.banId));
    if (i !== -1) list.splice(i, 1);
    io.to('room:' + roomId).emit('room-bans-list', list);
  });
  socket.on('toggle-room-moderator', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const targetUserId = String((data && data.targetUserId) || '');
    if (!targetUserId) return;
    let target = null;
    onlineSockets.forEach((t) => { if (String(t.uid || t.guestId || t.userId) === targetUserId) target = t; });
    let mods = roomModerators.get(String(roomId)) || new Map();
    if (mods.has(targetUserId)) {
      mods.delete(targetUserId);
    } else {
      mods.set(targetUserId, { userId: targetUserId, username: (target && target.username) || targetUserId, permissions: [] });
    }
    roomModerators.set(String(roomId), mods);
    socketModeratorSync(roomId);
    emitRoomUpdated(roomId);
  });
  socket.on('update-room-moderator-permissions', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const targetUserId = String((data && data.targetUserId) || '');
    const mods = roomModerators.get(String(roomId));
    if (!mods || !mods.has(targetUserId)) return;
    const perms = Array.isArray(data.permissions) ? data.permissions.map(String).slice(0, 40) : [];
    mods.get(targetUserId).permissions = perms;
    socketModeratorSync(roomId);
    emitRoomUpdated(roomId);
  });
  socket.on('toggle-mic-lock', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const micIndex = Number((data && data.micIndex));
    if (isNaN(micIndex)) return;
    const locks = roomMicLocks.get(String(roomId)) || new Map();
    if (locks.has(micIndex)) locks.delete(micIndex);
    else locks.set(micIndex, u.username);
    roomMicLocks.set(String(roomId), locks);
    socketModeratorSync(roomId);
    emitRoomUpdated(roomId);
  });
  socket.on('room-mute-user', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const name = String((data && data.targetUsername) || '').toLowerCase();
    if (!name) return;
    const rm = roomMutes.get(String(roomId)) || new Map();
    rm.set(String(name), { until: null });
    roomMutes.set(String(roomId), rm);
    const t = findUserByUsername(name);
    if (t) { t.isMutedRoom = true; broadcastPresence(); }
    const sid = socketIdForUsername(name);
    if (sid) io.to(sid).emit('new-notification', { id: nextId('n_'), type: 'info', message: 'قام المشرف بكتمك في هذه الغرفة', createdAt: new Date().toISOString(), read: false });
    io.to('room:' + roomId).emit('user_updated', { username: (data && data.targetUsername), isMutedRoom: true });
  });
  socket.on('room-unmute-user', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const name = String((data && data.targetUsername) || '').toLowerCase();
    const m = roomMutes.get(String(roomId));
    if (m) m.delete(name);
    const t = findUserByUsername(name);
    if (t) { t.isMutedRoom = false; broadcastPresence(); }
    io.to('room:' + roomId).emit('user_updated', { username: (data && data.targetUsername), isMutedRoom: false });
  });
  socket.on('mute-user', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const name = String((data && data.targetUsername) || '');
    globalMutes.set(name.toLowerCase(), { until: null });
    const t = findUserByUsername(name);
    if (t) { t.isGloballyMuted = true; broadcastPresence(); }
    io.emit('system-message', { message: 'تم كتم العضو ' + name + ' من الشات', content: 'تم كتم العضو ' + name + ' من الشات', title: 'كتم' });
  });
  socket.on('unmute-user', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const name = String((data && data.targetUsername) || '');
    globalMutes.delete(name.toLowerCase());
    const t = findUserByUsername(name);
    if (t) { t.isGloballyMuted = false; broadcastPresence(); }
    io.emit('system-message', { message: 'تم إلغاء كتم العضو ' + name, content: 'تم إلغاء كتم العضو ' + name, title: 'إلغاء كتم' });
  });
  socket.on('move-user-to-room', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const target = findOnlineByUsername(data && data.targetUsername);
    if (!target) return;
    const room = findRoomByAnyId(data && data.roomId);
    if (!room) return;
    if (room.password && String(room.password) !== String(data && data.password)) {
      socket.emit('error-msg', { msg: 'كلمة مرور الغرفة غير صحيحة' });
      return;
    }
    const prevRoom = target.roomid;
    target.roomid = String(room.id);
    broadcastPresence();
    const tSocket = socketIdForUser(target);
    if (tSocket) {
      io.to(tSocket).emit('force-change-room', { roomId: Number(room.id) });
      if (prevRoom !== undefined && prevRoom !== null) broadcastJoinLeave(target, 'leave', prevRoom);
      broadcastRoomMove(target, room.id);
    }
  });
  socket.on('reveal-nickname', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) { if (u) socket.emit('reveal-nickname-result', { error: 'هذه الخاصية للمشرفين فقط' }); return; }
    const name = String((data && data.targetUsername) || '');
    const target = findUserByUsername(name);
    const doc = db.users.findOne({ topic: name }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === name.toLowerCase());
    const liveFp = target ? (target.fp || '') : (doc ? doc.fp || '' : '');
    const liveFp2 = target ? (target.fp2 || '') : (doc ? doc.fp2 || '' : '');
    const liveIp = target && target.ip ? target.ip : (doc ? doc.ip || '' : '');
    const onlineByUid = new Map();
    const onlineByUsername = new Map();
    onlineSockets.forEach((lu, sid) => {
      if (lu && lu.uid) onlineByUid.set(String(lu.uid), lu);
      if (lu && lu.username) onlineByUsername.set(String(lu.username).toLowerCase(), lu);
    });
    function onlineFor(rowUser) {
      if (rowUser.uid && onlineByUid.has(String(rowUser.uid))) return onlineByUid.get(String(rowUser.uid));
      if (rowUser.topic) return onlineByUsername.get(String(rowUser.topic).toLowerCase()) || null;
      return null;
    }
    function deviceAgent(d) {
      try {
        const di = typeof d.deviceInfo === 'string' ? JSON.parse(d.deviceInfo) : (d.deviceInfo || {});
        return di.userAgent || di.ua || '';
      } catch (e) { return ''; }
    }
    function matches(docOrLive, fp, fp2, ip) {
      const reasons = [];
      if (fp2 && docOrLive.fp2 && String(docOrLive.fp2) === String(fp2)) reasons.push('fingerprint');
      if (fp && docOrLive.fp && String(docOrLive.fp) === String(fp)) reasons.push('fingerprint');
      if (ip && docOrLive.ip && String(docOrLive.ip) === String(ip)) reasons.push('IP');
      return reasons;
    }
    const rows = [];
    const seen = {};
    const seenOnline = {};
    function pushRow(r) {
      if (!r || !r.username || seen[r.username + '|' + r.type + '|' + (r.isHistorical ? 'h' : 'o')]) return;
      seen[r.username + '|' + r.type + '|' + (r.isHistorical ? 'h' : 'o')] = true;
      rows.push(r);
    }
    onlineSockets.forEach((lu, sid) => {
      if (!lu) return;
      const reasons = matches(lu, liveFp, liveFp2, liveIp);
      if (!reasons.length) return;
      const lRow = {
        id: lu.uid || lu.id || '', username: lu.topic || lu.username, type: lu.guest || lu.type === 'guest' ? 'guest' : 'member',
        isOnline: true, isHistorical: false, online: true,
        group: (lu.group && lu.group.name) ? { name: lu.group.name } : { name: '' },
        matchReasons: reasons, roomId: lu.roomid != null ? lu.roomid : null,
        ip: lu.ip || '', fp: lu.fp || '', fp2: lu.fp2 || '',
        userAgent: deviceAgent(lu), lastSeen: new Date().toISOString(),
      };
      pushRow(lRow);
      const k = String(lRow.username).toLowerCase();
      seenOnline[k] = seenOnline[k] || lRow;
    });
    db.users.find({}).forEach((d) => {
      if (!d || !d.topic) return;
      const reasons = matches(d, liveFp, liveFp2, liveIp);
      if (!reasons.length) return;
      const lu = onlineFor(d);
      pushRow({
        id: d.id, username: d.topic, type: d.isGuest ? 'guest' : 'member',
        isOnline: !!lu, isHistorical: false, online: !!lu,
        group: (d.group && d.group.name) ? { name: d.group.name } : { name: '' },
        matchReasons: reasons, roomId: lu ? lu.roomid : null,
        ip: d.ip || '', fp: d.fp || '', fp2: d.fp2 || '',
        userAgent: deviceAgent(d), lastSeen: d.lastSeen || d.created || '',
      });
    });
    const seenHist = {};
    const historical = [];
    db.users.find({}).forEach((d) => {
      if (!d || !d.topic || !matches(d, liveFp, liveFp2, liveIp).length) return;
      if (d.isGuest && seenHist[d.topic]) return;
      seenHist[d.topic] = true;
      const lu = onlineFor(d);
      if (lu) return;
      historical.push({
        id: d.id, username: d.topic, type: d.isGuest ? 'guest' : 'member',
        isOnline: false, isHistorical: true, online: false,
        group: (d.group && d.group.name) ? { name: d.group.name } : { name: '' },
        matchReasons: matches(d, liveFp, liveFp2, liveIp),
        ip: d.ip || '', fp: d.fp || '', fp2: d.fp2 || '',
        userAgent: deviceAgent(d), lastSeen: d.lastSeen || d.created || '',
      });
    });
    const onlineRows = rows.filter((r) => r.isOnline);
    const offlineRows = rows.filter((r) => !r.isOnline);
    const merged = onlineRows.concat(offlineRows, historical).slice(0, 60);
    if (!target && !doc) socket.emit('reveal-nickname-result', { targetUsername: name, associatedUsers: [], historicalLogins: [] });
    else socket.emit('reveal-nickname-result', { targetUsername: name, associatedUsers: merged.filter((r) => !r.isHistorical), historicalLogins: merged.filter((r) => r.isHistorical) });
  });
  socket.on('report-user', (data, ack) => {
    const u = findSocketUser(socket.id);
    if (!u) { if (typeof ack === 'function') ack({ success: false, message: 'يجب تسجيل الدخول' }); return; }
    const rl = rateLimit(socket.id + ':report', { max: 10, windowMs: 60000 }, 'report');
    if (rl.blocked) { if (typeof ack === 'function') ack({ success: false, message: 'محاولات كثيرة، حاول بعد قليل' }); return; }
    const report = {
      id: nextId('rep_'),
      from: publicUser(u),
      fromUsername: u.username,
      targetUsername: String((data && data.targetUsername) || ''),
      reason: String((data && data.reason) || '').substring(0, 500),
      proofImage: sanitizeMediaUrl(data && data.proofImage),
      createdAt: new Date().toISOString(),
    };
    pendingReports.unshift(report);
    if (pendingReports.length > 200) pendingReports.length = 200;
    onlineSockets.forEach((ou, sid) => {
      if (permissionsFor(ou).isAdmin) io.to(sid).emit('admin:new-report', report);
    });
    if (typeof ack === 'function') ack({ success: true, message: 'تم إرسال البلاغ للإدارة' });
  });
  socket.on('delete-user-frame', (data) => { adminDeleteCosmetic(data, 'frame'); });
  socket.on('delete-user-bg', (data) => { adminDeleteCosmetic(data, 'bg'); });
  socket.on('delete-user-link', (data) => { adminDeleteCosmetic(data, 'link'); });
  function adminDeleteCosmetic(data, field) {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const name = String((data && data.targetUsername) || '');
    const doc = db.users.findOne({ topic: name });
    if (!doc) return;
    const set = {};
    if (field === 'frame') set.frame = '';
    else if (field === 'bg') set.bg = '';
    else set.link = '';
    db.users.updateOne({ id: doc.id }, { $set: set });
    io.emit('user_updated', { id: doc.id, username: doc.topic || doc.username, frame: set.frame, bg: set.bg, link: set.link, deleted: true });
  }
  socket.on('message-as-bot', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : (u.roomid || GENERAL_ROOM_ID);
    const text = String((data && data.text) || '').substring(0, 300);
    if (!text) return;
    const botId = String((data && data.botId) || 'bot');
    const botName = 'بوت ' + u.username;
    const bot = {
      id: 'bot_' + botId,
      userId: 'bot_' + botId,
      username: botName,
      topic: botName,
      type: 'bot',
      pic: 'pic.png', ucol: '#9ca3af', mcol: '#9ca3af', bg: '#ffffff',
      msg: '', co: 'us', rep: 0, likes: 0, isBotOrVirtual: true, isVirtualUser: true,
    };
    const msg = { id: nextId('m_'), user: bot, userId: bot.id, text, createdAt: new Date().toISOString(), replyTo: null, mediaUrl: null, mediaType: null };
    const hist = roomHistory.get(String(roomId)) || [];
    hist.push(msg);
    if (hist.length > 100) hist.splice(0, hist.length - 100);
    roomHistory.set(String(roomId), hist);
    io.to('room:' + roomId).emit('message', msg);
  });
  socket.on('public-alert', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const text = String((data && data.text) || '').substring(0, 300);
    if (!text) return;
    io.emit('alert', { text, from: u.username });
  });
  socket.on('voice:speaker-muted', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    u.speakerMuted = !!(data && data.isMuted);
    broadcastPresence();
  });
  socket.on('offline-pending-alert-shown', (data) => {
    const u = findSocketUser(socket.id);
    const id = data && (data.alertId || data.id);
    if (u && u.token && pendingOfflineAlerts.has(u.token)) {
      const list = pendingOfflineAlerts.get(u.token);
      const i = list.indexOf(String(id));
      if (i !== -1) list.splice(i, 1);
      if (list.length === 0) pendingOfflineAlerts.delete(u.token);
    }
  });

  // ── Games spectate list ──────────────────────────────────────────────────
  socket.on('game:spectate:list', (cb) => {
    const out = [];
    battleSessions.forEach((b) => {
      if (b.status === 'countdown' || b.status === 'active' || b.status === 'break') {
        out.push({ gameId: b.battleId, type: 'battle', roomId: b.roomId, status: b.status, player1Name: b.player1Name, player2Name: b.player2Name, player1: publicUserSafe(b.player1Obj), player2: publicUserSafe(b.player2Obj), startedAt: b.startedAt });
      }
    });
    liveBroadcasts.forEach((lb) => {
      out.push({ gameId: 'lb_' + lb.userId, type: 'live', roomId: lb.roomId, status: 'live', broadcaster: lb.username, userId: lb.userId, startedAt: lb.startedAt });
    });
    if (typeof cb === 'function') cb(out);
    socket.emit('game:spectate:list:update', out);
  });

  // ── Battle engine (الملحمة) ──────────────────────────────────────────────
  function broadcastBattle(battle) {
    io.to('room:' + battle.roomId).emit('battle:sync', { hasActiveBattle: true, ...battleWire(battle) });
    spectrumUpdate();
  }
  function emitBattleTick(battle) {
    const p1s = battle.player1SocketId, p2s = battle.player2SocketId;
    if (p1s && io.sockets.sockets.get(String(p1s))) io.to(p1s).emit('battle:created', battleWire(battle));
    if (p2s && io.sockets.sockets.get(String(p2s))) io.to(p2s).emit('battle:created', battleWire(battle));
  }
  function battleWire(battle) {
    const b = {
      battleId: battle.battleId, roomId: battle.roomId, mode: battle.mode, status: battle.status,
      round: battle.round, maxRounds: battle.maxRounds,
      player1: publicUserSafe(battle.player1Obj), player2: publicUserSafe(battle.player2Obj),
      player1Name: battle.player1Name, player2Name: battle.player2Name,
      player1Score: battle.tapCounts[0], player2Score: battle.tapCounts[1],
      totalRounds: battle.maxRounds,
      startedAt: battle.startedAt,
    };
    return b;
  }
  function finishBattle(battle, winnerId) {
    battle.status = 'finished';
    clearTimersForBattle(battle);
    battleSessions.delete(String(battle.roomId));
    battleInvites.delete(String(battle.roomId));
    const pool = roundPool(battle);
const coinSettlement = pool > 0 ? { status: 'paid_to_winner', poolAmount: pool } : { status: 'none', poolAmount: 0 };
const payload = { battleId: battle.battleId, roomId: battle.roomId, winnerId, rounds: battle.roundsWon, player1Score: battle.tapCounts[0], player2Score: battle.tapCounts[1], player1TotalScore: battle.tapCounts[0], player2TotalScore: battle.tapCounts[1], player1RoundsWon: battle.roundsWon[0], player2RoundsWon: battle.roundsWon[1], player1: publicUserSafe(battle.player1Obj), player2: publicUserSafe(battle.player2Obj), player1Name: battle.player1Name, player2Name: battle.player2Name, coinSettlement, forfeitReason: null };
    io.to('room:' + battle.roomId).emit('battle:finished', payload);
    ['player1', 'player2'].forEach((side) => {
      settleBattleCoins(battle, side, winnerId);
    });
    spectrumUpdate();
  }
  function clearTimersForBattle(battle) {
    if (battle.roundTimer) clearInterval(battle.roundTimer);
    if (battle.countdownTimer) clearInterval(battle.countdownTimer);
    if (battle.breakTimer) clearTimeout(battle.breakTimer);
    if (battle.flushTimer) clearInterval(battle.flushTimer);
    battle.roundTimer = battle.countdownTimer = battle.flushTimer = null;
  }
  function startBattleRound(battle, roundNo) {
    battle.round = roundNo;
    battle.tapCounts = [0, 0];
    battle.status = 'active';
    battle.currentRound = roundNo;
    let countdown = 3;
    battle.countdownTimer = setInterval(() => {
      io.to('room:' + battle.roomId).emit('battle:countdown', { timer: countdown, currentRound: roundNo, battleId: battle.battleId });
      countdown -= 1;
      if (countdown < 0) {
        clearInterval(battle.countdownTimer);
        battle.countdownTimer = null;
        battle.tapQueue = { p1: 0, p2: 0 };
        io.to('room:' + battle.roomId).emit('battle:roundStarted', { battleId: battle.battleId, currentRound: roundNo, timer: BATTLE_ROUND_SECONDS, player1Score: 0, player2Score: 0 });
        let t = BATTLE_ROUND_SECONDS;
        battle.roundTimer = setInterval(() => {
          t -= 1;
          io.to('room:' + battle.roomId).emit('battle:timer', { timer: t, round: roundNo, battleId: battle.battleId });
          if (t <= 0) {
            clearInterval(battle.roundTimer);
            battle.roundTimer = null;
            endBattleRound(battle, roundNo);
          }
        }, 1000);
      }
    }, 1000);
  }
  function endBattleRound(battle, roundNo) {
    const p1t = battle.tapCounts[0], p2t = battle.tapCounts[1];
    let winnerId = null;
    if (p1t !== p2t) winnerId = p1t > p2t ? battle.player1Id : battle.player2Id;
    if (winnerId) battle.roundsWon[winnerId === battle.player1Id ? 0 : 1] += 1;
    const poolThisRound = roundPool(battle);
    const coinSettlement = poolThisRound > 0
      ? (winnerId ? { status: 'paid_to_winner', poolAmount: poolThisRound } : { status: 'refunded', poolAmount: poolThisRound })
      : { status: 'none', poolAmount: 0 };
    io.to('room:' + battle.roomId).emit('battle:roundEnded', {
      roundWinnerId: winnerId, round: roundNo,
      player1Score: p1t, player2Score: p2t,
      player1RoundsWon: battle.roundsWon[0], player2RoundsWon: battle.roundsWon[1],
      battleId: battle.battleId, coinSettlement,
      roundWinnerName: winnerId ? (winnerId === battle.player1Id ? battle.player1Name : battle.player2Name) : null,
    });
    if (battle.roundsWon[0] >= Math.ceil(battle.maxRounds / 2) || battle.roundsWon[1] >= Math.ceil(battle.maxRounds / 2)) {
      finishBattle(battle, battle.roundsWon[0] >= Math.ceil(battle.maxRounds / 2) ? battle.player1Id : battle.player2Id);
      return;
    }
    battle.status = 'break';
    battle.breakTimer = setTimeout(() => {
      if (battle.status === 'finished') return;
      startBattleRound(battle, roundNo + 1);
    }, 2000);
  }
  function roundPool(battle) {
    let total = 0;
    (battle.supporters || []).forEach((list) => (list || []).forEach((s) => { total += (s.score || 0); }));
    return total;
  }
  // Persist a real coin balance for a battle player and push the updated
  // balance to that player's sockets. Never fabricates a "balance" number.
  function settleBattleCoins(battle, side, winnerId) {
    const id = side === 'player1' ? battle.player1Id : battle.player2Id;
    const sidName = side + 'SocketId';
    const sid = battle[sidName];
    if (!id || !sid) return;
    const pool = roundPool(battle);
    const won = winnerId && String(id) === String(winnerId);
    // Winner takes the pool; loser/draw just keeps their balance unchanged.
    const delta = won ? Math.max(0, pool) : 0;
    if (delta > 0) {
      const doc = db.users.findOne({ id: String(id) });
      if (doc) {
        const next = (doc.coins || 0) + delta;
        db.users.updateOne({ id: String(id) }, { $set: { coins: next } });
        const live = findSocketUser(sid);
        if (live) live.coins = next;
        io.to(sid).emit('coins:updated', { userId: id, balance: next, reason: 'battle' });
        return;
      }
    }
    const live = findSocketUser(sid);
    const balance = (live && live.coins) || (db.users.findOne({ id: String(id) }) || {}).coins || 0;
    io.to(sid).emit('coins:updated', { userId: id, balance, reason: 'battle' });
  }
  const BATTLE_ROUND_SECONDS = 12;
  function flushBattleTaps(battle) {
    const { p1, p2 } = battle.tapQueue || { p1: 0, p2: 0 };
    if (!p1 && !p2) return;
    battle.tapQueue = { p1: 0, p2: 0 };
    io.to('room:' + battle.roomId).emit('battle:tapBurst', { player1TapCount: p1, player2TapCount: p2, battleId: battle.battleId, player1Score: battle.tapCounts[0], player2Score: battle.tapCounts[1] });
    io.to('room:' + battle.roomId).emit('battle:scoreUpdate', { player1Score: battle.tapCounts[0], player2Score: battle.tapCounts[1], battleId: battle.battleId });
  }

  socket.on('battle:syncState', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : (u && u.roomid) || GENERAL_ROOM_ID;
    const battle = battleSessions.get(String(roomId));
    if (battle && battle.status !== 'finished') {
      socket.emit('battle:sync', { hasActiveBattle: true, ...battleWire(battle) });
    } else {
      socket.emit('battle:sync', { hasActiveBattle: false, roomId });
    }
  });
  socket.on('battle:invite', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    const key = String(roomId);
    if (battleSessions.has(key)) { socket.emit('battle:error', { message: 'توجد ملحمة جارية في هذه الغرفة' }); return; }
    const targetUserId = String((data && data.targetUserId) || '');
    let target = null;
    onlineSockets.forEach((t) => { if (String(t.uid || t.guestId || t.userId) === targetUserId) target = t; });
    if (!target) { socket.emit('battle:error', { message: 'العضو غير متواجد الآن' }); return; }
    const tid = socketIdForUser(target);
    if (!tid) { socket.emit('battle:error', { message: 'العضو غير متصل' }); return; }
    battleInvites.set(key, { senderId: u.uid || u.guestId || u.userId, senderName: u.username, receiverId: targetUserId, receiverName: target.username, roomId });
    io.to(tid).emit('battle:invited', { senderId: u.uid || u.guestId || u.userId, senderName: u.username, roomId: Number(roomId), receiverName: target.username });
  });
  socket.on('battle:accept', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    const invite = battleInvites.get(String(roomId));
    if (!invite) { socket.emit('battle:error', { message: 'الدعوة غير موجودة' }); return; }
    if (String(u.uid || u.guestId || u.userId) !== String(invite.receiverId) && String(u.uid || u.guestId || u.userId) !== String(invite.senderId)) return;
    let sender = null, senderSid = null;
    onlineSockets.forEach((t, sid) => { if (String(t.uid || t.guestId || t.userId) === String(invite.senderId)) { sender = t; senderSid = sid; } });
    if (!sender || !senderSid) { socket.emit('battle:error', { message: 'مقدم الدعوة غير متواجد الآن' }); battleInvites.delete(String(roomId)); return; }
    const battle = {
      battleId: 'btl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      roomId: String(roomId),
      mode: (data && data.battleMode) || (invite.mode) || 'single',
      status: 'countdown',
      round: 1, maxRounds: 3, currentRound: 1,
      player1Obj: publicUser(sender), player2Obj: publicUser(u),
      player1Id: sender.uid || sender.guestId || sender.userId, player2Id: u.uid || u.guestId || u.userId,
      player1Name: sender.username, player2Name: u.username,
      player1SocketId: senderSid, player2SocketId: socket.id,
      tapCounts: [0, 0], tapQueue: { p1: 0, p2: 0 },
      roundsWon: [0, 0],
      supporters: [[], []],
      startedAt: new Date().toISOString(),
      roundTimer: null, countdownTimer: null, breakTimer: null, flushTimer: null,
    };
    battleSessions.set(String(roomId), battle);
    battleInvites.delete(String(roomId));
    emitBattleTick(battle);
    broadcastBattle(battle);
    startBattleRound(battle, 1);
    battle.flushTimer = setInterval(() => flushBattleTaps(battle), 350);
  });
  socket.on('battle:reject', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    const invite = battleInvites.get(String(roomId));
    if (!invite) return;
    const senderSid = socketIdForUserUsername_(invite.senderName);
    if (senderSid) io.to(senderSid).emit('battle:inviteRejected', { receiverName: u ? u.username : invite.receiverName, roomId });
    battleInvites.delete(String(roomId));
  });
  function socketIdForUserUsername_(name) {
    let sid = null;
    onlineSockets.forEach((t, k) => { if (String(t.username).toLowerCase() === String(name).toLowerCase() && !sid) sid = k; });
    return sid;
  }
  socket.on('battle:cancel', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : (u && u.roomid) || GENERAL_ROOM_ID;
    const invite = battleInvites.get(String(roomId));
    if (invite) {
      const sid = socketIdForUserUsername_(invite.senderName === (u && u.username) ? invite.receiverName : invite.senderName);
      if (sid && sid !== socket.id) io.to(sid).emit('battle:cancelled', { reason: 'تم إلغاء الملحمة', roomId: Number(roomId) });
      battleInvites.delete(String(roomId));
      return;
    }
    const battle = battleSessions.get(String(roomId));
    if (!battle) return;
    const isParticipant = socket.id === battle.player1SocketId || socket.id === battle.player2SocketId || permissionsFor(u).isAdmin;
    if (!isParticipant) return;
    clearTimersForBattle(battle);
    if (battle.flushTimer) clearInterval(battle.flushTimer);
    battleSessions.delete(String(roomId));
    io.to('room:' + battle.roomId).emit('battle:cancelled', { reason: 'تم إلغاء الملحمة', roomId: Number(roomId) });
    spectrumUpdate();
  });
  socket.on('battle:tap', (data) => {
    const u = findSocketUser(socket.id);
    let b = null;
    battleSessions.forEach((bs) => { if (String(bs.battleId) === String(data && data.battleId)) b = bs; });
    if (!b || b.status !== 'active') { socket.emit('battle:tapError', { message: 'الملحمة ليست نشطة' }); return; }
    if (socket.id !== b.player1SocketId && socket.id !== b.player2SocketId) { socket.emit('battle:tapError', { message: 'أنت لست مشاركاً في الملحمة' }); return; }
    const receiverId = String(data && data.receiverId);
    if (socket.id === b.player1SocketId && String(b.player2Id) !== receiverId) { socket.emit('battle:tapError', { message: 'هدف غير صالح' }); return; }
    if (socket.id === b.player2SocketId && String(b.player1Id) !== receiverId) { socket.emit('battle:tapError', { message: 'هدف غير صالح' }); return; }
    const idx = socket.id === b.player1SocketId ? 0 : 1;
    b.tapCounts[idx] += 1;
    if (b.tapQueue) b.tapQueue[idx === 0 ? 'p1' : 'p2'] += 1;
    io.to('room:' + b.roomId).emit('battle:tapEffect', { receiverId, byUserId: socket.id === b.player1SocketId ? b.player1Id : b.player2Id, battleId: b.battleId, byUsername: u.username, tapper: u.username, supporterAvatar: u.pic && u.pic !== 'pic.png' ? u.pic : null, operationId: 'tap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), supportType: 'tap' });
  });
  socket.on('battle:getGiftCatalog', (ack) => {
    if (typeof ack === 'function') ack({ success: true, catalog: BATTLE_GIFTS });
  });
  socket.on('battle:sendGift', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) { socket.emit('battle:giftError', { message: 'يجب تسجيل الدخول' }); return; }
    const battle = (() => { let found = null; battleSessions.forEach((b) => { if (String(b.battleId) === String(data && data.battleId)) found = b; }); return found; })();
    if (!battle) { socket.emit('battle:giftError', { message: 'الملحمة غير موجودة' }); return; }
    if (battle.status !== 'active' && battle.status !== 'break') { socket.emit('battle:giftError', { message: 'لا يمكن إرسال هدية الآن' }); return; }
    const gift = BATTLE_GIFTS.find((g) => g.key === (data && data.giftKey));
    if (!gift) { socket.emit('battle:giftError', { message: 'الهدية غير موجودة' }); return; }
    const slot = String((data && data.receiverSlot) || 'player1');
    const qty = Math.max(1, Math.min(999, parseInt((data && data.quantity) || 1, 10) || 1));
    const cost = gift.price * qty;
    const receiverIdx = slot.toLowerCase().indexOf('2') !== -1 ? 1 : 0;
    const receiverId = receiverIdx === 0 ? battle.player1Id : battle.player2Id;
    if (String(receiverId) === String(u.uid || u.guestId || u.userId)) { socket.emit('battle:giftError', { message: 'لا يمكنك إرسال هدية لنفسك' }); return; }
    // Deduct real coins from the sender's persisted balance and reject when broke.
    const senderDoc = db.users.findOne({ id: String(u.uid || u.userId || '') });
    const liveBal = (u.coins !== undefined) ? Number(u.coins) || 0 : (senderDoc ? Number(senderDoc.coins) || 0 : 0);
    if (liveBal < cost) { socket.emit('battle:giftError', { message: 'رصيد الكوينز لا يكفي لإرسال هذه الهدية' }); return; }
    const newBal = liveBal - cost;
    u.coins = newBal;
    if (senderDoc) db.users.updateOne({ id: String(u.uid || u.userId) }, { $set: { coins: newBal } });
    io.to(socket.id).emit('coins:updated', { userId: u.uid || u.guestId || u.userId, balance: newBal, reason: 'gift' });
    let sup = (battle.supporters[receiverIdx] || []).find((s) => String(s.userId) === String(u.uid || u.guestId || u.userId));
    if (!sup) {
      sup = { userId: u.uid || u.guestId || u.userId, user: publicUser(u), username: u.username, score: 0 };
      if (!battle.supporters[receiverIdx]) battle.supporters[receiverIdx] = [];
      battle.supporters[receiverIdx].push(sup);
    }
    sup.score += gift.price * qty;
    io.to('room:' + battle.roomId).emit('battle:giftAnimation', {
      sender: publicUser(u), receiver: publicUserSafe(receiverId === battle.player1Id ? battle.player1Obj : battle.player2Obj),
      senderName: u.username, senderId: u.uid || u.guestId || u.userId,
      receiverName: receiverIdx === 0 ? battle.player1Name : battle.player2Name, receiverId,
      giftIcon: gift.icon, giftName: gift.name, quantity: qty,
    });
    io.to('room:' + battle.roomId).emit('battle:topSupporters', { player1Supporters: battle.supporters[0] || [], player2Supporters: battle.supporters[1] || [] });
  });

  // ── Room music (أغاني الغرفة) ────────────────────────────────────────────
  function musicStateFor(roomId) {
    return roomMusic.get(String(roomId)) || { current: null, queue: [], playing: false, position: 0, volume: 1, currentTime: 0 };
  }
  function broadcastMusic(roomId, extra) {
    const st = musicStateFor(roomId);
    io.to('room:' + roomId).emit('room-music:state', { roomId: Number(roomId), ...st, ...extra });
  }
  function broadcastMusicQueue(roomId) {
    io.to('room:' + roomId).emit('room-music:queue-update', musicStateFor(roomId).queue || []);
  }
  function nextMusicIfNeeded(roomId) {
    const st = roomMusic.get(String(roomId));
    if (!st || st.current) return;
    if (st.queue.length > 0) {
      const next = st.queue.shift();
      st.current = next;
      st.playing = true;
      st.position = 0;
      broadcastMusic(roomId);
      broadcastMusicQueue(roomId);
    }
  }
  socket.on('room-music:get-state', (data) => {
    const roomId = (data && data.roomId !== undefined) ? data.roomId : (findSocketUser(socket.id) && findSocketUser(socket.id).roomid) || GENERAL_ROOM_ID;
    socket.emit('room-music:state', { roomId: Number(roomId), ...musicStateFor(roomId) });
  });
  socket.on('room-music:add-to-queue', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = (u.roomid) || GENERAL_ROOM_ID;
    const room = findRoomByAnyId(roomId);
    // Guests may not queue music; members when the room allows requests (or mods/admins always).
    if (u.type === 'guest') return;
    const isMod = isRoomModerator(roomId, u) || permissionsFor(u).isAdmin;
    if (room && room.allowRoomMusic === false && !isMod) return;
    if (room && room.membersCanRequestMusic === false && !isMod) return;
    const rl = rateLimit(socket.id, { max: 15, windowMs: 60000 }, 'room-music');
    if (rl && rl.blocked) return;
    const st = roomMusic.get(String(roomId)) || { current: null, queue: [], playing: false, position: 0, volume: 1, currentTime: 0 };
    if (st.queue.length >= 100) { socket.emit('room-music:error', { message: 'قائمة الانتظار ممتلئة' }); return; }
    if (!st.current && st.queue.length === 0) { st.current = null; }
    st.queue.push({ queueId: nextId('mq_'), videoId: String((data && data.videoId) || '').substring(0, 64), title: String((data && data.title) || '').substring(0, 150), requestedBy: u.username });
    roomMusic.set(String(roomId), st);
    broadcastMusicQueue(roomId);
    nextMusicIfNeeded(roomId);
  });
  socket.on('room-music:remove-from-queue', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = u.roomid || GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    const qid = String((data && data.queueId) || '');
    const entry = st.queue.find((q) => String(q.queueId) === qid);
    if (!entry) return;
    const isOwner = String(entry.requestedBy).toLowerCase() === String(u.username).toLowerCase();
    if (!isOwner && !permissionsFor(u).isAdmin && !isRoomModerator(roomId, u)) return;
    st.queue = st.queue.filter((q) => String(q.queueId) !== qid);
    broadcastMusicQueue(roomId);
  });
  socket.on('room-music:leave-queue', () => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = u.roomid || GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    st.queue = st.queue.filter((q) => String(q.requestedBy).toLowerCase() !== String(u.username).toLowerCase());
    if (st.current && String(st.current.requestedBy).toLowerCase() === String(u.username).toLowerCase()) {
      st.current = null; st.playing = false; st.position = 0;
      broadcastMusic(roomId);
      nextMusicIfNeeded(roomId);
    }
    broadcastMusicQueue(roomId);
  });
  socket.on('room-music:play', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = u.roomid || GENERAL_ROOM_ID;
    const room = findRoomByAnyId(roomId);
    // Control actions require a member (guests may not override the room's audio)
    // and the room's music permission (membersCanRequestMusic / moderator).
    if (u.type === 'guest') return;
    const isMod = isRoomModerator(roomId, u) || permissionsFor(u).isAdmin;
    if (room && room.moderatorsCanManageMusic === false && !room.membersCanRequestMusic && !isMod) return;
    const rl = rateLimit(socket.id, { max: 15, windowMs: 60000 }, 'room-music');
    if (rl && rl.blocked) return;
    const st = roomMusic.get(String(roomId)) || { current: null, queue: [], playing: false, position: 0, volume: 1, currentTime: 0 };
    st.current = { queueId: nextId('mq_'), videoId: String((data && data.videoId) || '').substring(0, 64), title: String((data && data.title) || '').substring(0, 150), requestedBy: u.username };
    st.playing = true;
    st.position = 0;
    st.currentTime = 0;
    roomMusic.set(String(roomId), st);
    broadcastMusic(roomId);
  });
  socket.on('room-music:pause', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = u ? u.roomid : GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    if (!permissionsFor(u).isAdmin && !isRoomModerator(roomId, u)) return;
    st.playing = false;
    st.currentTime = Number((data && data.currentTime) || st.currentTime || 0);
    broadcastMusic(roomId);
  });
  socket.on('room-music:resume', () => {
    const u = findSocketUser(socket.id);
    const roomId = u ? u.roomid : GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st || !st.current) return;
    if (!permissionsFor(u).isAdmin && !isRoomModerator(roomId, u)) return;
    st.playing = true;
    broadcastMusic(roomId);
  });
  socket.on('room-music:stop', () => {
    const u = findSocketUser(socket.id);
    const roomId = u ? u.roomid : GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    if (!permissionsFor(u).isAdmin && !isRoomModerator(roomId, u)) return;
    st.current = null;
    st.playing = false;
    st.position = 0;
    st.currentTime = 0;
    broadcastMusic(roomId);
    nextMusicIfNeeded(roomId);
  });
  socket.on('room-music:seek', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = u ? u.roomid : GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    if (!permissionsFor(u).isAdmin && !isRoomModerator(roomId, u)) return;
    st.position = Math.max(0, Number((data && data.position)) || 0);
    st.currentTime = st.position;
    broadcastMusic(roomId);
  });
  socket.on('room-music:set-volume', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = u ? u.roomid : GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    st.volume = Math.min(1, Math.max(0, Number((data && data.volume)) || 0));
    broadcastMusic(roomId);
  });

  // ── Private video/voice call (مكالمة خاصة) ───────────────────────────────
  socket.on('pmcall:invite', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const gate = likeGate(u, 'call');
    if (!gate.ok) { socket.emit('pmcall:error', { message: likeGateMessage('call', gate) }); return; }
    const targetUserId = String((data && data.targetUserId) || '');
    let target = null, tid = null;
    onlineSockets.forEach((t, sid) => { if (String(t.uid || t.guestId || t.userId) === targetUserId) { target = t; tid = sid; } });
    if (!target || !tid) { socket.emit('pmcall:error', { message: 'العضو غير متصل الآن' }); return; }
    let busy = false;
    privateCalls.forEach((c) => {
      if (String(c.callerId) === String(targetUserId) || String(c.calleeId) === String(targetUserId)) busy = true;
    });
    if (busy) { socket.emit('pmcall:busy'); return; }
    const callId = 'pc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    privateCalls.set(callId, { callId, callerId: u.uid || u.guestId || u.userId, calleeId: targetUserId, status: 'ringing' });
    io.to(tid).emit('pmcall:incoming', { callId, caller: publicUser(u) });
    socket.emit('pmcall:state', { callId, status: 'ringing' });
  });
  function pmcallPeer(callId, exceptId) {
    const c = privateCalls.get(callId);
    if (!c) return null;
    let peer = null, peerSid = null;
    const peerId = String(c.callerId) === String(exceptId) ? c.calleeId : c.callerId;
    onlineSockets.forEach((t, sid) => { if (String(t.uid || t.guestId || t.userId) === String(peerId)) { peer = t; peerSid = sid; } });
    return peerSid;
  }
  socket.on('pmcall:accept', (data) => {
    const u = findSocketUser(socket.id);
    const callId = String((data && data.callId) || '');
    const c = privateCalls.get(callId);
    if (!c) return;
    c.status = 'active';
    const peerSid = pmcallPeer(callId, u ? u.uid || u.guestId || u.userId : '');
    if (peerSid) io.to(peerSid).emit('pmcall:accept', { callId });
    socket.emit('pmcall:accept', { callId });
  });
  socket.on('pmcall:signal', (data) => {
    const u = findSocketUser(socket.id);
    const callId = String((data && data.callId) || '');
    const c = privateCalls.get(callId);
    if (!c) return;
    const peerSid = pmcallPeer(callId, u ? u.uid || u.guestId || u.userId : '');
    if (peerSid) io.to(peerSid).emit('pmcall:signal', { callId, signal: data.signal, fromUserId: u ? u.uid || u.guestId || u.userId : '' });
  });
  socket.on('pmcall:hangup', (data) => {
    const u = findSocketUser(socket.id);
    const callId = String((data && data.callId) || '');
    const c = privateCalls.get(callId);
    if (!c) return;
    const reason = (data && data.reason) || 'disconnected';
    const peerSid = pmcallPeer(callId, u ? u.uid || u.guestId || u.userId : '');
    privateCalls.delete(callId);
    if (peerSid) io.to(peerSid).emit('pmcall:hangup', { callId, reason });
  });

  // ── Camera (كاميرا) ──────────────────────────────────────────────────────
  socket.on('camera:request', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const targetUserId = String((data && data.targetId) || '');
    const tids = socketsForUserId(targetUserId);
    if (tids.length === 0) { socket.emit('camera:error', { message: 'العضو غير متصل' }); return; }
    // Only allow camera requests between users present in the same room.
    const targetOnline = socketsForUserId(targetUserId).map((sid) => onlineSockets.get(sid)).filter(Boolean);
    const sameRoom = targetOnline.some((tu) => String(tu.roomid) === String(u.roomid));
    if (!sameRoom) { socket.emit('camera:error', { message: 'يجب أن يكون العضو في نفس الغرفة' }); return; }
    tids.forEach((sid) => io.to(sid).emit('camera:request', { requesterId: u.uid || u.guestId || u.userId, requester: publicUser(u), requestId: nextId('cam_') }));
  });
  socket.on('camera:accept', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const viewerId = String((data && data.targetId) || '');
    const ownerId = u.uid || u.guestId || u.userId;
    if (!viewerId || viewerId === ownerId) return;
    const ownerSockets = socketsForUserId(ownerId);
    if (ownerSockets.length === 0) return;
    // The caller must be the camera owner: verify it is the stream owner that
    // grants consent (accept must come from the owner's own socket).
    const sess = cameraSessions.get(ownerId) || new Set();
    sess.add(viewerId);
    cameraSessions.set(ownerId, sess);
    const viewerSids = socketsForUserId(viewerId);
    viewerSids.forEach((sid) => io.to(sid).emit('camera:accepted', { ownerId, ownerUsername: u.username, targetId: viewerId }));
  });
  socket.on('camera:reject', (data) => {
    const u = findSocketUser(socket.id);
    const targetUserId = String((data && data.targetId) || '');
    const tids = socketsForUserId(targetUserId);
    tids.forEach((sid) => io.to(sid).emit('camera:rejected', { username: u ? u.username : '' }));
  });
  socket.on('camera:viewer-ready', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const ownerId = String((data && data.targetId) || '');
    const viewerId = u.uid || u.guestId || u.userId;
    if (!ownerId || ownerId === viewerId) return;
    // Consent gate: the owner must have accepted this viewer before the server
    // tells the owner's client to start broadcasting the camera to them.
    const sess = cameraSessions.get(ownerId);
    if (!sess || !sess.has(viewerId)) { socket.emit('camera:error', { message: 'لم يتم الموافقة على الطلب' }); return; }
    const tids = socketsForUserId(ownerId);
    tids.forEach((sid) => io.to(sid).emit('camera:start-broadcast', { viewerId, viewer: publicUser(u) }));
  });
  socket.on('camera:offer', (data) => {
    const u = findSocketUser(socket.id);
    const targetUserId = String((data && data.targetId) || '');
    const uid = u ? u.uid || u.guestId || u.userId : '';
    if (!u || !uid) return;
    // Only relay camera signaling between an owner and a viewer that has been
    // accepted for a session (both directions).
    const a = cameraSessions.get(uid);
    const b = cameraSessions.get(targetUserId);
    if (!((a && a.has(targetUserId)) || (b && b.has(uid)))) return;
    const tids = socketsForUserId(targetUserId);
    tids.forEach((sid) => io.to(sid).emit('camera:offer', { offer: data.offer, fromId: uid }));
  });
  socket.on('camera:answer', (data) => {
    const u = findSocketUser(socket.id);
    const targetUserId = String((data && data.targetId) || '');
    const uid = u ? u.uid || u.guestId || u.userId : '';
    if (!u || !uid) return;
    const a = cameraSessions.get(uid);
    const b = cameraSessions.get(targetUserId);
    if (!((a && a.has(targetUserId)) || (b && b.has(uid)))) return;
    const tids = socketsForUserId(targetUserId);
    tids.forEach((sid) => io.to(sid).emit('camera:answer', { answer: data.answer, fromId: uid }));
  });
  socket.on('camera:candidate', (data) => {
    const u = findSocketUser(socket.id);
    const targetUserId = String((data && data.targetId) || '');
    const uid = u ? u.uid || u.guestId || u.userId : '';
    if (!u || !uid) return;
    const a = cameraSessions.get(uid);
    const b = cameraSessions.get(targetUserId);
    if (!((a && a.has(targetUserId)) || (b && b.has(uid)))) return;
    const tids = socketsForUserId(targetUserId);
    tids.forEach((sid) => io.to(sid).emit('camera:candidate', { candidate: data.candidate, fromId: uid }));
  });
  socket.on('camera:pause', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const uid = u.uid || u.guestId || u.userId;
    const viewers = cameraSessions.get(String(uid)) || new Set();
    viewers.forEach((viewerId) => {
      const tids = socketsForUserId(viewerId);
      tids.forEach((sid) => io.to(sid).emit('camera:paused', { userId: uid, paused: !!(data && data.paused) }));
    });
  });
  socket.on('camera:end', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const uid = u.uid || u.guestId || u.userId;
    const targetUserId = String((data && data.targetId) || '');
    if (targetUserId) {
      const tids = socketsForUserId(targetUserId);
      tids.forEach((sid) => io.to(sid).emit('camera:ended', { userId: uid }));
      const sess = cameraSessions.get(String(uid));
      if (sess) sess.delete(targetUserId);
    } else {
      cameraSessions.forEach((viewers, ownerId) => {
        if (viewers.has(uid)) viewers.delete(uid);
      });
    }
  });

  // ── Live broadcast (بث مباشر) ─────────────────────────────────────────────
  socket.on('liveBroadcast:start', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    if (!permissionsFor(u).permissions.canStartLiveBroadcast) {
      socket.emit('liveBroadcast:error', { message: 'لا تملك صلاحية البث المباشر' });
      return;
    }
    const roomId = u.roomid || GENERAL_ROOM_ID;
    const lb = liveBroadcasts.get(String(roomId));
    if (lb) { socket.emit('liveBroadcast:error', { message: 'يوجد بث مباشر في هذه الغرفة' }); return; }
    const entry = { socketId: socket.id, userId: u.uid || u.guestId || u.userId, username: u.username, sourceType: (data && data.sourceType) || 'camera', scope: (data && data.scope) || 'room', viewers: new Set(), startedAt: Date.now() };
    liveBroadcasts.set(String(roomId), entry);
    io.to('room:' + roomId).emit('liveBroadcast:notify', { broadcasterId: entry.userId, broadcaster: publicUser(u), username: u.username, sourceType: entry.sourceType, scope: entry.scope, roomId: Number(roomId) });
    spectrumUpdate();
  });
  socket.on('liveBroadcast:watch', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const broadcasterId = String((data && data.broadcasterId) || '');
    let lb = null;
    liveBroadcasts.forEach((b) => { if (String(b.userId) === broadcasterId) lb = b; });
    if (!lb) { socket.emit('liveBroadcast:error', { message: 'البث غير متاح' }); return; }
    lb.viewers.add(u.uid || u.guestId || u.userId);
    io.to(lb.socketId).emit('liveBroadcast:viewer-request', { viewerId: u.uid || u.guestId || u.userId, viewer: publicUser(u) });
  });
  function isLiveBroadcastParticipant(socketId, targetSocketId) {
    const u = onlineSockets.get(socketId);
    if (!u) return false;
    const uid = u.uid || u.guestId || u.userId;
    const targetU = onlineSockets.get(targetSocketId);
    if (!targetU) return false;
    const targetUid = targetU.uid || targetU.guestId || targetU.userId;
    // Broadcasters may signal to their viewers and vice-versa within the same live broadcast.
    let lb = null;
    liveBroadcasts.forEach((b) => { if (b.socketId === socketId || String(b.userId) === uid) lb = b; });
    if (lb && (lb.socketId === targetSocketId || lb.viewers.has(targetUid))) return true;
    lb = null;
    liveBroadcasts.forEach((b) => { if (b.socketId === targetSocketId || String(b.userId) === targetUid) lb = b; });
    if (lb && (lb.socketId === socketId || lb.viewers.has(uid))) return true;
    return false;
  }
  socket.on('liveBroadcast:offer', (data) => {
    const targetSid = String((data && data.targetSocketId) || '');
    if (!isLiveBroadcastParticipant(socket.id, targetSid)) return;
    const sock = io.sockets.sockets.get(targetSid);
    if (sock) sock.emit('liveBroadcast:offer', { offer: data.offer, fromSocketId: socket.id });
  });
  socket.on('liveBroadcast:answer', (data) => {
    const targetSid = String((data && data.targetSocketId) || '');
    if (!isLiveBroadcastParticipant(socket.id, targetSid)) return;
    const sock = io.sockets.sockets.get(targetSid);
    if (sock) sock.emit('liveBroadcast:answer', { answer: data.answer, fromSocketId: socket.id });
  });
  socket.on('liveBroadcast:ice-candidate', (data) => {
    const targetSid = String((data && data.targetSocketId) || '');
    if (!isLiveBroadcastParticipant(socket.id, targetSid)) return;
    const sock = io.sockets.sockets.get(targetSid);
    if (sock) sock.emit('liveBroadcast:ice-candidate', { candidate: data.candidate, fromSocketId: socket.id });
  });
  socket.on('liveBroadcast:viewer-left', (data) => {
    const u = findSocketUser(socket.id);
    const broadcasterId = String((data && data.broadcasterId) || '');
    let lb = null;
    liveBroadcasts.forEach((b) => { if (String(b.userId) === broadcasterId) lb = b; });
    if (lb) {
      lb.viewers.delete(u ? u.uid || u.guestId || u.userId : '');
      io.to(lb.socketId).emit('liveBroadcast:viewer-left', { viewerId: u ? u.uid || u.guestId || u.userId : '' });
    }
  });
  socket.on('liveBroadcast:stop', () => {
    const u = findSocketUser(socket.id);
    let roomId = null;
    liveBroadcasts.forEach((b, key) => { if (b.socketId === socket.id) roomId = key; });
    if (roomId === null) return;
    const lb = liveBroadcasts.get(roomId);
    liveBroadcasts.delete(roomId);
    const payload = { broadcasterId: lb.userId, broadcaster: u ? publicUser(u) : { username: lb.username }, roomId: Number(roomId) };
    lb.viewers.forEach((viewerId) => {
      const tids = socketsForUserId(viewerId);
      tids.forEach((sid) => io.to(sid).emit('liveBroadcast:ended', { ...payload, reason: 'ended' }));
    });
    io.to('room:' + roomId).emit('liveBroadcast:ended', { ...payload, reason: 'ended' });
    spectrumUpdate();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────
// Rehydrate per-room moderator + mic-lock maps from the DB so they survive a
// restart (otherwise socketModeratorSync would wipe persisted data with the
// empty in-memory maps).
function rehydrateRoomFeatures() {
  try {
    (db.rooms.getAll() || []).forEach((r) => {
      const rid = String(r.id);
      if (Array.isArray(r.moderators) && r.moderators.length > 0 && !roomModerators.has(rid)) {
        setRoomModerators(rid, r.moderators);
      }
      if (Array.isArray(r.lockedMics) && r.lockedMics.length > 0 && !roomMicLocks.has(rid)) {
        const lm = new Map();
        r.lockedMics.forEach((mi) => { lm.set(String(mi), ''); });
        roomMicLocks.set(rid, lm);
      }
    });
  } catch (e) { logger.warn('boot.features', 'Rehydrate failed', { error: e.message }); }
}
async function start() {
  await connect();
  db = getDb();
  loadWall();
  loadStories();
  pruneStories();
  loadStoryBans();
  rehydrateRoomFeatures();
  // Seed default room if empty (RoomManager equivalent). The modern client
  // treats room ids as numeric (Number(r.id), Number(data.roomId)), so the
  // main room must carry a numeric id matching GENERAL_ROOM_ID.
  const existingRooms = db.rooms.getAll() || [];
  const mainRoom = existingRooms.find((r) => Number(r.id) === Number(GENERAL_ROOM_ID));
  if (!mainRoom) {
    // Discard legacy-format room docs (old schema: string ids, no owner) and
    // seed a clean main room the modern client can render.
    const cleanMain = { id: GENERAL_ROOM_ID, name: 'الساحة الرئيسية', owner: 'system', ownerId: '', password: '', created: new Date().toISOString(), online: 0 };
    try { db.rooms.drop(); } catch (e) { /* noop */ }
    db.rooms.create(cleanMain);
    logger.info('db.seed', 'Modern main room seeded', { id: GENERAL_ROOM_ID });
  }
  logger.info('server.start', 'Modern protocol server running', { port: PORT });
  // Lightweight story lifecycle: prune expired stories on an hourly cadence.
  setInterval(pruneStories, 60 * 60 * 1000).unref();
  server.listen(PORT, () => {
    const adminCred = getAdminCredentials();
    if (adminCred) {
      console.log('\n══════════════════════════════════════════════');
      console.log('  DRR Chat — Modern protocol server (live client)');
      console.log('  URL:      http://localhost:' + PORT);
      console.log('  Control:  http://localhost:' + PORT + '/cp');
      console.log('  Admin:    ' + adminCred.username + ' / ' + adminCred.password);
      console.log('══════════════════════════════════════════════\n');
    }
  });
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

if (require.main === module) {
  start().catch((e) => {
    logger.error('server.start', 'Fatal', { error: e && e.stack || e });
    process.exit(1);
  });
}

module.exports = { app, server, io, start };
