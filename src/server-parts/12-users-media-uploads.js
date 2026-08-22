/* ═══════════════════════════════════════════════════
   SERVER-PART 12/16 · users-media-uploads
   lines 2463–2781 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
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
