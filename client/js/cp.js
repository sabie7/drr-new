     1	var socket = io('/');
     2	var connected = false;
     3	var authed = false;
     4	
     5	var state = {
     6	  password: '',
     7	  siteweb: {},
     8	  seo: {},
     9	  appearance: {},
    10	  dro3: [], emo: [], sico: [],
    11	  powers: [],
    12	  noletters: [],
    13	  users: [],
    14	  rooms: [],
    15	  bands: [],
    16	  shrt: [], msgs: [], subs: [],
    17	  bans: { browsers: {}, systems: {} },
    18	  health: {},
    19	  audit: [],
    20	  online: [],
    21	  postsMod: [],
    22	  storiesMod: [],
    23	  addons: [],
    24	  storyBans: [],
    25	  userProfile: null,
    26	  roomProfile: null,
    27	  userFilter: '',
    28	  features: {},
    29	  tickers: { news: {}, ads: { settings: {}, ads: [] } },
    30	  badges: { enabled: false, badges: {} },
    31	  loginBehavior: {},
    32	  zajel: { approved: [], pending: [] }
    33	};
    34	
    35	/* ─── helpers ─── */
    36	
    37	function $(id) { return document.getElementById(id); }
    38	function esc(s) {
    39	  if (s === null || s === undefined) return '';
    40	  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    41	}
    42	function attr(s) { return esc(s); }
    43	
    44	function toast(msg, type) {
    45	  var box = $('cp-toasts');
    46	  if (!box) return;
    47	  var t = document.createElement('div');
    48	  t.className = 'toast' + (type ? ' ' + type : '');
    49	  t.textContent = msg;
    50	  box.appendChild(t);
    51	  setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3200);
    52	  setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3600);
    53	}
    54	
    55	function setStatus(msg, mode) {
    56	  var dot = $('cp-status-dot'), txt = $('cp-status-text');
    57	  if (txt) txt.textContent = msg;
    58	  if (dot) { dot.className = mode === 'ok' ? 'on' : mode === 'err' ? 'off' : ''; dot.id = 'cp-status-dot'; }
    59	}
    60	
    61	function admin(cmd, data) {
    62	  socket.emit('msg', { cmd: 'admin', data: { cmd: cmd, pass: state.password, data: data || {} } });
    63	}
    64	function getState() {
    65	  socket.emit('msg', { cmd: 'getstate', data: { password: state.password } });
    66	}
    67	
    68	function fmtBytes(n) {
    69	  if (n === undefined || n === null || isNaN(n)) return '—';
    70	  var u = ['B', 'KB', 'MB', 'GB'], i = 0;
    71	  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    72	  return n.toFixed(1) + ' ' + u[i];
    73	}
    74	function fmtUptime(sec) {
    75	  if (sec === undefined || sec === null || isNaN(sec)) return '—';
    76	  var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    77	  var out = [];
    78	  if (d) out.push(d + 'ي');
    79	  if (h) out.push(h + 'س');
    80	  if (m) out.push(m + 'د');
    81	  return out.length ? out.join(' ') : Math.floor(sec) + 'ث';
    82	}
    83	function fmtDate(s) {
    84	  return esc(String(s || '').replace('T', ' ').replace('Z', '').substring(0, 16));
    85	}
    86	
    87	function debounce(fn, ms) {
    88	  var t;
    89	  return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
    90	}
    91	
    92	/* ─── renderers ─── */
    93	
    94	var APPEARANCE_DEFAULTS = {
    95	  mainUiColor: '#794e4e', landingBgColor: '#3b3a3a', chatInputBg: '#794e4e',
    96	  unifiedBtnBg: '#4c0d21', unifiedBtnHoverBg: '#3b0d1b', micIconColor: '#e8dcd4',
    97	  micBtnBgColor: '#4c0d21', lineIconColor: '#e8dcd4', tickerBgColor: '#4c0d21', tickerTextColor: '#e8dcd4'
    98	};
    99	
   100	function setVal(id, v) { var el = $(id); if (el && v !== undefined && v !== null) el.value = v; }
   101	function setChk(id, v) { var el = $(id); if (el) el.checked = !!v; }
   102	
   103	function renderSettings() {
   104	  var s = state.siteweb || {};
   105	  setVal('s-name', s.name); setVal('s-title', s.title); setVal('s-msgst', s.msgst);
   106	  setVal('s-bg', s.bg || '#40404f'); setVal('s-buttons', s.buttons || '#f93634'); setVal('s-background', s.background || '#40404f');
   107	  setChk('s-allowg', s.allowg); setChk('s-allowreg', s.allowreg);
   108	  var def = { wall: 100, private: 200, story: 300, call: 400, mic: 500 };
   109	  var g = s.likeGates || {};
   110	  ['wall', 'private', 'story', 'call', 'mic'].forEach(function (k) { setVal('s-like-' + k, g[k] !== undefined ? g[k] : def[k]); });
   111	}
   112	
   113	function renderSeo() {
   114	  var s = state.seo || {};
   115	  setVal('seo-siteName', s.siteName); setVal('seo-siteTitle', s.siteTitle);
   116	  setVal('seo-siteDescription', s.siteDescription); setVal('seo-siteKeywords', s.siteKeywords);
   117	  setVal('seo-canonicalUrl', s.canonicalUrl); setVal('seo-robotsMeta', s.robotsMeta || 'index, follow');
   118	  setVal('seo-ogImage', s.ogImage); setVal('seo-twitterCard', s.twitterCard || 'summary_large_image');
   119	  setVal('seo-themeColor', s.themeColor || '#794e4e'); setVal('seo-googleSiteVerification', s.googleSiteVerification || '');
   120	  setVal('seo-sameAs', (Array.isArray(s.sameAs) ? s.sameAs : []).join('\n'));
   121	  setChk('seo-enableSitemap', s.enableSitemap !== false);
   122	  setChk('seo-enableRobotsTxt', s.enableRobotsTxt !== false);
   123	  setChk('seo-noindex', !!s.noindex);
   124	  setVal('ap-siteName', s.siteName); setVal('ap-siteTitle', s.siteTitle); setVal('ap-siteDescription', s.siteDescription);
   125	  var fv = $('img-favicon-preview'), bn = $('img-banner-preview'), pc = $('img-pic-preview');
   126	  if (fv && s.faviconUrl) fv.src = s.faviconUrl;
   127	  if (bn && s.bannerUrl) bn.src = s.bannerUrl;
   128	  if (pc && s.defaultAvatarUrl) pc.src = s.defaultAvatarUrl;
   129	}
   130	
   131	function renderAppearance() {
   132	  var s = state.appearance || {};
   133	  for (var k in APPEARANCE_DEFAULTS) setVal('ap-' + k, s[k] || APPEARANCE_DEFAULTS[k]);
   134	  setVal('ap-fontFamily', s.fontFamily || 'Arial, sans-serif');
   135	  setVal('ap-fontSize', s.fontSize != null ? s.fontSize : 15);
   136	  setVal('ap-fontWeight', s.fontWeight != null ? s.fontWeight : 700);
   137	  setVal('ap-footerText', s.footerText || '');
   138	}
   139	
   140	/* ─── features / tickers / badges / login behavior / zajel / emos ─── */
   141	
   142	var FEATURES_BOOLS = [
   143	  ['storiesEnabled', 'القصص'], ['wallEnabled', 'الجدار'], ['privateTabEnabled', 'الخاص'],
   144	  ['roomsEnabled', 'الغرف'], ['voiceEnabled', 'الصوت'], ['gamesEnabled', 'الألعاب'],
   145	  ['zajelEnabled', 'الزاجل'], ['quickChatEnabled', 'الدردشة السريعة'], ['profilesEnabled', 'الملفات الشخصية'],
   146	  ['giftsEnabled', 'الهدايا'], ['liveBroadcastEnabled', 'البث المباشر'], ['battleChallengesEnabled', 'تحديات المعارك'],
   147	  ['publicMessageDeletionEnabled', 'حذف الرسائل العامة'], ['publicMessageReplyEnabled', 'الرد على الرسائل'],
   148	  ['statusColorEnabled', 'ألوان الحالة'], ['profileLightboxEnabled', 'عرض الصور المكبر'],
   149	  ['mentionsEnabled', 'المنشن (@)'], ['sidebarAddonsEnabled', 'إضافات القائمة الجانبية'],
   150	  ['sidebarMemberSearchEnabled', 'بحث الأعضاء'], ['wallPostCommentsEnabled', 'تعليقات الجدار'],
   151	  ['wallPostLikesEnabled', 'إعجابات الجدار'], ['wallYoutubeBarEnabled', 'شريط يوتيوب'],
   152	  ['disableCopy', 'منع النسخ'], ['disableRightClick', 'منع الزر الأيمن']
   153	];
   154	
   155	function renderFeatures() {
   156	  var grid = $('cp-features-grid');
   157	  if (!grid) return;
   158	  var f = state.features || {};
   159	  var html = FEATURES_BOOLS.map(function (d) {
   160	    var on = f[d[0]] === undefined ? true : !!f[d[0]];
   161	    return '<label class="chk"><input type="checkbox" class="ft-chk" data-key="' + d[0] + '"' + (on ? ' checked' : '') + '> ' + d[1] + '</label>';
   162	  }).join('');
   163	  grid.innerHTML = html;
   164	  setVal('ft-likes_notifications', f.likes_notifications != null ? f.likes_notifications : 20);
   165	  setVal('ft-likes_effects', f.likes_effects != null ? f.likes_effects : 100);
   166	}
   167	
   168	function adRowHtml(ad) {
   169	  return '<div class="grid g3 ad-row" style="align-items:end">' +
   170	    '<div class="fld"><label>نص الإعلان</label><input class="ad-content" value="' + attr(ad.content || '') + '" maxlength="300"></div>' +
   171	    '<div class="fld"><label>رابط (اختياري)</label><input class="ad-link" value="' + attr(ad.linkUrl || '') + '" dir="ltr"></div>' +
   172	    '<div class="fld"><button class="btn btn-danger btn-sm ad-del">🗑 حذف</button></div>' +
   173	    '</div>';
   174	}
   175	function bindAdRows() {
   176	  var box = $('cp-ads-list');
   177	  if (!box) return;
   178	  box.querySelectorAll('.ad-del').forEach(function (b) {
   179	    b.addEventListener('click', function () { b.closest('.ad-row').remove(); });
   180	  });
   181	}
   182	function renderTickers() {
   183	  var n = (state.tickers && state.tickers.news) || {};
   184	  setChk('nt-enabled', n.enabled); setVal('nt-text', n.text || '');
   185	  setVal('nt-bgColor', n.bgColor || '#ff0000'); setVal('nt-textColor', n.textColor || '#ffffff');
   186	  var a = (state.tickers && state.tickers.ads) || {};
   187	  var st = a.settings || {};
   188	  setChk('ad-enabled', st.enabled); setVal('ad-speed', st.speed != null ? st.speed : 30);
   189	  setVal('ad-bgColor', st.bgColor || '#fff8e1'); setVal('ad-textColor', st.textColor || '#4b3600');
   190	  var box = $('cp-ads-list');
   191	  if (box) {
   192	    box.innerHTML = (a.ads || []).map(adRowHtml).join('') || '<span class="muted small">لا إعلانات</span>';
   193	    bindAdRows();
   194	  }
   195	}
   196	
   197	var BADGE_TIERS = [
   198	  [1, 'وسام البداية', 1000], [2, 'وسام التميز', 3000], [3, 'وسام النشاط', 5000],
   199	  [4, 'وسام القوة', 10000], [5, 'وسام النخبة', 20000], [6, 'وسام الأسطورة', 50000]
   200	];
   201	function renderBadges() {
   202	  var el = $('cp-badges-editor');
   203	  if (!el) return;
   204	  var b = state.badges || {};
   205	  setChk('bd-enabled', b.enabled);
   206	  el.innerHTML = '<div class="grid g3">' + BADGE_TIERS.map(function (t) {
   207	    var url = (b.badges || {})[t[0]] || '';
   208	    return '<div class="asset-item">' +
   209	      '<img id="bd-img-' + t[0] + '" src="' + attr(url) + '" style="' + (url ? '' : 'opacity:.25') + '">' +
   210	      '<span class="a-name">' + t[1] + '<br>' + t[2].toLocaleString('en') + ' نقطة</span>' +
   211	      '<button class="btn btn-sm btn-info mt" data-bd-upload="' + t[0] + '">⬆ رفع صورة</button>' +
   212	      '<input type="file" id="bd-file-' + t[0] + '" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none">' +
   213	      (url ? '<button class="btn btn-sm btn-ghost mt" data-bd-clear="' + t[0] + '">✕ إزالة</button>' : '') +
   214	      '</div>';
   215	  }).join('') + '</div>';
   216	  el.querySelectorAll('[data-bd-upload]').forEach(function (btn) {
   217	    btn.addEventListener('click', function () {
   218	      var lv = btn.getAttribute('data-bd-upload');
   219	      var input = $('bd-file-' + lv);
   220	      if (!input) return;
   221	      input.onchange = function () {
   222	        if (input.files && input.files[0]) sendImageFile(input.files[0], 'badge', lv);
   223	        input.value = '';
   224	      };
   225	      input.click();
   226	    });
   227	  });
   228	  el.querySelectorAll('[data-bd-clear]').forEach(function (btn) {
   229	    btn.addEventListener('click', function () {
   230	      var lv = btn.getAttribute('data-bd-clear');
   231	      if (!state.badges.badges) state.badges.badges = {};
   232	      delete state.badges.badges[lv];
   233	      admin('set_badges', state.badges);
   234	    });
   235	  });
   236	}
   237	
   238	function renderLoginBehavior() {
   239	  var l = state.loginBehavior || {};
   240	  setVal('lb-behavior', l.behavior || 'default_room');
   241	  setChk('lb-openusers', l.openUsersTabOnLogin);
   242	}
   243	
   244	function renderZajel() {
   245	  var z = state.zajel || {};
   246	  var app = z.approved || [], pend = z.pending || [];
   247	  var c1 = $('zaj-approved-count'), c2 = $('zaj-pending-count');
   248	  if (c1) c1.textContent = app.length;
   249	  if (c2) c2.textContent = pend.length;
   250	  var ta = $('zaj-approved-table');
   251	  if (ta) {
   252	    ta.innerHTML = '';
   253	    if (!app.length) ta.innerHTML = '<tr><td colspan="3" class="empty-row no-l">لا رسائل معتمدة</td></tr>';
   254	    app.forEach(function (m) {
   255	      var tr = document.createElement('tr');
   256	      tr.innerHTML =
   257	        '<td data-l="#">' + (m.id || '') + '</td>' +
   258	        '<td data-l="الرسالة">' + esc(m.message || '') + '</td>' +
   259	        '<td data-l class="no-l"><button class="btn btn-sm btn-danger">حذف</button></td>';
   260	      tr.querySelector('button').addEventListener('click', function () { admin('zajel_cp_del', { id: m.id, list: 'approved' }); });
   261	      ta.appendChild(tr);
   262	    });
   263	  }
   264	  var tp = $('zaj-pending-table');
   265	  if (tp) {
   266	    tp.innerHTML = '';
   267	    if (!pend.length) tp.innerHTML = '<tr><td colspan="4" class="empty-row no-l">لا رسائل منتظرة</td></tr>';
   268	    pend.forEach(function (m) {
   269	      var tr = document.createElement('tr');
   270	      tr.innerHTML =
   271	        '<td data-l="#">' + (m.id || '') + '</td>' +
   272	        '<td data-l="الكاتب">' + esc(m.username || '') + '</td>' +
   273	        '<td data-l="الرسالة">' + esc(m.message || '') + '</td>' +
   274	        '<td data-l class="no-l"><div class="row-btns">' +
   275	        '<button class="btn btn-sm btn-ok" data-act="ok">موافقة</button>' +
   276	        '<button class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
   277	        '</div></td>';
   278	      tr.querySelector('[data-act="ok"]').addEventListener('click', function () { admin('zajel_cp_approve', { id: m.id }); });
   279	      tr.querySelector('[data-act="del"]').addEventListener('click', function () { admin('zajel_cp_del', { id: m.id, list: 'pending' }); });
   280	      tp.appendChild(tr);
   281	    });
   282	  }
   283	}
   284	
   285	function assetItemHtml(kind, item) {
   286	  return '<div class="asset-item">' +
   287	    '<img src="' + attr(item.url) + '" alt="">' +
   288	    '<span class="a-name">' + esc(item.name || item.shortcut || '') + '</span>' +
   289	    '<button class="a-del" data-kind="' + kind + '" data-url="' + attr(item.url) + '" data-shortcut="' + attr(item.shortcut || '') + '">✕</button>' +
   290	    '</div>';
   291	}
   292	function renderEmos() {
   293	  var grid = $('cp-emo-grid');
   294	  var cnt = $('emo-count');
   295	  var list = state.emo || [];
   296	  if (cnt) cnt.textContent = list.length;
   297	  if (grid) {
   298	    grid.innerHTML = list.length ? list.map(function (e) { return assetItemHtml('emo', e); }).join('') : '<span class="muted small">لا ابتسامات</span>';
   299	    grid.querySelectorAll('.a-del').forEach(function (b) {
   300	      b.addEventListener('click', function () {
   301	        if (confirm('حذف الابتسامة (' + b.getAttribute('data-shortcut') + ')؟')) admin('emo_item_del', { shortcut: b.getAttribute('data-shortcut') });
   302	      });
   303	    });
   304	  }
   305	}
   306	function renderAddonsMgr() {
   307	  var cnt = $('addon-count');
   308	  var icons = (state.addons || []).filter(function (a) { return a.type !== 'gift'; });
   309	  var gifts = (state.addons || []).filter(function (a) { return a.type === 'gift'; });
   310	  if (cnt) cnt.textContent = (state.addons || []).length;
   311	  var gi = $('cp-icon-grid'), gg = $('cp-gift-grid');
   312	  if (gi) {
   313	    gi.innerHTML = icons.length ? icons.map(function (a) { return assetItemHtml('addon', a); }).join('') : '<span class="muted small">لا أيقونات</span>';
   314	  }
   315	  if (gg) {
   316	    gg.innerHTML = gifts.length ? gifts.map(function (a) { return assetItemHtml('addon', a); }).join('') : '<span class="muted small">لا هدايا</span>';
   317	  }
   318	  document.querySelectorAll('#cp-icon-grid .a-del, #cp-gift-grid .a-del').forEach(function (b) {
   319	    b.addEventListener('click', function () {
   320	      if (confirm('حذف هذا العنصر نهائياً من قائمة الإهداءات؟')) admin('addon_del', { url: b.getAttribute('data-url') });
   321	    });
   322	  });
   323	}
   324	
   325	var POWER_FLAGS = ['kick', 'delbc', 'alert', 'mynick', 'unick', 'ban', 'publicmsg', 'forcepm', 'roomowner', 'createroom', 'rooms', 'edituser', 'setpower', 'upgrades', 'history', 'cp', 'stealth', 'owner', 'meiut', 'loveu', 'ulike', 'flter', 'subs', 'shrt', 'msgs', 'bootedit', 'grupes', 'delmsg', 'delpic'];
   326	
   327	function renderPowers() {
   328	  var el = $('cp-powers-editor');
   329	  if (!el) return;
   330	  el.innerHTML = '';
   331	  (state.powers || []).forEach(function (p, idx) {
   332	    var card = document.createElement('div');
   333	    card.className = 'cp-card';
   334	    var flagsHtml = POWER_FLAGS.map(function (key) {
   335	      return '<label class="chk" style="padding:4px 0"><input type="checkbox" class="pw-flag" data-key="' + key + '"' + (p[key] ? ' checked' : '') + '> ' + key + '</label>';
   336	    }).join('');
   337	    card.innerHTML =
   338	      '<h5>🛡️ ' + esc(p.name || ('رتبة ' + (idx + 1))) + '</h5>' +
   339	      '<div class="grid g4">' +
   340	      '<div class="fld"><label>الاسم</label><input class="pw-name" value="' + attr(p.name || '') + '"></div>' +
   341	      '<div class="fld"><label>الرتبة (rank)</label><input class="pw-rank" type="number" value="' + (p.rank || 0) + '"></div>' +
   342	      '</div>' +
   343	      '<div class="grid g4 mt">' + flagsHtml + '</div>' +
   344	      '<button class="btn btn-pri btn-sm mt">💾 حفظ هذه الرتبة</button>';
   345	    card.querySelector('.btn').addEventListener('click', function () {
   346	      var doc = { rank: parseInt(card.querySelector('.pw-rank').value, 10) || 0, name: card.querySelector('.pw-name').value.trim(), ico: p.ico || '' };
   347	      card.querySelectorAll('.pw-flag').forEach(function (cb) { doc[cb.getAttribute('data-key')] = cb.checked ? 1 : 0; });
   348	      admin('save_as', { powers: state.powers.map(function (old, i) { return i === idx ? doc : old; }) });
   349	    });
   350	    el.appendChild(card);
   351	  });
   352	  if (!(state.powers || []).length) el.innerHTML = '<div class="cp-card muted">لا توجد رتب محملة</div>';
   353	}
   354	
   355	function renderUsers() {
   356	  var tbody = $('cp-users-table');
   357	  if (!tbody) return;
   358	  tbody.innerHTML = '';
   359	  var list = state.users || [];
   360	  var q = (state.userFilter || '').trim().toLowerCase();
   361	  if (q) list = list.filter(function (u) { return String(u.topic || u.username || '').toLowerCase().indexOf(q) !== -1; });
   362	  var cnt = $('cp-users-count');
   363	  if (cnt) cnt.textContent = q ? (list.length + ' / ' + (state.users || []).length) : (state.users || []).length;
   364	  if (!list.length) {
   365	    tbody.innerHTML = '<tr><td colspan="5" class="empty-row no-l">' + (q ? 'لا نتائج مطابقة' : 'لا يوجد أعضاء') + '</td></tr>';
   366	    return;
   367	  }
   368	  list.slice(0, 200).forEach(function (u) {
   369	    var name = u.topic || u.username || '';
   370	    var tr = document.createElement('tr');
   371	    tr.innerHTML =
   372	      '<td data-l="الاسم"><b>' + esc(name) + '</b>' + (u.verified ? ' ✅' : '') + '</td>' +
   373	      '<td data-l="الرتبة">' + esc(u.power || 'user') + '</td>' +
   374	      '<td data-l="النقاط">' + (u.rep || 0) + ' نقطة</td>' +
   375	      '<td data-l="IP">' + esc(u.ip || '—') + '</td>' +
   376	      '<td data-l class="no-l"><div class="row-btns">' +
   377	      '<button class="btn btn-sm btn-info" data-act="edit">تعديل</button>' +
   378	      '<button class="btn btn-sm btn-ghost" data-act="pow">رتبة</button>' +
   379	      '<button class="btn btn-sm btn-danger" data-act="ban">حظر</button>' +
   380	      '<button class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
   381	      '</div></td>';
   382	    tr.querySelector('[data-act="edit"]').addEventListener('click', function () { admin('get_user_profile', { topic: name }); });
   383	    tr.querySelector('[data-act="pow"]').addEventListener('click', function () {
   384	      var p = prompt('الرتبة الجديدة لـ ' + name + ':', u.power || 'user');
   385	      if (p) admin('setuserpower', { name: name, power: p.trim() });
   386	    });
   387	    tr.querySelector('[data-act="ban"]').addEventListener('click', function () {
   388	      if (confirm('حظر ' + name + '؟')) admin('save_band', { fp: u.fp || '', fp2: u.fp2 || '', ip: u.ip || '', reason: 'حظر من لوحة التحكم' });
   389	    });
   390	    tr.querySelector('[data-act="del"]').addEventListener('click', function () {
   391	      if (confirm('حذف ' + name + ' نهائياً؟')) admin('delete_user', { name: name });
   392	    });
   393	    tbody.appendChild(tr);
   394	  });
   395	}
   396	
   397	function renderOnline() {
   398	  var tbody = $('cp-live-table');
   399	  if (!tbody) return;
   400	  tbody.innerHTML = '';
   401	  var list = state.online || [];
   402	  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row no-l">لا يوجد متصلون حالياً</td></tr>'; return; }
   403	  list.forEach(function (u) {
   404	    var tr = document.createElement('tr');
   405	    tr.innerHTML =
   406	      '<td data-l="الاسم"><b>' + esc(u.username || '') + '</b>' + (u.guest ? ' <span class="tag">زائر</span>' : '') + '</td>' +
   407	      '<td data-l="النوع">' + esc(u.power || 'user') + '</td>' +
   408	      '<td data-l="الغرفة">' + esc(u.roomName || '—') + '</td>' +
   409	      '<td data-l="IP">' + esc(u.ip || '—') + '</td>' +
   410	      '<td data-l="الحالة">' + (u.idle ? '<span class="muted">خامل</span>' : '<span style="color:var(--ok)">نشط</span>') + '</td>' +
   411	      '<td data-l class="no-l"><div class="row-btns">' +
   412	      '<button class="btn btn-sm btn-warn" data-act="mute">كتم</button>' +
   413	      '<button class="btn btn-sm btn-ghost" data-act="unmute">رفع الكتم</button>' +
   414	      '<button class="btn btn-sm btn-info" data-act="kick">طرد</button>' +
   415	      '<button class="btn btn-sm btn-danger" data-act="ban">حظر</button>' +
   416	      '</div></td>';
   417	    tr.querySelector('[data-act="mute"]').addEventListener('click', function () {
   418	      var ms = prompt('مدة كتم ' + u.username + ' بالدقائق:', '10');
   419	      if (ms !== null) admin('cp_mute_user', { name: u.username, roomId: u.roomid, ms: (parseInt(ms, 10) || 10) * 60000, reason: 'كتم من لوحة التحكم' });
   420	    });
   421	    tr.querySelector('[data-act="unmute"]').addEventListener('click', function () { admin('cp_unmute_user', { name: u.username, roomId: u.roomid }); });
   422	    tr.querySelector('[data-act="kick"]').addEventListener('click', function () {
   423	      if (confirm('طرد ' + u.username + '؟')) admin('cp_kick_user', { name: u.username, reason: 'طرد من لوحة التحكم' });
   424	    });
   425	    tr.querySelector('[data-act="ban"]').addEventListener('click', function () {
   426	      if (confirm('حظر ' + u.username + '؟')) admin('cp_ban_online', { name: u.username, reason: 'حظر من لوحة التحكم' });
   427	    });
   428	    tbody.appendChild(tr);
   429	  });
   430	}
   431	
   432	function renderBans() {
   433	  var tbody = $('cp-ban-table');
   434	  if (!tbody) return;
   435	  tbody.innerHTML = '';
   436	  var list = state.bands || [];
   437	  if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-row no-l">لا يوجد حظر</td></tr>'; return; }
   438	  list.forEach(function (b) {
   439	    var val = b.device_band || b.ip_band || '';
   440	    var tr = document.createElement('tr');
   441	    tr.innerHTML =
   442	      '<td data-l="القيمة"><code style="font-size:11px">' + esc(val) + '</code></td>' +
   443	      '<td data-l="التاريخ">' + fmtDate(b.date) + '</td>' +
   444	      '<td data-l="السبب">' + esc(b.name_band || '') + '</td>' +
   445	      '<td data-l class="no-l"><button class="btn btn-sm btn-danger">إلغاء</button></td>';
   446	    tr.querySelector('button').addEventListener('click', function () {
   447	      socket.emit('msg', { cmd: 'delBand', data: { id: b._id || b.id || '', fp: b.device_band || '', ip: b.ip_band || '', password: state.password } });
   448	      admin('delete_band', { fp: b.device_band || '', ip: b.ip_band || '' });
   449	    });
   450	    tbody.appendChild(tr);
   451	  });
   452	}
   453	
   454	function banChecks(containerId, defs, cls) {
   455	  var el = $(containerId);
   456	  if (!el) return;
   457	  var cur = containerId === 'cp-browser-bans' ? (state.bans.browsers || {}) : (state.bans.systems || {});
   458	  el.innerHTML = '';
   459	  Object.keys(defs).forEach(function (key) {
   460	    var lab = document.createElement('label');
   461	    lab.className = 'chk';
   462	    lab.innerHTML = '<input type="checkbox" class="' + cls + '" data-key="' + key + '"' + (cur[key] === true ? ' checked' : '') + '> ' + defs[key];
   463	    el.appendChild(lab);
   464	  });
   465	}
   466	function renderBrowserBans() {
   467	  banChecks('cp-browser-bans', { browser_all: 'الكل', browser1: 'Chrome', browser2: 'Firefox', browser3: 'Safari', browser4: 'Opera', browser6: 'Edge' }, 'bb');
   468	}
   469	function renderOsBans() {
   470	  banChecks('cp-os-bans', { system_all: 'الكل', system1: 'Windows', system2: 'Linux', system3: 'Android', system4: 'iOS', system5: 'Mac OS' }, 'so');
   471	}
   472	
   473	function renderRooms() {
   474	  var tbody = $('cp-rooms-table');
   475	  if (!tbody) return;
   476	  tbody.innerHTML = '';
   477	  var list = state.rooms || [];
   478	  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row no-l">لا توجد غرف</td></tr>'; return; }
   479	  list.forEach(function (r) {
   480	    var tr = document.createElement('tr');
   481	    tr.innerHTML =
   482	      '<td data-l="الاسم"><b>' + esc(r.name || '') + '</b></td>' +
   483	      '<td data-l="المالك">' + esc(r.owner || r.roomOwner || '—') + '</td>' +
   484	      '<td data-l="كلمة مرور">' + ((r.hasPassword || r.password) ? '🔒' : '—') + '</td>' +
   485	      '<td data-l="نشطة">' + (r.isActive ? 'نعم' : 'لا') + '</td>' +
   486	      '<td data-l="مقفلة">' + (r.isLocked ? 'نعم' : 'لا') + '</td>' +
   487	      '<td data-l class="no-l"><div class="row-btns">' +
   488	      '<button class="btn btn-sm btn-info" data-act="edit">تعديل</button>' +
   489	      '<button class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
   490	      '</div></td>';
   491	    tr.querySelector('[data-act="edit"]').addEventListener('click', function () { admin('get_room_profile', { id: r.id }); });
   492	    tr.querySelector('[data-act="del"]').addEventListener('click', function () {
   493	      if (confirm('حذف غرفة ' + r.name + '؟')) admin('delete_room', { id: r.id });
   494	    });
   495	    tbody.appendChild(tr);
   496	  });
   497	}
   498	
   499	function renderRoomEditor() {
   500	  var el = $('cp-room-editor');
   501	  if (!el) return;
   502	  var r = state.roomProfile;
   503	  if (!r) { el.innerHTML = ''; return; }
   504	  var mods = (r.moderators || []).map(function (m) { return m.username || m.topic || m; });
   505	  el.innerHTML =
   506	    '<div class="cp-card"><h5>✏️ تعديل الغرفة: ' + esc(r.name || '') + '</h5>' +
   507	    '<div class="grid g4">' +
   508	    '<div class="fld"><label>الاسم</label><input id="re-name" value="' + attr(r.name || '') + '"></div>' +
   509	    '<div class="fld"><label>المالك</label><input id="re-owner" value="' + attr(r.owner || '') + '"></div>' +
   510	    '<div class="fld"><label>كلمة المرور (فارغ = إزالة)</label><input id="re-pass" type="text" value="' + attr(r.password || '') + '" placeholder="' + (r.hasPassword ? 'موجودة حالياً' : 'لا توجد') + '"></div>' +
   511	    '<div class="fld"><label>سعة المكالمات/الكاميرات</label><input id="re-cap" type="number" value="' + (r.capacity || 0) + '"></div>' +
   512	    '</div>' +
   513	    '<div class="grid g4 mt">' +
   514	    '<div class="fld"><label>مستوى الغرفة</label><input id="re-level" type="number" value="' + (r.roomLevel || 0) + '"></div>' +
   515	    '<div class="fld"><label>إعجابات مطلوبة</label><input id="re-likes" type="number" value="' + (r.requiredLikes || 0) + '"></div>' +
   516	    '<div class="fld"><label>أقصى مايكات</label><input id="re-mics" type="number" value="' + (r.roomMaxMicSlots || 4) + '"></div>' +
   517	    '<div class="fld"><label>الوصف</label><input id="re-desc" value="' + attr(r.roomDescription || '') + '"></div>' +
   518	    '</div>' +
   519	    '<div class="grid g4 mt">' +
   520	    '<label class="chk"><input type="checkbox" id="re-active"' + (r.isActive ? ' checked' : '') + '> نشطة</label>' +
   521	    '<label class="chk"><input type="checkbox" id="re-cam"' + (r.allowCamera ? ' checked' : '') + '> كاميرا</label>' +
   522	    '<label class="chk"><input type="checkbox" id="re-broadcast"' + (r.allowBroadcast ? ' checked' : '') + '> بث مباشر</label>' +
   523	    '<label class="chk"><input type="checkbox" id="re-chat"' + (r.disableChat ? ' checked' : '') + '> تعطيل الدردشة</label>' +
   524	    '</div>' +
   525	    '<div class="mt"><label class="hint">المشرفون الحاليون:</label><div id="re-mods-list">' +
   526	    (mods.length ? mods.map(function (m) { return '<span class="chip-user">👮 ' + esc(m) + '</span>'; }).join('') : '<span class="muted small">لا يوجد مشرفون</span>') +
   527	    '</div></div>' +
   528	    '<div class="grid g3 mt">' +
   529	    '<div class="fld"><input id="re-mod-name" placeholder="اسم المشرف"></div>' +
   530	    '<div class="fld" style="align-self:end"><button class="btn btn-ok btn-sm" data-x="addmod">➕ إضافة مشرف</button></div>' +
   531	    '<div class="fld" style="align-self:end"><button class="btn btn-warn btn-sm" data-x="delmod">➖ إزالة مشرف</button></div>' +
   532	    '</div>' +
   533	    '<div class="row-btns mt">' +
   534	    '<button class="btn btn-pri" data-x="saveroom">💾 حفظ الغرفة</button>' +
   535	    '<button class="btn btn-ghost" data-x="clearchat">🧹 مسح محادثة الغرفة</button>' +
   536	    '</div></div>';
   537	  el.querySelector('[data-x="saveroom"]').addEventListener('click', function () {
   538	    admin('edit_room_full', {
   539	      id: r.id,
   540	      name: $('re-name').value,
   541	      owner: $('re-owner').value,
   542	      roomPassword: $('re-pass').value,
   543	      removePassword: $('re-pass').value ? 'false' : 'true',
   544	      capacity: $('re-cap').value,
   545	      roomLevel: $('re-level').value,
   546	      requiredLikes: $('re-likes').value,
   547	      roomMaxMicSlots: $('re-mics').value,
   548	      roomDescription: $('re-desc').value,
   549	      isActive: !!$('re-active').checked,
   550	      allowCamera: !!$('re-cam').checked,
   551	      allowBroadcast: !!$('re-broadcast').checked,
   552	      disableChat: !!$('re-chat').checked
   553	    });
   554	  });
   555	  el.querySelector('[data-x="clearchat"]').addEventListener('click', function () {
   556	    if (confirm('مسح محادثة الغرفة ' + r.name + '؟')) admin('clear_room_chat', { id: r.id });
   557	  });
   558	  el.querySelector('[data-x="addmod"]').addEventListener('click', function () {
   559	    var n = $('re-mod-name').value.trim();
   560	    if (n) admin('add_room_moderator', { id: r.id, username: n });
   561	  });
   562	  el.querySelector('[data-x="delmod"]').addEventListener('click', function () {
   563	    var n = $('re-mod-name').value.trim();
   564	    if (n) admin('del_room_moderator', { id: r.id, username: n });
   565	  });
   566	  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
   567	}
   568	
   569	function renderFilter() {
   570	  var el = $('cp-fltr-list');
   571	  if (!el) return;
   572	  el.innerHTML = (state.noletters || []).length
   573	    ? state.noletters.map(function (n) { return '<span class="tag">' + esc(n.v || '') + '<span class="del" data-v="' + attr(n.v || '') + '">✕</span></span>'; }).join('')
   574	    : '<span class="muted small">لا توجد كلمات مفلترة</span>';
   575	  el.querySelectorAll('.del').forEach(function (d) {
   576	    d.addEventListener('click', function () { admin('fltr_del', { value: d.getAttribute('data-v') }); });
   577	  });
   578	}
   579	
   580	function renderMessages() {
   581	  var el = $('cp-msg-list');
   582	  if (!el) return;
   583	  var list = state.msgs || [];
   584	  el.innerHTML = list.length ? '' : '<span class="muted small">لا توجد رسائل</span>';
   585	  list.forEach(function (m, i) {
   586	    var row = document.createElement('div');
   587	    row.className = 'tag';
   588	    row.innerHTML = '<b>' + (m.category === 'w' ? 'ترحيب' : 'يومية') + '</b>: ' + esc(m.adresse || '') + ' — ' + esc((m.msg || '').substring(0, 40)) + ' <span class="del">✕</span>';
   589	    row.querySelector('.del').addEventListener('click', function () { admin('msg_del', { adresse: m.adresse, msg: m.msg }); });
   590	    el.appendChild(row);
   591	  });
   592	}
   593	
   594	function renderShortcuts() {
   595	  var el = $('cp-shrt-list');
   596	  if (!el) return;
   597	  el.innerHTML = (state.shrt || []).length ? '' : '<span class="muted small">لا توجد اختصارات</span>';
   598	  (state.shrt || []).forEach(function (s) {
   599	    var tag = document.createElement('span');
   600	    tag.className = 'tag';
   601	    tag.innerHTML = '<b>' + esc(s.name || '') + '</b> = ' + esc(String(s.value || '').substring(0, 24)) + ' <span class="del">✕</span>';
   602	    tag.querySelector('.del').addEventListener('click', function () { admin('shrt_del', { name: s.name }); });
   603	    el.appendChild(tag);
   604	  });
   605	}
   606	
   607	function renderSubs() {
   608	  var tbody = $('cp-subs-table');
   609	  if (!tbody) return;
   610	  tbody.innerHTML = '';
   611	  var list = state.subs || [];
   612	  if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-row no-l">لا توجد اشتراكات</td></tr>'; return; }
   613	  list.forEach(function (s) {
   614	    var tr = document.createElement('tr');
   615	    tr.innerHTML =
   616	      '<td data-l="المستخدم">' + esc(s.topic || s.topic1 || s.iduser || '') + '</td>' +
   617	      '<td data-l="الصلاحية">' + esc(s.sub || '') + '</td>' +
   618	      '<td data-l="التاريخ">' + esc(s.time || '') + '</td>' +
   619	      '<td data-l class="no-l"><button class="btn btn-sm btn-danger">حذف</button></td>';
   620	    tr.querySelector('button').addEventListener('click', function () { admin('subs_del', { iduser: s.iduser }); });
   621	    tbody.appendChild(tr);
   622	  });
   623	}
   624	
   625	function renderModeration() {
   626	  var tb = $('cp-mod-posts');
   627	  if (tb) {
   628	    tb.innerHTML = '';
   629	    var posts = state.postsMod || [];
   630	    if (!posts.length) tb.innerHTML = '<tr><td colspan="5" class="empty-row no-l">لا توجد منشورات</td></tr>';
   631	    posts.forEach(function (p) {
   632	      var tr = document.createElement('tr');
   633	      tr.innerHTML =
   634	        '<td data-l="المستخدم">' + esc(p.username || '') + '</td>' +
   635	        '<td data-l="النص">' + esc((p.text || '').substring(0, 60)) + (p.mediaUrl ? ' 🖼' : '') + '</td>' +
   636	        '<td data-l="تفاعل">❤️ ' + (p.likes || 0) + ' | 💬 ' + (p.comments || 0) + '</td>' +
   637	        '<td data-l="التاريخ">' + fmtDate(p.createdAt) + '</td>' +
   638	        '<td data-l class="no-l"><button class="btn btn-sm btn-danger">حذف</button></td>';
   639	      tr.querySelector('button').addEventListener('click', function () {
   640	        if (confirm('حذف منشور ' + (p.username || '') + '؟')) admin('del_post', { postId: p.id });
   641	      });
   642	      tb.appendChild(tr);
   643	    });
   644	  }
   645	  var ts = $('cp-mod-stories');
   646	  if (ts) {
   647	    ts.innerHTML = '';
   648	    var stories = state.storiesMod || [];
   649	    if (!stories.length) ts.innerHTML = '<tr><td colspan="6" class="empty-row no-l">لا توجد قصص</td></tr>';
   650	    stories.forEach(function (s) {
   651	      var banned = (state.storyBans || []).indexOf(String(s.userId)) !== -1;
   652	      var tr = document.createElement('tr');
   653	      tr.innerHTML =
   654	        '<td data-l="المستخدم">' + esc(s.username || '') + '</td>' +
   655	        '<td data-l="النص">' + esc((s.text || '').substring(0, 50)) + (s.img ? ' 🖼' : '') + '</td>' +
   656	        '<td data-l="مشاهدات">' + (s.views || 0) + '</td>' +
   657	        '<td data-l="إعجاب">' + (s.likes || 0) + '</td>' +
   658	        '<td data-l="التاريخ">' + fmtDate(s.createdAt) + '</td>' +
   659	        '<td data-l class="no-l"><div class="row-btns">' +
   660	        '<button class="btn btn-sm ' + (banned ? 'btn-ok' : 'btn-warn') + '" data-act="sban">' + (banned ? 'رفع حظر القصص' : 'حظر القصص') + '</button>' +
   661	        '<button class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
   662	        '</div></td>';
   663	      tr.querySelector('[data-act="sban"]').addEventListener('click', function () {
   664	        admin('set_story_ban', { userId: String(s.userId), banned: !banned });
   665	      });
   666	      tr.querySelector('[data-act="del"]').addEventListener('click', function () {
   667	        if (confirm('حذف ستوري ' + (s.username || '') + '؟')) admin('del_story', { storyId: s.id });
   668	      });
   669	      ts.appendChild(tr);
   670	    });
   671	  }
   672	  var sb = $('cp-story-bans');
   673	  if (sb) {
   674	    sb.innerHTML = (state.storyBans || []).length
   675	      ? '<span class="hint">محظورو القصص:</span> ' + state.storyBans.map(function (id) { return '<span class="tag">' + esc(id) + '<span class="del" data-id="' + attr(id) + '">✕</span></span>'; }).join('')
   676	      : '';
   677	    sb.querySelectorAll('.del').forEach(function (d) {
   678	      d.addEventListener('click', function () { admin('set_story_ban', { userId: d.getAttribute('data-id'), banned: false }); });
   679	    });
   680	  }
   681	}
   682	
   683	function renderFps(logs) {
   684	  var el = $('cp-fp-list');
   685	  if (!el) return;
   686	  el.innerHTML = '';
   687	  var list = logs || [];
   688	  if (!list.length) { el.innerHTML = '<tr><td colspan="4" class="empty-row no-l">لا سجلات</td></tr>'; return; }
   689	  list.forEach(function (l) {
   690	    var tr = document.createElement('tr');
   691	    tr.innerHTML =
   692	      '<td data-l="الاسم">' + esc(l.topic || l.username || '') + '</td>' +
   693	      '<td data-l="IP">' + esc(l.ip || '—') + '</td>' +
   694	      '<td data-l="الجهاز" title="' + attr(l.deviceInfo || l.fp || '') + '">' + esc(String(l.fp2 || l.fp || '').substring(0, 16) || '—') + '</td>' +
   695	      '<td data-l="آخر ظهور">' + fmtDate(l.time) + '</td>';
   696	    el.appendChild(tr);
   697	  });
   698	}
   699	
   700	function renderHealth() {
   701	  var h = state.health || {};
   702	  var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
   703	  set('h-online', h.onlineCount !== undefined ? h.onlineCount : '—');
   704	  set('h-members', (state.users || []).length);
   705	  set('h-rooms', (state.rooms || []).length);
   706	  set('h-bans', (state.bands || []).length);
   707	  set('h-db', h.dbStatus === 'mongo' ? 'MongoDB' : h.dbStatus === 'memory' ? 'ذاكرة' : '—');
   708	  set('h-mem', h.memory ? fmtBytes(h.memory.rss) : '—');
   709	  set('h-uptime', fmtUptime(h.uptime));
   710	  set('h-node', h.node || '—');
   711	}
   712	
   713	function shortObj(o) {
   714	  if (o === null || o === undefined) return '—';
   715	  var s = typeof o === 'string' ? o : JSON.stringify(o);
   716	  return esc(s.length > 50 ? s.substring(0, 50) + '…' : s);
   717	}
   718	function renderAudit() {
   719	  var tbody = $('cp-audit-table');
   720	  if (!tbody) return;
   721	  tbody.innerHTML = '';
   722	  var list = state.audit || [];
   723	  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row no-l">لا سجلات بعد</td></tr>'; return; }
   724	  list.slice(0, 150).forEach(function (e) {
   725	    var tr = document.createElement('tr');
   726	    tr.innerHTML =
   727	      '<td data-l="التاريخ">' + fmtDate(e.when) + '</td>' +
   728	      '<td data-l="المنفذ">' + esc(e.actor || '—') + '</td>' +
   729	      '<td data-l="الإجراء"><code style="font-size:11px">' + esc(e.action || '') + '</code></td>' +
   730	      '<td data-l="الهدف">' + esc(e.target || '—') + '</td>' +
   731	      '<td data-l="قبل">' + shortObj(e.before) + '</td>' +
   732	      '<td data-l="بعد">' + shortObj(e.after) + '</td>';
   733	    tbody.appendChild(tr);
   734	  });
   735	}
   736	
   737	/* ─── user profile modal ─── */
   738	
   739	function openModal(title, bodyHtml) {
   740	  $('cp-modal-title').textContent = title;
   741	  $('cp-modal-body').innerHTML = bodyHtml;
   742	  $('cp-modal').classList.add('open');
   743	}
   744	function closeModal() { $('cp-modal').classList.remove('open'); }
   745	
   746	function renderUserProfile(u) {
   747	  if (!u) { toast('المستخدم غير موجود', 'err'); return; }
   748	  state.userProfile = u;
   749	  var powerOpts = ['user', 'admin'].concat((state.powers || []).map(function (p) { return p.name; }))
   750	    .filter(function (v, i, a) { return a.indexOf(v) === i; })
   751	    .map(function (n) { return '<option value="' + attr(n) + '"' + ((u.power || 'user') === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
   752	  var addons = state.addons || [];
   753	  var iconAssets = addons.filter(function (a) { return a.type !== 'gift'; });
   754	  var giftAssets = addons.filter(function (a) { return a.type === 'gift'; });
   755	  var gifts = Array.isArray(u.gifts) ? u.gifts : [];
   756	  var storyBanned = (state.storyBans || []).indexOf(String(u.id)) !== -1;
   757	
   758	  var html =
   759	    '<div class="grid g2">' +
   760	    '<div class="fld"><label>اسم المستخدم</label><input id="up-topic" value="' + attr(u.topic || '') + '"></div>' +
   761	    '<div class="fld"><label>الرتبة</label><select id="up-power">' + powerOpts + '</select></div>' +
   762	    '</div>' +
   763	    '<div class="grid g4 mt">' +
   764	    '<div class="fld"><label>النقاط (rep)</label><input id="up-rep" type="number" value="' + (u.rep || 0) + '"></div>' +
   765	    '<div class="fld"><label>الإعجابات</label><input id="up-likes" type="number" value="' + (u.likes || 0) + '"></div>' +
   766	    '<div class="fld"><label>العملات</label><input id="up-coins" type="number" value="' + (u.coins || 0) + '"></div>' +
   767	    '<div class="fld"><label>نقاط الجدار</label><input id="up-wall" type="number" value="' + (u.wallPoints || 0) + '"></div>' +
   768	    '</div>' +
   769	    '<div class="grid g4 mt">' +
   770	    '<div class="fld"><label>الاشتراك</label><input id="up-membership" value="' + attr(u.memberShip || 'free') + '"></div>' +
   771	    '<div class="fld"><label>الدولة (كود)</label><input id="up-co" value="' + attr(u.co || '') + '" maxlength="3"></div>' +
   772	    '<div class="fld"><label>الجنس</label><input id="up-gender" value="' + attr(u.gender || '') + '"></div>' +
   773	    '<div class="fld"><label>البريد</label><input id="up-email" value="' + attr(u.email || '') + '"></div>' +
   774	    '</div>' +
   775	    '<div class="grid g2 mt">' +
   776	    '<div class="fld"><label>الحالة / رسالة</label><input id="up-msg" value="' + attr(u.msg || '') + '" maxlength="120"></div>' +
   777	    '<div class="fld"><label>كلمة مرور جديدة (اختياري)</label><input id="up-pass" type="password" placeholder="اتركه فارغاً"></div>' +
   778	    '</div>' +
   779	    '<div class="grid g2 mt">' +
   780	    '<label class="chk"><input type="checkbox" id="up-verify"' + (u.verified ? ' checked' : '') + '> حساب موثق ✅</label>' +
   781	    '<label class="chk"><input type="checkbox" id="up-isadmin"' + (u.isAdmin ? ' checked' : '') + '> مشرف عام (isAdmin)</label>' +
   782	    '</div>' +
   783	    '<p class="hint mt">ID: ' + esc(u.id || '') + ' | IP: ' + esc(u.ip || '—') + ' | الجهاز: ' + esc(String(u.fp || '').substring(0, 14) || '—') + ' | آخر ظهور: ' + fmtDate(u.lastSeen) + '</p>' +
   784	    '<div class="row-btns mt"><button class="btn btn-pri" data-x="save">💾 حفظ العضو</button>' +
   785	    '<button class="btn btn-ok btn-sm" data-x="rep">➕ إعطاء نقاط</button>' +
   786	    '<button class="btn btn-warn btn-sm" data-x="mute">🔇 كتم</button>' +
   787	    '<button class="btn btn-info btn-sm" data-x="kick">👢 طرد</button>' +
   788	    '<button class="btn btn-danger btn-sm" data-x="ban">🚫 حظر</button>' +
   789	    '<button class="btn btn-danger btn-sm" data-x="del">🗑 حذف الحساب</button></div>' +
   790	
   791	    '<h5 style="margin-top:18px">🎖 الأيقونة الفائقة (Super Icon)</h5>' +
   792	    '<div id="up-icons" class="row-btns">' +
   793	    iconAssets.map(function (a) {
   794	      var cur = u.superIcon === a.url;
   795	      return '<button class="btn btn-sm ' + (cur ? 'btn-pri' : 'btn-ghost') + '" data-icon="' + attr(a.url) + '">' + esc(a.name || a.url) + (cur ? ' ✓' : '') + '</button>';
   796	    }).join(' ') +
   797	    '<button class="btn btn-sm btn-danger" data-icon-remove="1">إزالة</button></div>' +
   798	
   799	    '<h5 style="margin-top:18px">🎁 الهدايا الممنوحة</h5>' +
   800	    '<div class="row-btns mb" id="up-gifts-current">' +
   801	    (gifts.length ? gifts.map(function (g) { return '<span class="tag">' + esc(g) + ' <span class="del" data-gift="' + attr(g) + '">✕</span></span>'; }).join('') : '<span class="muted small">لا هدايا</span>') +
   802	    '</div>' +
   803	    '<div class="row-btns">' +
   804	    giftAssets.map(function (a) {
   805	      var has = gifts.indexOf(a.url) !== -1;
   806	      return '<button class="btn btn-sm ' + (has ? 'btn-pri' : 'btn-ghost') + '" data-gift-add="' + attr(a.url) + '">' + esc(a.name || a.url) + (has ? ' ✓' : '') + '</button>';
   807	    }).join(' ') +
   808	    '</div>' +
   809	
   810	    '<div class="mt"><button class="btn btn-sm ' + (storyBanned ? 'btn-ok' : 'btn-warn') + '" data-x="storyban">' + (storyBanned ? '✅ رفع حظر القصص' : '📸 حظر نشر القصص') + '</button></div>';
   811	
   812	  openModal('تعديل العضو: ' + (u.topic || ''), html);
   813	
   814	  var body = $('cp-modal-body');
   815	  body.querySelector('[data-x="save"]').addEventListener('click', function () {
   816	    var data = {
   817	      original: u.topic || u.username,
   818	      topic: $('up-topic').value.trim(),
   819	      power: $('up-power').value,
   820	      rep: $('up-rep').value, likes: $('up-likes').value,
   821	      coins: $('up-coins').value, wallPoints: $('up-wall').value,
   822	      memberShip: $('up-membership').value.trim(),
   823	      co: $('up-co').value.trim(), gender: $('up-gender').value.trim(),
   824	      email: $('up-email').value.trim(), msg: $('up-msg').value.trim(),
   825	      verified: !!$('up-verify').checked, isAdmin: !!$('up-isadmin').checked
   826	    };
   827	    var pw = $('up-pass').value.trim();
   828	    if (pw) data.password = pw;
   829	    admin('edit_user_profile', data);
   830	  });
   831	  body.querySelector('[data-x="rep"]').addEventListener('click', function () {
   832	    var v = prompt('كم نقطة يُضاف لـ ' + (u.topic || '') + '؟', '10');
   833	    if (v) admin('cp_give_rep', { topic: u.topic || u.username, value: parseInt(v, 10) || 0 });
   834	  });
   835	  body.querySelector('[data-x="mute"]').addEventListener('click', function () {
   836	    var ms = prompt('مدة الكتم بالدقائق:', '10');
   837	    if (ms !== null) admin('cp_mute_user', { name: u.topic || u.username, ms: (parseInt(ms, 10) || 10) * 60000, reason: 'كتم من لوحة التحكم' });
   838	  });
   839	  body.querySelector('[data-x="kick"]').addEventListener('click', function () {
   840	    if (confirm('طرد ' + (u.topic || '') + ' من الاتصال؟')) admin('cp_kick_user', { name: u.topic || u.username, reason: 'طرد من لوحة التحكم' });
   841	  });
   842	  body.querySelector('[data-x="ban"]').addEventListener('click', function () {
   843	    if (confirm('حظر ' + (u.topic || '') + '؟')) admin('cp_ban_online', { name: u.topic || u.username, reason: 'حظر من لوحة التحكم' });
   844	  });
   845	  body.querySelector('[data-x="del"]').addEventListener('click', function () {
   846	    if (confirm('حذف حساب ' + (u.topic || '') + ' نهائياً؟')) admin('delete_user', { name: u.topic || u.username });
   847	  });
   848	  body.querySelector('[data-x="storyban"]').addEventListener('click', function () {
   849	    admin('set_story_ban', { userId: String(u.id), banned: !storyBanned });
   850	  });
   851	  body.querySelectorAll('[data-icon]').forEach(function (b) {
   852	    b.addEventListener('click', function () { admin('assign_super_icon', { userId: u.id, iconUrl: b.getAttribute('data-icon') }); });
   853	  });
   854	  body.querySelectorAll('[data-icon-remove]').forEach(function (b) {
   855	    b.addEventListener('click', function () { admin('remove_super_icon', { userId: u.id }); });
   856	  });
   857	  body.querySelectorAll('[data-gift-add]').forEach(function (b) {
   858	    b.addEventListener('click', function () { admin('assign_gift', { userId: u.id, giftUrl: b.getAttribute('data-gift-add') }); });
   859	  });
   860	  body.querySelectorAll('[data-gift]').forEach(function (x) {
   861	    x.addEventListener('click', function () { admin('remove_gift', { userId: u.id, giftUrl: x.getAttribute('data-gift') }); });
   862	  });
   863	}
   864	
   865	/* ─── protocol ─── */
   866	
   867	socket.on('connect', function () {
   868	  connected = true;
   869	  setStatus(authed ? 'متصل ومصرح' : 'متصل — أدخل كلمة المرور', authed ? 'ok' : '');
   870	  var saved = localStorage.getItem('cp-pass') || sessionStorage.getItem('cp-pass') || '';
   871	  if (saved) { state.password = saved; getState(); }
   872	});
   873	
   874	socket.on('disconnect', function () {
   875	  connected = false;
   876	  setStatus('انقطع الاتصال', 'err');
   877	});
   878	
   879	socket.on('message', function (msg) {
   880	  if (!msg || !msg.cmd) return;
   881	  switch (msg.cmd) {
   882	    case 'error_list':
   883	      if (!authed) {
   884	        $('cp-login-err').textContent = (msg.data && msg.data.msg) || 'كلمة المرور غير صحيحة';
   885	        setStatus('كلمة المرور غير صحيحة', 'err');
   886	      } else {
   887	        toast((msg.data && msg.data.msg) || 'خطأ صلاحية', 'err');
   888	      }
   889	      break;
   890	    case 'siteweb':
   891	      state.siteweb = msg.data || {};
   892	      if (!authed) {
   893	        authed = true;
   894	        localStorage.setItem('cp-pass', state.password);
   895	        $('cp-login').classList.add('hidden');
   896	        setStatus('متصل ومصرح', 'ok');
   897	        toast('مرحباً بك في لوحة التحكم', 'ok');
   898	        admin('get_system_health');
   899	      }
   900	      renderSettings();
   901	      break;
   902	    case 'dro3': state.dro3 = msg.data || []; break;
   903	    case 'emos': state.emo = msg.data || []; renderEmos(); break;
   904	    case 'sicos': state.sico = msg.data || []; break;
   905	    case 'addons': state.addons = msg.data || []; renderAddonsMgr(); break;
   906	    case 'powers': state.powers = msg.data || []; renderPowers(); break;
   907	    case 'noletters': state.noletters = msg.data || []; renderFilter(); break;
   908	    case 'zaker': break;
   909	    case 'users_data': state.users = msg.data || []; renderUsers(); renderHealth(); break;
   910	    case 'rlist': state.rooms = msg.data || []; renderRooms(); renderHealth(); break;
   911	    case 'band_list': state.bands = msg.data || []; renderBans(); renderHealth(); break;
   912	    case 'setbansystem': state.bans = msg.data || state.bans; renderBrowserBans(); renderOsBans(); break;
   913	    case 'shrtlist': state.shrt = msg.data || []; renderShortcuts(); break;
   914	    case 'msgslist': state.msgs = msg.data || []; renderMessages(); break;
   915	    case 'subslist': state.subs = msg.data || []; renderSubs(); break;
   916	    case 'online_usrs': state.online = msg.data || []; renderOnline(); break;
   917	    case 'posts_moderation': state.postsMod = msg.data || []; renderModeration(); break;
   918	    case 'stories_moderation': state.storiesMod = msg.data || []; renderModeration(); break;
   919	    case 'story_bans': state.storyBans = msg.data || []; renderModeration(); break;
   920	    case 'user_profile': renderUserProfile(msg.data); break;
   921	    case 'room_profile': state.roomProfile = msg.data || null; renderRoomEditor(); break;
   922	    case 'seo': case 'seo_saved': state.seo = msg.data || {}; renderSeo(); break;
   923	    case 'appearance': state.appearance = msg.data || {}; renderAppearance(); break;
   924	    case 'features_data': state.features = msg.data || {}; renderFeatures(); break;
   925	    case 'tickers_data':
   926	      state.tickers = msg.data || { news: {}, ads: { settings: {}, ads: [] } };
   927	      if (!state.tickers.ads) state.tickers.ads = { settings: {}, ads: [] };
   928	      renderTickers();
   929	      break;
   930	    case 'badges_data': state.badges = msg.data || { enabled: false, badges: {} }; renderBadges(); break;
   931	    case 'login_behavior_data': state.loginBehavior = msg.data || {}; renderLoginBehavior(); break;
   932	    case 'zajel_cp_data': state.zajel = msg.data || { approved: [], pending: [] }; renderZajel(); break;
   933	    case 'cp_image_uploaded': onImageUploaded(msg.data || {}); break;
   934	  }
   935	});
   936	
   937	socket.on('savedone', function (data) {
   938	  toast((data && data.msg) || 'تم الحفظ ✓', 'ok');
   939	  if ($('cp-modal').classList.contains('open') && state.userProfile) admin('get_user_profile', { topic: state.userProfile.topic || state.userProfile.username });
   940	  getState();
   941	});
   942	
   943	socket.on('error-msg', function (data) { toast((data && data.msg) || 'خطأ', 'err'); });
   944	
   945	socket.on('fpslist', function (logs) { renderFps(logs); });
   946	
   947	socket.on('user_data', function (u) {
   948	  if (u) admin('get_user_profile', { topic: u.topic || u.username });
   949	});
   950	
   951	socket.on('done_band', function () { toast('تم الحظر ✓', 'ok'); getState(); });
   952	
   953	socket.on('system_health', function (h) { state.health = h || {}; renderHealth(); });
   954	
   955	socket.on('auditlog', function (list) { state.audit = list || []; renderAudit(); });
   956	
   957	/* ─── auth ─── */
   958	
   959	function tryLogin() {
   960	  var pass = $('cp-login-pass').value.trim();
   961	  if (!pass) { $('cp-login-err').textContent = 'أدخل كلمة المرور'; return; }
   962	  state.password = pass;
   963	  $('cp-login-err').textContent = '';
   964	  setStatus('جاري التحقق...');
   965	  getState();
   966	}
   967	$('cp-login-btn').addEventListener('click', tryLogin);
   968	$('cp-login-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryLogin(); });
   969	
   970	$('cp-logout').addEventListener('click', function () {
   971	  localStorage.removeItem('cp-pass');
   972	  sessionStorage.removeItem('cp-pass');
   973	  location.reload();
   974	});
   975	
   976	/* ─── navigation ─── */
   977	
   978	var LAZY = {
   979	  health: function () { admin('get_system_health'); },
   980	  audit: function () { admin('get_auditlog'); },
   981	  live: function () { admin('get_online_users'); },
   982	  mod: function () { admin('get_posts_moderation'); admin('get_stories_moderation'); admin('get_story_bans'); admin('get_addons'); },
   983	  users: function () { admin('get_addons'); },
   984	  rooms: function () { if (!state.roomProfile && state.rooms && state.rooms[0]) admin('get_room_profile', { id: state.rooms[0].id }); },
   985	  tools: function () { admin('get_fps', {}); },
   986	  features: function () { admin('get_features'); },
   987	  tickers: function () { admin('get_tickers'); },
   988	  badges: function () { admin('get_badges_cp'); },
   989	  loginbeh: function () { admin('get_login_behavior'); },
   990	  zajel: function () { admin('zajel_cp_list'); },
   991	  emos: function () { admin('get_addons'); }
   992	};
   993	
   994	function switchTab(tab) {
   995	  document.querySelectorAll('#cp-sidebar .nav-item').forEach(function (i) { i.classList.toggle('active', i.getAttribute('data-tab') === tab); });
   996	  document.querySelectorAll('.cp-section').forEach(function (s) { s.classList.toggle('active', s.id === 'cp-' + tab); });
   997	  closeDrawer();
   998	  if (authed && LAZY[tab]) LAZY[tab]();
   999	}
  1000	
  1001	document.querySelectorAll('#cp-sidebar .nav-item').forEach(function (item) {
  1002	  item.addEventListener('click', function () { switchTab(item.getAttribute('data-tab')); });
  1003	});
  1004	
  1005	function closeDrawer() { $('cp-sidebar').classList.remove('open'); $('cp-backdrop').classList.remove('show'); }
  1006	$('cp-burger').addEventListener('click', function () {
  1007	  $('cp-sidebar').classList.toggle('open');
  1008	  $('cp-backdrop').classList.toggle('show', $('cp-sidebar').classList.contains('open'));
  1009	});
  1010	$('cp-backdrop').addEventListener('click', closeDrawer);
  1011	$('cp-modal-close').addEventListener('click', closeModal);
  1012	$('cp-modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
  1013	
  1014	/* ─── uploads ─── */
  1015	
  1016	function sendImageFile(file, kind, idx) {
  1017	  if (!file) return;
  1018	  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { toast('صيغة الصورة غير مدعومة', 'err'); return; }
  1019	  var reader = new FileReader();
  1020	  reader.onload = function (e) {
  1021	    var dataUrl = String(e.target.result);
  1022	    if (!/^data:image\//.test(dataUrl)) { toast('فشل قراءة الصورة', 'err'); return; }
  1023	    admin('upload_site_image', { kind: kind, dataUrl: dataUrl, idx: idx });
  1024	    toast('جاري رفع الصورة...');
  1025	  };
  1026	  reader.readAsDataURL(file);
  1027	}
  1028	
  1029	function bindImagePicker(inputId, kind) {
  1030	  var input = $(inputId);
  1031	  if (!input) return;
  1032	  input.addEventListener('change', function () {
  1033	    if (input.files && input.files[0]) sendImageFile(input.files[0], kind);
  1034	    input.value = '';
  1035	  });
  1036	}
  1037	
  1038	function onImageUploaded(d) {
  1039	  var kind = d.kind, url = d.url;
  1040	  if (!url) return;
  1041	  if (kind === 'badge') {
  1042	    var lv = d.idx;
  1043	    if (!state.badges.badges) state.badges.badges = {};
  1044	    state.badges.badges[lv] = url;
  1045	    admin('set_badges', state.badges);
  1046	    toast('تم رفع الوسام — جاري الحفظ', 'ok');
  1047	    return;
  1048	  }
  1049	  if (kind === 'emoji') {
  1050	    state.pendingEmojiUrl = url;
  1051	    var pv = $('em-preview');
  1052	    if (pv) pv.src = url;
  1053	    toast('تم رفع الصورة — اضغط إضافة ابتسامة', 'ok');
  1054	    return;
  1055	  }
  1056	  if (kind === 'addon_icon' || kind === 'addon_gift') {
  1057	    state.pendingAddonUrl = url;
  1058	    var ap = $('ad2-preview');
  1059	    if (ap) ap.src = url;
  1060	    toast('تم رفع الصورة — اضغط إضافة', 'ok');
  1061	    return;
  1062	  }
  1063	  // favicon / banner / pic already handled server-side via seo_saved
  1064	}
  1065	
  1066	bindImagePicker('img-favicon', 'favicon');
  1067	bindImagePicker('img-banner', 'banner');
  1068	bindImagePicker('img-pic', 'pic');
  1069	
  1070	var emFile = $('em-file');
  1071	if (emFile) emFile.addEventListener('change', function () {
  1072	  if (emFile.files && emFile.files[0]) sendImageFile(emFile.files[0], 'emoji');
  1073	  emFile.value = '';
  1074	});
  1075	var ad2File = $('ad2-file');
  1076	if (ad2File) ad2File.addEventListener('change', function () {
  1077	  if (ad2File.files && ad2File.files[0]) {
  1078	    var kind = ($('ad2-type') && $('ad2-type').value === 'gift') ? 'addon_gift' : 'addon_icon';
  1079	    sendImageFile(ad2File.files[0], kind);
  1080	  }
  1081	  ad2File.value = '';
  1082	});
  1083	
  1084	/* ─── actions ─── */
  1085	
  1086	var ACTIONS = {
  1087	  'refresh-health': function () { admin('get_system_health'); },
  1088	  'broadcast': function () {
  1089	    var msg = $('bc-msg').value.trim();
  1090	    if (msg) { admin('broadcast_msg', { msg: msg }); $('bc-msg').value = ''; }
  1091	  },
  1092	  'backup': function () { admin('backup'); },
  1093	  'restore': function () { if (confirm('استعادة آخر نسخة احتياطية؟')) admin('restore'); },
  1094	  'reload-site': function () { if (confirm('تحديث صفحات جميع المتصلين؟')) admin('reload_site'); },
  1095	  'refresh-live': function () { admin('get_online_users'); },
  1096	  'save-sett': function () {
  1097	    admin('save_state', {
  1098	      name: $('s-name').value, title: $('s-title').value,
  1099	      bg: $('s-bg').value, buttons: $('s-buttons').value, background: $('s-background').value,
  1100	      msgst: $('s-msgst').value,
  1101	      allowg: !!$('s-allowg').checked, allowreg: !!$('s-allowreg').checked,
  1102	      likeGates: {
  1103	        wall: $('s-like-wall').value, private: $('s-like-private').value,
  1104	        story: $('s-like-story').value, call: $('s-like-call').value, mic: $('s-like-mic').value
  1105	      }
  1106	    });
  1107	  },
  1108	  'save-features': function () {
  1109	    var patch = {};
  1110	    document.querySelectorAll('.ft-chk').forEach(function (cb) { patch[cb.getAttribute('data-key')] = cb.checked; });
  1111	    patch.likes_notifications = parseInt($('ft-likes_notifications').value, 10) || 0;
  1112	    patch.likes_effects = parseInt($('ft-likes_effects').value, 10) || 0;
  1113	    admin('set_features', patch);
  1114	  },
  1115	  'save-news-ticker': function () {
  1116	    admin('set_news_ticker', {
  1117	      enabled: !!$('nt-enabled').checked,
  1118	      text: $('nt-text').value.trim(),
  1119	      bgColor: $('nt-bgColor').value,
  1120	      textColor: $('nt-textColor').value
  1121	    });
  1122	  },
  1123	  'ad-add-row': function () {
  1124	    var box = $('cp-ads-list');
  1125	    if (!box) return;
  1126	    var empty = box.querySelector('.muted');
  1127	    if (empty) empty.remove();
  1128	    var wrap = document.createElement('div');
  1129	    wrap.innerHTML = adRowHtml({});
  1130	    box.appendChild(wrap.firstChild);
  1131	    bindAdRows();
  1132	  },
  1133	  'save-ads-ticker': function () {
  1134	    var ads = [];
  1135	    document.querySelectorAll('#cp-ads-list .ad-row').forEach(function (row) {
  1136	      var content = row.querySelector('.ad-content').value.trim();
  1137	      if (content) ads.push({ content: content, linkUrl: row.querySelector('.ad-link').value.trim() });
  1138	    });
  1139	    admin('set_ads_ticker', {
  1140	      settings: {
  1141	        enabled: !!$('ad-enabled').checked,
  1142	        speed: parseInt($('ad-speed').value, 10) || 30,
  1143	        bgColor: $('ad-bgColor').value,
  1144	        textColor: $('ad-textColor').value
  1145	      },
  1146	      ads: ads
  1147	    });
  1148	  },
  1149	  'zajel-add': function () {
  1150	    var v = $('zaj-add').value.trim();
  1151	    if (v) { admin('zajel_cp_add', { message: v }); $('zaj-add').value = ''; }
  1152	    else toast('أدخل نص الرسالة', 'err');
  1153	  },
  1154	  'zajel-clear-approved': function () {
  1155	    if (confirm('مسح جميع الرسائل المعتمدة؟')) admin('zajel_cp_clear', { list: 'approved' });
  1156	  },
  1157	  'zajel-clear-pending': function () {
  1158	    if (confirm('مسح جميع الرسائل المنتظرة؟')) admin('zajel_cp_clear', { list: 'pending' });
  1159	  },
  1160	  'save-badges': function () {
  1161	    state.badges.enabled = !!$('bd-enabled').checked;
  1162	    admin('set_badges', state.badges);
  1163	  },
  1164	  'save-loginbeh': function () {
  1165	    admin('set_login_behavior', {
  1166	      behavior: $('lb-behavior').value,
  1167	      openUsersTabOnLogin: !!$('lb-openusers').checked
  1168	    });
  1169	  },
  1170	  'emo-add': function () {
  1171	    var sc = $('em-shortcut').value.trim();
  1172	    if (!sc) { toast('أدخل الاختصار أولاً', 'err'); return; }
  1173	    if (!state.pendingEmojiUrl) { toast('ارفع صورة الابتسامة أولاً', 'err'); return; }
  1174	    admin('emo_item_add', { shortcut: sc, url: state.pendingEmojiUrl });
  1175	    state.pendingEmojiUrl = '';
  1176	    $('em-shortcut').value = '';
  1177	    var pv = $('em-preview'); if (pv) pv.removeAttribute('src');
  1178	  },
  1179	  'addon-add': function () {
  1180	    var type = $('ad2-type').value === 'gift' ? 'gift' : 'super_icon';
  1181	    var name = $('ad2-name').value.trim();
  1182	    if (!state.pendingAddonUrl) { toast('ارفع صورة العنصر أولاً', 'err'); return; }
  1183	    admin('addon_add', { type: type, name: name, url: state.pendingAddonUrl });
  1184	    state.pendingAddonUrl = '';
  1185	    $('ad2-name').value = '';
  1186	    var ap = $('ad2-preview'); if (ap) ap.removeAttribute('src');
  1187	  },
  1188	  'save-appearance': function () {
  1189	    admin('save_appearance', {
  1190	      mainUiColor: $('ap-mainUiColor').value, landingBgColor: $('ap-landingBgColor').value,
  1191	      chatInputBg: $('ap-chatInputBg').value, unifiedBtnBg: $('ap-unifiedBtnBg').value,
  1192	      unifiedBtnHoverBg: $('ap-unifiedBtnHoverBg').value, micIconColor: $('ap-micIconColor').value,
  1193	      micBtnBgColor: $('ap-micBtnBgColor').value, lineIconColor: $('ap-lineIconColor').value,
  1194	      tickerBgColor: $('ap-tickerBgColor').value, tickerTextColor: $('ap-tickerTextColor').value,
  1195	      fontFamily: $('ap-fontFamily').value,
  1196	      fontSize: parseInt($('ap-fontSize').value, 10), fontWeight: parseInt($('ap-fontWeight').value, 10),
  1197	      footerText: $('ap-footerText').value.trim()
  1198	    });
  1199	    admin('save_seo', { siteName: $('ap-siteName').value, siteTitle: $('ap-siteTitle').value, siteDescription: $('ap-siteDescription').value });
  1200	  },
  1201	  'save-seo': function () {
  1202	    admin('save_seo', {
  1203	      siteName: $('seo-siteName').value, siteTitle: $('seo-siteTitle').value,
  1204	      siteDescription: $('seo-siteDescription').value, siteKeywords: $('seo-siteKeywords').value,
  1205	      canonicalUrl: $('seo-canonicalUrl').value, robotsMeta: $('seo-robotsMeta').value,
  1206	      ogImage: $('seo-ogImage').value, twitterCard: $('seo-twitterCard').value,
  1207	      themeColor: $('seo-themeColor').value,
  1208	      enableSitemap: !!$('seo-enableSitemap').checked, enableRobotsTxt: !!$('seo-enableRobotsTxt').checked,
  1209	      noindex: !!$('seo-noindex').checked,
  1210	      googleSiteVerification: $('seo-googleSiteVerification').value.trim(),
  1211	      sameAs: $('seo-sameAs').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean)
  1212	    });
  1213	  },
  1214	  'upload-favicon': function () { $('img-favicon').click(); },
  1215	  'upload-banner': function () { $('img-banner').click(); },
  1216	  'upload-pic': function () { $('img-pic').click(); },
  1217	  'user-search': function () {
  1218	    state.userFilter = $('cp-user-search').value.trim();
  1219	    renderUsers();
  1220	    var exact = (state.users || []).find(function (u) { return String(u.topic || u.username || '').toLowerCase() === state.userFilter.toLowerCase(); });
  1221	    if (exact) admin('get_user_profile', { topic: exact.topic || exact.username });
  1222	  },
  1223	  'add-ban': function () {
  1224	    var val = $('cp-ban-input').value.trim();
  1225	    var reason = $('cp-ban-reason').value.trim() || 'مخالفة القوانين';
  1226	    if (val) {
  1227	      var isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(val);
  1228	      admin('save_band', { fp: isIp ? '' : val, ip: isIp ? val : '', reason: reason });
  1229	      $('cp-ban-input').value = '';
  1230	    }
  1231	  },
  1232	  'save-browser-bans': function () {
  1233	    var browsers = {};
  1234	    document.querySelectorAll('.bb').forEach(function (cb) { browsers[cb.getAttribute('data-key')] = cb.checked; });
  1235	    admin('save_browser_bans', { browser: browsers });
  1236	  },
  1237	  'save-os-bans': function () {
  1238	    var systems = {};
  1239	    document.querySelectorAll('.so').forEach(function (cb) { systems[cb.getAttribute('data-key')] = cb.checked; });
  1240	    admin('save_system_bans', { os: systems });
  1241	  },
  1242	  'add-room': function () {
  1243	    var n = $('cp-room-name').value.trim();
  1244	    if (n) { admin('add_room', { name: n }); $('cp-room-name').value = ''; }
  1245	  },
  1246	  'refresh-mod': function () { admin('get_posts_moderation'); admin('get_stories_moderation'); },
  1247	  'refresh-story-bans': function () { admin('get_story_bans'); },
  1248	  'fltr-block': function () {
  1249	    var v = $('cp-fltr-input').value.trim();
  1250	    if (v) { admin('fltr_add', { value: v, type: 'bmsgs' }); $('cp-fltr-input').value = ''; }
  1251	  },
  1252	  'fltr-allow': function () {
  1253	    var v = $('cp-fltr-input').value.trim();
  1254	    if (v) { admin('fltr_del', { value: v }); $('cp-fltr-input').value = ''; }
  1255	  },
  1256	  'msg-welcome': function () { addMessage('w'); },
  1257	  'msg-daily': function () { addMessage('d'); },
  1258	  'shrt-add': function () {
  1259	    var name = $('cp-shrt-name').value.trim(), value = $('cp-shrt-value').value.trim();
  1260	    if (name && value) { admin('shrt_add', { name: name, value: value }); $('cp-shrt-name').value = ''; $('cp-shrt-value').value = ''; }
  1261	  },
  1262	  'subs-add': function () {
  1263	    var user = $('cp-subs-user').value.trim(), power = $('cp-subs-power').value.trim(), days = $('cp-subs-days').value.trim();
  1264	    if (user && power) {
  1265	      admin('subs_add', { iduser: user, topic: user, topic1: user, sub: power, time: days ? days + ' يوم' : '', timeis: Date.now() });
  1266	      $('cp-subs-user').value = ''; $('cp-subs-power').value = ''; $('cp-subs-days').value = '';
  1267	    }
  1268	  },
  1269	  'delete-fps': function () { if (confirm('حذف سجل الدخول (البصمات) لجميع الأعضاء؟')) admin('delete_fps'); },
  1270	  'delete-actions': function () { if (confirm('حذف سجل الإجراءات؟')) admin('delete_actions'); },
  1271	  'refresh-audit': function () { admin('get_auditlog'); }
  1272	};
  1273	
  1274	function addMessage(category) {
  1275	  var title = $('cp-msg-title').value.trim(), body = $('cp-msg-body').value.trim();
  1276	  if (body) {
  1277	    admin('msg_add', { category: category, adresse: title, msg: body });
  1278	    $('cp-msg-title').value = ''; $('cp-msg-body').value = '';
  1279	  } else { toast('أدخل نص الرسالة', 'err'); }
  1280	}
  1281	
  1282	document.addEventListener('click', function (e) {
  1283	  var target = e.target.closest('[data-action]');
  1284	  if (!target) return;
  1285	  var fn = ACTIONS[target.getAttribute('data-action')];
  1286	  if (fn) { e.preventDefault(); fn(); }
  1287	});
  1288	
  1289	$('cp-fp-search').addEventListener('input', debounce(function () {
  1290	  if (!authed) return;
  1291	  admin('get_fps', { search: $('cp-fp-search').value.trim() });
  1292	}, 350));
  1293	
  1294	$('cp-user-search').addEventListener('keydown', function (e) { if (e.key === 'Enter') ACTIONS['user-search'](); });
  1295	
  1296	setStatus('جاري الاتصال...', '');