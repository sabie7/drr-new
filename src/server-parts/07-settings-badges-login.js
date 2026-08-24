/* ═══════════════════════════════════════════════════
   SERVER-PART 07/16 · settings-badges-login
   lines 1083–1135 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
0
/* Kaz alwadi (c) 2026 — settings-badges-login */
function badgeConfigGet() {
  const doc = moduleSettings();
  const b = (doc && doc.badgesCfg && typeof doc.badgesCfg === 'object') ? doc.badgesCfg : {};
  const out = { enabled: !!b.enabled, badges: {} };
  BADGE_LEVELS.forEach((lv) => { if (b.badges && b.badges[lv]) out.badges[lv] = String(b.badges[lv]).substring(0, 300); });
  return out;
}
function badgeConfigSave(patch) {
  if (!db || !db.settings) return badgeConfigGet();
  const doc = moduleSettings();
  const cur = badgeConfigGet();
  if (patch && patch.enabled !== undefined) cur.enabled = !!patch.enabled;
  if (patch && patch.badges && typeof patch.badges === 'object') {
    const clean = {};
    BADGE_LEVELS.forEach((lv) => {
      const u = String(patch.badges[lv] || '').trim();
      if (u) clean[lv] = u.substring(0, 300);
    });
    cur.badges = clean;
  }
  if (doc) doc.badgesCfg = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { badgesCfg: cur } });
  return cur;
}

// ── Login behavior (consumed via /api/settings/login-behavior) ──
const LOGIN_BEHAVIOR_DEFAULTS = { behavior: 'default_room', openUsersTabOnLogin: false, lowLikesRoomId: 0, lowLikesMaxLikes: 0 };
function loginBehaviorSettings() {
  const doc = moduleSettings();
  const l = (doc && doc.loginBehavior && typeof doc.loginBehavior === 'object') ? doc.loginBehavior : {};
  return {
    behavior: l.behavior === 'lobby' ? 'lobby' : 'default_room',
    openUsersTabOnLogin: !!l.openUsersTabOnLogin,
    lowLikesRoomId: parseInt(l.lowLikesRoomId, 10) || 0,
    lowLikesMaxLikes: parseInt(l.lowLikesMaxLikes, 10) || 0
  };
}
function loginBehaviorSave(patch) {
  if (!db || !db.settings) return loginBehaviorSettings();
  const doc = moduleSettings();
  const cur = loginBehaviorSettings();
  if (patch && patch.behavior !== undefined) cur.behavior = patch.behavior === 'lobby' ? 'lobby' : 'default_room';
  if (patch && patch.openUsersTabOnLogin !== undefined) cur.openUsersTabOnLogin = !!patch.openUsersTabOnLogin;
  if (patch && patch.lowLikesRoomId !== undefined) cur.lowLikesRoomId = parseInt(patch.lowLikesRoomId, 10) || 0;
  if (patch && patch.lowLikesMaxLikes !== undefined) cur.lowLikesMaxLikes = parseInt(patch.lowLikesMaxLikes, 10) || 0;
  if (doc) doc.loginBehavior = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { loginBehavior: cur } });
  return cur;
}

// Build the JSON-LD structured data from live settings so the logo/banner in
// the schema always match the currently uploaded favicon/banner.
function buildJsonLd(seo) {
