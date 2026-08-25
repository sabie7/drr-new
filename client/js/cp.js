var socket = io('/');
var connected = false;
var authed = false;

var state = {
  password: '',
  siteweb: {},
  seo: {},
  appearance: {},
  dro3: [], emo: [], sico: [],
  powers: [],
  noletters: [],
  users: [],
  rooms: [],
  bands: [],
  shrt: [], msgs: [], subs: [],
  bans: { browsers: {}, systems: {} },
  health: {},
  audit: [],
  online: [],
  postsMod: [],
  storiesMod: [],
  addons: [],
  storyBans: [],
  userProfile: null,
  roomProfile: null,
  userFilter: '',
  features: {},
  tickers: { news: {}, ads: { settings: {}, ads: [] } },
  badges: { enabled: false, badges: {} },
  loginBehavior: {},
  zajel: { approved: [], pending: [] }
};

/* ─── helpers ─── */

function $(id) { return document.getElementById(id); }
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function attr(s) { return esc(s); }

function toast(msg, type) {
  var box = $('cp-toasts');
  if (!box) return;
  var t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3200);
  setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3600);
}

function setStatus(msg, mode) {
  var dot = $('cp-status-dot'), txt = $('cp-status-text');
  if (txt) txt.textContent = msg;
  if (dot) { dot.className = mode === 'ok' ? 'on' : mode === 'err' ? 'off' : ''; dot.id = 'cp-status-dot'; }
}

function admin(cmd, data) {
  socket.emit('msg', { cmd: 'admin', data: { cmd: cmd, pass: state.password, data: data || {} } });
}
function getState() {
  socket.emit('msg', { cmd: 'getstate', data: { password: state.password } });
}

function fmtBytes(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  var u = ['B', 'KB', 'MB', 'GB'], i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(1) + ' ' + u[i];
}
function fmtUptime(sec) {
  if (sec === undefined || sec === null || isNaN(sec)) return '—';
  var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  var out = [];
  if (d) out.push(d + 'ي');
  if (h) out.push(h + 'س');
  if (m) out.push(m + 'د');
  return out.length ? out.join(' ') : Math.floor(sec) + 'ث';
}
function fmtDate(s) {
  return esc(String(s || '').replace('T', ' ').replace('Z', '').substring(0, 16));
}

function debounce(fn, ms) {
  var t;
  return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
}

/* ─── renderers ─── */

var APPEARANCE_DEFAULTS = {
  mainUiColor: '#794e4e', landingBgColor: '#3b3a3a', chatInputBg: '#794e4e',
  unifiedBtnBg: '#4c0d21', unifiedBtnHoverBg: '#3b0d1b', micIconColor: '#e8dcd4',
  micBtnBgColor: '#4c0d21', lineIconColor: '#e8dcd4', tickerBgColor: '#4c0d21', tickerTextColor: '#e8dcd4'
};

function setVal(id, v) { var el = $(id); if (el && v !== undefined && v !== null) el.value = v; }
function setChk(id, v) { var el = $(id); if (el) el.checked = !!v; }

function renderSettings() {
  var s = state.siteweb || {};
  setVal('s-name', s.name); setVal('s-title', s.title); setVal('s-msgst', s.msgst);
  setVal('s-bg', s.bg || '#40404f'); setVal('s-buttons', s.buttons || '#f93634'); setVal('s-background', s.background || '#40404f');
  setChk('s-allowg', s.allowg); setChk('s-allowreg', s.allowreg);
  var def = { wall: 100, private: 200, story: 300, call: 400, mic: 500 };
  var g = s.likeGates || {};
  ['wall', 'private', 'story', 'call', 'mic'].forEach(function (k) { setVal('s-like-' + k, g[k] !== undefined ? g[k] : def[k]); });
}

function renderSeo() {
  var s = state.seo || {};
  setVal('seo-siteName', s.siteName); setVal('seo-siteTitle', s.siteTitle);
  setVal('seo-siteDescription', s.siteDescription); setVal('seo-siteKeywords', s.siteKeywords);
  setVal('seo-canonicalUrl', s.canonicalUrl); setVal('seo-robotsMeta', s.robotsMeta || 'index, follow');
  setVal('seo-ogImage', s.ogImage); setVal('seo-twitterCard', s.twitterCard || 'summary_large_image');
  setVal('seo-themeColor', s.themeColor || '#794e4e'); setVal('seo-googleSiteVerification', s.googleSiteVerification || '');
  setVal('seo-sameAs', (Array.isArray(s.sameAs) ? s.sameAs : []).join('\n'));
  setChk('seo-enableSitemap', s.enableSitemap !== false);
  setChk('seo-enableRobotsTxt', s.enableRobotsTxt !== false);
  setChk('seo-noindex', !!s.noindex);
  setVal('ap-siteName', s.siteName); setVal('ap-siteTitle', s.siteTitle); setVal('ap-siteDescription', s.siteDescription);
  var fv = $('img-favicon-preview'), bn = $('img-banner-preview'), pc = $('img-pic-preview');
  if (fv && s.faviconUrl) fv.src = s.faviconUrl;
  if (bn && s.bannerUrl) bn.src = s.bannerUrl;
  if (pc && s.defaultAvatarUrl) pc.src = s.defaultAvatarUrl;
}

function renderAppearance() {
  var s = state.appearance || {};
  for (var k in APPEARANCE_DEFAULTS) setVal('ap-' + k, s[k] || APPEARANCE_DEFAULTS[k]);
  setVal('ap-fontFamily', s.fontFamily || 'Arial, sans-serif');
  setVal('ap-fontSize', s.fontSize != null ? s.fontSize : 15);
  setVal('ap-fontWeight', s.fontWeight != null ? s.fontWeight : 700);
  setVal('ap-footerText', s.footerText || '');
}

/* ─── features / tickers / badges / login behavior / zajel / emos ─── */

var FEATURES_BOOLS = [
  ['storiesEnabled', 'القصص'], ['wallEnabled', 'الجدار'], ['privateTabEnabled', 'الخاص'],
  ['roomsEnabled', 'الغرف'], ['voiceEnabled', 'الصوت'], ['gamesEnabled', 'الألعاب'],
  ['zajelEnabled', 'الزاجل'], ['quickChatEnabled', 'الدردشة السريعة'], ['profilesEnabled', 'الملفات الشخصية'],
  ['giftsEnabled', 'الهدايا'], ['liveBroadcastEnabled', 'البث المباشر'], ['battleChallengesEnabled', 'تحديات المعارك'],
  ['publicMessageDeletionEnabled', 'حذف الرسائل العامة'], ['publicMessageReplyEnabled', 'الرد على الرسائل'],
  ['statusColorEnabled', 'ألوان الحالة'], ['profileLightboxEnabled', 'عرض الصور المكبر'],
  ['mentionsEnabled', 'المنشن (@)'], ['sidebarAddonsEnabled', 'إضافات القائمة الجانبية'],
  ['sidebarMemberSearchEnabled', 'بحث الأعضاء'], ['wallPostCommentsEnabled', 'تعليقات الجدار'],
  ['wallPostLikesEnabled', 'إعجابات الجدار'], ['wallYoutubeBarEnabled', 'شريط يوتيوب'],
  ['disableCopy', 'منع النسخ'], ['disableRightClick', 'منع الزر الأيمن']
];

function renderFeatures() {
  var grid = $('cp-features-grid');
  if (!grid) return;
  var f = state.features || {};
  var html = FEATURES_BOOLS.map(function (d) {
    var on = f[d[0]] === undefined ? true : !!f[d[0]];
    return '<label class="chk"><input type="checkbox" class="ft-chk" data-key="' + d[0] + '"' + (on ? ' checked' : '') + '> ' + d[1] + '</label>';
  }).join('');
  grid.innerHTML = html;
  setVal('ft-likes_notifications', f.likes_notifications != null ? f.likes_notifications : 20);
  setVal('ft-likes_effects', f.likes_effects != null ? f.likes_effects : 100);
}

