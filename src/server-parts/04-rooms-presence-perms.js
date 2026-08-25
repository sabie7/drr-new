/* ═══════════════════════════════════════════════════
   SERVER-PART 04 · rooms-presence-gates-limits
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
0
/* Kaz alwadi (c) 2026 — rooms-presence-perms */
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
    // Gifts restricted: only admin or power with gifts flag
    const pw = powerEntryFor(u);
    p.canSendGifts = isAdmin || (pw && (pw.gifts === 1 || pw.gifts === true));
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

0
/* Kaz alwadi (c) 2026 — gates-public-user */
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
