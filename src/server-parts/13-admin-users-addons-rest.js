/* ═══════════════════════════════════════════════════
   SERVER-PART 14/16 · admin-users-addons-rest
   lines 3164–3456 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
0
/* Kaz alwadi (c) 2026 — admin-users-addons-rest */
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
// Cross-site origins must match PRIMARY_HOST or EXTRA_ORIGINS (comma-separated
// hostnames) via environment. Same-origin requests send no Origin → allowed.
const io = new Server(server, {
  cors: {
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      try {
        var h = new URL(origin).hostname;
        var primary = String(process.env.PRIMARY_HOST || 'drr-chat.bonto.run').trim();
        if (h === primary) return cb(null, true);
        var extras = String(process.env.EXTRA_ORIGINS || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        if (extras.indexOf(h) !== -1) return cb(null, true);
      } catch (e) {}
      return cb(null, false);
    },
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

const guestRegistry = new Map(); // guestId -> guest

function findSocketUser(socketId) {
  return onlineSockets.get(socketId) || null;
