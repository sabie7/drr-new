/* ═══════════════════════════════════════════════════
   SERVER-PART 01/16 · boot-deps-sanitizers
   lines 1–191 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
0
/* Kaz alwadi (c) 2026 — boot-deps-sanitizers */
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

// Timing-safe secret compare (length-guarded, constant-time)
function safeEqualSecret(a, b) {
  const ba = Buffer.from(String(a == null ? '' : a));
  const bb = Buffer.from(String(b == null ? '' : b));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return crypto.timingSafeEqual(ba, bb);
}


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
  return safeEqualSecret(p, config.adminPass);
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