function adRowHtml(ad) {
  return '<div class="grid g3 ad-row" style="align-items:end">' +
    '<div class="fld"><label>نص الإعلان</label><input class="ad-content" value="' + attr(ad.content || '') + '" maxlength="300"></div>' +
    '<div class="fld"><label>رابط (اختياري)</label><input class="ad-link" value="' + attr(ad.linkUrl || '') + '" dir="ltr"></div>' +
    '<div class="fld"><button class="btn btn-danger btn-sm ad-del">🗑 حذف</button></div>' +
    '</div>';
}
function bindAdRows() {
  var box = $('cp-ads-list');
  if (!box) return;
  box.querySelectorAll('.ad-del').forEach(function (b) {
    b.addEventListener('click', function () { b.closest('.ad-row').remove(); });
  });
}
function renderTickers() {
  var n = (state.tickers && state.tickers.news) || {};
  setChk('nt-enabled', n.enabled); setVal('nt-text', n.text || '');
  setVal('nt-bgColor', n.bgColor || '#ff0000'); setVal('nt-textColor', n.textColor || '#ffffff');
  var a = (state.tickers && state.tickers.ads) || {};
  var st = a.settings || {};
  setChk('ad-enabled', st.enabled); setVal('ad-speed', st.speed != null ? st.speed : 30);
  setVal('ad-bgColor', st.bgColor || '#fff8e1'); setVal('ad-textColor', st.textColor || '#4b3600');
  var box = $('cp-ads-list');
  if (box) {
    box.innerHTML = (a.ads || []).map(adRowHtml).join('') || '<span class="muted small">لا إعلانات</span>';
    bindAdRows();
  }
}

var BADGE_TIERS = [
  [1, 'وسام البداية', 1000], [2, 'وسام التميز', 3000], [3, 'وسام النشاط', 5000],
  [4, 'وسام القوة', 10000], [5, 'وسام النخبة', 20000], [6, 'وسام الأسطورة', 50000]
];
function renderBadges() {
  var el = $('cp-badges-editor');
  if (!el) return;
  var b = state.badges || {};
  setChk('bd-enabled', b.enabled);
  el.innerHTML = '<div class="grid g3">' + BADGE_TIERS.map(function (t) {
    var url = (b.badges || {})[t[0]] || '';
    return '<div class="asset-item">' +
      '<img id="bd-img-' + t[0] + '" src="' + attr(url) + '" style="' + (url ? '' : 'opacity:.25') + '">' +
      '<span class="a-name">' + t[1] + '<br>' + t[2].toLocaleString('en') + ' نقطة</span>' +
      '<button class="btn btn-sm btn-info mt" data-bd-upload="' + t[0] + '">⬆ رفع صورة</button>' +
      '<input type="file" id="bd-file-' + t[0] + '" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none">' +
      (url ? '<button class="btn btn-sm btn-ghost mt" data-bd-clear="' + t[0] + '">✕ إزالة</button>' : '') +
      '</div>';
  }).join('') + '</div>';
  el.querySelectorAll('[data-bd-upload]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var lv = btn.getAttribute('data-bd-upload');
      var input = $('bd-file-' + lv);
      if (!input) return;
      input.onchange = function () {
        if (input.files && input.files[0]) sendImageFile(input.files[0], 'badge', lv);
        input.value = '';
      };
      input.click();
    });
  });
  el.querySelectorAll('[data-bd-clear]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var lv = btn.getAttribute('data-bd-clear');
      if (!state.badges.badges) state.badges.badges = {};
      delete state.badges.badges[lv];
      admin('set_badges', state.badges);
    });
  });
}

function renderLoginBehavior() {
  var l = state.loginBehavior || {};
  setVal('lb-behavior', l.behavior || 'default_room');
  setChk('lb-openusers', l.openUsersTabOnLogin);
}

function renderZajel() {
  var z = state.zajel || {};
  var app = z.approved || [], pend = z.pending || [];
  var c1 = $('zaj-approved-count'), c2 = $('zaj-pending-count');
  if (c1) c1.textContent = app.length;
  if (c2) c2.textContent = pend.length;
  var ta = $('zaj-approved-table');
  if (ta) {
    ta.innerHTML = '';
    if (!app.length) ta.innerHTML = '<tr><td colspan="3" class="empty-row no-l">لا رسائل معتمدة</td></tr>';
    app.forEach(function (m) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td data-l="#">' + (m.id || '') + '</td>' +
        '<td data-l="الرسالة">' + esc(m.message || '') + '</td>' +
        '<td data-l class="no-l"><button class="btn btn-sm btn-danger">حذف</button></td>';
      tr.querySelector('button').addEventListener('click', function () { admin('zajel_cp_del', { id: m.id, list: 'approved' }); });
      ta.appendChild(tr);
    });
  }
  var tp = $('zaj-pending-table');
  if (tp) {
    tp.innerHTML = '';
    if (!pend.length) tp.innerHTML = '<tr><td colspan="4" class="empty-row no-l">لا رسائل منتظرة</td></tr>';
    pend.forEach(function (m) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td data-l="#">' + (m.id || '') + '</td>' +
        '<td data-l="الكاتب">' + esc(m.username || '') + '</td>' +
        '<td data-l="الرسالة">' + esc(m.message || '') + '</td>' +
        '<td data-l class="no-l"><div class="row-btns">' +
        '<button class="btn btn-sm btn-ok" data-act="ok">موافقة</button>' +
        '<button class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
        '</div></td>';
      tr.querySelector('[data-act="ok"]').addEventListener('click', function () { admin('zajel_cp_approve', { id: m.id }); });
      tr.querySelector('[data-act="del"]').addEventListener('click', function () { admin('zajel_cp_del', { id: m.id, list: 'pending' }); });
      tp.appendChild(tr);
    });
  }
}

function assetItemHtml(kind, item) {
  return '<div class="asset-item">' +
    '<img src="' + attr(item.url) + '" alt="">' +
    '<span class="a-name">' + esc(item.name || item.shortcut || '') + '</span>' +
    '<button class="a-del" data-kind="' + kind + '" data-url="' + attr(item.url) + '" data-shortcut="' + attr(item.shortcut || '') + '">✕</button>' +
    '</div>';
}
function renderEmos() {
  var grid = $('cp-emo-grid');
  var cnt = $('emo-count');
  var list = state.emo || [];
  if (cnt) cnt.textContent = list.length;
  if (grid) {
    grid.innerHTML = list.length ? list.map(function (e) { return assetItemHtml('emo', e); }).join('') : '<span class="muted small">لا ابتسامات</span>';
    grid.querySelectorAll('.a-del').forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('حذف الابتسامة (' + b.getAttribute('data-shortcut') + ')؟')) admin('emo_item_del', { shortcut: b.getAttribute('data-shortcut') });
      });
    });
  }
}
function renderAddonsMgr() {
  var cnt = $('addon-count');
  var icons = (state.addons || []).filter(function (a) { return a.type !== 'gift'; });
  var gifts = (state.addons || []).filter(function (a) { return a.type === 'gift'; });
  if (cnt) cnt.textContent = (state.addons || []).length;
  var gi = $('cp-icon-grid'), gg = $('cp-gift-grid');
  if (gi) {
    gi.innerHTML = icons.length ? icons.map(function (a) { return assetItemHtml('addon', a); }).join('') : '<span class="muted small">لا أيقونات</span>';
  }
  if (gg) {
    gg.innerHTML = gifts.length ? gifts.map(function (a) { return assetItemHtml('addon', a); }).join('') : '<span class="muted small">لا هدايا</span>';
  }
  document.querySelectorAll('#cp-icon-grid .a-del, #cp-gift-grid .a-del').forEach(function (b) {
    b.addEventListener('click', function () {
      if (confirm('حذف هذا العنصر نهائياً من قائمة الإهداءات؟')) admin('addon_del', { url: b.getAttribute('data-url') });
    });
  });
}

var POWER_FLAGS = ['kick', 'delbc', 'alert', 'mynick', 'unick', 'ban', 'publicmsg', 'forcepm', 'roomowner', 'createroom', 'rooms', 'edituser', 'setpower', 'upgrades', 'history', 'cp', 'stealth', 'owner', 'meiut', 'loveu', 'ulike', 'flter', 'subs', 'shrt', 'msgs', 'bootedit', 'grupes', 'delmsg', 'delpic'];

