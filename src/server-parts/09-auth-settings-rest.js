/* ═══════════════════════════════════════════════════
   SERVER-PART 09/16 · auth-settings-rest
   lines 1441–1741 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
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
