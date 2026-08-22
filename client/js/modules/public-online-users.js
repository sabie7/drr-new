     1	/* ══════════════════════════════════════════════════════════════
     2	   PUBLIC ONLINE USERS — restored from deobfuscated_source/
     3	   public-online-users.js.deobfuscated.js (legacy feature).
     4	   Polls the (formerly missing) public REST endpoint so the landing
     5	   page shows who is online BEFORE the visitor logs in.
     6	   ══════════════════════════════════════════════════════════════ */
     7	const POLL_MS = 12000;
     8	
     9	let pollTimer = null;
    10	let isFetching = false;
    11	let isStopped = false;
    12	
    13	function currentUserSession() {
    14	  return sessionStorage.getItem('token') || (window.state && window.state.currentUser);
    15	}
    16	
    17	function render(users) {
    18	  var listEl = document.getElementById('landing-users-list');
    19	  var countEl = document.getElementById('landing-users-count');
    20	  if (!listEl) return;
    21	  if (!Array.isArray(users)) users = [];
    22	  if (countEl) countEl.innerHTML = '<i class="fas fa-user-friends"></i> ' + users.length;
    23	  if (users.length === 0) {
    24	    listEl.innerHTML = '<div class="text-center text-muted p-4 small" id="empty-public-users-msg">لا يوجد متواجدون حالياً</div>';
    25	    return;
    26	  }
    27	  listEl.innerHTML = '';
    28	  users.forEach(function (user) {
    29	    var pic = user.pic && user.pic !== 'pic.png' ? user.pic : (window.defaultAvatarUrl || (window.domainConfig && window.domainConfig.defaultAvatarUrl)) || '/uploads/site/default.png';
    30	    var div = document.createElement('div');
    31	    div.className = 'list-group-item list-group-item-action py-1 px-2 d-flex align-items-center gap-2 ' + (user.isGhost ? 'ghost-user' : '');
    32	    div.setAttribute('data-username', user.topic || user.username || '');
    33	    div.setAttribute('data-user-id', user.id || '');
    34	    var avatar = document.createElement('img');
    35	    avatar.src = pic;
    36	    avatar.style.cssText = 'width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0;';
    37	    avatar.setAttribute('referrerPolicy', 'origin-when-cross-origin');
    38	    var wrap = document.createElement('span');
    39	    wrap.style.cssText = 'display:flex;flex-direction:column;line-height:1.2;';
    40	    var name = document.createElement('span');
    41	    name.className = 'fw-bold small';
    42	    name.style.color = user.ucol || '#000000';
    43	    name.textContent = user.topic || user.username || 'مستخدم';
    44	    wrap.appendChild(name);
    45	    var status = document.createElement('small');
    46	    status.className = 'text-muted';
    47	    status.textContent = user.msg || (user.isGhost ? 'مختفي' : 'متصل الآن');
    48	    wrap.appendChild(status);
    49	    div.appendChild(avatar);
    50	    div.appendChild(wrap);
    51	    div.addEventListener('click', function () {
    52	      if (window.showProfile) window.showProfile(user.topic || user.username);
    53	    });
    54	    listEl.appendChild(div);
    55	  });
    56	}
    57	
    58	export function loadPublicOnlineUsers() {
    59	  if (isStopped) return;
    60	  if (currentUserSession()) { stopPublicOnlineUsersPolling(); return; }
    61	  if (isFetching) return;
    62	  isFetching = true;
    63	  fetch('/api/public/online-users', { headers: { 'Cache-Control': 'no-cache' } })
    64	    .then(function (res) { if (!res.ok) throw new Error('Network response error'); return res.json(); })
    65	    .then(function (data) {
    66	      isFetching = false;
    67	      if (isStopped) return;
    68	      render(data);
    69	    })
    70	    .catch(function (err) {
    71	      console.warn('[PublicOnlineUsers] Fetch error:', err);
    72	      isFetching = false;
    73	    });
    74	}
    75	
    76	export function startPublicOnlineUsersPolling() {
    77	  isStopped = false;
    78	  isFetching = false;
    79	  if (currentUserSession()) return;
    80	  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    81	  loadPublicOnlineUsers();
    82	  pollTimer = setInterval(function () {
    83	    if (currentUserSession()) { stopPublicOnlineUsersPolling(); return; }
    84	    loadPublicOnlineUsers();
    85	  }, POLL_MS);
    86	}
    87	
    88	export function stopPublicOnlineUsersPolling() {
    89	  isStopped = true;
    90	  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    91	}
    92	
    93	export function initPublicOnlineUsers() {
    94	  document.addEventListener('DOMContentLoaded', function () { startPublicOnlineUsersPolling(); });
    95	  if (document.readyState !== 'loading') startPublicOnlineUsersPolling();
    96	  document.addEventListener('visibilitychange', function () {
    97	    if (document.visibilityState === 'visible' && !currentUserSession()) loadPublicOnlineUsers();
    98	  });
    99	}