function renderPowers() {
  var el = $('cp-powers-editor');
  if (!el) return;
  el.innerHTML = '';
  (state.powers || []).forEach(function (p, idx) {
    var card = document.createElement('div');
    card.className = 'cp-card';
    var flagsHtml = POWER_FLAGS.map(function (key) {
      return '<label class="chk" style="padding:4px 0"><input type="checkbox" class="pw-flag" data-key="' + key + '"' + (p[key] ? ' checked' : '') + '> ' + key + '</label>';
    }).join('');
    card.innerHTML =
      '<h5>🛡️ ' + esc(p.name || ('رتبة ' + (idx + 1))) + '</h5>' +
      '<div class="grid g4">' +
      '<div class="fld"><label>الاسم</label><input class="pw-name" value="' + attr(p.name || '') + '"></div>' +
      '<div class="fld"><label>الرتبة (rank)</label><input class="pw-rank" type="number" value="' + (p.rank || 0) + '"></div>' +
      '</div>' +
      '<div class="grid g4 mt">' + flagsHtml + '</div>' +
      '<button class="btn btn-pri btn-sm mt">💾 حفظ هذه الرتبة</button>';
    card.querySelector('.btn').addEventListener('click', function () {
      var doc = { rank: parseInt(card.querySelector('.pw-rank').value, 10) || 0, name: card.querySelector('.pw-name').value.trim(), ico: p.ico || '' };
      card.querySelectorAll('.pw-flag').forEach(function (cb) { doc[cb.getAttribute('data-key')] = cb.checked ? 1 : 0; });
      admin('save_as', { powers: state.powers.map(function (old, i) { return i === idx ? doc : old; }) });
    });
    el.appendChild(card);
  });
  if (!(state.powers || []).length) el.innerHTML = '<div class="cp-card muted">لا توجد رتب محملة</div>';
}

function renderUsers() {
  var tbody = $('cp-users-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  var list = state.users || [];
  var q = (state.userFilter || '').trim().toLowerCase();
  if (q) list = list.filter(function (u) { return String(u.topic || u.username || '').toLowerCase().indexOf(q) !== -1; });
  var cnt = $('cp-users-count');
  if (cnt) cnt.textContent = q ? (list.length + ' / ' + (state.users || []).length) : (state.users || []).length;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row no-l">' + (q ? 'لا نتائج مطابقة' : 'لا يوجد أعضاء') + '</td></tr>';
    return;
  }
  list.slice(0, 200).forEach(function (u) {
    var name = u.topic || u.username || '';
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-l="الاسم"><b>' + esc(name) + '</b>' + (u.verified ? ' ✅' : '') + '</td>' +
      '<td data-l="الرتبة">' + esc(u.power || 'user') + '</td>' +
      '<td data-l="النقاط">' + (u.rep || 0) + ' نقطة</td>' +
      '<td data-l="IP">' + esc(u.ip || '—') + '</td>' +
      '<td data-l class="no-l"><div class="row-btns">' +
      '<button class="btn btn-sm btn-info" data-act="edit">تعديل</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="pow">رتبة</button>' +
      '<button class="btn btn-sm btn-danger" data-act="ban">حظر</button>' +
      '<button class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
      '</div></td>';
    tr.querySelector('[data-act="edit"]').addEventListener('click', function () { admin('get_user_profile', { topic: name }); });
    tr.querySelector('[data-act="pow"]').addEventListener('click', function () {
      var p = prompt('الرتبة الجديدة لـ ' + name + ':', u.power || 'user');
      if (p) admin('setuserpower', { name: name, power: p.trim() });
    });
    tr.querySelector('[data-act="ban"]').addEventListener('click', function () {
      if (confirm('حظر ' + name + '؟')) admin('save_band', { fp: u.fp || '', fp2: u.fp2 || '', ip: u.ip || '', reason: 'حظر من لوحة التحكم' });
    });
    tr.querySelector('[data-act="del"]').addEventListener('click', function () {
      if (confirm('حذف ' + name + ' نهائياً؟')) admin('delete_user', { name: name });
    });
    tbody.appendChild(tr);
  });
}

function renderOnline() {
  var tbody = $('cp-live-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  var list = state.online || [];
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row no-l">لا يوجد متصلون حالياً</td></tr>'; return; }
  list.forEach(function (u) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-l="الاسم"><b>' + esc(u.username || '') + '</b>' + (u.guest ? ' <span class="tag">زائر</span>' : '') + '</td>' +
      '<td data-l="النوع">' + esc(u.power || 'user') + '</td>' +
      '<td data-l="الغرفة">' + esc(u.roomName || '—') + '</td>' +
      '<td data-l="IP">' + esc(u.ip || '—') + '</td>' +
      '<td data-l="الحالة">' + (u.idle ? '<span class="muted">خامل</span>' : '<span style="color:var(--ok)">نشط</span>') + '</td>' +
      '<td data-l class="no-l"><div class="row-btns">' +
      '<button class="btn btn-sm btn-warn" data-act="mute">كتم</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="unmute">رفع الكتم</button>' +
      '<button class="btn btn-sm btn-info" data-act="kick">طرد</button>' +
      '<button class="btn btn-sm btn-danger" data-act="ban">حظر</button>' +
      '</div></td>';
    tr.querySelector('[data-act="mute"]').addEventListener('click', function () {
      var ms = prompt('مدة كتم ' + u.username + ' بالدقائق:', '10');
      if (ms !== null) admin('cp_mute_user', { name: u.username, roomId: u.roomid, ms: (parseInt(ms, 10) || 10) * 60000, reason: 'كتم من لوحة التحكم' });
    });
    tr.querySelector('[data-act="unmute"]').addEventListener('click', function () { admin('cp_unmute_user', { name: u.username, roomId: u.roomid }); });
    tr.querySelector('[data-act="kick"]').addEventListener('click', function () {
      if (confirm('طرد ' + u.username + '؟')) admin('cp_kick_user', { name: u.username, reason: 'طرد من لوحة التحكم' });
    });
    tr.querySelector('[data-act="ban"]').addEventListener('click', function () {
      if (confirm('حظر ' + u.username + '؟')) admin('cp_ban_online', { name: u.username, reason: 'حظر من لوحة التحكم' });
    });
    tbody.appendChild(tr);
  });
}

