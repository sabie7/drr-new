/* ═══════════════════════════════════════════════════
   SERVER-PART 11/16 · private-threads-rooms-wall
   lines 1944–2462 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
0
/* Kaz alwadi (c) 2026 — private-threads-rooms-wall */
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
