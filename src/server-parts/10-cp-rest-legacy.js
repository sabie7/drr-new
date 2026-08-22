/* ═══════════════════════════════════════════════════
   SERVER-PART 10/16 · cp-rest-legacy
   lines 1742–1943 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
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
      (safeEqualSecret(password, config.adminPass) || (candidates[0] && candidates[0].password && bcrypt.compareSync(password, candidates[0].password))) ||
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