function renderBans() {
  var tbody = $('cp-ban-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  var list = state.bands || [];
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-row no-l">لا يوجد حظر</td></tr>'; return; }
  list.forEach(function (b) {
    var val = b.device_band || b.ip_band || '';
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-l="القيمة"><code style="font-size:11px">' + esc(val) + '</code></td>' +
      '<td data-l="التاريخ">' + fmtDate(b.date) + '</td>' +
      '<td data-l="السبب">' + esc(b.name_band || '') + '</td>' +
      '<td data-l class="no-l"><button class="btn btn-sm btn-danger">إلغاء</button></td>';
    tr.querySelector('button').addEventListener('click', function () {
      socket.emit('msg', { cmd: 'delBand', data: { id: b._id || b.id || '', fp: b.device_band || '', ip: b.ip_band || '', password: state.password } });
      admin('delete_band', { fp: b.device_band || '', ip: b.ip_band || '' });
    });
    tbody.appendChild(tr);
  });
}

function banChecks(containerId, defs, cls) {
  var el = $(containerId);
  if (!el) return;
  var cur = containerId === 'cp-browser-bans' ? (state.bans.browsers || {}) : (state.bans.systems || {});
  el.innerHTML = '';
  Object.keys(defs).forEach(function (key) {
    var lab = document.createElement('label');
    lab.className = 'chk';
    lab.innerHTML = '<input type="checkbox" class="' + cls + '" data-key="' + key + '"' + (cur[key] === true ? ' checked' : '') + '> ' + defs[key];
    el.appendChild(lab);
  });
}
function renderBrowserBans() {
  banChecks('cp-browser-bans', { browser_all: 'الكل', browser1: 'Chrome', browser2: 'Firefox', browser3: 'Safari', browser4: 'Opera', browser6: 'Edge' }, 'bb');
}
function renderOsBans() {
  banChecks('cp-os-bans', { system_all: 'الكل', system1: 'Windows', system2: 'Linux', system3: 'Android', system4: 'iOS', system5: 'Mac OS' }, 'so');
}

function renderRooms() {
  var tbody = $('cp-rooms-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  var list = state.rooms || [];
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row no-l">لا توجد غرف</td></tr>'; return; }
  list.forEach(function (r) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-l="الاسم"><b>' + esc(r.name || '') + '</b></td>' +
      '<td data-l="المالك">' + esc(r.owner || r.roomOwner || '—') + '</td>' +
      '<td data-l="كلمة مرور">' + ((r.hasPassword || r.password) ? '🔒' : '—') + '</td>' +
      '<td data-l="نشطة">' + (r.isActive ? 'نعم' : 'لا') + '</td>' +
      '<td data-l="مقفلة">' + (r.isLocked ? 'نعم' : 'لا') + '</td>' +
      '<td data-l class="no-l"><div class="row-btns">' +
      '<button class="btn btn-sm btn-info" data-act="edit">تعديل</button>' +
      '<button class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
      '</div></td>';
    tr.querySelector('[data-act="edit"]').addEventListener('click', function () { admin('get_room_profile', { id: r.id }); });
    tr.querySelector('[data-act="del"]').addEventListener('click', function () {
      if (confirm('حذف غرفة ' + r.name + '؟')) admin('delete_room', { id: r.id });
    });
    tbody.appendChild(tr);
  });
}

function renderRoomEditor() {
  var el = $('cp-room-editor');
  if (!el) return;
  var r = state.roomProfile;
  if (!r) { el.innerHTML = ''; return; }
  var mods = (r.moderators || []).map(function (m) { return m.username || m.topic || m; });
  el.innerHTML =
    '<div class="cp-card"><h5>✏️ تعديل الغرفة: ' + esc(r.name || '') + '</h5>' +
    '<div class="grid g4">' +
    '<div class="fld"><label>الاسم</label><input id="re-name" value="' + attr(r.name || '') + '"></div>' +
    '<div class="fld"><label>المالك</label><input id="re-owner" value="' + attr(r.owner || '') + '"></div>' +
    '<div class="fld"><label>كلمة المرور (فارغ = إزالة)</label><input id="re-pass" type="text" value="' + attr(r.password || '') + '" placeholder="' + (r.hasPassword ? 'موجودة حالياً' : 'لا توجد') + '"></div>' +
    '<div class="fld"><label>سعة المكالمات/الكاميرات</label><input id="re-cap" type="number" value="' + (r.capacity || 0) + '"></div>' +
    '</div>' +
    '<div class="grid g4 mt">' +
    '<div class="fld"><label>مستوى الغرفة</label><input id="re-level" type="number" value="' + (r.roomLevel || 0) + '"></div>' +
    '<div class="fld"><label>إعجابات مطلوبة</label><input id="re-likes" type="number" value="' + (r.requiredLikes || 0) + '"></div>' +
    '<div class="fld"><label>أقصى مايكات</label><input id="re-mics" type="number" value="' + (r.roomMaxMicSlots || 4) + '"></div>' +
    '<div class="fld"><label>الوصف</label><input id="re-desc" value="' + attr(r.roomDescription || '') + '"></div>' +
    '</div>' +
    '<div class="grid g4 mt">' +
    '<label class="chk"><input type="checkbox" id="re-active"' + (r.isActive ? ' checked' : '') + '> نشطة</label>' +
    '<label class="chk"><input type="checkbox" id="re-cam"' + (r.allowCamera ? ' checked' : '') + '> كاميرا</label>' +
    '<label class="chk"><input type="checkbox" id="re-broadcast"' + (r.allowBroadcast ? ' checked' : '') + '> بث مباشر</label>' +
    '<label class="chk"><input type="checkbox" id="re-chat"' + (r.disableChat ? ' checked' : '') + '> تعطيل الدردشة</label>' +
    '</div>' +
    '<div class="mt"><label class="hint">المشرفون الحاليون:</label><div id="re-mods-list">' +
    (mods.length ? mods.map(function (m) { return '<span class="chip-user">👮 ' + esc(m) + '</span>'; }).join('') : '<span class="muted small">لا يوجد مشرفون</span>') +
    '</div></div>' +
    '<div class="grid g3 mt">' +
    '<div class="fld"><input id="re-mod-name" placeholder="اسم المشرف"></div>' +
    '<div class="fld" style="align-self:end"><button class="btn btn-ok btn-sm" data-x="addmod">➕ إضافة مشرف</button></div>' +
    '<div class="fld" style="align-self:end"><button class="btn btn-warn btn-sm" data-x="delmod">➖ إزالة مشرف</button></div>' +
    '</div>' +
    '<div class="row-btns mt">' +
    '<button class="btn btn-pri" data-x="saveroom">💾 حفظ الغرفة</button>' +
    '<button class="btn btn-ghost" data-x="clearchat">🧹 مسح محادثة الغرفة</button>' +
    '</div></div>';
  el.querySelector('[data-x="saveroom"]').addEventListener('click', function () {
    admin('edit_room_full', {
      id: r.id,
      name: $('re-name').value,
      owner: $('re-owner').value,
      roomPassword: $('re-pass').value,
      removePassword: $('re-pass').value ? 'false' : 'true',
      capacity: $('re-cap').value,
      roomLevel: $('re-level').value,
      requiredLikes: $('re-likes').value,
      roomMaxMicSlots: $('re-mics').value,
      roomDescription: $('re-desc').value,
      isActive: !!$('re-active').checked,
      allowCamera: !!$('re-cam').checked,
      allowBroadcast: !!$('re-broadcast').checked,
      disableChat: !!$('re-chat').checked
    });
  });
  el.querySelector('[data-x="clearchat"]').addEventListener('click', function () {
    if (confirm('مسح محادثة الغرفة ' + r.name + '؟')) admin('clear_room_chat', { id: r.id });
  });
  el.querySelector('[data-x="addmod"]').addEventListener('click', function () {
    var n = $('re-mod-name').value.trim();
    if (n) admin('add_room_moderator', { id: r.id, username: n });
  });
  el.querySelector('[data-x="delmod"]').addEventListener('click', function () {
    var n = $('re-mod-name').value.trim();
    if (n) admin('del_room_moderator', { id: r.id, username: n });
  });
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderFilter() {
  var el = $('cp-fltr-list');
  if (!el) return;
  el.innerHTML = (state.noletters || []).length
    ? state.noletters.map(function (n) { return '<span class="tag">' + esc(n.v || '') + '<span class="del" data-v="' + attr(n.v || '') + '">✕</span></span>'; }).join('')
    : '<span class="muted small">لا توجد كلمات مفلترة</span>';
  el.querySelectorAll('.del').forEach(function (d) {
    d.addEventListener('click', function () { admin('fltr_del', { value: d.getAttribute('data-v') }); });
  });
}

function renderMessages() {
  var el = $('cp-msg-list');
  if (!el) return;
  var list = state.msgs || [];
  el.innerHTML = list.length ? '' : '<span class="muted small">لا توجد رسائل</span>';
  list.forEach(function (m, i) {
    var row = document.createElement('div');
    row.className = 'tag';
    row.innerHTML = '<b>' + (m.category === 'w' ? 'ترحيب' : 'يومية') + '</b>: ' + esc(m.adresse || '') + ' — ' + esc((m.msg || '').substring(0, 40)) + ' <span class="del">✕</span>';
    row.querySelector('.del').addEventListener('click', function () { admin('msg_del', { adresse: m.adresse, msg: m.msg }); });
    el.appendChild(row);
  });
}

function renderShortcuts() {
  var el = $('cp-shrt-list');
  if (!el) return;
  el.innerHTML = (state.shrt || []).length ? '' : '<span class="muted small">لا توجد اختصارات</span>';
  (state.shrt || []).forEach(function (s) {
    var tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = '<b>' + esc(s.name || '') + '</b> = ' + esc(String(s.value || '').substring(0, 24)) + ' <span class="del">✕</span>';
    tag.querySelector('.del').addEventListener('click', function () { admin('shrt_del', { name: s.name }); });
    el.appendChild(tag);
  });
}

function renderSubs() {
  var tbody = $('cp-subs-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  var list = state.subs || [];
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-row no-l">لا توجد اشتراكات</td></tr>'; return; }
  list.forEach(function (s) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-l="المستخدم">' + esc(s.topic || s.topic1 || s.iduser || '') + '</td>' +
      '<td data-l="الصلاحية">' + esc(s.sub || '') + '</td>' +
      '<td data-l="التاريخ">' + esc(s.time || '') + '</td>' +
      '<td data-l class="no-l"><button class="btn btn-sm btn-danger">حذف</button></td>';
    tr.querySelector('button').addEventListener('click', function () { admin('subs_del', { iduser: s.iduser }); });
    tbody.appendChild(tr);
  });
}

function renderModeration() {
  var tb = $('cp-mod-posts');
  if (tb) {
    tb.innerHTML = '';
    var posts = state.postsMod || [];
    if (!posts.length) tb.innerHTML = '<tr><td colspan="5" class="empty-row no-l">لا توجد منشورات</td></tr>';
    posts.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td data-l="المستخدم">' + esc(p.username || '') + '</td>' +
        '<td data-l="النص">' + esc((p.text || '').substring(0, 60)) + (p.mediaUrl ? ' 🖼' : '') + '</td>' +
        '<td data-l="تفاعل">❤️ ' + (p.likes || 0) + ' | 💬 ' + (p.comments || 0) + '</td>' +
        '<td data-l="التاريخ">' + fmtDate(p.createdAt) + '</td>' +
        '<td data-l class="no-l"><button class="btn btn-sm btn-danger">حذف</button></td>';
      tr.querySelector('button').addEventListener('click', function () {
        if (confirm('حذف منشور ' + (p.username || '') + '؟')) admin('del_post', { postId: p.id });
      });
      tb.appendChild(tr);
    });
  }
  var ts = $('cp-mod-stories');
  if (ts) {
    ts.innerHTML = '';
    var stories = state.storiesMod || [];
    if (!stories.length) ts.innerHTML = '<tr><td colspan="6" class="empty-row no-l">لا توجد قصص</td></tr>';
    stories.forEach(function (s) {
      var banned = (state.storyBans || []).indexOf(String(s.userId)) !== -1;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td data-l="المستخدم">' + esc(s.username || '') + '</td>' +
        '<td data-l="النص">' + esc((s.text || '').substring(0, 50)) + (s.img ? ' 🖼' : '') + '</td>' +
        '<td data-l="مشاهدات">' + (s.views || 0) + '</td>' +
        '<td data-l="إعجاب">' + (s.likes || 0) + '</td>' +
        '<td data-l="التاريخ">' + fmtDate(s.createdAt) + '</td>' +
        '<td data-l class="no-l"><div class="row-btns">' +
        '<button class="btn btn-sm ' + (banned ? 'btn-ok' : 'btn-warn') + '" data-act="sban">' + (banned ? 'رفع حظر القصص' : 'حظر القصص') + '</button>' +
        '<button class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
        '</div></td>';
      tr.querySelector('[data-act="sban"]').addEventListener('click', function () {
        admin('set_story_ban', { userId: String(s.userId), banned: !banned });
      });
      tr.querySelector('[data-act="del"]').addEventListener('click', function () {
        if (confirm('حذف ستوري ' + (s.username || '') + '؟')) admin('del_story', { storyId: s.id });
      });
      ts.appendChild(tr);
    });
  }
  var sb = $('cp-story-bans');
  if (sb) {
    sb.innerHTML = (state.storyBans || []).length
      ? '<span class="hint">محظورو القصص:</span> ' + state.storyBans.map(function (id) { return '<span class="tag">' + esc(id) + '<span class="del" data-id="' + attr(id) + '">✕</span></span>'; }).join('')
      : '';
    sb.querySelectorAll('.del').forEach(function (d) {
      d.addEventListener('click', function () { admin('set_story_ban', { userId: d.getAttribute('data-id'), banned: false }); });
    });
  }
}

