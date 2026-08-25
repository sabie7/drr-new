/* ═══════════════════════════════════════════════════
   SERVER-PART 13/16 · stories-admin-visits-youtube
   lines 2782–3163 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
0
/* Kaz alwadi (c) 2026 — stories-admin-visits-youtube */
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
