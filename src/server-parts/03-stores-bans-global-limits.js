/* ═══════════════════════════════════════════════════
   SERVER-PART 03/16 · stores-bans-global-limits
   lines 339–551 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
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