function renderFps(logs) {
  var el = $('cp-fp-list');
  if (!el) return;
  el.innerHTML = '';
  var list = logs || [];
  if (!list.length) { el.innerHTML = '<tr><td colspan="4" class="empty-row no-l">لا سجلات</td></tr>'; return; }
  list.forEach(function (l) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-l="الاسم">' + esc(l.topic || l.username || '') + '</td>' +
      '<td data-l="IP">' + esc(l.ip || '—') + '</td>' +
      '<td data-l="الجهاز" title="' + attr(l.deviceInfo || l.fp || '') + '">' + esc(String(l.fp2 || l.fp || '').substring(0, 16) || '—') + '</td>' +
      '<td data-l="آخر ظهور">' + fmtDate(l.time) + '</td>';
    el.appendChild(tr);
  });
}

function renderHealth() {
  var h = state.health || {};
  var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
  set('h-online', h.onlineCount !== undefined ? h.onlineCount : '—');
  set('h-members', (state.users || []).length);
  set('h-rooms', (state.rooms || []).length);
  set('h-bans', (state.bands || []).length);
  set('h-db', h.dbStatus === 'mongo' ? 'MongoDB' : h.dbStatus === 'memory' ? 'ذاكرة' : '—');
  set('h-mem', h.memory ? fmtBytes(h.memory.rss) : '—');
  set('h-uptime', fmtUptime(h.uptime));
  set('h-node', h.node || '—');
}

function shortObj(o) {
  if (o === null || o === undefined) return '—';
  var s = typeof o === 'string' ? o : JSON.stringify(o);
  return esc(s.length > 50 ? s.substring(0, 50) + '…' : s);
}
function renderAudit() {
  var tbody = $('cp-audit-table');
  if (!tbody) return;
  tbody.innerHTML = '';
  var list = state.audit || [];
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row no-l">لا سجلات بعد</td></tr>'; return; }
  list.slice(0, 150).forEach(function (e) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-l="التاريخ">' + fmtDate(e.when) + '</td>' +
      '<td data-l="المنفذ">' + esc(e.actor || '—') + '</td>' +
      '<td data-l="الإجراء"><code style="font-size:11px">' + esc(e.action || '') + '</code></td>' +
      '<td data-l="الهدف">' + esc(e.target || '—') + '</td>' +
      '<td data-l="قبل">' + shortObj(e.before) + '</td>' +
      '<td data-l="بعد">' + shortObj(e.after) + '</td>';
    tbody.appendChild(tr);
  });
}

/* ─── user profile modal ─── */

function openModal(title, bodyHtml) {
  $('cp-modal-title').textContent = title;
  $('cp-modal-body').innerHTML = bodyHtml;
  $('cp-modal').classList.add('open');
}
function closeModal() { $('cp-modal').classList.remove('open'); }

