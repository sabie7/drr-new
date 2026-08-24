/* ═══════════════════════════════════════════════════
   SERVER-PART 04/16 · rooms-presence-perms
   lines 552–683 of original modern-server.js
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
