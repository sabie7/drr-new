/* ═══════════════════════════════════════════════════
   SERVER-PART 15/16 · sockets-battle-music-pmcall-live
   lines 3457–6488 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
}

function emitUserSnapshotTo(socket) {
  socket.emit('users-snapshot', { version: presenceVersion, users: serializeAllPresence() });
}

function resolveUserForSocket(socket) {
  const auth = (socket.handshake && socket.handshake.auth) || {};
  const token = auth.token || '';

  // Identity is resolved from a bearer token ONLY. The client always sends the
  // token alongside clientSessionId; clientSessionId is never an authenticator
  // on its own (removes the impersonation vector from a leaked session id).
  if (token) {
    const guest = guestRegistryForToken(token);
    if (guest) return guest;
    const doc = findUserByToken(token);
    if (doc) {
      const entry = {
        uid: doc.id, username: doc.topic || doc.username, type: 'member',
        pic: doc.pic || 'pic.png', ucol: doc.ucol || '#000000', mcol: doc.mcol || '#6c757d',
        bg: doc.bg || '#ffffff', msg: doc.msg || '', co: doc.co || 'us',
        rep: doc.rep || 0, likes: doc.likes || 0, coins: doc.coins || 0, wallPoints: doc.wallPoints || 0, rank: doc.power || '',
        fp: doc.fp || '', fp2: doc.fp2 || '', deviceInfo: doc.deviceInfo || '',
        group: doc.group || { id: 0, name: '', roleRank: doc.power === 'admin' ? 999 : 0 },
        stealth: false, isHidden: false, isIdle: false, isAdmin: !!doc.isAdmin || doc.power === 'admin',
        verified: !!doc.verified, token, guest: false,
        roomid: GENERAL_ROOM_ID, joinTime: Date.now(),
        isActive: true,
      };
      return entry;
    }
  }
  return null;
}

function guestRegistryForToken(token) {
  let found = null;
  guestRegistry.forEach((g) => { if (g.token === token) found = g; });
  return found;
}
function purgeGuestRegistryForToken(token) {
  if (!token) return;
  guestRegistry.forEach((g, gid) => { if (g && g.token === token) guestRegistry.delete(gid); });
}
function purgeGuestRegistryForUser(u) {
  if (!u || !u.guest || !u.guestId) return;
  let active = false;
  onlineSockets.forEach((o) => {
    if (o && o !== u && String(o.guestId || o.userId || '') === String(u.guestId || u.userId || '')) active = true;
  });
  if (!active) guestRegistry.delete(u.guestId);
}

io.on('connection', (socket) => {
  const auth = (socket.handshake && socket.handshake.auth) || {};
  const token = auth.token || '';
  const clientSessionId = auth.clientSessionId || '';

  // Connection flood guard: cap simultaneous sockets per client IP so a single
  // machine cannot exhaust the server's socket pool.
  const connIp = (socket.handshake && (socket.handshake.address || (socket.request && socket.request.socket && socket.request.socket.remoteAddress))) || '';
  const ipConnKey = 'sockconn:' + connIp;
  const ipCount = (connSlots.get(ipConnKey) || 0) + 1;
  if (ipCount > 8) {
    socket.emit('error-msg', { msg: 'تجاوزت حد الاتصالات المتزامنة' });
    socket.disconnect(true);
    return;
  }
  connSlots.set(ipConnKey, ipCount);
  const releaseConnCount = () => {
    const n = (connSlots.get(ipConnKey) || 1) - 1;
    if (n <= 0) connSlots.delete(ipConnKey); else connSlots.set(ipConnKey, n);
  };
  socket.once('disconnect', releaseConnCount);

  socket.sessionStartedMs = ensureSessionStart(clientSessionId);

  // Pre-connect: user already logged in via REST -> attach the presence entry now
  const user = resolveUserForSocket(socket);

  // Re-check bans on socket connect: a member/guest holding a token minted before
  // they were banned must not be able to keep chatting by simply reconnecting.
  // Also enforces browser/OS bans from the panel (applies to guests too).
  {
    const sockUa = (socket.handshake && socket.handshake.headers && socket.handshake.headers['user-agent']) || '';
    const envBan = isBannedByClientEnv(sockUa);
    if ((user && isBannedByIpOrFp(socketIp(socket), user.fp, user.fp2)) || envBan.banned) {
      socket.emit('banned', { reason: envBan.banned ? envBanMessage(envBan.why) : 'تم حظرك من الدردشة', expiresAt: null });
      socket.disconnect(true);
      return;
    }
  }

  // Single-session enforcement: the same account must not be online twice.
  // If this user already has an active socket, log that old session out (kick it).
  if (user) {
    socketSession.set(socket.id, clientSessionId);
    kickExistingSessionsForUser(user, socket.id, clientSessionId);
  }

  // Public/unauth connect: still emit config + snapshot (guest not yet created).
  socket.emit('init-config', { GENERAL_ROOM_ID, waitingRoomId: WAITING_ROOM_ID });

  if (user) {
    onlineSockets.set(socket.id, user);
    user.roomid = GENERAL_ROOM_ID;
    socket.join('room:' + GENERAL_ROOM_ID);
    tokenToUser.set(user.token, { socketId: socket.id, username: user.username, token: user.token, guest: user.guest });
    broadcastPresence();
    broadcastJoinLeave(user, 'join');
  }

  socket.emit('rooms-stats', roomStats());
  socket.emit('global-limits', globalLimitsGet());

  if (user) {
    emitUserSnapshotTo(socket);
  } else {
    socket.emit('users-snapshot', { version: presenceVersion, users: serializeAllPresence() });
  }

  // Deliver any offline private messages waiting for this user
  if (user && typeof user.username === 'string') {
    const offline = [];
    privateMessages.forEach((msgs) => {
      msgs.forEach((m) => {
        const t = m && m.timestamp ? new Date(m.timestamp).getTime() : 0;
        if (String(m.to).toLowerCase() === String(user.username).toLowerCase() && m.status !== 'read' && (!socket.sessionStartedMs || !t || t >= socket.sessionStartedMs)) offline.push({
          fromUser: { username: m.from, topic: m.from, type: 'user', id: m.from, userId: m.from },
          message: { id: m.id, text: m.text, type: m.type, fileUrl: m.fileUrl, replyTo: m.replyTo, timestamp: m.timestamp },
        });
      });
    });
    if (offline.length > 0) socket.emit('offline-private-messages', offline);
  }

  // ── join room ─────────────────────────────────────────────────────────
  function roomAccessCheck(socket, roomId, password) {
    const room = findRoomByAnyId(roomId);
    if (!room) return null;
    const u = findSocketUser(socket.id);
    if (u && isRoomBanned(roomId, u)) {
      socket.emit('room-ban-error', { roomId: String(room.id), msg: 'أنت محظور من هذه الغرفة' });
      return false;
    }
    if (room.isActive === false) {
      socket.emit('room-join-error', { roomId: String(room.id), msg: 'الغرفة غير متاحة حالياً' });
      return false;
    }
    if (room.password) {
      if (!password || String(password) !== String(room.password)) {
        socket.emit('needpass', { roomId: String(room.id), roomName: room.name });
        return false;
      }
    }
    // Membership gating: requiredLikes / roomLevel / capacity are enforced
    // server-side now (not just in the client UI).
    const adminPass = u && permissionsFor(u).permissions.canAccessLockedAndFullRooms;
    if (u && !adminPass) {
      if (room.requiredLikes && (u.likes || 0) < room.requiredLikes) {
        socket.emit('room-join-error', { roomId: String(room.id), msg: 'تحتاج إلى ' + room.requiredLikes + ' إعجاباً لدخول هذه الغرفة' });
        return false;
      }
      if (room.roomLevel && (u.roomLevel || 0) < room.roomLevel) {
        socket.emit('room-join-error', { roomId: String(room.id), msg: 'مستواك غير كافٍ لدخول هذه الغرفة' });
        return false;
      }
      if (room.capacity) {
        let live = 0;
        onlineSockets.forEach((ou) => { if (String(ou.roomid) === String(room.id)) live++; });
        if (live >= room.capacity) {
          socket.emit('room-join-error', { roomId: String(room.id), msg: 'الغرفة ممتلئة' });
          return false;
        }
      }
    }
    return true;
  }
  function isRoomBanned(roomId, u) {
    const list = roomBans.get(String(roomId)) || [];
    if (!list.length) return false;
    const now = Date.now();
    return list.some((b) => {
      if (b.until && now > b.until) return false;
      return (b.username && b.username.toLowerCase() === String(u.username || '').toLowerCase())
        || (b.userId && String(b.userId) === String(u.uid || u.userId || u.guestId || ''));
    });
  }
  socket.on('join', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const prevRoom = u.roomid;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (roomAccessCheck(socket, roomId, data && data.password) === false) return;
    u.roomid = roomId;
    socket.join('room:' + roomId);
    socket.emit('rejoin-success', {});
    socket.emit('room-changed', { roomId, room: roomToClient(findRoomByAnyId(roomId)) });
    const hist = (roomHistory.get(String(roomId)) || []).filter((m) => {
      const t = m && (m.createdAt ? new Date(m.createdAt).getTime() : (m.timestamp ? new Date(m.timestamp).getTime() : 0));
      return !socket.sessionStartedMs || !t || t >= socket.sessionStartedMs;
    });
    socket.emit('presence:room-history', { roomId, messages: hist, recovered: true });
    broadcastPresence();
    if (String(prevRoom) !== String(roomId)) {
      if (socket.rooms && prevRoom !== undefined && prevRoom !== null) socket.leave('room:' + prevRoom);
      if (prevRoom !== undefined && prevRoom !== null) broadcastJoinLeave(u, 'leave', prevRoom);
      broadcastRoomMove(u, roomId);
    }
  });

  socket.on('change-room', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const prevRoom = u.roomid;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (roomAccessCheck(socket, roomId, data && data.password) === false) return;
    u.roomid = roomId;
    socket.join('room:' + roomId);
    socket.emit('room-changed', { roomId, room: roomToClient(findRoomByAnyId(roomId)) });
    const hist = (roomHistory.get(String(roomId)) || []).filter((m) => {
      const t = m && (m.createdAt ? new Date(m.createdAt).getTime() : (m.timestamp ? new Date(m.timestamp).getTime() : 0));
      return !socket.sessionStartedMs || !t || t >= socket.sessionStartedMs;
    });
    socket.emit('presence:room-history', { roomId, messages: hist, recovered: true });
    broadcastPresence();
    if (String(prevRoom) !== String(roomId)) {
      if (socket.rooms && prevRoom !== undefined && prevRoom !== null) socket.leave('room:' + prevRoom);
      if (prevRoom !== undefined && prevRoom !== null) broadcastJoinLeave(u, 'leave', prevRoom);
      broadcastRoomMove(u, roomId);
    }
  });

  socket.on('leave-room', (data) => {
    const u = findSocketUser(socket.id);
    if (u) {
      const prevRoom = u.roomid;
      u.roomid = null;
      if (socket.rooms && prevRoom !== undefined && prevRoom !== null) socket.leave('room:' + prevRoom);
      broadcastPresence();
      broadcastJoinLeave(u, 'leave', prevRoom);
    }
  });

  socket.on('request-users-snapshot', () => {
    emitUserSnapshotTo(socket);
  });

  socket.on('message', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || typeof data.text !== 'string') return;
    const roomId = data.roomId !== undefined ? data.roomId : (u.roomid || GENERAL_ROOM_ID);
    if (isGloballyMuted(u.username) || isRoomMuted(roomId, u.username)) {
      socket.emit('error-msg', { msg: 'أنت مكتوم الصوت حالياً ولا يمكنك إرسال الرسائل' });
      return;
    }
    // Per-user flood control: cap public messages so a single account cannot
    // spam the whole room.
    const who = u.uid || u.guestId || u.userId || u.username || socket.id;
    const rl = rateLimit(socket.id + ':' + who, { max: 30, windowMs: 60000 }, 'message');
    if (rl.blocked) { socket.emit('error-msg', { msg: 'رسائلك كثيرة جداً، توقف قليلاً' }); return; }
    // Room membership gate: only allow sending to the room the user actually
    // joined (prevents injecting messages into other/password-locked rooms).
    const targetRoom = findRoomByAnyId(roomId);
    if (!targetRoom) return;
    if (String(targetRoom.id) !== String(u.roomid) && String(roomId) !== String(u.roomid)) {
      return;
    }
    if (targetRoom.disableChat && !permissionsFor(u).isAdmin) {
      socket.emit('error-msg', { msg: 'الدردشة معطلة في هذه الغرفة' });
      return;
    }
    const rawText = String(data.text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    const filteredText = filterNoLetters(rawText, 'bmsgs').trim();
    if (!filteredText) return;
    const msg = {
      id: nextId('m_'),
      user: publicUser(u),
      userId: u.guest ? u.guestId : u.uid,
      text: filteredText.substring(0, 300),
      createdAt: new Date().toISOString(),
      replyTo: (data.replyTo && typeof data.replyTo === 'object') ? {
        // Whitelist — never trust client-supplied cosmetic/identity fields here;
        // they are replayed to every viewer and rendered into style=""/attributes.
        id: String(data.replyTo.id || data.replyTo.userId || '').slice(0, 60),
        userId: String(data.replyTo.id || data.replyTo.userId || '').slice(0, 60),
        username: sanitizeUsername(String(data.replyTo.username || ''), 30),
        text: String(data.replyTo.text || '').substring(0, 300),
        mediaUrl: sanitizeMediaUrl(data.replyTo.mediaUrl),
        mediaType: safeMediaType(data.replyTo.mediaType),
      } : null,
      mediaUrl: sanitizeMediaUrl(data.mediaUrl),
      mediaType: safeMediaType(data.mediaType),
    };
    const hist = roomHistory.get(String(roomId)) || [];
    hist.push(msg);
    if (hist.length > 100) hist.splice(0, hist.length - 100);
    roomHistory.set(String(roomId), hist);
    io.to('room:' + roomId).emit('message', msg);
    // also store in db.messages if available
    try { if (db.messages) db.messages.create({ roomId, text: msg.text, userId: msg.userId, createdAt: msg.createdAt }); } catch (e) {}
  });

  socket.on('activity', () => {
    const u = findSocketUser(socket.id);
    if (u) { u.isIdle = false; broadcastPresence(); }
  });

  socket.on('presence:idle', () => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const rl = rateLimit(socket.id, { max: 4, windowMs: 60000 }, 'presence-enable');
    if (rl && rl.blocked) return;
    if (!u.isIdle) { u.isIdle = true; broadcastPresence(); }
  });

  socket.on('presence:active', () => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const rl = rateLimit(socket.id, { max: 4, windowMs: 60000 }, 'presence-active');
    if (rl && rl.blocked) return;
    if (u.isIdle) { u.isIdle = false; broadcastPresence(); }
  });

  socket.on('logout', () => {
    const u = findSocketUser(socket.id);
    if (u) {
      onlineSockets.delete(socket.id);
      socketSession.delete(socket.id);
      tokenToUser.delete(u.token);
      io.emit('user-left', { name: u.username });
      broadcastPresence();
    }
    socket.disconnect(true);
  });

  // ── Admin Control Panel (/cp) protocol ──────────────────────────────────
  // Thread-safe singleton helpers for CP-managed settings. All data is kept in
  // the `settings` doc (siteweb, dro3, emo, sico, shrt, msgs, banssystems),
  // `powers` (single doc { powers: [...] }), `subscriptions`, and `bans`.
  function cpSettingsDoc() {
    return moduleSettings();
  }
  function cpSettingsSet(patch) {
    const doc = cpSettingsDoc();
    Object.keys(patch).forEach((k) => { if (patch[k] !== undefined) doc[k] = patch[k]; });
    if (db.settings) db.settings.updateOne({}, { $set: patch });
    return doc;
  }
  function cpPowers() {
    const doc = db.powers ? db.powers.getAll()[0] : null;
    return doc && Array.isArray(doc.powers) ? doc.powers : [];
  }
  function cpSavePowers(list) {
    const arr = Array.isArray(list) ? list : [];
    if (db.powers) {
      const existing = db.powers.getAll()[0];
      if (existing) db.powers.updateOne({}, { $set: { powers: arr } });
      else db.powers.create({ powers: arr });
    }
  }
  function cpBanSystems() {
    return cpSettingsDoc().banssystems || { browsers: {}, systems: {} };
  }
  function cpShortcuts() {
    const shrt = cpSettingsDoc().shrt;
    return Array.isArray(shrt) ? shrt.filter((s) => s && s.name) : [];
  }
  function cpMsgs() {
    const msgs = cpSettingsDoc().msgs;
    return Array.isArray(msgs) ? msgs.filter((m) => m && m.adresse) : [];
  }
  function cpSubs() {
    return db.subscriptions ? db.subscriptions.getAll().map((s) => ({ iduser: s.iduser, topic: s.topic, topic1: s.topic1, sub: s.sub, time: s.time || (s.timeis ? new Date(s.timeis).toLocaleString('ar') : '') })) : [];
  }
  function cpAuditlog() {
    return db.auditlog ? db.auditlog.getAll() : [];
  }
  function cpRecordAudit(action, target, before, after, detail) {
    try {
      if (db.auditlog) db.auditlog.create({ when: new Date().toISOString(), actor: socket.isAdmin ? (socket.username || 'admin') : 'admin', action, target, before: before || null, after: after || null, detail: detail || null });
    } catch (e) {}
  }
  function cpReloadSite() {
    io.emit('reload_site', { at: Date.now() });
  }
  function cpBackupData() {
    const snap = {};
    // db is the collection map itself (see src/db/repository.js); there is no
    // `db.collections` property. Snapshot every real collection via getAll().
    Object.keys(db).forEach((k) => {
      try { if (db[k] && typeof db[k].getAll === 'function') snap[k] = db[k].getAll(); } catch (e) {}
    });
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, 'cp-backup-' + Date.now() + '.json');
    fs.writeFileSync(file, JSON.stringify(snap, null, 2), 'utf8');
    return file;
  }
  function cpRestoreData() {
    if (!fs.existsSync(DATA_DIR)) return false;
    const files = fs.readdirSync(DATA_DIR).filter((f) => /^cp-backup-.*\.json$/.test(f)).sort().reverse();
    if (files.length === 0) return false;
    const snap = JSON.parse(fs.readFileSync(path.join(DATA_DIR, files[0]), 'utf8'));
    Object.keys(snap).forEach((k) => {
      try { if (db[k] && typeof db[k].setAll === 'function') db[k].setAll(snap[k]); } catch (e) {}
    });
    return true;
  }

  socket.on('msg', (data) => {
    if (!data || !data.cmd) return;
    if (data.cmd === 'delBand' && data.data && (data.data.id || data.data.fp || data.data.ip)) {
      // Require an already-authenticated CP admin; otherwise verify the CP
      // password inline so the ban list can never be tampered with by anon.
      if (!socket.isAdmin) {
        // Throttle password attempts so an anonymous socket cannot brute-force
        // the CP password through this command (mirrors getstate/admin limits).
        const rl = rateLimit(socketIp(socket), { max: 5, windowMs: 60000 }, 'cp-delband');
        if (rl && rl.blocked) {
          socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'محاولات كثيرة، حاول بعد قليل' } });
          socket.disconnect(true);
          return;
        }
        const pass = data.data && data.data.password;
        if (!verifyCPPassword(pass)) {
          socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'صلاحية مطلوبة لحذف الحظر' } });
          return;
        }
        socket.isAdmin = true;
      }
      if (db.bands) {
        const all = db.bands.getAll() || [];
        // Match by _id/id first (strict), then by device/ip only when a value was supplied.
        const id = String(data.data.id || '');
        let target = null;
        if (id) target = all.find((b) => String(b._id || b.id || '') === id);
        if (!target) {
          target = all.find((b) =>
            (data.data.fp && String(b.device_band) === String(data.data.fp)) ||
            (data.data.ip && String(b.ip_band) === String(data.data.ip))
          );
        }
        if (target) {
          if (target._id) db.bands.deleteOne({ _id: target._id });
          else if (target.id) db.bands.deleteOne({ id: target.id });
          else if (target.device_band) db.bands.deleteMany({ device_band: target.device_band });
          else db.bands.deleteMany({ ip_band: target.ip_band });
        }
      }
      socket.emit('savedone', { msg: 'تم حذف الحظر' });
      return;
    }
    if (data.cmd === 'getstate') {
      const ip = socketIp(socket);
      const rl = socket.isAdmin ? null : rateLimit(ip, { max: 5, windowMs: 60000 }, 'getstate');
      if (rl && rl.blocked) {
        socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'محاولات كثيرة، حاول بعد قليل' } });
        socket.disconnect(true);
        return;
      }
      const pass = data.data && data.data.password;
      if (!cpAccessAllowed(pass)) {
        socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'كلمة المرور غير صحيحة' } });
        return;
      }
      socket.isAdmin = true;
      const siteweb = cpSettingsDoc().siteweb || { name: 'شات درر', title: 'لوحة التحكم', bg: '#40404f', buttons: '#f93634', background: '#40404f', allowg: true, allowreg: true };
      const s = cpSettingsDoc();
      socket.emit('message', { cmd: 'siteweb', data: siteweb });
      socket.emit('message', { cmd: 'dro3', data: Array.isArray(s.dro3) ? s.dro3 : [] });
      socket.emit('message', { cmd: 'emos', data: Array.isArray(s.emo) ? s.emo : [] });
      socket.emit('message', { cmd: 'sicos', data: Array.isArray(s.sico) ? s.sico : [] });
      socket.emit('message', { cmd: 'powers', data: cpPowers() });
      socket.emit('message', { cmd: 'noletters', data: db.noletters ? db.noletters.getAll() : [] });
      socket.emit('message', { cmd: 'zaker', data: db.zakrfa ? db.zakrfa.getAll() : [] });
      socket.emit('message', { cmd: 'users_data', data: (db.users.find({}) || []).map((u) => ({ id: u.id, topic: u.topic, username: u.username, power: u.power || 'user', ip: u.ip || '', fp: u.fp || '', fp2: u.fp2 || '', deviceInfo: u.deviceInfo || '', rep: u.rep || 0, likes: u.likes || 0, coins: u.coins || 0, wallPoints: u.wallPoints || 0, verified: !!u.verified, documentationc: u.documentationc || 0, created: u.created || '' })) });
      socket.emit('message', { cmd: 'rlist', data: (db.rooms.getAll() || []).map((r) => ({ ...roomToClient(r), hasPassword: !!r.password, owner: r.owner || '' })) });
      socket.emit('message', { cmd: 'band_list', data: db.bands ? db.bands.getAll() : [] });
      socket.emit('message', { cmd: 'setbansystem', data: { browsers: cpBanSystems().browsers || {}, systems: cpBanSystems().systems || {} } });
      socket.emit('message', { cmd: 'shrtlist', data: cpShortcuts() });
      socket.emit('message', { cmd: 'msgslist', data: cpMsgs() });
      socket.emit('message', { cmd: 'subslist', data: cpSubs() });
      socket.emit('message', { cmd: 'seo', data: seoSettings() });
      socket.emit('message', { cmd: 'appearance', data: appearanceSettings() });
      return;
    }
    if (data.cmd === 'admin') {
      const rl = socket.isAdmin ? null : rateLimit(socketIp(socket), { max: 5, windowMs: 60000 }, 'cpadmin');
      if (rl && rl.blocked) {
        socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'محاولات كثيرة، حاول بعد قليل' } });
        socket.disconnect(true);
        return;
      }
      const a = data.data || {};
      if (!a.cmd || !a.pass) return;
      if (!cpAccessAllowed(a.pass)) {
        socket.emit('message', { cmd: 'error_list', data: { color: 'danger', msg: 'كلمة المرور غير صحيحة' } });
        return;
      }
      socket.isAdmin = true;
      const payload = a.data || {};
      switch (a.cmd) {
        case 'delete_user': {
          if (payload.name) {
            const target = db.users.findOne({ topic: payload.name }) || db.users.findOne({ username: payload.name }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(payload.name).toLowerCase());
            if (target) {
              if (String(target.topic).toLowerCase() === String(config.adminUser || 'admin').toLowerCase()) {
                socket.emit('savedone', { msg: 'لا يمكن حذف حساب المدير الرئيسي' });
                break;
              }
              db.users.deleteMany({ id: target.id });
              db.users.deleteMany({ topic: target.topic });
              const dead = [];
              onlineSockets.forEach((u, sid) => { if (String(u.uid || u.guestId || u.userId || '') === String(target.id)) dead.push({ sid, u }); });
              dead.forEach(({ sid, u }) => {
                try { io.sockets.sockets.get(sid) && io.sockets.sockets.get(sid).emit('kicked', { reason: 'تم حذف حسابك من لوحة التحكم' }); } catch (e) {}
                onlineSockets.delete(sid); socketSession.delete(sid); if (u.token) tokenToUser.delete(u.token);
              });
              io.emit('user-left', { name: target.topic });
              broadcastPresence();
              cpRecordAudit('delete_user', target.topic, null, null);
            }
          }
          socket.emit('savedone', { msg: 'تم حذف العضو' });
          break;
        }
        case 'save_band': {
          if (payload.fp || payload.ip) {
            const rec = { _id: crypto.randomBytes(8).toString('hex'), id: crypto.randomBytes(8).toString('hex'), device_band: payload.fp || '', device_band2: payload.fp2 || '', ip_band: payload.ip || '', date: new Date().toISOString(), name_band: payload.reason || 'حظر من لوحة التحكم' };
            db.bands.create(rec);
            cpRecordAudit('save_band', rec.device_band || rec.ip_band, null, rec.name_band);
          }
          socket.emit('done_band', {});
          break;
        }
        case 'delete_band': {
          if (payload.fp) db.bands.deleteMany({ device_band: payload.fp });
          if (payload.ip) db.bands.deleteMany({ ip_band: payload.ip });
          socket.emit('savedone', { msg: 'تم إلغاء الحظر' });
          break;
        }
        case 'add_room': {
          const name = sanitizeRoomName((payload && payload.name) || '', 30);
          if (!name) { socket.emit('error-msg', { msg: 'أدخل اسم الغرفة' }); break; }
          if (!db.rooms.getAll().some((r) => String(r.name) === name)) {
            const room = { id: nextId('room_'), name, owner: (payload && payload.owner) || '', order: db.rooms.getAll().length, created: new Date().toISOString(), password: '', isActive: true, isLocked: false, capacity: 0, roomLevel: 0 };
            db.rooms.create(room);
            io.emit('rooms-stats', roomStats());
            cpRecordAudit('add_room', name, null, null);
            socket.emit('message', { cmd: 'rlist', data: (db.rooms.getAll() || []).map((r) => ({ ...roomToClient(r), hasPassword: !!r.password, owner: r.owner || '' })) });
            socket.emit('savedone', { msg: 'تمت إضافة الغرفة' });
          } else {
            socket.emit('error-msg', { msg: 'الغرفة موجودة بالفعل' });
          }
          break;
        }
        case 'rename_room': {
          const room = payload && payload.id !== undefined ? findRoomByAnyId(payload.id) : null;
          const name = sanitizeRoomName((payload && payload.name) || '', 30);
          if (room && name) {
            db.rooms.updateOne({ id: room.id }, { $set: { name } });
            emitRoomUpdated(room.id);
            cpRecordAudit('rename_room', String(room.id), null, name);
            socket.emit('savedone', { msg: 'تمت إعادة تسمية الغرفة' });
          } else {
            socket.emit('error-msg', { msg: 'الغرفة غير موجودة أو الاسم فارغ' });
          }
          break;
        }
        case 'delete_room': {
          if (payload.id !== undefined) {
            const room = findRoomByAnyId(payload.id);
            if (!room) {
              socket.emit('savedone', { msg: 'الغرفة غير موجودة' });
              break;
            }
            if (String(room.id) === String(GENERAL_ROOM_ID)) {
              socket.emit('savedone', { msg: 'لا يمكن حذف الغرفة العامة' });
              break;
            }
            db.rooms.deleteMany({ id: room.id });
            roomModerators.delete(String(room.id));
            roomMutes.delete(String(room.id));
            roomMicLocks.delete(String(room.id));
            roomHistory.delete(String(room.id));
            roomBans.delete(String(room.id));
            io.emit('rooms-stats', roomStats());
            io.emit('room-deleted', { id: room.id });
            cpRecordAudit('delete_room', room.name || String(room.id), null, null);
            socket.emit('savedone', { msg: 'تم حذف الغرفة' });
          }
          break;
        }
        case 'setuserpower': {
          if (payload.name) {
            const target = db.users.findOne({ topic: payload.name }) || db.users.findOne({ username: payload.name }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(payload.name).toLowerCase());
            const power = String(payload.power || 'user');
            if (target) {
              const isRoot = String(target.topic).toLowerCase() === String(config.adminUser || 'admin').toLowerCase();
              if (isRoot && power !== 'admin') {
                socket.emit('savedone', { msg: 'لا يمكن تغيير صلاحية المدير الرئيسي' });
                break;
              }
              const before = target.power || 'user';
              (db.users.find({ id: target.id }) || []).forEach((row) => db.users.updateOne({ id: row.id }, { $set: { power } }));
              onlineSockets.forEach((u) => { if (String(u.uid || u.guestId || u.userId || '') === String(target.id)) { u.rank = power; u.power = power; } });
              io.emit('user_updated', { id: target.id, username: target.topic, power });
              cpRecordAudit('setuserpower', target.topic, before, power);
            }
          }
          socket.emit('savedone', { msg: 'تم تغيير الصلاحية' });
          break;
        }
        case 'save_state': {
          const siteweb = cpSettingsDoc().siteweb || {};
          ['name', 'title', 'bg', 'buttons', 'background', 'msgst'].forEach((k) => { if (payload[k] !== undefined) siteweb[k] = payload[k]; });
          if (payload.allowg !== undefined) siteweb.allowg = !!payload.allowg;
          if (payload.allowreg !== undefined) siteweb.allowreg = !!payload.allowreg;
          if (payload.likeGates && typeof payload.likeGates === 'object') {
            const gates = siteweb.likeGates || {};
            ['wall', 'private', 'story', 'call', 'mic'].forEach((k) => {
              const n = parseInt(payload.likeGates[k], 10);
              if (!isNaN(n) && n >= 0) gates[k] = n;
            });
            siteweb.likeGates = gates;
          }
          cpSettingsSet({ siteweb });
          socket.emit('savedone', { msg: 'تم حفظ الإعدادات' });
          io.emit('settings-updated', { siteweb });
          cpRecordAudit('save_state', 'site', null, { name: siteweb.name, allowg: siteweb.allowg, allowreg: siteweb.allowreg });
          break;
        }
        case 'get_seo': {
          socket.emit('message', { cmd: 'seo', data: seoSettings() });
          break;
        }
        case 'save_seo': {
          if (typeof payload !== 'object' || payload === null) { socket.emit('error-msg', { msg: 'بيانات غير صالحة' }); break; }
          const saved = seoSave(payload);
          socket.emit('message', { cmd: 'seo_saved', data: saved });
          socket.emit('savedone', { msg: 'تم حفظ إعدادات محركات البحث' });
          cpRecordAudit('save_seo', 'site', null, { title: saved.siteTitle, canonicalUrl: saved.canonicalUrl });
          break;
        }
        case 'get_appearance': {
          socket.emit('message', { cmd: 'appearance', data: appearanceSettings() });
          break;
        }
        case 'save_appearance': {
          if (typeof payload !== 'object' || payload === null) { socket.emit('error-msg', { msg: 'بيانات غير صالحة' }); break; }
          const savedAp = appearanceSave(payload);
          socket.emit('message', { cmd: 'appearance', data: savedAp });
          socket.emit('savedone', { msg: 'تم حفظ الألوان والمظهر' });
          io.emit('settings-updated', { appearance: savedAp });
          cpRecordAudit('save_appearance', 'site', null, { mainUiColor: savedAp.mainUiColor, landingBgColor: savedAp.landingBgColor });
          break;
        }
        case 'upload_site_image': {
          // payload: { kind, dataUrl, idx? }
          // kinds: favicon|banner|pic (SEO) · emoji|badge|addon_icon|addon_gift (assets)
          //        overlay_image|private_tab_bg|system_message_image|default_room|default_cover (appearance)
          const kind = String(payload.kind || '').trim();
          const ASSET_KINDS = ['emoji', 'badge', 'addon_icon', 'addon_gift'];
          const APPEARANCE_IMG_KINDS = {
            overlay_image: 'overlayImageUrl',
            private_tab_bg: 'privateTabBgUrl',
            system_message_image: 'defaultSystemMessageImageUrl',
            default_room: 'defaultRoomUrl',
            default_cover: 'defaultCoverUrl'
          };
          const appearanceKey = APPEARANCE_IMG_KINDS[kind];
          if (['favicon', 'banner', 'pic'].indexOf(kind) === -1 && ASSET_KINDS.indexOf(kind) === -1 && !appearanceKey) {
            socket.emit('error-msg', { msg: 'نوع الصورة غير صالح' });
            break;
          }
          const isAssetKind = ASSET_KINDS.indexOf(kind) !== -1;
          const assetIdx = payload.idx !== undefined ? payload.idx : null;
          const dataUrl = String(payload.dataUrl || '');
          const m = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i);
          if (!m) { socket.emit('error-msg', { msg: 'صورة غير صالحة' }); break; }
          const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
          const buf = Buffer.from(m[2], 'base64');
          if (!buf.length || buf.length > 8 * 1024 * 1024) { socket.emit('error-msg', { msg: 'حجم الصورة كبير جداً' }); break; }
          const siteUploadDir = path.join(CLIENT_DIR, 'uploads', 'site');
          if (!fs.existsSync(siteUploadDir)) fs.mkdirSync(siteUploadDir, { recursive: true });
          const seoBefore = seoSettings();
          const prevKey = kind === 'pic' ? 'defaultAvatarUrl' : kind + 'Url';
          const prev = isAssetKind
            ? ''
            : appearanceKey
              ? (appearanceSettings()[appearanceKey] || '')
              : ((seoBefore && seoBefore[prevKey]) || '');
          const finishSiteUpload = (dataBuf, ext2) => {
            const fname = kind + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext2;
            fs.writeFileSync(path.join(siteUploadDir, fname), dataBuf);
            const url = '/uploads/site/' + fname;
            if (isAssetKind) {
              // Asset uploads (emoji/badge/addon): URL only — the caller attaches
              // it to its own list via a follow-up *_item_add / set_badges cmd.
              socket.emit('message', { cmd: 'cp_image_uploaded', data: { kind, url, idx: assetIdx } });
              socket.emit('savedone', { msg: 'تم رفع الصورة' });
              cpRecordAudit('upload_site_image', kind, null, url);
              return;
            }
            if (appearanceKey) {
              // Appearance media: persist into db.settings.appearance and push live
              // to every connected client via site_appearance_updated.
              const savedAp = appearanceSave({ [appearanceKey]: url });
              if (prev && prev.indexOf('/uploads/site/') === 0 && prev !== url) {
                try { const p = path.join(siteUploadDir, path.basename(prev.split('?')[0])); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { logger.warn('cp', 'Old site image cleanup failed', { error: e.message }); }
              }
              io.emit('site_appearance_updated', savedAp);
              socket.emit('message', { cmd: 'appearance', data: savedAp });
              socket.emit('savedone', { msg: 'تم رفع الصورة وتحديث الموقع' });
              cpRecordAudit('upload_site_image', kind, null, url);
              return;
            }
            const savedImage = seoSave({ [kind === 'pic' ? 'defaultAvatarUrl' : kind + 'Url']: url, ...(kind === 'banner' ? { ogImage: url } : {}) });
            // Auto-cleanup: remove the previous file of the same kind once the new
            // one is persisted, so replaced images never accumulate on the disk.
            if (prev && prev.indexOf('/uploads/site/') === 0 && prev !== url) {
              try { const p = path.join(siteUploadDir, path.basename(prev.split('?')[0])); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { logger.warn('cp', 'Old site image cleanup failed', { error: e.message }); }
            }
            socket.emit('message', { cmd: 'seo_saved', data: savedImage });
            socket.emit('savedone', { msg: 'تم رفع الصورة وتحديث الموقع' });
            cpRecordAudit('upload_site_image', kind, null, url);
          };
          // Animated gifs pass through untouched (sharp would flatten them).
          if (ext === 'gif') { finishSiteUpload(buf, ext); break; }
          compressSiteImageBuffer(buf, kind)
            .then((out) => {
              if (out && out.data && out.data.length && out.data.length < buf.length) finishSiteUpload(out.data, out.ext);
              else finishSiteUpload(buf, ext);
            })
            .catch(() => {
              try { finishSiteUpload(buf, ext); } catch (e) { socket.emit('error-msg', { msg: 'تعذر رفع الصورة' }); }
            });
          break;
        }
        case 'save_as': {
          if (Array.isArray(payload.powers)) cpSavePowers(payload.powers);
          socket.emit('savedone', { msg: 'تم حفظ الصلاحيات' });
          socket.emit('message', { cmd: 'powers', data: cpPowers() });
          break;
        }
        case 'save_emo': {
          const arr = Array.isArray(payload) ? payload : (Array.isArray(payload && payload.data) ? payload.data : []);
          cpSettingsSet({ emo: arr });
          socket.emit('savedone', { msg: 'تم حفظ الابتسامات' });
          io.emit('smileys:updated', arr);
          break;
        }
        case 'save_dro3': {
          const arr = Array.isArray(payload) ? payload : (Array.isArray(payload && payload.data) ? payload.data : []);
          cpSettingsSet({ dro3: arr });
          socket.emit('savedone', { msg: 'تم حفظ الدروق' });
          break;
        }
        case 'save_sico': {
          const arr = Array.isArray(payload) ? payload : (Array.isArray(payload && payload.data) ? payload.data : []);
          cpSettingsSet({ sico: arr });
          socket.emit('savedone', { msg: 'تم حفظ الأيقونات الفائقة' });
          io.emit('sicos:updated', arr);
          break;
        }
        case 'save_browser_bans': {
          const cur = cpBanSystems();
          cur.browsers = Object.assign({}, cur.browsers, payload.browser || {});
          cpSettingsSet({ banssystems: cur });
          socket.emit('savedone', { msg: 'تم حفظ حظر المتصفحات' });
          io.emit('banssystem-updated', cur);
          break;
        }
        case 'save_system_bans': {
          const cur = cpBanSystems();
          cur.systems = Object.assign({}, cur.systems, payload.os || {});
          cpSettingsSet({ banssystems: cur });
          socket.emit('savedone', { msg: 'تم حفظ حظر الأنظمة' });
          io.emit('banssystem-updated', cur);
          break;
        }
        case 'shrt_add': {
          const list = cpShortcuts();
          const name = String(payload.name || '').trim();
          if (name && !list.some((x) => x.name === name)) list.push({ name, value: String(payload.value || '') });
          cpSettingsSet({ shrt: list });
          socket.emit('savedone', { msg: 'تمت إضافة الاختصار' });
          io.emit('shortcuts:updated', list);
          break;
        }
        case 'shrt_del': {
          const list = cpShortcuts().filter((x) => x.name !== String(payload.name || ''));
          cpSettingsSet({ shrt: list });
          socket.emit('savedone', { msg: 'تم حذف الاختصار' });
          io.emit('shortcuts:updated', list);
          break;
        }
        case 'subs_add': {
          if (db.subscriptions && payload.iduser) db.subscriptions.create({ iduser: String(payload.iduser), topic: String(payload.topic || ''), topic1: String(payload.topic1 || ''), sub: String(payload.sub || ''), time: String(payload.time || ''), timeis: payload.timeis || Date.now() });
          socket.emit('savedone', { msg: 'تمت إضافة الاشتراك' });
          socket.emit('message', { cmd: 'subslist', data: cpSubs() });
          break;
        }
        case 'subs_del': {
          if (db.subscriptions) db.subscriptions.deleteOne({ iduser: String(payload.iduser) });
          socket.emit('savedone', { msg: 'تم حذف الاشتراك' });
          socket.emit('message', { cmd: 'subslist', data: cpSubs() });
          break;
        }
        case 'msg_add': {
          const list = cpMsgs();
          list.push({ category: String(payload.category || 'w'), adresse: String(payload.adresse || ''), msg: String(payload.msg || '') });
          cpSettingsSet({ msgs: list });
          socket.emit('savedone', { msg: 'تمت إضافة الرسالة' });
          socket.emit('message', { cmd: 'msgslist', data: cpMsgs() });
          break;
        }
        case 'msg_del': {
          const list = cpMsgs().filter((m) => !(m.adresse === String(payload.adresse || '') && m.msg === String(payload.msg || '')));
          cpSettingsSet({ msgs: list });
          socket.emit('savedone', { msg: 'تم حذف الرسالة' });
          socket.emit('message', { cmd: 'msgslist', data: cpMsgs() });
          break;
        }
        case 'reload_site': { cpRecordAudit('reload_site', null); socket.emit('savedone', { msg: 'تم إعادة التشغيل' }); cpReloadSite(); break; }
        case 'backup': { cpRecordAudit('backup', null); socket.emit('savedone', { msg: 'تم إنشاء النسخة الاحتياطية' }); cpBackupData(); break; }
        case 'restore': { cpRecordAudit('restore', null); const ok = cpRestoreData(); socket.emit('savedone', { msg: ok ? 'تمت الاستعادة' : 'لا توجد نسخة احتياطية' }); if (ok) cpReloadSite(); break; }
        case 'delete_actions': { if (db.auditlog) db.auditlog.drop(); socket.emit('savedone', { msg: 'تم حذف سجل الإجراءات' }); break; }
        case 'get_system_health': {
          socket.emit('system_health', {
            connectedUsers: onlineSockets.size,
            onlineCount: onlineSockets.size,
            activeRooms: db.rooms.getAll().length,
            roomsOnline: db.rooms.getAll().length,
            dbStatus: 'memory',
            memory: { rss: process.memoryUsage().rss, heap: process.memoryUsage().heapUsed },
            uptime: Math.floor(process.uptime()),
            node: process.version,
          });
          break;
        }
        case 'get_auditlog': {
          socket.emit('auditlog', cpAuditlog().map((a) => ({ when: a.when, actor: a.actor, action: a.action, target: a.target, before: a.before, after: a.after })));
          break;
        }
        case 'get_user': {
          if (payload.topic) {
            const q = String(payload.topic);
            const u = db.users.findOne({ topic: q }) || db.users.findOne({ username: q }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === q.toLowerCase());
            socket.emit('user_data', u ? { topic: u.topic, username: u.username, ip: u.ip || '', fp: u.fp || '', power: u.power || 'user', rep: u.rep || 0, likes: u.likes || 0 } : null);
          } else {
            socket.emit('user_data', null);
          }
          break;
        }
        case 'get_fps': {
          const q = String((payload && payload.search) || '').trim().toLowerCase();
          let list = db.users ? (db.users.find({}) || []).filter((u) => u.fp) : [];
          if (q) list = list.filter((u) => String(u.topic || '').toLowerCase().indexOf(q) !== -1 || String(u.username || '').toLowerCase().indexOf(q) !== -1 || String(u.fp || '').indexOf(q) !== -1 || String(u.ip || '').indexOf(q) !== -1);
          socket.emit('fpslist', list.slice(0, 200).map((u) => ({ topic: u.topic, username: u.username, fp: u.fp || '', fp2: u.fp2 || '', deviceInfo: u.deviceInfo || '', ip: u.ip || '', rep: u.rep || 0, likes: u.likes || 0, time: u.lastSeen || u.created || '' })));
          break;
        }
        case 'delete_fps': {
          // FPS list is built from user fingerprints; clearing it clears fp on
          // every user (and drops the legacy logs collection when present).
          if (db.users) (db.users.find({}) || []).forEach((u) => { if (u.fp) db.users.updateOne({ id: u.id }, { $set: { fp: '' } }); });
          if (db.logs) db.logs.drop();
          socket.emit('savedone', { msg: 'تم حذف سجل الدخول' });
          break;
        }
        case 'fltr_add': {
          if (db.noletters && payload.value) db.noletters.create({ v: payload.value, type: payload.type || 'bmsgs' });
          socket.emit('savedone', { msg: 'تمت إضافة الكلمة' });
          socket.emit('message', { cmd: 'noletters', data: db.noletters ? db.noletters.getAll() : [] });
          break;
        }
        case 'fltr_del': {
          if (db.noletters) db.noletters.deleteOne({ v: payload.value });
          socket.emit('savedone', { msg: 'تم حذف الكلمة' });
          socket.emit('message', { cmd: 'noletters', data: db.noletters ? db.noletters.getAll() : [] });
          break;
        }

        // ── CP Group 1: Live user management (online list, kick, mute, ban) ──
        case 'get_online_users': {
          const users = [];
          onlineSockets.forEach((u, sid) => {
            users.push({
              sid,
              id: u.uid || u.guestId || u.userId || '',
              username: u.username,
              type: u.type,
              roomid: u.roomid || GENERAL_ROOM_ID,
              roomName: (() => { const rr = db.rooms.findOne({ id: String(u.roomid || GENERAL_ROOM_ID) }); return rr ? rr.name : ''; })(),
              ip: (() => { try { const sk = io.sockets.sockets.get(sid); return sk ? socketIp(sk) : ''; } catch (e) { return ''; } })(),
              power: u.rank || u.power || 'user',
              isAdmin: u.isAdmin === true || u.rank === 'admin',
              idle: !!u.isIdle,
              guest: u.type === 'guest',
            });
          });
          socket.emit('message', { cmd: 'online_usrs', data: users });
          break;
        }
        case 'cp_kick_user': {
          const name = String(payload.name || '').toLowerCase();
          let kicked = 0;
          onlineSockets.forEach((u, sid) => {
            if (u.username && String(u.username).toLowerCase() === name) {
              const sk = io.sockets.sockets.get(sid);
              if (sk) { try { sk.emit('kicked', { reason: String(payload.reason || 'تم طردك من قبل الإدارة') }); sk.disconnect(true); } catch (e) {} }
              onlineSockets.delete(sid); socketSession.delete(sid);
              kicked++;
            }
          });
          if (kicked) broadcastPresence();
          cpRecordAudit('kick_user', String(payload.name), null, { sockets: kicked });
          socket.emit('savedone', { msg: kicked ? 'تم طرد ' + payload.name + ' (' + kicked + ' جلسة)' : 'لا يوجد مستخدم متصل بهذا الاسم' });
          break;
        }
        case 'cp_mute_user': {
          const name = String(payload.name || '') || '';
          const roomId = String(payload.roomId || '').toLowerCase();
          const ms = Math.max(60 * 1000, parseInt(payload.ms, 10) || 60 * 1000);
          if (name) {
            const rm = roomMutes.get(roomId) || new Map();
            rm.set(String(name).toLowerCase(), { until: Date.now() + ms });
            roomMutes.set(roomId, rm);
            onlineSockets.forEach((u, sid) => { if (u.username && String(u.username).toLowerCase() === String(name).toLowerCase()) { const sk = io.sockets.sockets.get(sid); if (sk) sk.emit('muted', { seconds: Math.ceil(ms / 1000), reason: String(payload.reason || 'تم كتم صوتك') }); } });
            cpRecordAudit('mute_user', name, null, { room: roomId, ms });
            socket.emit('savedone', { msg: 'تم كتم ' + name });
          } else {
            socket.emit('error-msg', { msg: 'أدخل اسم المستخدم' });
          }
          break;
        }
        case 'cp_unmute_user': {
          const name = String(payload.name || '').toLowerCase();
          const roomId = String(payload.roomId || '').toLowerCase();
          if (roomMutes.has(roomId)) {
            const rm = roomMutes.get(roomId);
            rm.delete(name);
            if (rm.size === 0) roomMutes.delete(roomId);
          }
          onlineSockets.forEach((u, sid) => { if (u.username && String(u.username).toLowerCase() === name) { const sk = io.sockets.sockets.get(sid); if (sk) sk.emit('unmuted', {}); } });
          cpRecordAudit('unmute_user', String(payload.name));
          socket.emit('savedone', { msg: 'تم رفع الكتم' });
          break;
        }
        case 'cp_ban_online': {
          const name = String(payload.name || '') || '';
          const target = db.users.findOne({ topic: name }) || db.users.findOne({ username: name }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(name).toLowerCase());
          if (target) {
            const rec = { _id: crypto.randomBytes(8).toString('hex'), id: crypto.randomBytes(8).toString('hex'), device_band: target.fp || '', device_band2: target.fp2 || '', ip_band: target.ip || '', date: new Date().toISOString(), name_band: String(payload.reason || 'حظر من لوحة التحكم') };
            if (db.bands) db.bands.create(rec);
            cpRecordAudit('ban_user', name, null, rec.name_band);
          }
          onlineSockets.forEach((u, sid) => {
            if (u.username && String(u.username).toLowerCase() === String(name).toLowerCase()) {
              const sk = io.sockets.sockets.get(sid);
              if (sk) { try { sk.emit('banned', { reason: 'تم حظرك من قبل الإدارة' }); sk.disconnect(true); } catch (e) {} }
              onlineSockets.delete(sid); socketSession.delete(sid);
            }
          });
          broadcastPresence();
          socket.emit('savedone', { msg: 'تم حظر ' + name });
          break;
        }

        // ── CP Group 2: Full profile editing ─────────────────────────────
        case 'get_user_profile': {
          const q = String(payload.topic || payload.name || '');
          const u = db.users.findOne({ topic: q }) || db.users.findOne({ username: q }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(q).toLowerCase());
          if (!u) { socket.emit('message', { cmd: 'user_profile', data: null }); break; }
          socket.emit('message', { cmd: 'user_profile', data: {
            id: u.id, topic: u.topic, username: u.username, power: u.power || 'user',
            ip: u.ip || '', fp: u.fp || '', created: u.created || '', lastSeen: u.lastSeen || '',
            rep: u.rep || 0, likes: u.likes || 0, coins: u.coins || 0, wallPoints: u.wallPoints || 0,
            verified: !!u.verified, memberShip: u.memberShip || 'free', isAdmin: !!u.isAdmin,
            pic: u.pic || 'pic.png', co: u.co || '', country: u.country || '', msg: u.msg || '',
            ucol: u.ucol || '', mcol: u.mcol || '', bg: u.bg || '', email: u.email || '',
            gender: u.gender || '', birthdays: u.birthday || u.birthdates || '',
            group: u.group || { id: 0, name: '', roleRank: 0 },
          }});
          break;
        }
        case 'edit_user_profile': {
          const q = String(payload.original || payload.topic || payload.name || '');
          const u = db.users.findOne({ topic: q }) || db.users.findOne({ username: q }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(q).toLowerCase());
          if (!u) { socket.emit('error-msg', { msg: 'المستخدم غير موجود' }); break; }
          const isRoot = String(u.topic).toLowerCase() === String(config.adminUser || 'admin').toLowerCase();
          const set = {};
          if (payload.topic !== undefined) {
            const newTopic = sanitizeUsername(payload.topic, 30);
            if (newTopic && newTopic.toLowerCase() !== u.topic.toLowerCase()) {
              const clash = db.users.find({}).some((x) => x.id !== u.id && String(x.topic || '').toLowerCase() === newTopic.toLowerCase());
              if (clash) { socket.emit('error-msg', { msg: 'اسم المستخدم موجود مسبقاً' }); break; }
              set.topic = newTopic; set.username = newTopic;
            }
          }
          if (payload.power !== undefined && !isRoot) set.power = String(payload.power) === 'admin' ? 'admin' : String(payload.power || 'user');
          if (payload.isAdmin !== undefined && !isRoot) set.isAdmin = !!payload.isAdmin;
          if (payload.rep !== undefined) set.rep = Math.max(0, parseInt(payload.rep, 10) || 0);
          if (payload.likes !== undefined) set.likes = Math.max(0, parseInt(payload.likes, 10) || 0);
          if (payload.coins !== undefined) set.coins = Math.max(0, parseInt(payload.coins, 10) || 0);
          if (payload.wallPoints !== undefined) set.wallPoints = Math.max(0, parseInt(payload.wallPoints, 10) || 0);
          if (payload.verified !== undefined) set.verified = !!payload.verified;
          if (payload.memberShip !== undefined) set.memberShip = String(payload.memberShip || 'free');
          if (payload.co !== undefined) set.co = String(payload.co || '').substring(0, 3);
          if (payload.country !== undefined) set.country = String(payload.country || '').substring(0, 60);
          if (payload.msg !== undefined) set.msg = String(payload.msg || '').substring(0, 120);
          if (payload.gender !== undefined) set.gender = String(payload.gender || '');
          if (payload.email !== undefined) set.email = String(payload.email || '').substring(0, 120);
          if (payload.pic !== undefined) set.pic = String(payload.pic || 'pic.png').substring(0, 300);
          if (payload.password !== undefined && !isRoot) {
            const pw = String(payload.password || '').trim();
            if (pw.length >= 4) set.password = bcrypt.hashSync(pw, 10);
          }
          if (Object.keys(set).length) db.users.updateOne({ id: u.id }, { $set: set });
          syncPresenceStatsFor({ ...u, ...set });
          io.emit('user_updated', { id: u.id, username: set.topic || u.topic, topic: set.topic || u.topic, power: set.power || u.power, verified: set.verified !== undefined ? set.verified : !!u.verified, rep: set.rep !== undefined ? set.rep : (u.rep || 0), likes: set.likes !== undefined ? set.likes : (u.likes || 0), coins: set.coins !== undefined ? set.coins : (u.coins || 0), wallPoints: set.wallPoints !== undefined ? set.wallPoints : (u.wallPoints || 0) });
          broadcastPresence();
          cpRecordAudit('edit_user_profile', q, null, set);
          socket.emit('savedone', { msg: 'تم تحديث العضو' });
          break;
        }
        case 'cp_give_rep': {
          const q = String(payload.topic || payload.name || '');
          const val = parseInt(payload.value, 10) || 1;
          const u = db.users.findOne({ topic: q }) || db.users.findOne({ username: q }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === String(q).toLowerCase());
          if (!u) { socket.emit('error-msg', { msg: 'المستخدم غير موجود' }); break; }
          const r = Math.max(0, (u.rep || 0) + val);
          db.users.updateOne({ id: u.id }, { $set: { rep: r } });
          onlineSockets.forEach((o) => { if (o.username && String(o.username).toLowerCase() === String(u.topic || '').toLowerCase()) o.rep = r; });
          io.emit('user_updated', { id: u.id, username: u.topic, topic: u.topic, rep: r });
          socket.emit('savedone', { msg: 'تمت إضافة ' + val + ' نقاط شكر' });
          break;
        }

        // ── CP Group 3: Full room management ─────────────────────────────
        case 'get_room_profile': {
          const room = findRoomByAnyId(payload.id);
          if (!room) { socket.emit('message', { cmd: 'room_profile', data: null }); break; }
          socket.emit('message', { cmd: 'room_profile', data: { ...roomToClient(room), owner: room.owner || '', password: room.password || '', moderators: roomModeratorList(String(room.id)), roomBans: roomBans.get(String(room.id)) || [] } });
          break;
        }
        case 'edit_room_full': {
          const room = findRoomByAnyId(payload.id);
          if (!room) { socket.emit('error-msg', { msg: 'الغرفة غير موجودة' }); break; }
          const name = sanitizeRoomName(payload.name, 30);
          if (payload.name !== undefined && name) payload.name = name; else delete payload.name;
          roomApplyCommonFields({ body: payload }, room, null);
          if (payload.owner !== undefined) room.owner = String(payload.owner || '').substring(0, 30);
          if (payload.isActive !== undefined) room.isActive = !!payload.isActive;
          if (payload.isLocked !== undefined && payload.isLocked === false && !room.password) room.isLocked = false;
          db.rooms.updateOne({ id: room.id }, { $set: { ...room } });
          emitRoomUpdated(room.id);
          io.emit('rooms-stats', roomStats());
          cpRecordAudit('edit_room', room.name || String(room.id), null, payload);
          socket.emit('savedone', { msg: 'تم تحديث الغرفة' });
          break;
        }
        case 'add_room_moderator': {
          const room = findRoomByAnyId(payload.id);
          const modName = String(payload.username || '').trim();
          if (!room || !modName) { socket.emit('error-msg', { msg: 'بيانات غير مكتملة' }); break; }
          const list = roomModeratorList(String(room.id));
          if (!list.some((m) => String(m.username || m.topic || '').toLowerCase() === modName.toLowerCase())) {
            setRoomModerators(String(room.id), list.concat([{ userId: '', username: modName }]));
            socketModeratorSync(room.id);
            cpRecordAudit('room_add_mod', String(room.id), null, modName);
            socket.emit('savedone', { msg: 'تمت إضافة المشرف' });
          } else { socket.emit('savedone', { msg: 'المشرف موجود مسبقاً' }); }
          break;
        }
        case 'del_room_moderator': {
          const room = findRoomByAnyId(payload.id);
          const modName = String(payload.username || '').toLowerCase();
          if (!room || !modName) { socket.emit('error-msg', { msg: 'بيانات غير مكتملة' }); break; }
          const list = roomModeratorList(String(room.id)).filter((m) => String(m.username || m.topic || '').toLowerCase() !== modName);
          setRoomModerators(String(room.id), list);
          socketModeratorSync(room.id);
          cpRecordAudit('room_del_mod', String(room.id), null, payload.username);
          socket.emit('savedone', { msg: 'تمت إزالة المشرف' });
          break;
        }
        case 'clear_room_chat': {
          const room = findRoomByAnyId(payload.id);
          if (!room) { socket.emit('error-msg', { msg: 'الغرفة غير موجودة' }); break; }
          roomHistory.set(String(room.id), []);
          io.to('room:' + room.id).emit('room-chat-cleared', { roomId: String(room.id), username: 'admin', global: false });
          cpRecordAudit('clear_room_chat', room.name || String(room.id));
          socket.emit('savedone', { msg: 'تم مسح محادثة الغرفة' });
          break;
        }

        // ── CP Group 4: Content moderation (wall + stories) ──────────────
        case 'get_posts_moderation': {
          socket.emit('message', { cmd: 'posts_moderation', data: [...wallPosts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 120).map((p) => ({
            id: p.id, userId: p.userId, username: (p.user && (p.user.username || p.user.topic)) || ((p.guestInfo && p.guestInfo.username) || ''),
            text: (p.msg || p.text || '').substring(0, 120), mediaUrl: p.mediaUrl || '', likes: (p.wallLikes || []).length, comments: (p.comments || []).length, createdAt: p.createdAt,
          })) });
          break;
        }
        case 'get_stories_moderation': {
          socket.emit('message', { cmd: 'stories_moderation', data: [...stories].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 120).map((s) => ({
            id: s.id, userId: s.userId, username: (s.user && (s.user.username || s.user.topic)) || '', text: (s.text || '').substring(0, 80), img: s.img || s.mediaUrl || '', views: (s.views || []).length, likes: (s.likes || []).length, createdAt: s.createdAt,
          })) });
          break;
        }
        case 'del_post': {
          const idx = wallPosts.findIndex((p) => String(p.id) === String(payload.postId));
          if (idx === -1) { socket.emit('error-msg', { msg: 'المنشور غير موجود' }); break; }
          const p = wallPosts[idx];
          wallPosts.splice(idx, 1);
          persistWall();
          io.emit('wall-update', { type: 'delete', postId: p.id });
          if (p.mediaUrl && canDeleteUploadedFile(p.mediaUrl, p.userId)) { try { fs.unlinkSync(path.join(uploadDir, path.basename(p.mediaUrl.split('?')[0]))); } catch (e) {} }
          cpRecordAudit('del_post', p.id, null, (p.user && p.user.username) || '');
          socket.emit('savedone', { msg: 'تم حذف المنشور' });
          break;
        }
        case 'del_story': {
          const idx = stories.findIndex((s) => String(s.id) === String(payload.storyId));
          if (idx === -1) { socket.emit('error-msg', { msg: 'الستوري غير موجود' }); break; }
          const s = stories[idx];
          stories.splice(idx, 1);
          persistStories();
          if (s.img && canDeleteUploadedFile(s.img, s.userId)) { try { fs.unlinkSync(path.join(uploadDir, path.basename(s.img.split('?')[0]))); } catch (e) {} }
          io.emit('stories:updated', { stories: [...stories].slice(0, 20) });
          cpRecordAudit('del_story', s.id, null, (s.user && s.user.username) || '');
          socket.emit('savedone', { msg: 'تم حذف الستوري' });
          break;
        }
        case 'del_comment': {
          const p = wallPosts.find((x) => String(x.id) === String(payload.postId));
          if (!p) { socket.emit('error-msg', { msg: 'المنشور غير موجود' }); break; }
          p.comments = (p.comments || []).filter((c) => String(c.id) !== String(payload.commentId));
          persistWall();
          io.emit('wall-update', { type: 'comment', postId: p.id, commentCount: p.comments.length, comment: p.comments.length ? p.comments[p.comments.length - 1] : null });
          cpRecordAudit('del_comment', String(payload.postId), null, payload.commentId);
          socket.emit('savedone', { msg: 'تم حذف التعليق' });
          break;
        }

        // ── CP Group 6: Addons (super icons / gifts) + story bans ────────
        case 'get_addons': {
          const custom = addonAssets().filter((x) => x && x.url).map((x) => ({ url: x.url, type: x.type === 'gift' ? 'gift' : 'super_icon', name: x.name || '' }));
          socket.emit('message', { cmd: 'addons', data: custom.length ? custom : defaultSuperIcons });
          break;
        }
        case 'addon_add': {
          const type = payload.type === 'gift' ? 'gift' : 'super_icon';
          const url = String(payload.url || '').trim().substring(0, 300);
          if (!url) { socket.emit('error-msg', { msg: 'رابط الصورة مطلوب' }); break; }
          const name = String(payload.name || '').trim().substring(0, 60) || (type === 'gift' ? 'هدية' : 'أيقونة');
          const arr = addonAssets().slice();
          arr.push({ url, type, name });
          cpSettingsSet({ addons: arr });
          socket.emit('savedone', { msg: 'تمت إضافة الإضافة' });
          const custom2 = arr.filter((x) => x && x.url).map((x) => ({ url: x.url, type: x.type === 'gift' ? 'gift' : 'super_icon', name: x.name || '' }));
          socket.emit('message', { cmd: 'addons', data: custom2 });
          cpRecordAudit('addon_add', type, null, url);
          break;
        }
        case 'addon_del': {
          const url = String(payload.url || '');
          const arr = addonAssets().filter((x) => x && x.url !== url);
          cpSettingsSet({ addons: arr });
          socket.emit('savedone', { msg: 'تم حذف الإضافة' });
          const custom3 = arr.filter((x) => x && x.url).map((x) => ({ url: x.url, type: x.type === 'gift' ? 'gift' : 'super_icon', name: x.name || '' }));
          socket.emit('message', { cmd: 'addons', data: custom3 });
          cpRecordAudit('addon_del', url.substring(0, 80), null, null);
          break;
        }

        // ── CP Group 7: Feature toggles / tickers / badges / login behavior ──
        case 'get_features': {
          socket.emit('message', { cmd: 'features_data', data: featuresSettings() });
          break;
        }
        case 'set_features': {
          const savedF = featuresSave(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ الميزات' });
          socket.emit('message', { cmd: 'features_data', data: savedF });
          io.emit('features-updated', savedF);
          cpRecordAudit('set_features', '', null, payload);
          break;
        }
        case 'get_tickers': {
          socket.emit('message', { cmd: 'tickers_data', data: { news: newsTickerSettings(), ads: adsTickerSettings() } });
          break;
        }
        case 'set_news_ticker': {
          const savedN = newsTickerSave(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ الشريط الإخباري' });
          socket.emit('message', { cmd: 'tickers_data', data: { news: savedN, ads: adsTickerSettings() } });
          io.emit('news-ticker-updated', savedN);
          cpRecordAudit('set_news_ticker', '', null, payload);
          break;
        }
        case 'set_ads_ticker': {
          const savedA = adsTickerSave(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ شريط الإعلانات' });
          socket.emit('message', { cmd: 'tickers_data', data: { news: newsTickerSettings(), ads: savedA } });
          cpRecordAudit('set_ads_ticker', '', null, { enabled: !!(payload && payload.settings && payload.settings.enabled), count: Array.isArray(payload && payload.ads) ? payload.ads.length : null });
          break;
        }
        case 'get_badges_cp': {
          socket.emit('message', { cmd: 'badges_data', data: badgeConfigGet() });
          break;
        }
        case 'set_badges': {
          const savedB = badgeConfigSave(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ الأوسمة' });
          socket.emit('message', { cmd: 'badges_data', data: savedB });
          cpRecordAudit('set_badges', '', null, payload);
          break;
        }
        case 'get_login_behavior': {
          socket.emit('message', { cmd: 'login_behavior_data', data: loginBehaviorSettings() });
          break;
        }
        case 'set_login_behavior': {
          const savedL = loginBehaviorSave(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ سلوك الدخول' });
          socket.emit('message', { cmd: 'login_behavior_data', data: savedL });
          cpRecordAudit('set_login_behavior', '', null, payload);
          break;
        }

        case 'get_global_limits': {
          socket.emit('message', { cmd: 'global_limits_data', data: globalLimitsGet() });
          break;
        }
        case 'set_global_limits': {
          const savedGl = globalLimitsSet(payload || {});
          socket.emit('savedone', { msg: 'تم حفظ حدود الرسائل' });
          socket.emit('message', { cmd: 'global_limits_data', data: savedGl });
          io.emit('global-limits', savedGl);
          cpRecordAudit('set_global_limits', '', null, savedGl);
          break;
        }

        // ── CP Group 8: Zajel management (in-memory lists) ─────────────────
        case 'zajel_cp_list': {
          socket.emit('message', { cmd: 'zajel_cp_data', data: { approved: zajelApproved.slice(0, 100), pending: zajelPending.slice(0, 200) } });
          break;
        }
        case 'zajel_cp_add': {
          const ztext = String(payload.message || payload.text || '').trim().substring(0, 150);
          if (!ztext) { socket.emit('error-msg', { msg: 'أدخل نص الرسالة' }); break; }
          const zApproved = { id: zajelIdSeq.approved++, message: ztext };
          zajelApproved.unshift(zApproved);
          if (zajelApproved.length > 100) zajelApproved.length = 100;
          io.emit('zajel:new', zApproved);
          socket.emit('savedone', { msg: 'تم نشر رسالة الزاجل' });
          socket.emit('message', { cmd: 'zajel_cp_data', data: { approved: zajelApproved.slice(0, 100), pending: zajelPending.slice(0, 200) } });
          cpRecordAudit('zajel_cp_add', '', null, ztext);
          break;
        }
        case 'zajel_cp_approve': {
          const zid1 = Number(payload.id);
          const zi = zajelPending.findIndex((p) => Number(p.id) === zid1);
          if (zi !== -1) {
            const zPending = zajelPending.splice(zi, 1)[0];
            const zAppr = { id: zajelIdSeq.approved++, message: zPending.message };
            zajelApproved.unshift(zAppr);
            if (zajelApproved.length > 100) zajelApproved.length = 100;
            io.emit('zajel:new', zAppr);
            io.emit('zajel:moderation-resolved', { id: zid1 });
            cpRecordAudit('zajel_cp_approve', String(zid1), null, zPending.message);
          }
          socket.emit('message', { cmd: 'zajel_cp_data', data: { approved: zajelApproved.slice(0, 100), pending: zajelPending.slice(0, 200) } });
          break;
        }
        case 'zajel_cp_del': {
          const zid2 = Number(payload.id);
          const zList = payload.list === 'pending' ? zajelPending : zajelApproved;
          const zi2 = zList.findIndex((mm) => Number(mm.id) === zid2);
          if (zi2 !== -1) zList.splice(zi2, 1);
          if (payload.list !== 'pending') io.emit('zajel:delete', { id: zid2 });
          socket.emit('message', { cmd: 'zajel_cp_data', data: { approved: zajelApproved.slice(0, 100), pending: zajelPending.slice(0, 200) } });
          cpRecordAudit('zajel_cp_del', (payload.list || 'approved') + ':' + zid2, null, null);
          break;
        }
        case 'zajel_cp_clear': {
          if (payload.list === 'pending') zajelPending.length = 0;
          else { zajelApproved.length = 0; io.emit('zajel:list', { messages: [] }); }
          socket.emit('savedone', { msg: 'تم المسح' });
          socket.emit('message', { cmd: 'zajel_cp_data', data: { approved: zajelApproved.slice(0, 100), pending: zajelPending.slice(0, 200) } });
          cpRecordAudit('zajel_cp_clear', String(payload.list || 'approved'), null, null);
          break;
        }

        // ── CP Group 9: Emoji item manager (per-item ops over doc.emo) ─────
        case 'emo_item_add': {
          const eshortcut = String(payload.shortcut || '').trim().substring(0, 12);
          const eurl = String(payload.url || '').trim().substring(0, 300);
          if (!eshortcut || !eurl) { socket.emit('error-msg', { msg: 'الاختصار والصورة مطلوبان' }); break; }
          const emoArr = (Array.isArray(cpSettingsDoc().emo) ? cpSettingsDoc().emo : []).filter((e) => e && String(e.shortcut || '') !== eshortcut);
          // Normalize legacy entries (missing type) so the picker can always
          // categorize items; new items default to smiley.
          const emoNorm = emoArr.map((e) => Object.assign({}, e, { type: e.type === 'sticker' ? 'sticker' : 'smiley' }));
          emoNorm.push({ shortcut: eshortcut, url: eurl, order: emoNorm.length + 1, type: String(payload.type || 'smiley') });
          cpSettingsSet({ emo: emoNorm });
          io.emit('smileys:updated', emoNorm);
          socket.emit('savedone', { msg: 'تمت إضافة الابتسامة' });
          socket.emit('message', { cmd: 'emos', data: emoNorm });
          cpRecordAudit('emo_item_add', eshortcut, null, eurl);
          break;
        }
        case 'emo_item_del': {
          const dshortcut = String(payload.shortcut || '');
          const emoArr2 = (Array.isArray(cpSettingsDoc().emo) ? cpSettingsDoc().emo : []).filter((e) => e && String(e.shortcut || '') !== dshortcut);
          cpSettingsSet({ emo: emoArr2 });
          io.emit('smileys:updated', emoArr2);
          socket.emit('savedone', { msg: 'تم حذف الابتسامة' });
          socket.emit('message', { cmd: 'emos', data: emoArr2 });
          cpRecordAudit('emo_item_del', dshortcut, null, null);
          break;
        }
        case 'assign_super_icon':
        case 'remove_super_icon':
        case 'assign_gift':
        case 'remove_gift': {
          const idKey = String(payload.userId || payload.topic || '');
          const doc = db.users.findOne({ id: idKey }) || db.users.findOne({ topic: idKey }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === idKey.toLowerCase());
          if (!doc) { socket.emit('error-msg', { msg: 'المستخدم غير موجود' }); break; }
          const isGiftCmd = a.cmd.indexOf('gift') !== -1;
          if (a.cmd === 'assign_super_icon') {
            const iconUrl = String(payload.iconUrl || '').substring(0, 300);
            if (!iconUrl) { socket.emit('error-msg', { msg: 'رابط الأيقونة مطلوب' }); break; }
            db.users.updateOne({ id: doc.id }, { $set: { superIcon: iconUrl } });
            emitUserAddonsUpdated({ ...doc, superIcon: iconUrl });
          } else if (a.cmd === 'remove_super_icon') {
            db.users.updateOne({ id: doc.id }, { $set: { superIcon: '' } });
            emitUserAddonsUpdated({ ...doc, superIcon: '' });
          } else if (a.cmd === 'assign_gift') {
            const giftUrl = String(payload.giftUrl || '').substring(0, 300);
            if (!giftUrl) { socket.emit('error-msg', { msg: 'رابط الهدية مطلوب' }); break; }
            const gifts = Array.isArray(doc.gifts) ? doc.gifts.slice() : [];
            if (gifts.indexOf(giftUrl) === -1) gifts.push(giftUrl);
            db.users.updateOne({ id: doc.id }, { $set: { gifts } });
            emitUserAddonsUpdated({ ...doc, gifts });
          } else {
            const giftUrl = String(payload.giftUrl || '');
            const gifts = Array.isArray(doc.gifts) ? doc.gifts.filter((g) => g !== giftUrl) : [];
            db.users.updateOne({ id: doc.id }, { $set: { gifts } });
            emitUserAddonsUpdated({ ...doc, gifts });
          }
          cpRecordAudit(a.cmd, doc.topic, null, isGiftCmd ? String(payload.giftUrl || '') : String(payload.iconUrl || ''));
          socket.emit('savedone', { msg: 'تم تحديث إضافات العضو' });
          break;
        }
        case 'get_story_bans': {
          socket.emit('message', { cmd: 'story_bans', data: [...storyBans] });
          break;
        }
        case 'set_story_ban': {
          const sid2 = String(payload.userId || '');
          if (sid2) {
            if (payload.banned) storyBans.add(sid2); else storyBans.delete(sid2);
            persistStoryBans();
            cpRecordAudit('set_story_ban', sid2, null, !!payload.banned);
          }
          socket.emit('savedone', { msg: payload.banned ? 'تم حظر القصص' : 'تم رفع حظر القصص' });
          socket.emit('message', { cmd: 'story_bans', data: [...storyBans] });
          break;
        }

        // ── CP Group 5: Broadcast / announcement ─────────────────────────
        case 'broadcast_msg': {
          const text = String(payload.msg || '').trim().substring(0, 500);
          if (!text) { socket.emit('error-msg', { msg: 'أدخل نص الإعلان' }); break; }
          io.emit('admin:broadcast', { msg: text });
          io.emit('alert:show', { text });
          cpRecordAudit('broadcast_msg', null, null, text.substring(0, 80));
          socket.emit('savedone', { msg: 'تم بث الإعلان للجميع' });
          break;
        }
        case 'reload_site':
        case 'clear_room_chat_legacy':
        default: {
          if (a.cmd === 'reload_site') { cpRecordAudit('reload_site', null); socket.emit('savedone', { msg: 'تم إعادة التشغيل' }); cpReloadSite(); break; }
          socket.emit('error-msg', { msg: 'أمر غير معروف: ' + String(a.cmd) });
          break;
        }
      }
      return;
    }
  });

  socket.on('getstate', () => {
    if (socket.isAdmin) {
      const siteweb = cpSettingsDoc().siteweb || {};
      const s = cpSettingsDoc();
      socket.emit('getstate', { siteweb, dro3: s.dro3 || [], emos: s.emo || [], sicos: s.sico || [], powers: cpPowers(), noletters: db.noletters ? db.noletters.getAll() : [], zaker: db.zakrfa ? db.zakrfa.getAll() : [], users_data: (db.users.find({}) || []).map((u) => ({ topic: u.topic, username: u.username, power: u.power || 'user', ip: u.ip || '', fp: u.fp || '', fp2: u.fp2 || '', deviceInfo: u.deviceInfo || '', rep: u.rep || 0, likes: u.likes || 0, verified: !!u.verified, coins: u.coins || 0, wallPoints: u.wallPoints || 0, id: u.id })), rlist: (db.rooms.getAll() || []).map(roomToClient), bandList: db.bands ? db.bands.getAll() : [], blockList: [], shrtlist: cpShortcuts(), msgslist: cpMsgs(), subslist: cpSubs() });
    }
  });

  // ── Admin member actions: kick / ban (from profile context menu) ────────
  const findOnlineByUsername = (name) => {
    if (!name) return null;
    const uname = String(name);
    let hit = null;
    onlineSockets.forEach((t) => { if (t.username === uname) hit = t; });
    return hit;
  };
  const socketIdForUser = (u) => { let sid = null; onlineSockets.forEach((v, k) => { if (v === u) sid = k; }); return sid; };
  const socketIdForTarget = (u) => socketIdForUser(u);
  const isGlobalAdminMe = () => { const me = findSocketUser(socket.id); return me ? permissionsFor(me).isAdmin : false; };

  socket.on('kick-user', (data) => {
    if (!isGlobalAdminMe()) return;
    const target = findOnlineByUsername(data && data.targetUsername);
    if (!target) return;
    const tSocket = socketIdForUser(target);
    if (tSocket) io.to(tSocket).emit('kicked', { reason: 'تم طردك من الشات بواسطة الإدارة' });
    io.emit('system-message', { message: 'تم طرد العضو ' + target.username + ' من الشات', content: 'تم طرد العضو ' + target.username + ' من الشات', title: 'طرد' });
  });

  socket.on('room-kick-user', (data) => {
    if (!isGlobalAdminMe()) return;
    const target = findOnlineByUsername(data && data.targetUsername);
    if (!target) return;
    const roomId = data && data.roomId !== undefined ? data.roomId : GENERAL_ROOM_ID;
    const previousRoom = target.roomid;
    target.roomid = null;
    broadcastPresence();
    const tSocket = socketIdForUser(target);
    if (tSocket) io.to(tSocket).emit('kicked', { reason: 'تم طردك من الغرفة' });
    if (previousRoom != null) broadcastJoinLeave(target, 'leave', previousRoom);
  });

  socket.on('ban-user', (data) => {
    if (!isGlobalAdminMe()) return;
    const name = (data && (data.username || data.targetUsername)) || '';
    const target = findOnlineByUsername(name);
    const reason = (data && data.reason) || 'مخالفة القوانين';
    if (target) {
      const tSocket = socketIdForUser(target);
      const isPermanent = (data && data.type) !== 'temporary';
      if (tSocket) io.to(tSocket).emit('banned', { reason, expiresAt: isPermanent ? null : new Date(Date.now() + 6 * 3600 * 1000).toISOString() });
      try { db.bands.create({ device_band: target.fp || '', device_band2: target.fp2 || '', ip_band: target.ip || '', date: new Date().toISOString(), name_band: reason }); } catch (e) {}
      io.emit('system-message', { message: 'تم حظر العضو ' + name + ' (' + reason + ')', content: 'تم حظر العضو ' + name + ' (' + reason + ')', title: 'حظر' });
    }
  });

  socket.on('room-ban-user', (data) => {
    if (!isGlobalAdminMe()) return;
    const target = findOnlineByUsername(data && data.targetUsername);
    const roomId = (data && data.roomId !== undefined ? data.roomId : GENERAL_ROOM_ID);
    if (!target) return;
    const previousRoom = target.roomid;
    const banId = nextId('rb_');
    const list = roomBans.get(String(roomId)) || [];
    list.push({ id: banId, userId: target.uid || target.guestId, username: target.username, reason: data && data.reason || 'مخالفة القوانين', until: null });
    roomBans.set(String(roomId), list);
    target.roomid = null;
    broadcastPresence();
    const tSocket = socketIdForTarget(target);
    if (tSocket) io.to(tSocket).emit('kicked', { reason: 'تم حظرك من الغرفة' });
    if (previousRoom) broadcastJoinLeave(target, 'leave', previousRoom);
    io.emit('room-bans-list', list);
  });

  // ── Voice mesh (mic raise/lower + WebRTC signaling) ─────────────────────
  const vuser = () => findSocketUser(socket.id);
  const vroom = () => (vuser() && vuser().roomid) || GENERAL_ROOM_ID;

  socket.emit('voice:config', { iceServers: config.buildIceServers(), maxSpeakers: config.maxVoiceSpeakers });

  socket.on('voice:state', (data) => {
    const rid = (data && data.roomId !== undefined) ? data.roomId : vroom();
    socket.emit('voice:state', { roomId: Number(rid), mics: roomMicState(rid) });
  });

  socket.on('voice:active-users', () => socket.emit('voice:active-users', { roomId: vroom(), speakers: Object.values(roomMicState(vroom())), max: config.maxVoiceSpeakers }));

  socket.on('voice:take-mic', (data, ack) => {
    const u = vuser();
    if (!u) { if (ack) ack({ ok: false, reason: 'unauthenticated' }); return; }
    const gate = likeGate(u, 'mic');
    if (!gate.ok) { if (ack) ack({ ok: false, reason: likeGateMessage('mic', gate) }); return; }
    const roomId = (data && data.roomId !== undefined) ? data.roomId : vroom();
    const micIndex = data && data.micIndex;
    if (micIndex === undefined || micIndex === null) { if (ack) ack({ ok: false, reason: 'bad-index' }); return; }
    const key = String(roomId);
    const mics = roomMicState(roomId);
    // Free previous slot under same socket
    const prev = voiceUsers.get(socket.id);
    if (prev) freeMicFor(prev.roomId, prev.micIndex);
    const existing = mics[micIndex];
    if (existing && existing.socketId !== socket.id) { if (ack) ack({ ok: false, reason: 'mic-busy' }); return; }
    if (!voiceMics.has(key)) voiceMics.set(key, {});
    const session = 'vs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    voiceMics.get(key)[micIndex] = { socketId: socket.id, voiceSessionId: session, username: u.username, userId: u.uid || u.guestId, isMutedSelf: false };
    voiceUsers.set(socket.id, { roomId: key, micIndex, voiceSessionId: session });
    broadcastRoomState(roomId);
    if (ack) ack({ ok: true, voiceSessionId: session });
  });

  socket.on('voice:move-mic', (data, ack) => {
    const u = vuser();
    if (!u) { if (ack) ack({ ok: false, reason: 'unauthenticated' }); return; }
    const roomId = (data && data.roomId !== undefined) ? data.roomId : vroom();
    const toMicIndex = data && data.toMicIndex;
    if (toMicIndex === undefined) { if (ack) ack({ ok: false, reason: 'bad-index' }); return; }
    const prev = voiceUsers.get(socket.id);
    if (!prev) { if (ack) ack({ ok: false, reason: 'not-on-mic' }); return; }
    const mics = voiceMics.get(String(roomId));
    if (mics && mics[toMicIndex] && mics[toMicIndex].socketId !== socket.id) { if (ack) ack({ ok: false, reason: 'mic-busy' }); return; }
    const session = prev.voiceSessionId;
    if (mics) { delete mics[prev.micIndex]; mics[toMicIndex] = { socketId: socket.id, voiceSessionId: session, username: u.username, userId: u.uid || u.guestId, isMutedSelf: false }; }
    voiceUsers.set(socket.id, { roomId: String(roomId), micIndex: toMicIndex, voiceSessionId: session });
    broadcastRoomState(roomId);
    if (ack) ack({ ok: true, voiceSessionId: session });
  });

  socket.on('voice:leave-mic', (data) => {
    const roomId = (data && data.roomId !== undefined) ? data.roomId : vroom();
    const micIndex = data && data.micIndex;
    freeMicFor(roomId, micIndex);
  });

  socket.on('voice:toggle-mute-self', (data) => {
    const micIndex = data && data.micIndex;
    const mics = roomMicState(data && data.roomId !== undefined ? data.roomId : vroom());
    if (mics[micIndex] && mics[micIndex].socketId === socket.id) { mics[micIndex].isMutedSelf = !!(data && data.isMuted); broadcastRoomState(data && data.roomId !== undefined ? data.roomId : vroom()); }
  });

  socket.on('voice:signal', (data) => {
    const u = vuser();
    if (!u || !data || !data.targetSocketId) return;
    const target = io.sockets.sockets.get(String(data.targetSocketId)) || null;
    const payload = { senderSocketId: socket.id, signalData: data.signalData, voiceSessionId: data.voiceSessionId };
    if (target) target.emit('voice:signal', payload);
  });

  socket.on('voice:kick-from-mic', (data) => {
    const me = vuser();
    if (!me || !permissionsFor(me).isAdmin) return;
    const micIndex = data && data.micIndex;
    const rid = (data && data.roomId !== undefined) ? data.roomId : vroom();
    const entry = roomMicState(rid)[micIndex];
    const targetSock = entry ? io.sockets.sockets.get(String(entry.socketId)) : null;
    if (targetSock) targetSock.emit('voice:cleanup');
    freeMicFor(rid, micIndex);
  });

  socket.on('voice:pull-from-mic', (data, ack) => {
    const me = vuser();
    const micIndex = data && data.micIndex;
    const rid = (data && data.roomId !== undefined) ? data.roomId : vroom();
    const entry = roomMicState(rid)[micIndex];
    if (entry && entry.socketId === socket.id) { if (ack) ack({ ok: false, reason: 'can\'t pull headset' }); return; }
    if (me && !permissionsFor(me).isAdmin) { if (ack) ack({ ok: false, reason: 'no-permission' }); return; }
    const target = entry ? io.sockets.sockets.get(String(entry.socketId)) : null;
    if (target) target.emit('voice:cleanup');
    freeMicFor(rid, micIndex);
    if (ack) ack({ ok: true });
  });

  // ── Like / rep / animations ─────────────────────────────────────────────
  socket.on('send-private-notification', (data, ack) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const who = u.uid || u.guestId || u.userId || u.username || socket.id;
    const rl = rateLimit(socket.id + ':' + who, { max: 30, windowMs: 60000 }, 'private-notif');
    if (rl.blocked) { if (ack) ack({ success: false }); return; }
    const name = (data && (data.targetUsername || data.name)) || '';
    let targetUser = null;
    onlineSockets.forEach((t) => { if (t.username === name) targetUser = t; });
    if (!targetUser) { if (ack) ack({ success: false }); return; }
    if (targetUser.allowPrivate === false && !permissionsFor(u).isAdmin && String(targetUser.username).toLowerCase() !== String(u.username).toLowerCase()) {
      if (ack) ack({ success: false });
      return;
    }
    const rawText = String((data && data.text) || '').replace(/[\u0000-\u001f\u007f]/g, '');
    const text = filterNoLetters(rawText, 'bmsgs').trim().substring(0, 300);
    if (!text) { if (ack) ack({ success: false }); return; }
    let tid = null;
    onlineSockets.forEach((t, sid) => { if (t === targetUser) tid = sid; });
    if (tid) io.to(tid).emit('private-notification', {
      id: 'man-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      sender: u.username,
      senderNickname: u.username,
      senderId: u.uid || u.guestId || u.userId,
      senderAvatar: u.pic && u.pic !== 'pic.png' ? u.pic : null,
      senderUcol: u.ucol || null,
      senderSuperIcon: u.superIcon || '',
      senderGifts: Array.isArray(u.gifts) ? u.gifts : [],
      text,
      type: (data && data.type) || 'info',
      createdAt: new Date().toISOString(),
    });
    if (ack) ack({ success: true });
  });

  socket.on('send:public-notification', (data, ack) => {
    const u = findSocketUser(socket.id);
    if (!u || !permissionsFor(u).isAdmin) return;
    const text = String((data && data.text) || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().substring(0, 300);
    if (!text) return;
    io.emit('notification', { text, type: 'info' });
    if (ack) ack({ success: true });
  });

  socket.on('like-user', (data, ack) => {
    try {
      const u = findSocketUser(socket.id);
      if (!u) { if (ack) ack({ ok: false, why: 'no-user' }); return; }
      const who = u.uid || u.guestId || u.userId || u.username;
      const rl = rateLimit(socket.id + ':' + who, { max: 20, windowMs: 60000 }, 'like');
      if (rl.blocked) { if (ack) ack({ ok: false, why: 'rate-limited' }); return; }
      const name = (data && (data.targetUsername || data.name)) || '';
      let targetUser = null;
      onlineSockets.forEach((t) => { if (t.username === name) targetUser = t; });
      let targetSocketId = null;
      onlineSockets.forEach((t, sid) => { if (t === targetUser) targetSocketId = sid; });
      if (!targetUser) { if (ack) ack({ ok: false, why: 'no-target', name }); return; }
      if (targetUser === u || (targetUser.uid && u.uid && String(targetUser.uid) === String(u.uid))) {
        if (ack) ack({ ok: false, why: 'self' });
        return;
      }
      // A user may like a given target at most once (no unbounded inflation).
      const tkey = String(who) + '::like::' + String(targetUser.uid || targetUser.guestId || targetUser.username);
      if (likeGiven.has(tkey)) { if (ack) ack({ ok: false, why: 'already' }); return; }
      likeGiven.add(tkey);
      const sender = publicUser(u);
      targetUser.likes = (targetUser.likes || 0) + 1;
      io.emit('likes-updated', { id: targetUser.uid || targetUser.guestId, userId: targetUser.uid || targetUser.guestId, username: targetUser.username, likes: targetUser.likes, sender, from: u.username });
      if (targetSocketId) {
        io.to(targetSocketId).emit('new-notification', { id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: 'like', fromUser: { username: u.username, id: u.uid || u.guestId, pic: u.pic || 'pic.png' }, message: 'أعطاك إعجاباً', createdAt: new Date().toISOString(), read: false });
        io.to(targetSocketId).emit('session-notification', {
          id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          type: 'like',
          createdAt: new Date(),
          message: 'أعطاك إعجاباً',
          senderUsername: u.username,
          senderAvatar: u.pic && u.pic !== 'pic.png' ? u.pic : null,
          senderDisplayName: u.username,
          senderBanner: null, senderDecoration: null, senderUcol: u.ucol || null,
        });
      }
      if (targetUser.type === 'member' && targetUser.uid) {
        db.users.updateOne({ id: targetUser.uid }, { $set: { likes: targetUser.likes } });
      }
      socket.emit('like-success', { targetUsername: targetUser.username, likes: targetUser.likes });
      if (ack) ack({ ok: true, likes: targetUser.likes, sid: targetSocketId });
    } catch (e) {
      if (ack) ack({ ok: false, why: 'err:' + e.message });
    }
  });

  socket.on('rep-user', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const who = u.uid || u.guestId || u.userId || u.username;
    const rl = rateLimit(socket.id + ':' + who, { max: 20, windowMs: 60000 }, 'rep');
    if (rl.blocked) return;
    const name = (data && (data.targetUsername || data.name)) || '';
    let targetUser = null;
    onlineSockets.forEach((t) => { if (t.username === name) targetUser = t; });
    let targetSocketId = null;
    onlineSockets.forEach((t, sid) => { if (t === targetUser) targetSocketId = sid; });
    if (!targetUser) return;
    if (targetUser === u) return;
    const tkey = String(who) + '::rep::' + String(targetUser.uid || targetUser.guestId || targetUser.username);
    if (repGiven.has(tkey)) return;
    repGiven.add(tkey);
    const amount = Math.min(Math.max(parseInt((data && data.amount) || 1, 10) || 1, 1), 5);
    targetUser.rep = (targetUser.rep || 0) + amount;
    io.emit('rep-updated', { rep: targetUser.rep, userId: targetUser.uid || targetUser.guestId, id: targetUser.uid || targetUser.guestId, targetUsername: targetUser.username, sender: publicUser(u), from: u.username });
    if (targetSocketId) {
      io.to(targetSocketId).emit('new-notification', { id: 'rn-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: 'rep', fromUser: { username: u.username, id: u.uid || u.guestId, pic: u.pic || 'pic.png' }, message: 'أعطاك ' + targetUser.rep + ' نقاط تقييم', createdAt: new Date().toISOString(), read: false });
      io.to(targetSocketId).emit('session-notification', {
        id: 'rn-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: 'rep',
        createdAt: new Date(),
        message: 'أعطاك ' + targetUser.rep + ' نقاط تقييم',
        senderUsername: u.username,
        senderAvatar: u.pic && u.pic !== 'pic.png' ? u.pic : null,
        senderDisplayName: u.username,
        senderBanner: null, senderDecoration: null, senderUcol: u.ucol || null,
      });
    }
    if (targetUser.type === 'member' && targetUser.uid) {
      db.users.updateOne({ id: targetUser.uid }, { $set: { rep: targetUser.rep } });
    }
    socket.emit('rep-success', { targetUsername: targetUser.username, rep: targetUser.rep });
  });

  const animEvents = {
    'kiss': { out: 'kiss-received', toast: 'kiss-sent', file: '/uploads/system/kiss.webp', action: 'بوسة', sound: '/sounds/kiss.mp3' },
    'hug': { out: 'hug-received', toast: null, file: '/uploads/system/hug.webp', action: 'عناق', sound: '/sounds/hug.mp3' },
    'slap': { out: 'slap-received', toast: null, file: '/uploads/system/slap.webp', action: 'صفعة', sound: '/sounds/slap.mp3' },
    'clap': { out: 'clap-received', toast: null, file: '/uploads/system/clap.webp', action: 'تصفيق', sound: '/sounds/clap.mp3' },
  };
  Object.keys(animEvents).forEach((ev) => {
    socket.on(ev, (data) => {
      const u = findSocketUser(socket.id);
      if (!u) return;
      const spec = animEvents[ev];
      const sender = publicUser(u);
      io.emit(spec.out, { sender, from: u.username, type: ev });
      if (spec.toast) socket.emit(spec.toast, { targetUsername: (data && data.targetUsername) || '' });
    });
  });

  socket.on('delete-message', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    const hist = roomHistory.get(String(roomId)) || [];
    const msgId = (data && data.messageId) || (data && data.id);
    const idx = hist.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    const authorId = hist[idx].userId;
    const isAuthor = String(authorId) === String(u.uid || u.guestId);
    if (!isAuthor && !permissionsFor(u).isAdmin) return;
    hist.splice(idx, 1);
    io.to('room:' + roomId).emit('delete-message', { messageId: msgId, id: msgId, userId: authorId });
  });

  socket.on('clear-room-chat', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    const room = findRoomByAnyId(roomId);
    const isOwner = u && room && (String(room.ownerId) === String(u.uid || u.guestId) || (room.owner && String(room.owner) === String(u.username)));
    if (!u || !(isOwner || permissionsFor(u).isAdmin)) return;
    roomHistory.set(String(roomId), []);
    io.emit('room-chat-cleared', { roomId });
  });

  // ── Wall posts via socket ───────────────────────────────────────────────
  socket.on('wallpost', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || (!data.text && !data.msg && !data.mediaUrl)) return;
    const who = u.uid || u.guestId || u.userId || u.username || socket.id;
    const rl = rateLimit(socket.id + ':' + who, { max: 8, windowMs: 60000 }, 'wallpost');
    if (rl.blocked) { socket.emit('error-msg', { msg: 'منشورات كثيرة جداً، توقف قليلاً' }); return; }
    const rawMsg = String(data.text || data.msg || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    const msg = filterNoLetters(rawMsg, 'bmsgs').trim().substring(0, 4000);
    if (!msg && !data.mediaUrl) return;
    const post = {
      id: nextId('post_'), userId: u.uid || u.guestId, user: { ...publicUser(u) }, guestInfo: null,
      msg, mediaUrl: sanitizeMediaUrl(data.mediaUrl), mediaType: safeMediaType(data.mediaType || (data.mediaUrl ? 'image' : null)),
      wallLikes: [], comments: [], createdAt: new Date().toISOString(),
    };
    wallPosts.unshift(post);
    if (wallPosts.length > 500) wallPosts.length = 500;
    persistWall();
    io.emit('wall-update', { type: 'new-post', post: toClientPost(post) });
  });

  // ── Private messaging ───────────────────────────────────────────────────
  socket.on('private_message', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const who = u.uid || u.guestId || u.userId || u.username || socket.id;
    const rl = rateLimit(socket.id + ':' + who, { max: 20, windowMs: 60000 }, 'private_message');
    if (rl.blocked) { socket.emit('error-msg', { msg: 'رسائل خاصة كثيرة جداً، توقف قليلاً' }); return; }
    const targetName = String(data.targetUsername).replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '').trim().slice(0, 50);
    if (!targetName) return;
    const gate = likeGate(u, 'private');
    if (!gate.ok) { socket.emit('error-msg', { msg: likeGateMessage('private', gate) }); return; }
    const target = findUserByUsername(targetName);
    if (target && target.allowPrivate === false && !permissionsFor(u).isAdmin && String(target.username).toLowerCase() !== String(u.username).toLowerCase()) {
      socket.emit('error-msg', { msg: 'هذا العضو لا يقبل الرسائل الخاصة' });
      return;
    }
    const msg = data.message || {};
    const rawText = String(typeof msg.text === 'string' ? msg.text : '');
    const filtered = filterNoLetters(rawText, 'bmsgs').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    const hasFile = typeof msg.fileUrl === 'string' && msg.fileUrl.trim().length > 0;
    if (!filtered && !hasFile) return;
    const stored = {
      id: msg.id || nextId('pm_'),
      from: u.username,
      to: targetName,
      text: filtered.substring(0, 300),
      type: msg.type || 'text',
      fileUrl: sanitizeMediaUrl(msg.fileUrl),
      replyTo: (msg.replyTo && typeof msg.replyTo === 'object') ? {
        id: String(msg.replyTo.id || msg.replyTo.userId || '').slice(0, 60),
        userId: String(msg.replyTo.id || msg.replyTo.userId || '').slice(0, 60),
        username: sanitizeUsername(String(msg.replyTo.username || ''), 30),
        text: String(msg.replyTo.text || '').substring(0, 300),
        fileUrl: sanitizeMediaUrl(msg.replyTo.fileUrl),
        mediaUrl: sanitizeMediaUrl(msg.replyTo.mediaUrl),
        mediaType: safeMediaType(msg.replyTo.mediaType),
      } : null,
      timestamp: new Date().toISOString(),
      status: 'sent',
    };
    const thread = getPrivateThread(u.username, targetName);
    thread.push(stored);
    if (thread.length > 200) thread.splice(0, thread.length - 200);
    const out = { id: stored.id, text: stored.text, type: stored.type, fileUrl: stored.fileUrl, replyTo: stored.replyTo, timestamp: stored.timestamp, status: stored.status };
    let targetSocket = null;
    onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
    if (targetSocket) {
      io.to(targetSocket).emit('private_message', { fromUser: publicUser(u), message: out });
    }
    socket.emit('private_message_sent', { toUsername: targetName, message: out, targetUser: target ? publicUser(target) : { username: targetName, topic: targetName, type: 'user', id: targetName, userId: targetName } });
  });

  socket.on('private_typing', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const target = findUserByUsername(data.targetUsername);
    if (target) {
      let targetSocket = null;
      onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
      if (targetSocket) io.to(targetSocket).emit('private_typing', { byUsername: u.username });
    }
  });

  socket.on('private_ping', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const target = findUserByUsername(data.targetUsername);
    if (target) {
      let targetSocket = null;
      onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
      if (targetSocket) io.to(targetSocket).emit('private_ping_received', { fromUser: publicUser(u) });
    }
  });

  socket.on('private_message_read', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const target = findUserByUsername(data.targetUsername);
    const ids = (data.messageIds || []).map(String);
    const thread = getPrivateThread(u.username, data.targetUsername);
    thread.forEach((m) => { if (ids.indexOf(String(m.id)) !== -1) m.status = 'read'; });
    if (target) {
      let targetSocket = null;
      onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
      if (targetSocket) io.to(targetSocket).emit('private_message_read', { byUsername: u.username, messageIds: ids });
    }
  });

  socket.on('private_message_edit', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const target = findUserByUsername(data.targetUsername);
    const thread = getPrivateThread(u.username, data.targetUsername);
    const msg = thread.find((m) => String(m.id) === String(data.messageId) && String(m.from).toLowerCase() === String(u.username).toLowerCase());
    if (!msg) return;
    msg.text = String(data.newText || '').substring(0, 300);
    if (target) {
      let targetSocket = null;
      onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
      if (targetSocket) io.to(targetSocket).emit('private_message_edited', { byUsername: u.username, messageId: msg.id, newText: msg.text });
    }
  });

  socket.on('private_message_delete', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || !data.targetUsername) return;
    const target = findUserByUsername(data.targetUsername);
    const thread = getPrivateThread(u.username, data.targetUsername);
    const idx = thread.findIndex((m) => String(m.id) === String(data.messageId) && String(m.from).toLowerCase() === String(u.username).toLowerCase());
    if (idx !== -1) thread.splice(idx, 1);
    if (target) {
      let targetSocket = null;
      onlineSockets.forEach((t, sid) => { if (t === target) targetSocket = sid; });
      if (targetSocket) io.to(targetSocket).emit('private_message_deleted', { byUsername: u.username, messageId: data.messageId });
    }
  });

  socket.on('disconnect', () => {
    freeAllMicsForSocket(socket.id);
    socketSession.delete(socket.id);
    const u = findSocketUser(socket.id);
    if (u) {
      const leaveRoom = u.roomid;
      onlineSockets.delete(socket.id);
      // Guests are transient: drop their registry entry once their socket is gone
      // (unless another socket still uses the same guest identity).
      if (u.guest) purgeGuestRegistryForUser(u);
      io.emit('user-left', { name: u.username });
      broadcastPresence();
      broadcastJoinLeave(u, 'leave', leaveRoom);
      // Close any private calls this user was part of: their peer must never be
      // stuck on a ringing/active screen just because this socket vanished.
      const goneId = u.uid || u.guestId || u.userId;
      if (goneId) {
        let stillOnline = false;
        onlineSockets.forEach((o) => { if (o && String(o.uid || o.guestId || o.userId) === String(goneId)) stillOnline = true; });
        if (!stillOnline) {
          const deadCalls = [];
          privateCalls.forEach((c, callId) => {
            if (String(c.callerId) === String(goneId) || String(c.calleeId) === String(goneId)) deadCalls.push(callId);
          });
          deadCalls.forEach((callId) => {
            const peerSid = pmcallPeer(callId, goneId);
            if (peerSid) io.to(peerSid).emit('pmcall:hangup', { callId, reason: 'disconnected' });
            privateCalls.delete(callId);
          });
        }
      }
    }
  });

  // ── Quick chat (الدردشة السريعة) ────────────────────────────────────────
  socket.on('quick-chat:request-history', (cb) => {
    const list = [...quickChatMsgs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
    socket.emit('quick-chat:history', list);
    if (typeof cb === 'function') cb(list);
  });
  socket.on('quick-chat:get history', () => {
    socket.emit('quick-chat:history', [...quickChatMsgs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100));
  });
  socket.on('quickchat', () => {
    socket.emit('quick-chat:history', [...quickChatMsgs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100));
  });
  socket.on('getquickchat', () => {
    socket.emit('quick-chat:history', [...quickChatMsgs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100));
  });
  socket.on('quick-chat:send', (data, ack) => {
    const u = findSocketUser(socket.id);
    if (!u || !data || (!data.text && !data.mediaUrl)) {
      if (typeof ack === 'function') ack({ success: false, error: 'رسالة فارغة' });
      return;
    }
    const who = u.uid || u.guestId || u.userId || u.username || socket.id;
    const rl = rateLimit(socket.id + ':' + who, { max: 30, windowMs: 60000 }, 'quick-chat');
    if (rl.blocked) {
      if (typeof ack === 'function') ack({ success: false, error: 'رسائلك كثيرة جداً، توقف قليلاً' });
      return;
    }
    const rawText = String(data.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    const text = filterNoLetters(rawText, 'bmsgs').trim().substring(0, 500);
    if (!text && !data.mediaUrl) {
      if (typeof ack === 'function') ack({ success: false, error: 'رسالة فارغة' });
      return;
    }
    const msg = {
      id: nextId('qc_'),
      sender: publicUser(u),
      text,
      mediaUrl: sanitizeMediaUrl(data.mediaUrl),
      mediaType: safeMediaType(data.mediaType || (data.mediaUrl ? 'image' : null)),
      createdAt: new Date().toISOString(),
    };
    quickChatMsgs.unshift(msg);
    if (quickChatMsgs.length > 200) quickChatMsgs.length = 200;
    io.emit('quick-chat:new', msg);
    if (typeof ack === 'function') ack({ success: true });
  });
  socket.on('quick-chat:delete', (data) => {
    const u = findSocketUser(socket.id);
    const id = data && (data.id || data.messageId);
    const i = quickChatMsgs.findIndex((m) => String(m.id) === String(id));
    if (i === -1) return;
    const isOwner = u && quickChatMsgs[i].sender && String(quickChatMsgs[i].sender.userId) === String(u.uid || u.guestId);
    const isAdmin = u && (u.rank === 'admin' || u.isAdmin);
    if (!isOwner && !isAdmin) return;
    quickChatMsgs.splice(i, 1);
    io.emit('quick-chat:deleted', { id });
  });

  // ── Zajel (الزاجل) ───────────────────────────────────────────────────────
  function sendZajelApproved() {
    io.emit('zajel:list', { messages: zajelApproved.slice(0, 50) });
  }
  socket.on('zajel:get-approved', () => {
    socket.emit('zajel:list', { messages: zajelApproved.slice(0, 50) });
  });
  socket.on('zajel:moderation:get-pending', () => {
    socket.emit('zajel:moderation:pending-list', zajelPending.slice(0, 100));
  });
  socket.on('zajel:send', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const rl = rateLimit(socket.id + ':zajel', { max: 20, windowMs: 60000 }, 'zajel');
    if (rl.blocked) return;
    const text = String((data && (data.message || data.msg)) || '').substring(0, 150);
    if (!text) return;
    const pending = { id: zajelIdSeq.pending++, username: u.username, message: text, createdAt: new Date().toISOString() };
    zajelPending.push(pending);
    if (zajelPending.length > 200) zajelPending.length = 200;
    // Broadcast a moderation request to any admin/mod online.
    io.emit('zajel:moderation-request', pending);
    // For simplicity, auto-approve (common chat behavior) unless moderation is strict:
    const approved = { id: zajelIdSeq.approved++, message: text };
    zajelApproved.unshift(approved);
    if (zajelApproved.length > 100) zajelApproved.length = 100;
    io.emit('zajel:new', approved);
  });
  socket.on('zajel:moderate', (data, ack) => {
    const u = findSocketUser(socket.id);
    if (!u || !permissionsFor(u).isAdmin) return;
    const id = data && Number(data.id);
    const action = data && data.action;
    const i = zajelPending.findIndex((p) => Number(p.id) === Number(id));
    if (i === -1) {
      if (typeof ack === 'function') ack({ success: false, message: 'الرسالة غير موجودة' });
      return;
    }
    const pending = zajelPending[i];
    zajelPending.splice(i, 1);
    if (action === 'approve') {
      const approved = { id: zajelIdSeq.approved++, message: pending.message };
      zajelApproved.unshift(approved);
      if (zajelApproved.length > 100) zajelApproved.length = 100;
      io.emit('zajel:new', approved);
    }
    io.emit('zajel:moderation-resolved', { id });
    if (typeof ack === 'function') ack({ success: true });
  });
  socket.on('zajel:delete', (data) => {
    const u = findSocketUser(socket.id);
    if (!u || !permissionsFor(u).isAdmin) return;
    const id = data && (data.id !== undefined ? Number(data.id) : undefined);
    const i = zajelApproved.findIndex((m) => Number(m.id) === Number(id));
    if (i !== -1) { zajelApproved.splice(i, 1); }
    io.emit('zajel:delete', { id });
  });

  // ── Room moderation / user management (missing live-client events) ────────
  socket.on('get-room-bans', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    socket.emit('room-bans-list', roomBans.get(String(roomId)) || []);
  });
  socket.on('room-unban-user', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const list = roomBans.get(String(roomId)) || [];
    const i = list.findIndex((b) => String(b.id) === String(data && data.banId));
    if (i !== -1) list.splice(i, 1);
    io.to('room:' + roomId).emit('room-bans-list', list);
  });
  socket.on('toggle-room-moderator', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const targetUserId = String((data && data.targetUserId) || '');
    if (!targetUserId) return;
    let target = null;
    onlineSockets.forEach((t) => { if (String(t.uid || t.guestId || t.userId) === targetUserId) target = t; });
    let mods = roomModerators.get(String(roomId)) || new Map();
    if (mods.has(targetUserId)) {
      mods.delete(targetUserId);
    } else {
      mods.set(targetUserId, { userId: targetUserId, username: (target && target.username) || targetUserId, permissions: [] });
    }
    roomModerators.set(String(roomId), mods);
    socketModeratorSync(roomId);
    emitRoomUpdated(roomId);
  });
  socket.on('update-room-moderator-permissions', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const targetUserId = String((data && data.targetUserId) || '');
    const mods = roomModerators.get(String(roomId));
    if (!mods || !mods.has(targetUserId)) return;
    const perms = Array.isArray(data.permissions) ? data.permissions.map(String).slice(0, 40) : [];
    mods.get(targetUserId).permissions = perms;
    socketModeratorSync(roomId);
    emitRoomUpdated(roomId);
  });
  socket.on('toggle-mic-lock', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const micIndex = Number((data && data.micIndex));
    if (isNaN(micIndex)) return;
    const locks = roomMicLocks.get(String(roomId)) || new Map();
    if (locks.has(micIndex)) locks.delete(micIndex);
    else locks.set(micIndex, u.username);
    roomMicLocks.set(String(roomId), locks);
    socketModeratorSync(roomId);
    emitRoomUpdated(roomId);
  });
  socket.on('room-mute-user', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const name = String((data && data.targetUsername) || '').toLowerCase();
    if (!name) return;
    const rm = roomMutes.get(String(roomId)) || new Map();
    rm.set(String(name), { until: null });
    roomMutes.set(String(roomId), rm);
    const t = findUserByUsername(name);
    if (t) { t.isMutedRoom = true; broadcastPresence(); }
    const sid = socketIdForUsername(name);
    if (sid) io.to(sid).emit('new-notification', { id: nextId('n_'), type: 'info', message: 'قام المشرف بكتمك في هذه الغرفة', createdAt: new Date().toISOString(), read: false });
    io.to('room:' + roomId).emit('user_updated', { username: (data && data.targetUsername), isMutedRoom: true });
  });
  socket.on('room-unmute-user', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    if (!canModerateRoom(roomId, u)) return;
    const name = String((data && data.targetUsername) || '').toLowerCase();
    const m = roomMutes.get(String(roomId));
    if (m) m.delete(name);
    const t = findUserByUsername(name);
    if (t) { t.isMutedRoom = false; broadcastPresence(); }
    io.to('room:' + roomId).emit('user_updated', { username: (data && data.targetUsername), isMutedRoom: false });
  });
  socket.on('mute-user', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const name = String((data && data.targetUsername) || '');
    globalMutes.set(name.toLowerCase(), { until: null });
    const t = findUserByUsername(name);
    if (t) { t.isGloballyMuted = true; broadcastPresence(); }
    io.emit('system-message', { message: 'تم كتم العضو ' + name + ' من الشات', content: 'تم كتم العضو ' + name + ' من الشات', title: 'كتم' });
  });
  socket.on('unmute-user', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const name = String((data && data.targetUsername) || '');
    globalMutes.delete(name.toLowerCase());
    const t = findUserByUsername(name);
    if (t) { t.isGloballyMuted = false; broadcastPresence(); }
    io.emit('system-message', { message: 'تم إلغاء كتم العضو ' + name, content: 'تم إلغاء كتم العضو ' + name, title: 'إلغاء كتم' });
  });
  socket.on('move-user-to-room', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const target = findOnlineByUsername(data && data.targetUsername);
    if (!target) return;
    const room = findRoomByAnyId(data && data.roomId);
    if (!room) return;
    if (room.password && String(room.password) !== String(data && data.password)) {
      socket.emit('error-msg', { msg: 'كلمة مرور الغرفة غير صحيحة' });
      return;
    }
    const prevRoom = target.roomid;
    target.roomid = String(room.id);
    broadcastPresence();
    const tSocket = socketIdForUser(target);
    if (tSocket) {
      io.to(tSocket).emit('force-change-room', { roomId: Number(room.id) });
      if (prevRoom !== undefined && prevRoom !== null) broadcastJoinLeave(target, 'leave', prevRoom);
      broadcastRoomMove(target, room.id);
    }
  });
  socket.on('reveal-nickname', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) { if (u) socket.emit('reveal-nickname-result', { error: 'هذه الخاصية للمشرفين فقط' }); return; }
    const name = String((data && data.targetUsername) || '');
    const target = findUserByUsername(name);
    const doc = db.users.findOne({ topic: name }) || db.users.find({}).find((x) => x && String(x.topic || '').toLowerCase() === name.toLowerCase());
    const liveFp = target ? (target.fp || '') : (doc ? doc.fp || '' : '');
    const liveFp2 = target ? (target.fp2 || '') : (doc ? doc.fp2 || '' : '');
    const liveIp = target && target.ip ? target.ip : (doc ? doc.ip || '' : '');
    const onlineByUid = new Map();
    const onlineByUsername = new Map();
    onlineSockets.forEach((lu, sid) => {
      if (lu && lu.uid) onlineByUid.set(String(lu.uid), lu);
      if (lu && lu.username) onlineByUsername.set(String(lu.username).toLowerCase(), lu);
    });
    function onlineFor(rowUser) {
      if (rowUser.uid && onlineByUid.has(String(rowUser.uid))) return onlineByUid.get(String(rowUser.uid));
      if (rowUser.topic) return onlineByUsername.get(String(rowUser.topic).toLowerCase()) || null;
      return null;
    }
    function deviceAgent(d) {
      try {
        const di = typeof d.deviceInfo === 'string' ? JSON.parse(d.deviceInfo) : (d.deviceInfo || {});
        return di.userAgent || di.ua || '';
      } catch (e) { return ''; }
    }
    function matches(docOrLive, fp, fp2, ip) {
      const reasons = [];
      if (fp2 && docOrLive.fp2 && String(docOrLive.fp2) === String(fp2)) reasons.push('fingerprint');
      if (fp && docOrLive.fp && String(docOrLive.fp) === String(fp)) reasons.push('fingerprint');
      if (ip && docOrLive.ip && String(docOrLive.ip) === String(ip)) reasons.push('IP');
      return reasons;
    }
    const rows = [];
    const seen = {};
    const seenOnline = {};
    function pushRow(r) {
      if (!r || !r.username || seen[r.username + '|' + r.type + '|' + (r.isHistorical ? 'h' : 'o')]) return;
      seen[r.username + '|' + r.type + '|' + (r.isHistorical ? 'h' : 'o')] = true;
      rows.push(r);
    }
    onlineSockets.forEach((lu, sid) => {
      if (!lu) return;
      const reasons = matches(lu, liveFp, liveFp2, liveIp);
      if (!reasons.length) return;
      const lRow = {
        id: lu.uid || lu.id || '', username: lu.topic || lu.username, type: lu.guest || lu.type === 'guest' ? 'guest' : 'member',
        isOnline: true, isHistorical: false, online: true,
        group: (lu.group && lu.group.name) ? { name: lu.group.name } : { name: '' },
        matchReasons: reasons, roomId: lu.roomid != null ? lu.roomid : null,
        ip: lu.ip || '', fp: lu.fp || '', fp2: lu.fp2 || '',
        userAgent: deviceAgent(lu), lastSeen: new Date().toISOString(),
      };
      pushRow(lRow);
      const k = String(lRow.username).toLowerCase();
      seenOnline[k] = seenOnline[k] || lRow;
    });
    db.users.find({}).forEach((d) => {
      if (!d || !d.topic) return;
      const reasons = matches(d, liveFp, liveFp2, liveIp);
      if (!reasons.length) return;
      const lu = onlineFor(d);
      pushRow({
        id: d.id, username: d.topic, type: d.isGuest ? 'guest' : 'member',
        isOnline: !!lu, isHistorical: false, online: !!lu,
        group: (d.group && d.group.name) ? { name: d.group.name } : { name: '' },
        matchReasons: reasons, roomId: lu ? lu.roomid : null,
        ip: d.ip || '', fp: d.fp || '', fp2: d.fp2 || '',
        userAgent: deviceAgent(d), lastSeen: d.lastSeen || d.created || '',
      });
    });
    const seenHist = {};
    const historical = [];
    db.users.find({}).forEach((d) => {
      if (!d || !d.topic || !matches(d, liveFp, liveFp2, liveIp).length) return;
      if (d.isGuest && seenHist[d.topic]) return;
      seenHist[d.topic] = true;
      const lu = onlineFor(d);
      if (lu) return;
      historical.push({
        id: d.id, username: d.topic, type: d.isGuest ? 'guest' : 'member',
        isOnline: false, isHistorical: true, online: false,
        group: (d.group && d.group.name) ? { name: d.group.name } : { name: '' },
        matchReasons: matches(d, liveFp, liveFp2, liveIp),
        ip: d.ip || '', fp: d.fp || '', fp2: d.fp2 || '',
        userAgent: deviceAgent(d), lastSeen: d.lastSeen || d.created || '',
      });
    });
    const onlineRows = rows.filter((r) => r.isOnline);
    const offlineRows = rows.filter((r) => !r.isOnline);
    const merged = onlineRows.concat(offlineRows, historical).slice(0, 60);
    if (!target && !doc) socket.emit('reveal-nickname-result', { targetUsername: name, associatedUsers: [], historicalLogins: [] });
    else socket.emit('reveal-nickname-result', { targetUsername: name, associatedUsers: merged.filter((r) => !r.isHistorical), historicalLogins: merged.filter((r) => r.isHistorical) });
  });
  socket.on('report-user', (data, ack) => {
    const u = findSocketUser(socket.id);
    if (!u) { if (typeof ack === 'function') ack({ success: false, message: 'يجب تسجيل الدخول' }); return; }
    const rl = rateLimit(socket.id + ':report', { max: 10, windowMs: 60000 }, 'report');
    if (rl.blocked) { if (typeof ack === 'function') ack({ success: false, message: 'محاولات كثيرة، حاول بعد قليل' }); return; }
    const report = {
      id: nextId('rep_'),
      from: publicUser(u),
      fromUsername: u.username,
      targetUsername: String((data && data.targetUsername) || ''),
      reason: String((data && data.reason) || '').substring(0, 500),
      proofImage: sanitizeMediaUrl(data && data.proofImage),
      createdAt: new Date().toISOString(),
    };
    pendingReports.unshift(report);
    if (pendingReports.length > 200) pendingReports.length = 200;
    onlineSockets.forEach((ou, sid) => {
      if (permissionsFor(ou).isAdmin) io.to(sid).emit('admin:new-report', report);
    });
    if (typeof ack === 'function') ack({ success: true, message: 'تم إرسال البلاغ للإدارة' });
  });
  socket.on('delete-user-frame', (data) => { adminDeleteCosmetic(data, 'frame'); });
  socket.on('delete-user-bg', (data) => { adminDeleteCosmetic(data, 'bg'); });
  socket.on('delete-user-link', (data) => { adminDeleteCosmetic(data, 'link'); });
  function adminDeleteCosmetic(data, field) {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const name = String((data && data.targetUsername) || '');
    const doc = db.users.findOne({ topic: name });
    if (!doc) return;
    const set = {};
    if (field === 'frame') set.frame = '';
    else if (field === 'bg') set.bg = '';
    else set.link = '';
    db.users.updateOne({ id: doc.id }, { $set: set });
    io.emit('user_updated', { id: doc.id, username: doc.topic || doc.username, frame: set.frame, bg: set.bg, link: set.link, deleted: true });
  }
  socket.on('message-as-bot', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : (u.roomid || GENERAL_ROOM_ID);
    const text = String((data && data.text) || '').substring(0, 300);
    if (!text) return;
    const botId = String((data && data.botId) || 'bot');
    const botName = 'بوت ' + u.username;
    const bot = {
      id: 'bot_' + botId,
      userId: 'bot_' + botId,
      username: botName,
      topic: botName,
      type: 'bot',
      pic: 'pic.png', ucol: '#9ca3af', mcol: '#9ca3af', bg: '#ffffff',
      msg: '', co: 'us', rep: 0, likes: 0, isBotOrVirtual: true, isVirtualUser: true,
    };
    const msg = { id: nextId('m_'), user: bot, userId: bot.id, text, createdAt: new Date().toISOString(), replyTo: null, mediaUrl: null, mediaType: null };
    const hist = roomHistory.get(String(roomId)) || [];
    hist.push(msg);
    if (hist.length > 100) hist.splice(0, hist.length - 100);
    roomHistory.set(String(roomId), hist);
    io.to('room:' + roomId).emit('message', msg);
  });
  socket.on('public-alert', (data) => {
    const u = findSocketUser(socket.id);
    if (!permissionsFor(u).isAdmin) return;
    const text = String((data && data.text) || '').substring(0, 300);
    if (!text) return;
    io.emit('alert', { text, from: u.username });
  });
  socket.on('voice:speaker-muted', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    u.speakerMuted = !!(data && data.isMuted);
    broadcastPresence();
  });
  socket.on('offline-pending-alert-shown', (data) => {
    const u = findSocketUser(socket.id);
    const id = data && (data.alertId || data.id);
    if (u && u.token && pendingOfflineAlerts.has(u.token)) {
      const list = pendingOfflineAlerts.get(u.token);
      const i = list.indexOf(String(id));
      if (i !== -1) list.splice(i, 1);
      if (list.length === 0) pendingOfflineAlerts.delete(u.token);
    }
  });

  // ── Games spectate list ──────────────────────────────────────────────────
  socket.on('game:spectate:list', (cb) => {
    const out = [];
    battleSessions.forEach((b) => {
      if (b.status === 'countdown' || b.status === 'active' || b.status === 'break') {
        out.push({ gameId: b.battleId, type: 'battle', roomId: b.roomId, status: b.status, player1Name: b.player1Name, player2Name: b.player2Name, player1: publicUserSafe(b.player1Obj), player2: publicUserSafe(b.player2Obj), startedAt: b.startedAt });
      }
    });
    liveBroadcasts.forEach((lb) => {
      out.push({ gameId: 'lb_' + lb.userId, type: 'live', roomId: lb.roomId, status: 'live', broadcaster: lb.username, userId: lb.userId, startedAt: lb.startedAt });
    });
    if (typeof cb === 'function') cb(out);
    socket.emit('game:spectate:list:update', out);
  });

  // ── Battle engine (الملحمة) ──────────────────────────────────────────────
  function broadcastBattle(battle) {
    io.to('room:' + battle.roomId).emit('battle:sync', { hasActiveBattle: true, ...battleWire(battle) });
    spectrumUpdate();
  }
  function emitBattleTick(battle) {
    const p1s = battle.player1SocketId, p2s = battle.player2SocketId;
    if (p1s && io.sockets.sockets.get(String(p1s))) io.to(p1s).emit('battle:created', battleWire(battle));
    if (p2s && io.sockets.sockets.get(String(p2s))) io.to(p2s).emit('battle:created', battleWire(battle));
  }
  function battleWire(battle) {
    const b = {
      battleId: battle.battleId, roomId: battle.roomId, mode: battle.mode, status: battle.status,
      round: battle.round, maxRounds: battle.maxRounds,
      player1: publicUserSafe(battle.player1Obj), player2: publicUserSafe(battle.player2Obj),
      player1Name: battle.player1Name, player2Name: battle.player2Name,
      player1Score: battle.tapCounts[0], player2Score: battle.tapCounts[1],
      totalRounds: battle.maxRounds,
      startedAt: battle.startedAt,
    };
    return b;
  }
  function finishBattle(battle, winnerId) {
    battle.status = 'finished';
    clearTimersForBattle(battle);
    battleSessions.delete(String(battle.roomId));
    battleInvites.delete(String(battle.roomId));
    const pool = roundPool(battle);
const coinSettlement = pool > 0 ? { status: 'paid_to_winner', poolAmount: pool } : { status: 'none', poolAmount: 0 };
const payload = { battleId: battle.battleId, roomId: battle.roomId, winnerId, rounds: battle.roundsWon, player1Score: battle.tapCounts[0], player2Score: battle.tapCounts[1], player1TotalScore: battle.tapCounts[0], player2TotalScore: battle.tapCounts[1], player1RoundsWon: battle.roundsWon[0], player2RoundsWon: battle.roundsWon[1], player1: publicUserSafe(battle.player1Obj), player2: publicUserSafe(battle.player2Obj), player1Name: battle.player1Name, player2Name: battle.player2Name, coinSettlement, forfeitReason: null };
    io.to('room:' + battle.roomId).emit('battle:finished', payload);
    ['player1', 'player2'].forEach((side) => {
      settleBattleCoins(battle, side, winnerId);
    });
    spectrumUpdate();
  }
  function clearTimersForBattle(battle) {
    if (battle.roundTimer) clearInterval(battle.roundTimer);
    if (battle.countdownTimer) clearInterval(battle.countdownTimer);
    if (battle.breakTimer) clearTimeout(battle.breakTimer);
    if (battle.flushTimer) clearInterval(battle.flushTimer);
    battle.roundTimer = battle.countdownTimer = battle.flushTimer = null;
  }
  function startBattleRound(battle, roundNo) {
    battle.round = roundNo;
    battle.tapCounts = [0, 0];
    battle.status = 'active';
    battle.currentRound = roundNo;
    let countdown = 3;
    battle.countdownTimer = setInterval(() => {
      io.to('room:' + battle.roomId).emit('battle:countdown', { timer: countdown, currentRound: roundNo, battleId: battle.battleId });
      countdown -= 1;
      if (countdown < 0) {
        clearInterval(battle.countdownTimer);
        battle.countdownTimer = null;
        battle.tapQueue = { p1: 0, p2: 0 };
        io.to('room:' + battle.roomId).emit('battle:roundStarted', { battleId: battle.battleId, currentRound: roundNo, timer: BATTLE_ROUND_SECONDS, player1Score: 0, player2Score: 0 });
        let t = BATTLE_ROUND_SECONDS;
        battle.roundTimer = setInterval(() => {
          t -= 1;
          io.to('room:' + battle.roomId).emit('battle:timer', { timer: t, round: roundNo, battleId: battle.battleId });
          if (t <= 0) {
            clearInterval(battle.roundTimer);
            battle.roundTimer = null;
            endBattleRound(battle, roundNo);
          }
        }, 1000);
      }
    }, 1000);
  }
  function endBattleRound(battle, roundNo) {
    const p1t = battle.tapCounts[0], p2t = battle.tapCounts[1];
    let winnerId = null;
    if (p1t !== p2t) winnerId = p1t > p2t ? battle.player1Id : battle.player2Id;
    if (winnerId) battle.roundsWon[winnerId === battle.player1Id ? 0 : 1] += 1;
    const poolThisRound = roundPool(battle);
    const coinSettlement = poolThisRound > 0
      ? (winnerId ? { status: 'paid_to_winner', poolAmount: poolThisRound } : { status: 'refunded', poolAmount: poolThisRound })
      : { status: 'none', poolAmount: 0 };
    io.to('room:' + battle.roomId).emit('battle:roundEnded', {
      roundWinnerId: winnerId, round: roundNo,
      player1Score: p1t, player2Score: p2t,
      player1RoundsWon: battle.roundsWon[0], player2RoundsWon: battle.roundsWon[1],
      battleId: battle.battleId, coinSettlement,
      roundWinnerName: winnerId ? (winnerId === battle.player1Id ? battle.player1Name : battle.player2Name) : null,
    });
    if (battle.roundsWon[0] >= Math.ceil(battle.maxRounds / 2) || battle.roundsWon[1] >= Math.ceil(battle.maxRounds / 2)) {
      finishBattle(battle, battle.roundsWon[0] >= Math.ceil(battle.maxRounds / 2) ? battle.player1Id : battle.player2Id);
      return;
    }
    battle.status = 'break';
    battle.breakTimer = setTimeout(() => {
      if (battle.status === 'finished') return;
      startBattleRound(battle, roundNo + 1);
    }, 2000);
  }
  function roundPool(battle) {
    let total = 0;
    (battle.supporters || []).forEach((list) => (list || []).forEach((s) => { total += (s.score || 0); }));
    return total;
  }
  // Persist a real coin balance for a battle player and push the updated
  // balance to that player's sockets. Never fabricates a "balance" number.
  function settleBattleCoins(battle, side, winnerId) {
    const id = side === 'player1' ? battle.player1Id : battle.player2Id;
    const sidName = side + 'SocketId';
    const sid = battle[sidName];
    if (!id || !sid) return;
    const pool = roundPool(battle);
    const won = winnerId && String(id) === String(winnerId);
    // Winner takes the pool; loser/draw just keeps their balance unchanged.
    const delta = won ? Math.max(0, pool) : 0;
    if (delta > 0) {
      const doc = db.users.findOne({ id: String(id) });
      if (doc) {
        const next = (doc.coins || 0) + delta;
        db.users.updateOne({ id: String(id) }, { $set: { coins: next } });
        const live = findSocketUser(sid);
        if (live) live.coins = next;
        io.to(sid).emit('coins:updated', { userId: id, balance: next, reason: 'battle' });
        return;
      }
    }
    const live = findSocketUser(sid);
    const balance = (live && live.coins) || (db.users.findOne({ id: String(id) }) || {}).coins || 0;
    io.to(sid).emit('coins:updated', { userId: id, balance, reason: 'battle' });
  }
  const BATTLE_ROUND_SECONDS = 12;
  function flushBattleTaps(battle) {
    const { p1, p2 } = battle.tapQueue || { p1: 0, p2: 0 };
    if (!p1 && !p2) return;
    battle.tapQueue = { p1: 0, p2: 0 };
    io.to('room:' + battle.roomId).emit('battle:tapBurst', { player1TapCount: p1, player2TapCount: p2, battleId: battle.battleId, player1Score: battle.tapCounts[0], player2Score: battle.tapCounts[1] });
    io.to('room:' + battle.roomId).emit('battle:scoreUpdate', { player1Score: battle.tapCounts[0], player2Score: battle.tapCounts[1], battleId: battle.battleId });
  }

  socket.on('battle:syncState', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : (u && u.roomid) || GENERAL_ROOM_ID;
    const battle = battleSessions.get(String(roomId));
    if (battle && battle.status !== 'finished') {
      socket.emit('battle:sync', { hasActiveBattle: true, ...battleWire(battle) });
    } else {
      socket.emit('battle:sync', { hasActiveBattle: false, roomId });
    }
  });
  socket.on('battle:invite', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    const key = String(roomId);
    if (battleSessions.has(key)) { socket.emit('battle:error', { message: 'توجد ملحمة جارية في هذه الغرفة' }); return; }
    const targetUserId = String((data && data.targetUserId) || '');
    let target = null;
    onlineSockets.forEach((t) => { if (String(t.uid || t.guestId || t.userId) === targetUserId) target = t; });
    if (!target) { socket.emit('battle:error', { message: 'العضو غير متواجد الآن' }); return; }
    const tid = socketIdForUser(target);
    if (!tid) { socket.emit('battle:error', { message: 'العضو غير متصل' }); return; }
    battleInvites.set(key, { senderId: u.uid || u.guestId || u.userId, senderName: u.username, receiverId: targetUserId, receiverName: target.username, roomId });
    io.to(tid).emit('battle:invited', { senderId: u.uid || u.guestId || u.userId, senderName: u.username, roomId: Number(roomId), receiverName: target.username });
  });
  socket.on('battle:accept', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    const invite = battleInvites.get(String(roomId));
    if (!invite) { socket.emit('battle:error', { message: 'الدعوة غير موجودة' }); return; }
    if (String(u.uid || u.guestId || u.userId) !== String(invite.receiverId) && String(u.uid || u.guestId || u.userId) !== String(invite.senderId)) return;
    let sender = null, senderSid = null;
    onlineSockets.forEach((t, sid) => { if (String(t.uid || t.guestId || t.userId) === String(invite.senderId)) { sender = t; senderSid = sid; } });
    if (!sender || !senderSid) { socket.emit('battle:error', { message: 'مقدم الدعوة غير متواجد الآن' }); battleInvites.delete(String(roomId)); return; }
    const battle = {
      battleId: 'btl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      roomId: String(roomId),
      mode: (data && data.battleMode) || (invite.mode) || 'single',
      status: 'countdown',
      round: 1, maxRounds: 3, currentRound: 1,
      player1Obj: publicUser(sender), player2Obj: publicUser(u),
      player1Id: sender.uid || sender.guestId || sender.userId, player2Id: u.uid || u.guestId || u.userId,
      player1Name: sender.username, player2Name: u.username,
      player1SocketId: senderSid, player2SocketId: socket.id,
      tapCounts: [0, 0], tapQueue: { p1: 0, p2: 0 },
      roundsWon: [0, 0],
      supporters: [[], []],
      startedAt: new Date().toISOString(),
      roundTimer: null, countdownTimer: null, breakTimer: null, flushTimer: null,
    };
    battleSessions.set(String(roomId), battle);
    battleInvites.delete(String(roomId));
    emitBattleTick(battle);
    broadcastBattle(battle);
    startBattleRound(battle, 1);
    battle.flushTimer = setInterval(() => flushBattleTaps(battle), 350);
  });
  socket.on('battle:reject', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : GENERAL_ROOM_ID;
    const invite = battleInvites.get(String(roomId));
    if (!invite) return;
    const senderSid = socketIdForUserUsername_(invite.senderName);
    if (senderSid) io.to(senderSid).emit('battle:inviteRejected', { receiverName: u ? u.username : invite.receiverName, roomId });
    battleInvites.delete(String(roomId));
  });
  function socketIdForUserUsername_(name) {
    let sid = null;
    onlineSockets.forEach((t, k) => { if (String(t.username).toLowerCase() === String(name).toLowerCase() && !sid) sid = k; });
    return sid;
  }
  socket.on('battle:cancel', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = (data && data.roomId !== undefined) ? data.roomId : (u && u.roomid) || GENERAL_ROOM_ID;
    const invite = battleInvites.get(String(roomId));
    if (invite) {
      const sid = socketIdForUserUsername_(invite.senderName === (u && u.username) ? invite.receiverName : invite.senderName);
      if (sid && sid !== socket.id) io.to(sid).emit('battle:cancelled', { reason: 'تم إلغاء الملحمة', roomId: Number(roomId) });
      battleInvites.delete(String(roomId));
      return;
    }
    const battle = battleSessions.get(String(roomId));
    if (!battle) return;
    const isParticipant = socket.id === battle.player1SocketId || socket.id === battle.player2SocketId || permissionsFor(u).isAdmin;
    if (!isParticipant) return;
    clearTimersForBattle(battle);
    if (battle.flushTimer) clearInterval(battle.flushTimer);
    battleSessions.delete(String(roomId));
    io.to('room:' + battle.roomId).emit('battle:cancelled', { reason: 'تم إلغاء الملحمة', roomId: Number(roomId) });
    spectrumUpdate();
  });
  socket.on('battle:tap', (data) => {
    const u = findSocketUser(socket.id);
    let b = null;
    battleSessions.forEach((bs) => { if (String(bs.battleId) === String(data && data.battleId)) b = bs; });
    if (!b || b.status !== 'active') { socket.emit('battle:tapError', { message: 'الملحمة ليست نشطة' }); return; }
    if (socket.id !== b.player1SocketId && socket.id !== b.player2SocketId) { socket.emit('battle:tapError', { message: 'أنت لست مشاركاً في الملحمة' }); return; }
    const receiverId = String(data && data.receiverId);
    if (socket.id === b.player1SocketId && String(b.player2Id) !== receiverId) { socket.emit('battle:tapError', { message: 'هدف غير صالح' }); return; }
    if (socket.id === b.player2SocketId && String(b.player1Id) !== receiverId) { socket.emit('battle:tapError', { message: 'هدف غير صالح' }); return; }
    const idx = socket.id === b.player1SocketId ? 0 : 1;
    b.tapCounts[idx] += 1;
    if (b.tapQueue) b.tapQueue[idx === 0 ? 'p1' : 'p2'] += 1;
    io.to('room:' + b.roomId).emit('battle:tapEffect', { receiverId, byUserId: socket.id === b.player1SocketId ? b.player1Id : b.player2Id, battleId: b.battleId, byUsername: u.username, tapper: u.username, supporterAvatar: u.pic && u.pic !== 'pic.png' ? u.pic : null, operationId: 'tap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), supportType: 'tap' });
  });
  socket.on('battle:getGiftCatalog', (ack) => {
    if (typeof ack === 'function') ack({ success: true, catalog: BATTLE_GIFTS });
  });
  socket.on('battle:sendGift', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) { socket.emit('battle:giftError', { message: 'يجب تسجيل الدخول' }); return; }
    const battle = (() => { let found = null; battleSessions.forEach((b) => { if (String(b.battleId) === String(data && data.battleId)) found = b; }); return found; })();
    if (!battle) { socket.emit('battle:giftError', { message: 'الملحمة غير موجودة' }); return; }
    if (battle.status !== 'active' && battle.status !== 'break') { socket.emit('battle:giftError', { message: 'لا يمكن إرسال هدية الآن' }); return; }
    const gift = BATTLE_GIFTS.find((g) => g.key === (data && data.giftKey));
    if (!gift) { socket.emit('battle:giftError', { message: 'الهدية غير موجودة' }); return; }
    const slot = String((data && data.receiverSlot) || 'player1');
    const qty = Math.max(1, Math.min(999, parseInt((data && data.quantity) || 1, 10) || 1));
    const cost = gift.price * qty;
    const receiverIdx = slot.toLowerCase().indexOf('2') !== -1 ? 1 : 0;
    const receiverId = receiverIdx === 0 ? battle.player1Id : battle.player2Id;
    if (String(receiverId) === String(u.uid || u.guestId || u.userId)) { socket.emit('battle:giftError', { message: 'لا يمكنك إرسال هدية لنفسك' }); return; }
    // Deduct real coins from the sender's persisted balance and reject when broke.
    const senderDoc = db.users.findOne({ id: String(u.uid || u.userId || '') });
    const liveBal = (u.coins !== undefined) ? Number(u.coins) || 0 : (senderDoc ? Number(senderDoc.coins) || 0 : 0);
    if (liveBal < cost) { socket.emit('battle:giftError', { message: 'رصيد الكوينز لا يكفي لإرسال هذه الهدية' }); return; }
    const newBal = liveBal - cost;
    u.coins = newBal;
    if (senderDoc) db.users.updateOne({ id: String(u.uid || u.userId) }, { $set: { coins: newBal } });
    io.to(socket.id).emit('coins:updated', { userId: u.uid || u.guestId || u.userId, balance: newBal, reason: 'gift' });
    let sup = (battle.supporters[receiverIdx] || []).find((s) => String(s.userId) === String(u.uid || u.guestId || u.userId));
    if (!sup) {
      sup = { userId: u.uid || u.guestId || u.userId, user: publicUser(u), username: u.username, score: 0 };
      if (!battle.supporters[receiverIdx]) battle.supporters[receiverIdx] = [];
      battle.supporters[receiverIdx].push(sup);
    }
    sup.score += gift.price * qty;
    io.to('room:' + battle.roomId).emit('battle:giftAnimation', {
      sender: publicUser(u), receiver: publicUserSafe(receiverId === battle.player1Id ? battle.player1Obj : battle.player2Obj),
      senderName: u.username, senderId: u.uid || u.guestId || u.userId,
      receiverName: receiverIdx === 0 ? battle.player1Name : battle.player2Name, receiverId,
      giftIcon: gift.icon, giftName: gift.name, quantity: qty,
    });
    io.to('room:' + battle.roomId).emit('battle:topSupporters', { player1Supporters: battle.supporters[0] || [], player2Supporters: battle.supporters[1] || [] });
  });

  // ── Room music (أغاني الغرفة) ────────────────────────────────────────────
  function musicStateFor(roomId) {
    return roomMusic.get(String(roomId)) || { current: null, queue: [], playing: false, position: 0, volume: 1, currentTime: 0 };
  }
  function broadcastMusic(roomId, extra) {
    const st = musicStateFor(roomId);
    io.to('room:' + roomId).emit('room-music:state', { roomId: Number(roomId), ...st, ...extra });
  }
  function broadcastMusicQueue(roomId) {
    io.to('room:' + roomId).emit('room-music:queue-update', musicStateFor(roomId).queue || []);
  }
  function nextMusicIfNeeded(roomId) {
    const st = roomMusic.get(String(roomId));
    if (!st || st.current) return;
    if (st.queue.length > 0) {
      const next = st.queue.shift();
      st.current = next;
      st.playing = true;
      st.position = 0;
      broadcastMusic(roomId);
      broadcastMusicQueue(roomId);
    }
  }
  socket.on('room-music:get-state', (data) => {
    const roomId = (data && data.roomId !== undefined) ? data.roomId : (findSocketUser(socket.id) && findSocketUser(socket.id).roomid) || GENERAL_ROOM_ID;
    socket.emit('room-music:state', { roomId: Number(roomId), ...musicStateFor(roomId) });
  });
  socket.on('room-music:add-to-queue', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = (u.roomid) || GENERAL_ROOM_ID;
    const room = findRoomByAnyId(roomId);
    // Guests may not queue music; members when the room allows requests (or mods/admins always).
    if (u.type === 'guest') return;
    const isMod = isRoomModerator(roomId, u) || permissionsFor(u).isAdmin;
    if (room && room.allowRoomMusic === false && !isMod) return;
    if (room && room.membersCanRequestMusic === false && !isMod) return;
    const rl = rateLimit(socket.id, { max: 15, windowMs: 60000 }, 'room-music');
    if (rl && rl.blocked) return;
    const st = roomMusic.get(String(roomId)) || { current: null, queue: [], playing: false, position: 0, volume: 1, currentTime: 0 };
    if (st.queue.length >= 100) { socket.emit('room-music:error', { message: 'قائمة الانتظار ممتلئة' }); return; }
    if (!st.current && st.queue.length === 0) { st.current = null; }
    st.queue.push({ queueId: nextId('mq_'), videoId: String((data && data.videoId) || '').substring(0, 64), title: String((data && data.title) || '').substring(0, 150), requestedBy: u.username });
    roomMusic.set(String(roomId), st);
    broadcastMusicQueue(roomId);
    nextMusicIfNeeded(roomId);
  });
  socket.on('room-music:remove-from-queue', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = u.roomid || GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    const qid = String((data && data.queueId) || '');
    const entry = st.queue.find((q) => String(q.queueId) === qid);
    if (!entry) return;
    const isOwner = String(entry.requestedBy).toLowerCase() === String(u.username).toLowerCase();
    if (!isOwner && !permissionsFor(u).isAdmin && !isRoomModerator(roomId, u)) return;
    st.queue = st.queue.filter((q) => String(q.queueId) !== qid);
    broadcastMusicQueue(roomId);
  });
  socket.on('room-music:leave-queue', () => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = u.roomid || GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    st.queue = st.queue.filter((q) => String(q.requestedBy).toLowerCase() !== String(u.username).toLowerCase());
    if (st.current && String(st.current.requestedBy).toLowerCase() === String(u.username).toLowerCase()) {
      st.current = null; st.playing = false; st.position = 0;
      broadcastMusic(roomId);
      nextMusicIfNeeded(roomId);
    }
    broadcastMusicQueue(roomId);
  });
  socket.on('room-music:play', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const roomId = u.roomid || GENERAL_ROOM_ID;
    const room = findRoomByAnyId(roomId);
    // Control actions require a member (guests may not override the room's audio)
    // and the room's music permission (membersCanRequestMusic / moderator).
    if (u.type === 'guest') return;
    const isMod = isRoomModerator(roomId, u) || permissionsFor(u).isAdmin;
    if (room && room.moderatorsCanManageMusic === false && !room.membersCanRequestMusic && !isMod) return;
    const rl = rateLimit(socket.id, { max: 15, windowMs: 60000 }, 'room-music');
    if (rl && rl.blocked) return;
    const st = roomMusic.get(String(roomId)) || { current: null, queue: [], playing: false, position: 0, volume: 1, currentTime: 0 };
    st.current = { queueId: nextId('mq_'), videoId: String((data && data.videoId) || '').substring(0, 64), title: String((data && data.title) || '').substring(0, 150), requestedBy: u.username };
    st.playing = true;
    st.position = 0;
    st.currentTime = 0;
    roomMusic.set(String(roomId), st);
    broadcastMusic(roomId);
  });
  socket.on('room-music:pause', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = u ? u.roomid : GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    if (!permissionsFor(u).isAdmin && !isRoomModerator(roomId, u)) return;
    st.playing = false;
    st.currentTime = Number((data && data.currentTime) || st.currentTime || 0);
    broadcastMusic(roomId);
  });
  socket.on('room-music:resume', () => {
    const u = findSocketUser(socket.id);
    const roomId = u ? u.roomid : GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st || !st.current) return;
    if (!permissionsFor(u).isAdmin && !isRoomModerator(roomId, u)) return;
    st.playing = true;
    broadcastMusic(roomId);
  });
  socket.on('room-music:stop', () => {
    const u = findSocketUser(socket.id);
    const roomId = u ? u.roomid : GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    if (!permissionsFor(u).isAdmin && !isRoomModerator(roomId, u)) return;
    st.current = null;
    st.playing = false;
    st.position = 0;
    st.currentTime = 0;
    broadcastMusic(roomId);
    nextMusicIfNeeded(roomId);
  });
  socket.on('room-music:seek', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = u ? u.roomid : GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    if (!permissionsFor(u).isAdmin && !isRoomModerator(roomId, u)) return;
    st.position = Math.max(0, Number((data && data.position)) || 0);
    st.currentTime = st.position;
    broadcastMusic(roomId);
  });
  socket.on('room-music:set-volume', (data) => {
    const u = findSocketUser(socket.id);
    const roomId = u ? u.roomid : GENERAL_ROOM_ID;
    const st = roomMusic.get(String(roomId));
    if (!st) return;
    st.volume = Math.min(1, Math.max(0, Number((data && data.volume)) || 0));
    broadcastMusic(roomId);
  });

  // ── Private video/voice call (مكالمة خاصة) ───────────────────────────────
  socket.on('pmcall:invite', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const gate = likeGate(u, 'call');
    if (!gate.ok) { socket.emit('pmcall:error', { message: likeGateMessage('call', gate) }); return; }
    const targetUserId = String((data && data.targetUserId) || '');
    let target = null, tid = null;
    onlineSockets.forEach((t, sid) => { if (String(t.uid || t.guestId || t.userId) === targetUserId) { target = t; tid = sid; } });
    if (!target || !tid) { socket.emit('pmcall:error', { message: 'العضو غير متصل الآن' }); return; }
    let busy = false;
    privateCalls.forEach((c) => {
      if (String(c.callerId) === String(targetUserId) || String(c.calleeId) === String(targetUserId)) busy = true;
    });
    if (busy) { socket.emit('pmcall:busy'); return; }
    const callId = 'pc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    privateCalls.set(callId, { callId, callerId: u.uid || u.guestId || u.userId, calleeId: targetUserId, status: 'ringing' });
    io.to(tid).emit('pmcall:incoming', { callId, caller: publicUser(u) });
    socket.emit('pmcall:state', { callId, status: 'ringing' });
  });
  function pmcallPeer(callId, exceptId) {
    const c = privateCalls.get(callId);
    if (!c) return null;
    let peer = null, peerSid = null;
    const peerId = String(c.callerId) === String(exceptId) ? c.calleeId : c.callerId;
    onlineSockets.forEach((t, sid) => { if (String(t.uid || t.guestId || t.userId) === String(peerId)) { peer = t; peerSid = sid; } });
    return peerSid;
  }
  socket.on('pmcall:accept', (data) => {
    const u = findSocketUser(socket.id);
    const callId = String((data && data.callId) || '');
    const c = privateCalls.get(callId);
    if (!c) return;
    c.status = 'active';
    const peerSid = pmcallPeer(callId, u ? u.uid || u.guestId || u.userId : '');
    if (peerSid) io.to(peerSid).emit('pmcall:accept', { callId });
    socket.emit('pmcall:accept', { callId });
  });
  socket.on('pmcall:signal', (data) => {
    const u = findSocketUser(socket.id);
    const callId = String((data && data.callId) || '');
    const c = privateCalls.get(callId);
    if (!c) return;
    const peerSid = pmcallPeer(callId, u ? u.uid || u.guestId || u.userId : '');
    if (peerSid) io.to(peerSid).emit('pmcall:signal', { callId, signal: data.signal, fromUserId: u ? u.uid || u.guestId || u.userId : '' });
  });
  socket.on('pmcall:hangup', (data) => {
    const u = findSocketUser(socket.id);
    const callId = String((data && data.callId) || '');
    const c = privateCalls.get(callId);
    if (!c) return;
    const reason = (data && data.reason) || 'disconnected';
    const peerSid = pmcallPeer(callId, u ? u.uid || u.guestId || u.userId : '');
    privateCalls.delete(callId);
    if (peerSid) io.to(peerSid).emit('pmcall:hangup', { callId, reason });
  });

  // ── Camera (كاميرا) ──────────────────────────────────────────────────────
  socket.on('camera:request', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const targetUserId = String((data && data.targetId) || '');
    const tids = socketsForUserId(targetUserId);
    if (tids.length === 0) { socket.emit('camera:error', { message: 'العضو غير متصل' }); return; }
    // Only allow camera requests between users present in the same room.
    const targetOnline = socketsForUserId(targetUserId).map((sid) => onlineSockets.get(sid)).filter(Boolean);
    const sameRoom = targetOnline.some((tu) => String(tu.roomid) === String(u.roomid));
    if (!sameRoom) { socket.emit('camera:error', { message: 'يجب أن يكون العضو في نفس الغرفة' }); return; }
    tids.forEach((sid) => io.to(sid).emit('camera:request', { requesterId: u.uid || u.guestId || u.userId, requester: publicUser(u), requestId: nextId('cam_') }));
  });
  socket.on('camera:accept', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const viewerId = String((data && data.targetId) || '');
    const ownerId = u.uid || u.guestId || u.userId;
    if (!viewerId || viewerId === ownerId) return;
    const ownerSockets = socketsForUserId(ownerId);
    if (ownerSockets.length === 0) return;
    // The caller must be the camera owner: verify it is the stream owner that
    // grants consent (accept must come from the owner's own socket).
    const sess = cameraSessions.get(ownerId) || new Set();
    sess.add(viewerId);
    cameraSessions.set(ownerId, sess);
    const viewerSids = socketsForUserId(viewerId);
    viewerSids.forEach((sid) => io.to(sid).emit('camera:accepted', { ownerId, ownerUsername: u.username, targetId: viewerId }));
  });
  socket.on('camera:reject', (data) => {
    const u = findSocketUser(socket.id);
    const targetUserId = String((data && data.targetId) || '');
    const tids = socketsForUserId(targetUserId);
    tids.forEach((sid) => io.to(sid).emit('camera:rejected', { username: u ? u.username : '' }));
  });
  socket.on('camera:viewer-ready', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const ownerId = String((data && data.targetId) || '');
    const viewerId = u.uid || u.guestId || u.userId;
    if (!ownerId || ownerId === viewerId) return;
    // Consent gate: the owner must have accepted this viewer before the server
    // tells the owner's client to start broadcasting the camera to them.
    const sess = cameraSessions.get(ownerId);
    if (!sess || !sess.has(viewerId)) { socket.emit('camera:error', { message: 'لم يتم الموافقة على الطلب' }); return; }
    const tids = socketsForUserId(ownerId);
    tids.forEach((sid) => io.to(sid).emit('camera:start-broadcast', { viewerId, viewer: publicUser(u) }));
  });
  socket.on('camera:offer', (data) => {
    const u = findSocketUser(socket.id);
    const targetUserId = String((data && data.targetId) || '');
    const uid = u ? u.uid || u.guestId || u.userId : '';
    if (!u || !uid) return;
    // Only relay camera signaling between an owner and a viewer that has been
    // accepted for a session (both directions).
    const a = cameraSessions.get(uid);
    const b = cameraSessions.get(targetUserId);
    if (!((a && a.has(targetUserId)) || (b && b.has(uid)))) return;
    const tids = socketsForUserId(targetUserId);
    tids.forEach((sid) => io.to(sid).emit('camera:offer', { offer: data.offer, fromId: uid }));
  });
  socket.on('camera:answer', (data) => {
    const u = findSocketUser(socket.id);
    const targetUserId = String((data && data.targetId) || '');
    const uid = u ? u.uid || u.guestId || u.userId : '';
    if (!u || !uid) return;
    const a = cameraSessions.get(uid);
    const b = cameraSessions.get(targetUserId);
    if (!((a && a.has(targetUserId)) || (b && b.has(uid)))) return;
    const tids = socketsForUserId(targetUserId);
    tids.forEach((sid) => io.to(sid).emit('camera:answer', { answer: data.answer, fromId: uid }));
  });
  socket.on('camera:candidate', (data) => {
    const u = findSocketUser(socket.id);
    const targetUserId = String((data && data.targetId) || '');
    const uid = u ? u.uid || u.guestId || u.userId : '';
    if (!u || !uid) return;
    const a = cameraSessions.get(uid);
    const b = cameraSessions.get(targetUserId);
    if (!((a && a.has(targetUserId)) || (b && b.has(uid)))) return;
    const tids = socketsForUserId(targetUserId);
    tids.forEach((sid) => io.to(sid).emit('camera:candidate', { candidate: data.candidate, fromId: uid }));
  });
  socket.on('camera:pause', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const uid = u.uid || u.guestId || u.userId;
    const viewers = cameraSessions.get(String(uid)) || new Set();
    viewers.forEach((viewerId) => {
      const tids = socketsForUserId(viewerId);
      tids.forEach((sid) => io.to(sid).emit('camera:paused', { userId: uid, paused: !!(data && data.paused) }));
    });
  });
  socket.on('camera:end', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const uid = u.uid || u.guestId || u.userId;
    const targetUserId = String((data && data.targetId) || '');
    if (targetUserId) {
      const tids = socketsForUserId(targetUserId);
      tids.forEach((sid) => io.to(sid).emit('camera:ended', { userId: uid }));
      const sess = cameraSessions.get(String(uid));
      if (sess) sess.delete(targetUserId);
    } else {
      cameraSessions.forEach((viewers, ownerId) => {
        if (viewers.has(uid)) viewers.delete(uid);
      });
    }
  });

  // ── Live broadcast (بث مباشر) ─────────────────────────────────────────────
  socket.on('liveBroadcast:start', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    if (!permissionsFor(u).permissions.canStartLiveBroadcast) {
      socket.emit('liveBroadcast:error', { message: 'لا تملك صلاحية البث المباشر' });
      return;
    }
    const roomId = u.roomid || GENERAL_ROOM_ID;
    const lb = liveBroadcasts.get(String(roomId));
    if (lb) { socket.emit('liveBroadcast:error', { message: 'يوجد بث مباشر في هذه الغرفة' }); return; }
    const entry = { socketId: socket.id, userId: u.uid || u.guestId || u.userId, username: u.username, sourceType: (data && data.sourceType) || 'camera', scope: (data && data.scope) || 'room', viewers: new Set(), startedAt: Date.now() };
    liveBroadcasts.set(String(roomId), entry);
    io.to('room:' + roomId).emit('liveBroadcast:notify', { broadcasterId: entry.userId, broadcaster: publicUser(u), username: u.username, sourceType: entry.sourceType, scope: entry.scope, roomId: Number(roomId) });
    spectrumUpdate();
  });
  socket.on('liveBroadcast:watch', (data) => {
    const u = findSocketUser(socket.id);
    if (!u) return;
    const broadcasterId = String((data && data.broadcasterId) || '');
    let lb = null;
    liveBroadcasts.forEach((b) => { if (String(b.userId) === broadcasterId) lb = b; });
    if (!lb) { socket.emit('liveBroadcast:error', { message: 'البث غير متاح' }); return; }
    lb.viewers.add(u.uid || u.guestId || u.userId);
    io.to(lb.socketId).emit('liveBroadcast:viewer-request', { viewerId: u.uid || u.guestId || u.userId, viewer: publicUser(u) });
  });
  function isLiveBroadcastParticipant(socketId, targetSocketId) {
    const u = onlineSockets.get(socketId);
    if (!u) return false;
    const uid = u.uid || u.guestId || u.userId;
    const targetU = onlineSockets.get(targetSocketId);
    if (!targetU) return false;
    const targetUid = targetU.uid || targetU.guestId || targetU.userId;
    // Broadcasters may signal to their viewers and vice-versa within the same live broadcast.
    let lb = null;
    liveBroadcasts.forEach((b) => { if (b.socketId === socketId || String(b.userId) === uid) lb = b; });
    if (lb && (lb.socketId === targetSocketId || lb.viewers.has(targetUid))) return true;
    lb = null;
    liveBroadcasts.forEach((b) => { if (b.socketId === targetSocketId || String(b.userId) === targetUid) lb = b; });
    if (lb && (lb.socketId === socketId || lb.viewers.has(uid))) return true;
    return false;
  }
  socket.on('liveBroadcast:offer', (data) => {
    const targetSid = String((data && data.targetSocketId) || '');
    if (!isLiveBroadcastParticipant(socket.id, targetSid)) return;
    const sock = io.sockets.sockets.get(targetSid);
    if (sock) sock.emit('liveBroadcast:offer', { offer: data.offer, fromSocketId: socket.id });
  });
  socket.on('liveBroadcast:answer', (data) => {
    const targetSid = String((data && data.targetSocketId) || '');
    if (!isLiveBroadcastParticipant(socket.id, targetSid)) return;
    const sock = io.sockets.sockets.get(targetSid);
    if (sock) sock.emit('liveBroadcast:answer', { answer: data.answer, fromSocketId: socket.id });
  });
  socket.on('liveBroadcast:ice-candidate', (data) => {
    const targetSid = String((data && data.targetSocketId) || '');
    if (!isLiveBroadcastParticipant(socket.id, targetSid)) return;
    const sock = io.sockets.sockets.get(targetSid);
    if (sock) sock.emit('liveBroadcast:ice-candidate', { candidate: data.candidate, fromSocketId: socket.id });
  });
  socket.on('liveBroadcast:viewer-left', (data) => {
    const u = findSocketUser(socket.id);
    const broadcasterId = String((data && data.broadcasterId) || '');
    let lb = null;
    liveBroadcasts.forEach((b) => { if (String(b.userId) === broadcasterId) lb = b; });
    if (lb) {
      lb.viewers.delete(u ? u.uid || u.guestId || u.userId : '');
      io.to(lb.socketId).emit('liveBroadcast:viewer-left', { viewerId: u ? u.uid || u.guestId || u.userId : '' });
    }
  });
  socket.on('liveBroadcast:stop', () => {
    const u = findSocketUser(socket.id);
    let roomId = null;
    liveBroadcasts.forEach((b, key) => { if (b.socketId === socket.id) roomId = key; });
    if (roomId === null) return;
    const lb = liveBroadcasts.get(roomId);
    liveBroadcasts.delete(roomId);
    const payload = { broadcasterId: lb.userId, broadcaster: u ? publicUser(u) : { username: lb.username }, roomId: Number(roomId) };
    lb.viewers.forEach((viewerId) => {
      const tids = socketsForUserId(viewerId);
      tids.forEach((sid) => io.to(sid).emit('liveBroadcast:ended', { ...payload, reason: 'ended' }));
    });
    io.to('room:' + roomId).emit('liveBroadcast:ended', { ...payload, reason: 'ended' });
    spectrumUpdate();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────
// Rehydrate per-room moderator + mic-lock maps from the DB so they survive a
// restart (otherwise socketModeratorSync would wipe persisted data with the
// empty in-memory maps).
function rehydrateRoomFeatures() {
  try {