function renderUserProfile(u) {
  if (!u) { toast('المستخدم غير موجود', 'err'); return; }
  state.userProfile = u;
  var powerOpts = ['user', 'admin'].concat((state.powers || []).map(function (p) { return p.name; }))
    .filter(function (v, i, a) { return a.indexOf(v) === i; })
    .map(function (n) { return '<option value="' + attr(n) + '"' + ((u.power || 'user') === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
  var addons = state.addons || [];
  var iconAssets = addons.filter(function (a) { return a.type !== 'gift'; });
  var giftAssets = addons.filter(function (a) { return a.type === 'gift'; });
  var gifts = Array.isArray(u.gifts) ? u.gifts : [];
  var storyBanned = (state.storyBans || []).indexOf(String(u.id)) !== -1;

  var html =
    '<div class="grid g2">' +
    '<div class="fld"><label>اسم المستخدم</label><input id="up-topic" value="' + attr(u.topic || '') + '"></div>' +
    '<div class="fld"><label>الرتبة</label><select id="up-power">' + powerOpts + '</select></div>' +
    '</div>' +
    '<div class="grid g4 mt">' +
    '<div class="fld"><label>النقاط (rep)</label><input id="up-rep" type="number" value="' + (u.rep || 0) + '"></div>' +
    '<div class="fld"><label>الإعجابات</label><input id="up-likes" type="number" value="' + (u.likes || 0) + '"></div>' +
    '<div class="fld"><label>العملات</label><input id="up-coins" type="number" value="' + (u.coins || 0) + '"></div>' +
    '<div class="fld"><label>نقاط الجدار</label><input id="up-wall" type="number" value="' + (u.wallPoints || 0) + '"></div>' +
    '</div>' +
    '<div class="grid g4 mt">' +
    '<div class="fld"><label>الاشتراك</label><input id="up-membership" value="' + attr(u.memberShip || 'free') + '"></div>' +
    '<div class="fld"><label>الدولة (كود)</label><input id="up-co" value="' + attr(u.co || '') + '" maxlength="3"></div>' +
    '<div class="fld"><label>الجنس</label><input id="up-gender" value="' + attr(u.gender || '') + '"></div>' +
    '<div class="fld"><label>البريد</label><input id="up-email" value="' + attr(u.email || '') + '"></div>' +
    '</div>' +
    '<div class="grid g2 mt">' +
    '<div class="fld"><label>الحالة / رسالة</label><input id="up-msg" value="' + attr(u.msg || '') + '" maxlength="120"></div>' +
    '<div class="fld"><label>كلمة مرور جديدة (اختياري)</label><input id="up-pass" type="password" placeholder="اتركه فارغاً"></div>' +
    '</div>' +
    '<div class="grid g2 mt">' +
    '<label class="chk"><input type="checkbox" id="up-verify"' + (u.verified ? ' checked' : '') + '> حساب موثق ✅</label>' +
    '<label class="chk"><input type="checkbox" id="up-isadmin"' + (u.isAdmin ? ' checked' : '') + '> مشرف عام (isAdmin)</label>' +
    '</div>' +
    '<p class="hint mt">ID: ' + esc(u.id || '') + ' | IP: ' + esc(u.ip || '—') + ' | الجهاز: ' + esc(String(u.fp || '').substring(0, 14) || '—') + ' | آخر ظهور: ' + fmtDate(u.lastSeen) + '</p>' +
    '<div class="row-btns mt"><button class="btn btn-pri" data-x="save">💾 حفظ العضو</button>' +
    '<button class="btn btn-ok btn-sm" data-x="rep">➕ إعطاء نقاط</button>' +
    '<button class="btn btn-warn btn-sm" data-x="mute">🔇 كتم</button>' +
    '<button class="btn btn-info btn-sm" data-x="kick">👢 طرد</button>' +
    '<button class="btn btn-danger btn-sm" data-x="ban">🚫 حظر</button>' +
    '<button class="btn btn-danger btn-sm" data-x="del">🗑 حذف الحساب</button></div>' +

    '<h5 style="margin-top:18px">🎖 الأيقونة الفائقة (Super Icon)</h5>' +
    '<div id="up-icons" class="row-btns">' +
    iconAssets.map(function (a) {
      var cur = u.superIcon === a.url;
      return '<button class="btn btn-sm ' + (cur ? 'btn-pri' : 'btn-ghost') + '" data-icon="' + attr(a.url) + '">' + esc(a.name || a.url) + (cur ? ' ✓' : '') + '</button>';
    }).join(' ') +
    '<button class="btn btn-sm btn-danger" data-icon-remove="1">إزالة</button></div>' +

    '<h5 style="margin-top:18px">🎁 الهدايا الممنوحة</h5>' +
    '<div class="row-btns mb" id="up-gifts-current">' +
    (gifts.length ? gifts.map(function (g) { return '<span class="tag">' + esc(g) + ' <span class="del" data-gift="' + attr(g) + '">✕</span></span>'; }).join('') : '<span class="muted small">لا هدايا</span>') +
    '</div>' +
    '<div class="row-btns">' +
    giftAssets.map(function (a) {
      var has = gifts.indexOf(a.url) !== -1;
      return '<button class="btn btn-sm ' + (has ? 'btn-pri' : 'btn-ghost') + '" data-gift-add="' + attr(a.url) + '">' + esc(a.name || a.url) + (has ? ' ✓' : '') + '</button>';
    }).join(' ') +
    '</div>' +

    '<div class="mt"><button class="btn btn-sm ' + (storyBanned ? 'btn-ok' : 'btn-warn') + '" data-x="storyban">' + (storyBanned ? '✅ رفع حظر القصص' : '📸 حظر نشر القصص') + '</button></div>';

  openModal('تعديل العضو: ' + (u.topic || ''), html);

  var body = $('cp-modal-body');
  body.querySelector('[data-x="save"]').addEventListener('click', function () {
    var data = {
      original: u.topic || u.username,
      topic: $('up-topic').value.trim(),
      power: $('up-power').value,
      rep: $('up-rep').value, likes: $('up-likes').value,
      coins: $('up-coins').value, wallPoints: $('up-wall').value,
      memberShip: $('up-membership').value.trim(),
      co: $('up-co').value.trim(), gender: $('up-gender').value.trim(),
      email: $('up-email').value.trim(), msg: $('up-msg').value.trim(),
      verified: !!$('up-verify').checked, isAdmin: !!$('up-isadmin').checked
    };
    var pw = $('up-pass').value.trim();
    if (pw) data.password = pw;
    admin('edit_user_profile', data);
  });
  body.querySelector('[data-x="rep"]').addEventListener('click', function () {
    var v = prompt('كم نقطة يُضاف لـ ' + (u.topic || '') + '؟', '10');
    if (v) admin('cp_give_rep', { topic: u.topic || u.username, value: parseInt(v, 10) || 0 });
  });
  body.querySelector('[data-x="mute"]').addEventListener('click', function () {
    var ms = prompt('مدة الكتم بالدقائق:', '10');
    if (ms !== null) admin('cp_mute_user', { name: u.topic || u.username, ms: (parseInt(ms, 10) || 10) * 60000, reason: 'كتم من لوحة التحكم' });
  });
  body.querySelector('[data-x="kick"]').addEventListener('click', function () {
    if (confirm('طرد ' + (u.topic || '') + ' من الاتصال؟')) admin('cp_kick_user', { name: u.topic || u.username, reason: 'طرد من لوحة التحكم' });
  });
  body.querySelector('[data-x="ban"]').addEventListener('click', function () {
    if (confirm('حظر ' + (u.topic || '') + '؟')) admin('cp_ban_online', { name: u.topic || u.username, reason: 'حظر من لوحة التحكم' });
  });
  body.querySelector('[data-x="del"]').addEventListener('click', function () {
    if (confirm('حذف حساب ' + (u.topic || '') + ' نهائياً؟')) admin('delete_user', { name: u.topic || u.username });
  });
  body.querySelector('[data-x="storyban"]').addEventListener('click', function () {
    admin('set_story_ban', { userId: String(u.id), banned: !storyBanned });
  });
  body.querySelectorAll('[data-icon]').forEach(function (b) {
    b.addEventListener('click', function () { admin('assign_super_icon', { userId: u.id, iconUrl: b.getAttribute('data-icon') }); });
  });
  body.querySelectorAll('[data-icon-remove]').forEach(function (b) {
    b.addEventListener('click', function () { admin('remove_super_icon', { userId: u.id }); });
  });
  body.querySelectorAll('[data-gift-add]').forEach(function (b) {
    b.addEventListener('click', function () { admin('assign_gift', { userId: u.id, giftUrl: b.getAttribute('data-gift-add') }); });
  });
  body.querySelectorAll('[data-gift]').forEach(function (x) {
    x.addEventListener('click', function () { admin('remove_gift', { userId: u.id, giftUrl: x.getAttribute('data-gift') }); });
  });
}

/* ─── protocol ─── */

socket.on('connect', function () {
  connected = true;
  setStatus(authed ? 'متصل ومصرح' : 'متصل — أدخل كلمة المرور', authed ? 'ok' : '');
  var saved = localStorage.getItem('cp-pass') || sessionStorage.getItem('cp-pass') || '';
  if (saved) { state.password = saved; getState(); }
});

socket.on('disconnect', function () {
  connected = false;
  setStatus('انقطع الاتصال', 'err');
});

socket.on('message', function (msg) {
  if (!msg || !msg.cmd) return;
  switch (msg.cmd) {
    case 'error_list':
      if (!authed) {
        $('cp-login-err').textContent = (msg.data && msg.data.msg) || 'كلمة المرور غير صحيحة';
        setStatus('كلمة المرور غير صحيحة', 'err');
      } else {
        toast((msg.data && msg.data.msg) || 'خطأ صلاحية', 'err');
      }
      break;
    case 'siteweb':
      state.siteweb = msg.data || {};
      if (!authed) {
        authed = true;
        localStorage.setItem('cp-pass', state.password);
        $('cp-login').classList.add('hidden');
        setStatus('متصل ومصرح', 'ok');
        toast('مرحباً بك في لوحة التحكم', 'ok');
        admin('get_system_health');
      }
      renderSettings();
      break;
    case 'dro3': state.dro3 = msg.data || []; break;
    case 'emos': state.emo = msg.data || []; renderEmos(); break;
    case 'sicos': state.sico = msg.data || []; break;
    case 'addons': state.addons = msg.data || []; renderAddonsMgr(); break;
    case 'powers': state.powers = msg.data || []; renderPowers(); break;
    case 'noletters': state.noletters = msg.data || []; renderFilter(); break;
    case 'zaker': break;
    case 'users_data': state.users = msg.data || []; renderUsers(); renderHealth(); break;
    case 'rlist': state.rooms = msg.data || []; renderRooms(); renderHealth(); break;
    case 'band_list': state.bands = msg.data || []; renderBans(); renderHealth(); break;
    case 'setbansystem': state.bans = msg.data || state.bans; renderBrowserBans(); renderOsBans(); break;
    case 'shrtlist': state.shrt = msg.data || []; renderShortcuts(); break;
    case 'msgslist': state.msgs = msg.data || []; renderMessages(); break;
    case 'subslist': state.subs = msg.data || []; renderSubs(); break;
    case 'online_usrs': state.online = msg.data || []; renderOnline(); break;
    case 'posts_moderation': state.postsMod = msg.data || []; renderModeration(); break;
    case 'stories_moderation': state.storiesMod = msg.data || []; renderModeration(); break;
    case 'story_bans': state.storyBans = msg.data || []; renderModeration(); break;
    case 'user_profile': renderUserProfile(msg.data); break;
    case 'room_profile': state.roomProfile = msg.data || null; renderRoomEditor(); break;
    case 'seo': case 'seo_saved': state.seo = msg.data || {}; renderSeo(); break;
    case 'appearance': state.appearance = msg.data || {}; renderAppearance(); break;
    case 'features_data': state.features = msg.data || {}; renderFeatures(); break;
    case 'tickers_data':
      state.tickers = msg.data || { news: {}, ads: { settings: {}, ads: [] } };
      if (!state.tickers.ads) state.tickers.ads = { settings: {}, ads: [] };
      renderTickers();
      break;
    case 'badges_data': state.badges = msg.data || { enabled: false, badges: {} }; renderBadges(); break;
    case 'login_behavior_data': state.loginBehavior = msg.data || {}; renderLoginBehavior(); break;
    case 'zajel_cp_data': state.zajel = msg.data || { approved: [], pending: [] }; renderZajel(); break;
    case 'cp_image_uploaded': onImageUploaded(msg.data || {}); break;
  }
});

socket.on('savedone', function (data) {
  toast((data && data.msg) || 'تم الحفظ ✓', 'ok');
  if ($('cp-modal').classList.contains('open') && state.userProfile) admin('get_user_profile', { topic: state.userProfile.topic || state.userProfile.username });
  getState();
});

socket.on('error-msg', function (data) { toast((data && data.msg) || 'خطأ', 'err'); });

socket.on('fpslist', function (logs) { renderFps(logs); });

socket.on('user_data', function (u) {
  if (u) admin('get_user_profile', { topic: u.topic || u.username });
});

socket.on('done_band', function () { toast('تم الحظر ✓', 'ok'); getState(); });

socket.on('system_health', function (h) { state.health = h || {}; renderHealth(); });

socket.on('auditlog', function (list) { state.audit = list || []; renderAudit(); });

/* ─── auth ─── */

function tryLogin() {
  var pass = $('cp-login-pass').value.trim();
  if (!pass) { $('cp-login-err').textContent = 'أدخل كلمة المرور'; return; }
  state.password = pass;
  $('cp-login-err').textContent = '';
  setStatus('جاري التحقق...');
  getState();
}
$('cp-login-btn').addEventListener('click', tryLogin);
$('cp-login-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryLogin(); });

$('cp-logout').addEventListener('click', function () {
  localStorage.removeItem('cp-pass');
  sessionStorage.removeItem('cp-pass');
  location.reload();
});

/* ─── navigation ─── */

var LAZY = {
  health: function () { admin('get_system_health'); },
  audit: function () { admin('get_auditlog'); },
  live: function () { admin('get_online_users'); },
  mod: function () { admin('get_posts_moderation'); admin('get_stories_moderation'); admin('get_story_bans'); admin('get_addons'); },
  users: function () { admin('get_addons'); },
  rooms: function () { if (!state.roomProfile && state.rooms && state.rooms[0]) admin('get_room_profile', { id: state.rooms[0].id }); },
  tools: function () { admin('get_fps', {}); },
  features: function () { admin('get_features'); },
  tickers: function () { admin('get_tickers'); },
  badges: function () { admin('get_badges_cp'); },
  loginbeh: function () { admin('get_login_behavior'); },
  zajel: function () { admin('zajel_cp_list'); },
  emos: function () { admin('get_addons'); }
};

function switchTab(tab) {
  document.querySelectorAll('#cp-sidebar .nav-item').forEach(function (i) { i.classList.toggle('active', i.getAttribute('data-tab') === tab); });
  document.querySelectorAll('.cp-section').forEach(function (s) { s.classList.toggle('active', s.id === 'cp-' + tab); });
  closeDrawer();
  if (authed && LAZY[tab]) LAZY[tab]();
}

document.querySelectorAll('#cp-sidebar .nav-item').forEach(function (item) {
  item.addEventListener('click', function () { switchTab(item.getAttribute('data-tab')); });
});

function closeDrawer() { $('cp-sidebar').classList.remove('open'); $('cp-backdrop').classList.remove('show'); }
$('cp-burger').addEventListener('click', function () {
  $('cp-sidebar').classList.toggle('open');
  $('cp-backdrop').classList.toggle('show', $('cp-sidebar').classList.contains('open'));
});
$('cp-backdrop').addEventListener('click', closeDrawer);
$('cp-modal-close').addEventListener('click', closeModal);
$('cp-modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

/* ─── uploads ─── */

function sendImageFile(file, kind, idx) {
  if (!file) return;
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { toast('صيغة الصورة غير مدعومة', 'err'); return; }
  var reader = new FileReader();
  reader.onload = function (e) {
    var dataUrl = String(e.target.result);
    if (!/^data:image\//.test(dataUrl)) { toast('فشل قراءة الصورة', 'err'); return; }
    admin('upload_site_image', { kind: kind, dataUrl: dataUrl, idx: idx });
    toast('جاري رفع الصورة...');
  };
  reader.readAsDataURL(file);
}

function bindImagePicker(inputId, kind) {
  var input = $(inputId);
  if (!input) return;
  input.addEventListener('change', function () {
    if (input.files && input.files[0]) sendImageFile(input.files[0], kind);
    input.value = '';
  });
}

function onImageUploaded(d) {
  var kind = d.kind, url = d.url;
  if (!url) return;
  if (kind === 'badge') {
    var lv = d.idx;
    if (!state.badges.badges) state.badges.badges = {};
    state.badges.badges[lv] = url;
    admin('set_badges', state.badges);
    toast('تم رفع الوسام — جاري الحفظ', 'ok');
    return;
  }
  if (kind === 'emoji') {
    state.pendingEmojiUrl = url;
    var pv = $('em-preview');
    if (pv) pv.src = url;
    toast('تم رفع الصورة — اضغط إضافة ابتسامة', 'ok');
    return;
  }
  if (kind === 'addon_icon' || kind === 'addon_gift') {
    state.pendingAddonUrl = url;
    var ap = $('ad2-preview');
    if (ap) ap.src = url;
    toast('تم رفع الصورة — اضغط إضافة', 'ok');
    return;
  }
  // favicon / banner / pic already handled server-side via seo_saved
}

bindImagePicker('img-favicon', 'favicon');
bindImagePicker('img-banner', 'banner');
bindImagePicker('img-pic', 'pic');

var emFile = $('em-file');
if (emFile) emFile.addEventListener('change', function () {
  if (emFile.files && emFile.files[0]) sendImageFile(emFile.files[0], 'emoji');
  emFile.value = '';
});
var ad2File = $('ad2-file');
if (ad2File) ad2File.addEventListener('change', function () {
  if (ad2File.files && ad2File.files[0]) {
    var kind = ($('ad2-type') && $('ad2-type').value === 'gift') ? 'addon_gift' : 'addon_icon';
    sendImageFile(ad2File.files[0], kind);
  }
  ad2File.value = '';
});

/* ─── actions ─── */

var ACTIONS = {
  'refresh-health': function () { admin('get_system_health'); },
  'broadcast': function () {
    var msg = $('bc-msg').value.trim();
    if (msg) { admin('broadcast_msg', { msg: msg }); $('bc-msg').value = ''; }
  },
  'backup': function () { admin('backup'); },
  'restore': function () { if (confirm('استعادة آخر نسخة احتياطية؟')) admin('restore'); },
  'reload-site': function () { if (confirm('تحديث صفحات جميع المتصلين؟')) admin('reload_site'); },
  'refresh-live': function () { admin('get_online_users'); },
  'save-sett': function () {
    admin('save_state', {
      name: $('s-name').value, title: $('s-title').value,
      bg: $('s-bg').value, buttons: $('s-buttons').value, background: $('s-background').value,
      msgst: $('s-msgst').value,
      allowg: !!$('s-allowg').checked, allowreg: !!$('s-allowreg').checked,
      likeGates: {
        wall: $('s-like-wall').value, private: $('s-like-private').value,
        story: $('s-like-story').value, call: $('s-like-call').value, mic: $('s-like-mic').value
      }
    });
  },
  'save-features': function () {
    var patch = {};
    document.querySelectorAll('.ft-chk').forEach(function (cb) { patch[cb.getAttribute('data-key')] = cb.checked; });
    patch.likes_notifications = parseInt($('ft-likes_notifications').value, 10) || 0;
    patch.likes_effects = parseInt($('ft-likes_effects').value, 10) || 0;
    admin('set_features', patch);
  },
  'save-news-ticker': function () {
    admin('set_news_ticker', {
      enabled: !!$('nt-enabled').checked,
      text: $('nt-text').value.trim(),
      bgColor: $('nt-bgColor').value,
      textColor: $('nt-textColor').value
    });
  },
  'ad-add-row': function () {
    var box = $('cp-ads-list');
    if (!box) return;
    var empty = box.querySelector('.muted');
    if (empty) empty.remove();
    var wrap = document.createElement('div');
    wrap.innerHTML = adRowHtml({});
    box.appendChild(wrap.firstChild);
    bindAdRows();
  },
  'save-ads-ticker': function () {
    var ads = [];
    document.querySelectorAll('#cp-ads-list .ad-row').forEach(function (row) {
      var content = row.querySelector('.ad-content').value.trim();
      if (content) ads.push({ content: content, linkUrl: row.querySelector('.ad-link').value.trim() });
    });
    admin('set_ads_ticker', {
      settings: {
        enabled: !!$('ad-enabled').checked,
        speed: parseInt($('ad-speed').value, 10) || 30,
        bgColor: $('ad-bgColor').value,
        textColor: $('ad-textColor').value
      },
      ads: ads
    });
  },
  'zajel-add': function () {
    var v = $('zaj-add').value.trim();
    if (v) { admin('zajel_cp_add', { message: v }); $('zaj-add').value = ''; }
    else toast('أدخل نص الرسالة', 'err');
  },
  'zajel-clear-approved': function () {
    if (confirm('مسح جميع الرسائل المعتمدة؟')) admin('zajel_cp_clear', { list: 'approved' });
  },
  'zajel-clear-pending': function () {
    if (confirm('مسح جميع الرسائل المنتظرة؟')) admin('zajel_cp_clear', { list: 'pending' });
  },
  'save-badges': function () {
    state.badges.enabled = !!$('bd-enabled').checked;
    admin('set_badges', state.badges);
  },
  'save-loginbeh': function () {
    admin('set_login_behavior', {
      behavior: $('lb-behavior').value,
      openUsersTabOnLogin: !!$('lb-openusers').checked
    });
  },
  'emo-add': function () {
    var sc = $('em-shortcut').value.trim();
    if (!sc) { toast('أدخل الاختصار أولاً', 'err'); return; }
    if (!state.pendingEmojiUrl) { toast('ارفع صورة الابتسامة أولاً', 'err'); return; }
    admin('emo_item_add', { shortcut: sc, url: state.pendingEmojiUrl });
    state.pendingEmojiUrl = '';
    $('em-shortcut').value = '';
    var pv = $('em-preview'); if (pv) pv.removeAttribute('src');
  },
  'addon-add': function () {
    var type = $('ad2-type').value === 'gift' ? 'gift' : 'super_icon';
    var name = $('ad2-name').value.trim();
    if (!state.pendingAddonUrl) { toast('ارفع صورة العنصر أولاً', 'err'); return; }
    admin('addon_add', { type: type, name: name, url: state.pendingAddonUrl });
    state.pendingAddonUrl = '';
    $('ad2-name').value = '';
    var ap = $('ad2-preview'); if (ap) ap.removeAttribute('src');
  },
  'save-appearance': function () {
    admin('save_appearance', {
      mainUiColor: $('ap-mainUiColor').value, landingBgColor: $('ap-landingBgColor').value,
      chatInputBg: $('ap-chatInputBg').value, unifiedBtnBg: $('ap-unifiedBtnBg').value,
      unifiedBtnHoverBg: $('ap-unifiedBtnHoverBg').value, micIconColor: $('ap-micIconColor').value,
      micBtnBgColor: $('ap-micBtnBgColor').value, lineIconColor: $('ap-lineIconColor').value,
      tickerBgColor: $('ap-tickerBgColor').value, tickerTextColor: $('ap-tickerTextColor').value,
      fontFamily: $('ap-fontFamily').value,
      fontSize: parseInt($('ap-fontSize').value, 10), fontWeight: parseInt($('ap-fontWeight').value, 10),
      footerText: $('ap-footerText').value.trim()
    });
    admin('save_seo', { siteName: $('ap-siteName').value, siteTitle: $('ap-siteTitle').value, siteDescription: $('ap-siteDescription').value });
  },
  'save-seo': function () {
    admin('save_seo', {
      siteName: $('seo-siteName').value, siteTitle: $('seo-siteTitle').value,
      siteDescription: $('seo-siteDescription').value, siteKeywords: $('seo-siteKeywords').value,
      canonicalUrl: $('seo-canonicalUrl').value, robotsMeta: $('seo-robotsMeta').value,
      ogImage: $('seo-ogImage').value, twitterCard: $('seo-twitterCard').value,
      themeColor: $('seo-themeColor').value,
      enableSitemap: !!$('seo-enableSitemap').checked, enableRobotsTxt: !!$('seo-enableRobotsTxt').checked,
      noindex: !!$('seo-noindex').checked,
      googleSiteVerification: $('seo-googleSiteVerification').value.trim(),
      sameAs: $('seo-sameAs').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean)
    });
  },
  'upload-favicon': function () { $('img-favicon').click(); },
  'upload-banner': function () { $('img-banner').click(); },
  'upload-pic': function () { $('img-pic').click(); },
  'user-search': function () {
    state.userFilter = $('cp-user-search').value.trim();
    renderUsers();
    var exact = (state.users || []).find(function (u) { return String(u.topic || u.username || '').toLowerCase() === state.userFilter.toLowerCase(); });
    if (exact) admin('get_user_profile', { topic: exact.topic || exact.username });
  },
  'add-ban': function () {
    var val = $('cp-ban-input').value.trim();
    var reason = $('cp-ban-reason').value.trim() || 'مخالفة القوانين';
    if (val) {
      var isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(val);
      admin('save_band', { fp: isIp ? '' : val, ip: isIp ? val : '', reason: reason });
      $('cp-ban-input').value = '';
    }
  },
  'save-browser-bans': function () {
    var browsers = {};
    document.querySelectorAll('.bb').forEach(function (cb) { browsers[cb.getAttribute('data-key')] = cb.checked; });
    admin('save_browser_bans', { browser: browsers });
  },
  'save-os-bans': function () {
    var systems = {};
    document.querySelectorAll('.so').forEach(function (cb) { systems[cb.getAttribute('data-key')] = cb.checked; });
    admin('save_system_bans', { os: systems });
  },
  'add-room': function () {
    var n = $('cp-room-name').value.trim();
    if (n) { admin('add_room', { name: n }); $('cp-room-name').value = ''; }
  },
  'refresh-mod': function () { admin('get_posts_moderation'); admin('get_stories_moderation'); },
  'refresh-story-bans': function () { admin('get_story_bans'); },
  'fltr-block': function () {
    var v = $('cp-fltr-input').value.trim();
    if (v) { admin('fltr_add', { value: v, type: 'bmsgs' }); $('cp-fltr-input').value = ''; }
  },
  'fltr-allow': function () {
    var v = $('cp-fltr-input').value.trim();
    if (v) { admin('fltr_del', { value: v }); $('cp-fltr-input').value = ''; }
  },
  'msg-welcome': function () { addMessage('w'); },
  'msg-daily': function () { addMessage('d'); },
  'shrt-add': function () {
    var name = $('cp-shrt-name').value.trim(), value = $('cp-shrt-value').value.trim();
    if (name && value) { admin('shrt_add', { name: name, value: value }); $('cp-shrt-name').value = ''; $('cp-shrt-value').value = ''; }
  },
  'subs-add': function () {
    var user = $('cp-subs-user').value.trim(), power = $('cp-subs-power').value.trim(), days = $('cp-subs-days').value.trim();
    if (user && power) {
      admin('subs_add', { iduser: user, topic: user, topic1: user, sub: power, time: days ? days + ' يوم' : '', timeis: Date.now() });
      $('cp-subs-user').value = ''; $('cp-subs-power').value = ''; $('cp-subs-days').value = '';
    }
  },
  'delete-fps': function () { if (confirm('حذف سجل الدخول (البصمات) لجميع الأعضاء؟')) admin('delete_fps'); },
  'delete-actions': function () { if (confirm('حذف سجل الإجراءات؟')) admin('delete_actions'); },
  'refresh-audit': function () { admin('get_auditlog'); }
};

function addMessage(category) {
  var title = $('cp-msg-title').value.trim(), body = $('cp-msg-body').value.trim();
  if (body) {
    admin('msg_add', { category: category, adresse: title, msg: body });
    $('cp-msg-title').value = ''; $('cp-msg-body').value = '';
  } else { toast('أدخل نص الرسالة', 'err'); }
}

document.addEventListener('click', function (e) {
  var target = e.target.closest('[data-action]');
  if (!target) return;
  var fn = ACTIONS[target.getAttribute('data-action')];
  if (fn) { e.preventDefault(); fn(); }
});

$('cp-fp-search').addEventListener('input', debounce(function () {
  if (!authed) return;
  admin('get_fps', { search: $('cp-fp-search').value.trim() });
}, 350));

$('cp-user-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') ACTIONS['user-search'](); });

setStatus('جاري الاتصال...', '');