/* ═══════════════════════════════════════════════════
   SERVER-PART 16/16 · boot-final-listen
   lines 6489–6549 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
    (db.rooms.getAll() || []).forEach((r) => {
      const rid = String(r.id);
      if (Array.isArray(r.moderators) && r.moderators.length > 0 && !roomModerators.has(rid)) {
        setRoomModerators(rid, r.moderators);
      }
      if (Array.isArray(r.lockedMics) && r.lockedMics.length > 0 && !roomMicLocks.has(rid)) {
        const lm = new Map();
        r.lockedMics.forEach((mi) => { lm.set(String(mi), ''); });
        roomMicLocks.set(rid, lm);
      }
    });
  } catch (e) { logger.warn('boot.features', 'Rehydrate failed', { error: e.message }); }
}
async function start() {
  await connect();
  db = getDb();
  loadWall();
  loadStories();
  pruneStories();
  loadStoryBans();
  rehydrateRoomFeatures();
  // Seed default room if empty (RoomManager equivalent). The modern client
  // treats room ids as numeric (Number(r.id), Number(data.roomId)), so the
  // main room must carry a numeric id matching GENERAL_ROOM_ID.
  const existingRooms = db.rooms.getAll() || [];
  const mainRoom = existingRooms.find((r) => Number(r.id) === Number(GENERAL_ROOM_ID));
  if (!mainRoom) {
    // Discard legacy-format room docs (old schema: string ids, no owner) and
    // seed a clean main room the modern client can render.
    const cleanMain = { id: GENERAL_ROOM_ID, name: 'الساحة الرئيسية', owner: 'system', ownerId: '', password: '', created: new Date().toISOString(), online: 0 };
    try { db.rooms.drop(); } catch (e) { /* noop */ }
    db.rooms.create(cleanMain);
    logger.info('db.seed', 'Modern main room seeded', { id: GENERAL_ROOM_ID });
  }
  logger.info('server.start', 'Modern protocol server running', { port: PORT });
  // Lightweight story lifecycle: prune expired stories on an hourly cadence.
  setInterval(pruneStories, 60 * 60 * 1000).unref();
  server.listen(PORT, () => {
    const adminCred = getAdminCredentials();
    if (adminCred) {
      console.log('\n══════════════════════════════════════════════');
      console.log('  DRR Chat — Modern protocol server (live client)');
      console.log('  URL:      http://localhost:' + PORT);
      console.log('  Control:  http://localhost:' + PORT + '/cp');
      console.log('  Admin:    ' + adminCred.username + ' / ' + adminCred.password);
      console.log('══════════════════════════════════════════════\n');
    }
  });
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

if (require.main === module) {
  start().catch((e) => {
    logger.error('server.start', 'Fatal', { error: e && e.stack || e });
    process.exit(1);
  });
}

module.exports = { app, server, io, start };
