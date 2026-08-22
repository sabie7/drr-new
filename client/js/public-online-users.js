     1	(function () {
     2	  let pollingInterval = null;
     3	  let isFetching = false;
     4	  let isStopped = false;
     5	
     6	  function escapeHTML(str) {
     7	    if (!str) return '';
     8	    return String(str)
     9	      .replace(/&/g, '&amp;')
    10	      .replace(/</g, '&lt;')
    11	      .replace(/>/g, '&gt;')
    12	      .replace(/"/g, '&quot;')
    13	      .replace(/'/g, '&#039;');
    14	  }
    15	
    16	  function getAvatarUrl(user) {
    17	    if (window.getAvatarUrl && typeof window.getAvatarUrl === 'function') {
    18	      return window.getAvatarUrl(user);
    19	    }
    20	    var pic = user ? (user.pic !== undefined ? user.pic : (user.avatar !== undefined ? user.avatar : user.senderAvatar)) : null;
    21	    if (pic && typeof pic === 'string') {
    22	      var trimmed = pic.trim();
    23	      var lower = trimmed.toLowerCase();
    24	      var isInvalid = !trimmed ||
    25	        lower === 'null' ||
    26	        lower === 'undefined' ||
    27	        lower === 'none' ||
    28	        lower.includes('placehold.co') ||
    29	        lower.includes('flaticon.com') ||
    30	        lower === '/default-avatar.png' ||
    31	        lower === '/img/default-avatar.png' ||
    32	        lower === '/images/default-avatar.png' ||
    33	        lower === '/uploads/site/default.png';
    34	      if (!isInvalid) return trimmed;
    35	    }
    36	    var showDefault = window.showDefaultAvatar;
    37	    if (showDefault === undefined && window.domainConfig) {
    38	      showDefault = window.domainConfig.showDefaultAvatar;
    39	    }
    40	    if (showDefault !== false && showDefault !== 'false') {
    41	      var customDefault = window.defaultAvatarUrl;
    42	      if (!customDefault && window.domainConfig && window.domainConfig.defaultAvatarUrl) {
    43	        customDefault = window.domainConfig.defaultAvatarUrl;
    44	      }
    45	      if (customDefault && typeof customDefault === 'string' && customDefault.trim() !== '') {
    46	        var trimmedDefault = customDefault.trim();
    47	        var lowerDefault = trimmedDefault.toLowerCase();
    48	        if (lowerDefault !== 'null' && lowerDefault !== 'undefined' && lowerDefault !== 'none') {
    49	          return trimmedDefault;
    50	        }
    51	      }
    52	    }
    53	    return '/uploads/site/default.png';
    54	  }
    55	
    56	  function renderUserIdentity(u, opts) {
    57	    if (window.renderUserIdentity && typeof window.renderUserIdentity === 'function') {
    58	      return window.renderUserIdentity(u, opts);
    59	    }
    60	    var displayName = escapeHTML(u.topic || u.username);
    61	    var color = u.ucol || '#000000';
    62	    return '<span class="user-addon-container font-weight-bold"><span class="user-name" style="color: ' + color + '; font-family: var(--font-family);">' + displayName + '</span></span>';
    63	  }
    64	
    65	  function renderAvatar(u, sizeClass, extraStyles) {
    66	    if (window.renderAvatar && typeof window.renderAvatar === 'function') {
    67	      return window.renderAvatar(u, sizeClass, extraStyles);
    68	    }
    69	    var avatarUrl = getAvatarUrl(u);
    70	    return '<img src="' + avatarUrl + '" class="rounded-circle" style="width: 50px; height: 50px; object-fit: cover;" onerror="window.handleAvatarError && window.handleAvatarError(this)">';
    71	  }
    72	
    73	  function syncDOMList(container, newItems) {
    74	    if (!container) return;
    75	    var existingMap = new Map();
    76	    Array.from(container.children).forEach(function (child) {
    77	      if (child.id) existingMap.set(child.id, child);
    78	    });
    79	
    80	    var newIds = new Set(newItems.map(function (item) { return item.id; }));
    81	    existingMap.forEach(function (node, id) {
    82	      if (!newIds.has(id)) node.remove();
    83	    });
    84	
    85	    function createNodeFromHTML(html) {
    86	      var template = document.createElement('template');
    87	      template.innerHTML = String(html).trim();
    88	      return template.content.firstElementChild;
    89	    }
    90	
    91	    newItems.forEach(function (item, index) {
    92	      var currentNode = existingMap.get(item.id);
    93	      
    94	      if (!currentNode) {
    95	        var newNode = createNodeFromHTML(item.html);
    96	        if (newNode) {
    97	          newNode.dataset.signature = item.html;
    98	          currentNode = newNode;
    99	        }
   100	      } else {
   101	        if (currentNode.dataset.signature !== item.html) {
   102	          var newNode = createNodeFromHTML(item.html);
   103	          if (newNode) {
   104	            if (typeof window.syncNodes === 'function') {
   105	              window.syncNodes(currentNode, newNode);
   106	            } else {
   107	              currentNode.replaceWith(newNode);
   108	              currentNode = newNode;
   109	            }
   110	            currentNode.dataset.signature = item.html;
   111	          }
   112	        }
   113	      }
   114	
   115	      if (!currentNode) return;
   116	
   117	      var nodeAtIndex = container.children[index];
   118	      if (nodeAtIndex !== currentNode) {
   119	        container.insertBefore(currentNode, nodeAtIndex || null);
   120	      }
   121	    });
   122	  }
   123	
   124	  window.renderPublicOnlineUsers = function (users) {
   125	    var listContainer = document.getElementById('landing-users-list');
   126	    var countContainer = document.getElementById('landing-users-count');
   127	
   128	    if (!listContainer) return;
   129	
   130	    if (!Array.isArray(users)) {
   131	      users = [];
   132	    }
   133	
   134	    if (countContainer) {
   135	      countContainer.innerHTML = '<i class="fas fa-user-friends"></i> ' + users.length;
   136	    }
   137	
   138	    if (users.length === 0) {
   139	      listContainer.innerHTML = '<div class="text-center text-muted p-4 small" id="empty-public-users-msg">لا يوجد متواجدون حالياً</div>';
   140	      return;
   141	    }
   142	
   143	    var landingItems = users.map(function (u) {
   144	      var selectedCountry = (u.profileCountry || u.country || '')
   145	        .toString()
   146	        .trim()
   147	        .toLowerCase();
   148	
   149	      var countryCode = selectedCountry && selectedCountry !== 'unknown'
   150	        ? selectedCountry
   151	        : null;
   152	
   153	      var statusColor = '#28a745';
   154	      if (u.isVirtualUser && u.onlineStatusStr) {
   155	        if (u.onlineStatusStr === 'أخضر') statusColor = '#28a745';
   156	        else if (u.onlineStatusStr === 'أحمر') statusColor = '#dc3545';
   157	        else if (u.onlineStatusStr === 'أصفر') statusColor = '#ffc107';
   158	        else if (u.onlineStatusStr === 'أزرق') statusColor = '#007bff';
   159	        else statusColor = '#6c757d';
   160	      } else if (u.isGhost) {
   161	        statusColor = '#6c757d';
   162	      } else if (u.isIdle || u.presenceState === 'idle') {
   163	        statusColor = '#ffc107';
   164	      }
   165	
   166	      var appearance = window.siteAppearance || window.domainConfig;
   167	      var rawLandingStatusVal = appearance ? appearance.showStatusOnLanding : undefined;
   168	      var showStatusColorOnLanding =
   169	        rawLandingStatusVal === true ||
   170	        rawLandingStatusVal === 'true' ||
   171	        rawLandingStatusVal === 1 ||
   172	        rawLandingStatusVal === '1';
   173	
   174	      var hasDesign = !!(u.membershipFrame || u.membershipBg);
   175	      var showAvatar = u.showMembershipAvatar !== false;
   176	      var showName = u.showMembershipName !== false;
   177	      var showStatusText = u.showMembershipStatus !== false;
   178	
   179	      var isActuallyOnline = u.isOnline && !u.isGhost;
   180	      var isYellow = statusColor === '#ffc107';
   181	      var borderColor = (isActuallyOnline && u.allowPrivate === false && !isYellow) ? '#dc3545' : statusColor;
   182	
   183	      var landingStatusBorderDesign = showStatusColorOnLanding
   184	        ? 'border-left: 5px solid ' + borderColor + ' !important;'
   185	        : '';
   186	
   187	      var landingStatusBorderDefault = showStatusColorOnLanding
   188	        ? 'border-left: 4px solid ' + borderColor + ' !important;'
   189	        : '';
   190	
   191	      var ghostStyle = (showStatusColorOnLanding && u.isGhost)
   192	        ? 'border-left: 4px solid #808080 !important;'
   193	        : '';
   194	
   195	      var html = '';
   196	
   197	      if (hasDesign) {
   198	        var avatarHtml = renderAvatar(u, '', 'width: 72px; height: 72px;');
   199	        var bgStyle = u.membershipBg ? "background: url('" + u.membershipBg + "'); background-size: cover; background-position: center;" : 'background: #fff;';
   200	        var textColor = u.membershipBg ? '#fff' : (u.ucol || '#000');
   201	        var textShadow = '';
   202	
   203	        html = '\
   204	        <div id="landing-user-' + u.username + '" class="list-group-item d-flex align-items-center border-0 border-bottom p-0 user-pro-item ' + (u.isGhost ? 'ghost-user' : '') + '" data-user-id="' + (u.userId ?? u.id) + '" style="' + landingStatusBorderDesign + ' min-height: 90px; ' + bgStyle + ' ' + textShadow + ' ' + ghostStyle + ' overflow: hidden; position: relative;">\
   205	          ' + (showAvatar ? '\
   206	          <div style="margin: 5px 10px; flex-shrink: 0; z-index: 1;">\
   207	            ' + avatarHtml + '\
   208	          </div>\
   209	          ' : '') + '\
   210	          <div class="flex-grow-1 ps-1 py-1 d-flex flex-column" style="min-width: 0; z-index: 1; padding-right: 4px !important; flex: 1;">\
   211	            ' + (showName ? '\
   212	            <div class="fw-bold d-flex align-items-center flex-wrap" style="font-size: 17px; font-family: var(--font-family); line-height: 1.2; padding-right: 45px; width: 100%;">\
   213	              ' + renderUserIdentity(u, {
   214	                containerClasses: 'user-addon-container font-weight-bold',
   215	                nameStyle: 'color: ' + (u.ucol || textColor) + ';'
   216	              }) + '\
   217	            </div>\
   218	            ' + ((window.memberStateBadgeHtml && typeof window.memberStateBadgeHtml === 'function') ? window.memberStateBadgeHtml(u) : '') + '\
   219	            ' : '') + '\
   220	            ' + (showStatusText ? '\
   221	            <div class="user-sidebar-status fw-bold" style="color: ' + ((window.featuresSettings && window.featuresSettings.statusColorEnabled === true && u.mcol) ? u.mcol : '#888') + '; width: 100%; display: block;">\
   222	              ' + (u.msg || (u.type === 'guest' ? 'زائر' : 'عضو')) + '\
   223	            </div>\
   224	            ' : '') + '\
   225	          </div>\
   226	          <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">\
   227	            ' + ((u.showMembershipFlag !== false && countryCode) ? '<img src="/flags/' + countryCode + '.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; object-fit: cover;">' : '') + '\
   228	            ' + ((u.userId && u.showMembershipId !== false && !isNaN(Number(u.userId))) ? '<span style="font-size: 11px; font-weight: 700; color: ' + (u.membershipBg ? '#fff' : '#6c757d') + '; letter-spacing: 0.5px;">#' + Math.abs(Number(u.userId)) + '</span>' : '') + '\
   229	          </div>\
   230	        </div>\
   231	      ';
   232	      } else {
   233	        var rawId = u.userId ?? u.id;
   234	        var displayId = (rawId && !isNaN(Number(rawId))) ? '#' + Math.abs(Number(rawId)) : '';
   235	        html = '\
   236	        <div id="landing-user-' + u.username + '" class="list-group-item d-flex align-items-start border-0 border-bottom p-0" data-user-id="' + (u.userId ?? u.id) + '" style="' + landingStatusBorderDefault + ' min-height: 52px; background-color: #fff; ' + ghostStyle + '; cursor: default; position: relative;">\
   237	          <div>\
   238	            <img src="' + getAvatarUrl(u) + '" style="width: 50px; height: 50px; object-fit: cover;" referrerPolicy="origin-when-cross-origin" onerror="window.handleAvatarError && window.handleAvatarError(this)">\
   239	          </div>\
   240	          <div class="flex-grow-1 ps-1 py-1 d-flex flex-column" style="min-width: 0; z-index: 1; padding-right: 4px !important; flex: 1;">\
   241	            <div class="fw-bold d-flex align-items-center flex-wrap" style="font-size: 17px; font-family: var(--font-family); line-height: 1.2; padding-right: 45px; width: 100%;">\
   242	              ' + renderUserIdentity(u, {
   243	                containerClasses: 'user-addon-container font-weight-bold',
   244	                nameStyle: 'color: ' + (u.ucol || '#000000') + '; font-family: var(--font-family);'
   245	              }) + '\
   246	            </div>\
   247	            ' + ((window.memberStateBadgeHtml && typeof window.memberStateBadgeHtml === 'function') ? window.memberStateBadgeHtml(u) : '') + '\
   248	            ' + (showStatusText ? '\
   249	            <div class="user-sidebar-status fw-bold" style="color: ' + ((window.featuresSettings && window.featuresSettings.statusColorEnabled === true && u.mcol) ? u.mcol : '#888') + '; width: 100%; display: block;">\
   250	              ' + (u.msg || (u.isOnline ? 'متصل الآن' : 'غير متصل')) + '\
   251	            </div>\
   252	            ' : '') + '\
   253	          </div>\
   254	          <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">\
   255	            ' + (countryCode ? '<img src="/flags/' + countryCode + '.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; object-fit: cover;">' : '') + '\
   256	            ' + (displayId ? '<span style="font-size: 10px; font-weight: 700; color: #6c757d; letter-spacing: 0.5px;">' + displayId + '</span>' : '') + '\
   257	          </div>\
   258	        </div>\
   259	      ';
   260	      }
   261	
   262	      return { id: 'landing-user-' + u.username, html: html };
   263	    });
   264	
   265	    syncDOMList(listContainer, landingItems);
   266	  };
   267	
   268	  window.loadPublicOnlineUsers = function (force) {
   269	    if (isStopped && !force) return;
   270	    isStopped = false;
   271	
   272	    var token = sessionStorage.getItem('token');
   273	    if (token || (window.state && window.state.currentUser)) {
   274	      window.stopPublicOnlineUsersPolling();
   275	      return;
   276	    }
   277	
   278	    if (isFetching) return;
   279	    isFetching = true;
   280	
   281	    fetch('/api/public/online-users', {
   282	      headers: {
   283	        'Cache-Control': 'no-cache'
   284	      }
   285	    })
   286	      .then(function (res) {
   287	        if (!res.ok) throw new Error('Network response error');
   288	        return res.json();
   289	      })
   290	      .then(function (users) {
   291	        isFetching = false;
   292	        if (isStopped) return;
   293	        window.renderPublicOnlineUsers(users);
   294	      })
   295	      .catch(function (err) {
   296	        console.warn('[PublicOnlineUsers] Fetch error:', err);
   297	        isFetching = false;
   298	      });
   299	  };
   300	
   301	  window.startPublicOnlineUsersPolling = function () {
   302	    isStopped = false;
   303	    var token = sessionStorage.getItem('token');
   304	    if (token || (window.state && window.state.currentUser)) {
   305	      return;
   306	    }
   307	
   308	    if (pollingInterval) {
   309	      clearInterval(pollingInterval);
   310	      pollingInterval = null;
   311	    }
   312	
   313	    window.loadPublicOnlineUsers(true);
   314	
   315	    pollingInterval = setInterval(function () {
   316	      var token = sessionStorage.getItem('token');
   317	      if (token || (window.state && window.state.currentUser)) {
   318	        window.stopPublicOnlineUsersPolling();
   319	        return;
   320	      }
   321	      window.loadPublicOnlineUsers();
   322	    }, 12000);
   323	  };
   324	
   325	  window.stopPublicOnlineUsersPolling = function () {
   326	    isStopped = true;
   327	    if (pollingInterval) {
   328	      clearInterval(pollingInterval);
   329	      pollingInterval = null;
   330	    }
   331	  };
   332	
   333	  document.addEventListener('visibilitychange', function () {
   334	    if (document.visibilityState === 'visible') {
   335	      var token = sessionStorage.getItem('token');
   336	      if (!token && (!window.state || !window.state.currentUser)) {
   337	        window.loadPublicOnlineUsers();
   338	      }
   339	    }
   340	  });
   341	
   342	  if (document.readyState === 'loading') {
   343	    document.addEventListener('DOMContentLoaded', function () {
   344	      window.startPublicOnlineUsersPolling();
   345	    });
   346	  } else {
   347	    window.startPublicOnlineUsersPolling();
   348	  }
   349	})();
   350	
   351	