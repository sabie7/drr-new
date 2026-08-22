     1	const fetch = window.apiFetch || window.fetch;
     2	
     3	let privateMessageQueue = [];
     4	let privateMessageRAF = null;
     5	
     6	export const PrivateChatManager = {
     7	  conversations: new Map(),
     8	  activeChatUser: null,
     9	  socket: null,
    10	  isWindowOpen: false,
    11	
    12	  init() {
    13	    this.socket = window.socket;
    14	    if (!this.socket) return;
    15	
    16	    this.setupSocketListeners();
    17	    this.renderChatWindowContainer();
    18	    this.updateSidebarBadge();
    19	    
    20	    // Make window draggable
    21	    this.makeDraggable();
    22	
    23	    // Load persistent archived conversations
    24	    this.loadArchivedConversations();
    25	  },
    26	
    27	  getConvKey(user) {
    28	    if (!user) return '';
    29	    if (typeof window.getPresenceKey === 'function') {
    30	      return window.getPresenceKey(user);
    31	    }
    32	    if (user.key) return user.key;
    33	    const isGuest = user.type === 'guest' || user.isGuest || user.guestId || (typeof user.id === 'number' && user.id < 0) || (user.id && String(user.id).startsWith('g_'));
    34	    if (isGuest) {
    35	      const guestId = user.guestId ?? user.userId ?? user.id ?? user.username;
    36	      return `guest:${guestId}`;
    37	    }
    38	    const memberId = user.userId ?? user.id;
    39	    if (memberId && memberId !== 'unknown' && memberId !== undefined) {
    40	      return `reg:${memberId}`;
    41	    }
    42	    return user.username ? `reg:${user.username}` : 'unknown:0';
    43	  },
    44	
    45	  findConversation(userOrKeyOrUsername) {
    46	    if (!userOrKeyOrUsername) return null;
    47	    if (typeof userOrKeyOrUsername === 'object') {
    48	      const key = this.getConvKey(userOrKeyOrUsername);
    49	      for (const [k, conv] of this.conversations.entries()) {
    50	        if (this.getConvKey(conv.user) === key) return conv;
    51	        if (userOrKeyOrUsername.id && (conv.user.id === userOrKeyOrUsername.id || conv.user.userId === userOrKeyOrUsername.id)) return conv;
    52	        if (userOrKeyOrUsername.userId && (conv.user.id === userOrKeyOrUsername.userId || conv.user.userId === userOrKeyOrUsername.userId)) return conv;
    53	        if (userOrKeyOrUsername.username && conv.user.username && conv.user.username.toLowerCase() === userOrKeyOrUsername.username.toLowerCase()) return conv;
    54	      }
    55	      if (userOrKeyOrUsername.username && this.conversations.has(userOrKeyOrUsername.username)) {
    56	        return this.conversations.get(userOrKeyOrUsername.username);
    57	      }
    58	    } else {
    59	      const targetStr = String(userOrKeyOrUsername).toLowerCase();
    60	      for (const [k, conv] of this.conversations.entries()) {
    61	        const cKey = this.getConvKey(conv.user);
    62	        const uId = String(conv.user.userId || conv.user.id || '').toLowerCase();
    63	        const uName = String(conv.user.username || '').toLowerCase();
    64	        if (k === userOrKeyOrUsername || cKey === userOrKeyOrUsername || uName === targetStr || uId === targetStr || targetStr === `reg:${uId}` || targetStr === `member:${uId}` || targetStr === `guest:${uId}`) {
    65	          return conv;
    66	        }
    67	      }
    68	      if (this.conversations.has(userOrKeyOrUsername)) {
    69	        return this.conversations.get(userOrKeyOrUsername);
    70	      }
    71	    }
    72	    return null;
    73	  },
    74	
    75	  applyPresenceSnapshot(users) {
    76	    if (!Array.isArray(users)) return;
    77	    
    78	    const onlineKeysSet = new Set();
    79	    const onlineUserIdsSet = new Set();
    80	    const onlineUsernamesSet = new Set();
    81	
    82	    users.forEach(u => {
    83	      const k = this.getConvKey(u);
    84	      if (k) onlineKeysSet.add(k);
    85	      if (u.id) onlineUserIdsSet.add(String(u.id));
    86	      if (u.userId) onlineUserIdsSet.add(String(u.userId));
    87	      if (u.username) onlineUsernamesSet.add(String(u.username).toLowerCase());
    88	
    89	      const conv = this.findConversation(u);
    90	      if (conv) {
    91	        conv.user = { ...conv.user, ...u, isOnline: true };
    92	      }
    93	    });
    94	
    95	    this.conversations.forEach(conv => {
    96	      const cKey = this.getConvKey(conv.user);
    97	      const uId = String(conv.user.userId || conv.user.id || '');
    98	      const uName = String(conv.user.username || '').toLowerCase();
    99	
   100	      const isOnlineInSnapshot = (cKey && onlineKeysSet.has(cKey)) ||
   101	                                 (uId && onlineUserIdsSet.has(uId)) ||
   102	                                 (uName && onlineUsernamesSet.has(uName));
   103	
   104	      if (!isOnlineInSnapshot && !conv.user.isVirtualUser) {
   105	        conv.user.isOnline = false;
   106	        conv.user.isGhost = false;
   107	        conv.user.isIdle = false;
   108	        conv.user.presenceState = 'offline';
   109	      }
   110	    });
   111	
   112	    this.renderSidebar();
   113	  },
   114	
   115	  applyPresencePatch(upserts, removes) {
   116	    let updated = false;
   117	    if (Array.isArray(upserts) && upserts.length > 0) {
   118	      upserts.forEach(u => {
   119	        const conv = this.findConversation(u);
   120	        if (conv) {
   121	          conv.user = { ...conv.user, ...u, isOnline: true };
   122	          updated = true;
   123	          this.updateSidebarItem(conv);
   124	        }
   125	      });
   126	    }
   127	    if (Array.isArray(removes) && removes.length > 0) {
   128	      removes.forEach(key => {
   129	        const keyStr = String(key).toLowerCase();
   130	        for (const [username, conv] of this.conversations.entries()) {
   131	          const cKey = this.getConvKey(conv.user);
   132	          const uId = String(conv.user.userId || conv.user.id || '').toLowerCase();
   133	          const uName = String(conv.user.username || '').toLowerCase();
   134	
   135	          if (cKey === key || uName === keyStr || uId === keyStr || keyStr === `reg:${uId}` || keyStr === `member:${uId}` || keyStr === `guest:${uId}`) {
   136	            conv.user.isOnline = false;
   137	            conv.user.isGhost = false;
   138	            conv.user.isIdle = false;
   139	            conv.user.presenceState = 'offline';
   140	            updated = true;
   141	            this.updateSidebarItem(conv);
   142	          }
   143	        }
   144	      });
   145	    }
   146	  },
   147	
   148	  updateSidebarItem(conv) {
   149	    const container = document.getElementById('sidebar-private-container');
   150	    if (!container) {
   151	      this.renderSidebar();
   152	      return;
   153	    }
   154	    const username = conv.user.username;
   155	    const userId = conv.user.userId || conv.user.id;
   156	    let itemEl = container.querySelector(`[data-username="${username}"]`) || container.querySelector(`[data-user-id="${userId}"]`);
   157	    if (itemEl) {
   158	      const statusSpan = itemEl.querySelector('.rounded-circle');
   159	      if (statusSpan) {
   160	        statusSpan.style.backgroundColor = this.getUserStatusHex(conv.user);
   161	      }
   162	    } else {
   163	      this.renderSidebar();
   164	    }
   165	  },
   166	
   167	  getUserStatusHex(u) {
   168	    if (!u) return '#6c757d';
   169	    let color = '#6c757d'; // Offline (gray)
   170	    if (u.isOnline) {
   171	      if (u.isVirtualUser && u.onlineStatusStr) {
   172	        if (u.onlineStatusStr === 'أخضر') color = '#28a745';
   173	        else if (u.onlineStatusStr === 'أحمر') color = '#dc3545';
   174	        else if (u.onlineStatusStr === 'أصفر') color = '#ffc107';
   175	        else if (u.onlineStatusStr === 'أزرق') color = '#007bff';
   176	        else color = '#6c757d';
   177	      } else if (u.isGhost) {
   178	        color = '#6c757d';
   179	      } else if (u.isHidden) {
   180	        color = '#007bff';
   181	      } else if (u.isReconnecting) {
   182	        color = '#ffc107';
   183	      } else {
   184	        color = (u.isIdle || u.presenceState === 'idle') ? '#ffc107' : '#28a745';
   185	      }
   186	    }
   187	    const isActuallyOnline = u.isOnline && !u.isGhost;
   188	    const isYellow = color === '#ffc107';
   189	    if (isActuallyOnline && u.allowPrivate === false && !isYellow) {
   190	      color = '#dc3545';
   191	    }
   192	    return color;
   193	  },
   194	
   195	  async loadArchivedConversations() {
   196	    const token = sessionStorage.getItem('token');
   197	    if (!token) return;
   198	
   199	    try {
   200	      const sessionParam = window.getClientSessionId ? `?clientSessionId=${encodeURIComponent(window.getClientSessionId())}` : '';
   201	      const res = await fetch(`/api/private/conversations${sessionParam}`, {
   202	        headers: {
   203	          'Authorization': `Bearer ${token}`
   204	        }
   205	      });
   206	      if (!res.ok) throw new Error('Failed to fetch archived conversations');
   207	      const data = await res.json();
   208	      
   209	      if (Array.isArray(data)) {
   210	        data.forEach(conv => {
   211	          const user = conv.user;
   212	          const username = user.username;
   213	          let existing = this.findConversation(user);
   214	          if (!existing) {
   215	            this.conversations.set(username, {
   216	              ...conv,
   217	              user,
   218	              lastMessageTime: new Date(conv.lastMessageTime)
   219	            });
   220	          } else {
   221	            existing.user = { ...existing.user, ...user };
   222	            const existingIds = new Set(existing.messages.map(m => String(m.id)));
   223	            conv.messages.forEach(m => {
   224	              if (!existingIds.has(String(m.id))) {
   225	                existing.messages.push(m);
   226	              }
   227	            });
   228	            existing.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
   229	            existing.lastMessageTime = new Date(conv.lastMessageTime);
   230	          }
   231	        });
   232	
   233	        this.updateSidebarBadge();
   234	        this.renderSidebar();
   235	      }
   236	    } catch (err) {
   237	      console.error('[PrivateChatManager] Error loading archived conversations:', err);
   238	    }
   239	  },
   240	
   241	  typingTimeout: null,
   242	
   243	  resetForFreshSession() {
   244	    this.conversations.clear();
   245	    this.activeChatUser = null;
   246	    this.isWindowOpen = false;
   247	    const inner = document.getElementById('private-chat-messages-inner');
   248	    if (inner) inner.innerHTML = '';
   249	    if (typeof this.renderSidebar === 'function') this.renderSidebar();
   250	    if (typeof this.updateSidebarBadge === 'function') this.updateSidebarBadge();
   251	    if (typeof this.closeChat === 'function') { try { this.closeChat(); } catch (e) {} }
   252	  },
   253	
   254	  setupSocketListeners() {
   255	    this.socket.on('connect', () => {
   256	      this.loadArchivedConversations();
   257	    });
   258	
   259	    this.socket.on('private_message', (data) => {
   260	      this.handleIncomingMessage(data);
   261	    });
   262	
   263	    this.socket.on('offline-private-messages', (payload, callback) => {
   264	      if (Array.isArray(payload)) {
   265	        let addedAny = false;
   266	        payload.forEach(data => {
   267	          const added = this.handleIncomingMessage(data);
   268	          if (added) addedAny = true;
   269	        });
   270	        if (addedAny && typeof this.playPingSound === 'function') {
   271	          this.playPingSound();
   272	        }
   273	      }
   274	      if (typeof callback === 'function') {
   275	        callback(true);
   276	      }
   277	    });
   278	
   279	    this.socket.on('private_message_sent', (data) => {
   280	      this.handleSentMessage(data);
   281	    });
   282	
   283	    this.socket.on('private-conversation-deleted', (data) => {
   284	      const peerName = data && (data.fromUsername || data.peerUsername);
   285	      if (!peerName) return;
   286	      const existing = this.conversations.get(peerName) ||
   287	        Array.from(this.conversations.keys()).find(k => String(k).toLowerCase() === String(peerName).toLowerCase());
   288	      if (existing) this.conversations.delete(existing);
   289	      if (this.activeChatUser && String(this.activeChatUser.username).toLowerCase() === String(peerName).toLowerCase()) {
   290	        this.closeChat();
   291	      }
   292	      this.renderSidebar();
   293	      this.updateSidebarBadge();
   294	      if (typeof this.showToast === 'function') {
   295	        this.showToast(`تم حذف المحادثة الخاصة مع ${peerName}`, 'info');
   296	      }
   297	    });
   298	
   299	    this.socket.on('private_message_read', (data) => {
   300	      this.handleMessageRead(data);
   301	    });
   302	
   303	    this.socket.on('private_message_deleted', (data) => {
   304	      this.handleMessageDeleted(data);
   305	    });
   306	
   307	    this.socket.on('private_message_edited', (data) => {
   308	      this.handleMessageEdited(data);
   309	    });
   310	
   311	    this.socket.on('private_typing', (data) => {
   312	      this.handleIncomingTyping(data);
   313	    });
   314	
   315	    this.socket.on('private_ping_received', (data) => {
   316	      this.handlePingReceived(data);
   317	    });
   318	  },
   319	
   320	  handlePingReceived(data) {
   321	    const { fromUser } = data;
   322	    
   323	    // Don't ping yourself
   324	    if (fromUser.username === window.state?.currentUser?.username) return;
   325	
   326	    // Play sound
   327	    this.playPingSound();
   328	
   329	    // Open chat if not open
   330	    this.openChat(fromUser);
   331	
   332	    // Shake window
   333	    const chatWindow = document.getElementById('private-chat-window');
   334	    if (chatWindow) {
   335	      chatWindow.classList.remove('chat-nudge');
   336	      void chatWindow.offsetWidth; // trigger reflow
   337	      chatWindow.classList.add('chat-nudge');
   338	      setTimeout(() => chatWindow.classList.remove('chat-nudge'), 500);
   339	    }
   340	
   341	    // Add system message
   342	    const conv = this.conversations.get(fromUser.username);
   343	    if (conv) {
   344	      const pingMsg = {
   345	        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
   346	        text: 'قام بإرسال تنبيه (Ping) لك!',
   347	        type: 'system',
   348	        timestamp: new Date().toISOString(),
   349	        isMine: false
   350	      };
   351	      conv.messages.push(pingMsg);
   352	      if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === fromUser.username) {
   353	        this.appendMessage(pingMsg, conv);
   354	      }
   355	    }
   356	  },
   357	
   358	  playPingSound() {
   359	    try {
   360	      const ctx = new (window.AudioContext || window.webkitAudioContext)();
   361	      const playTone = (freq, startTime, duration) => {
   362	        const osc = ctx.createOscillator();
   363	        const gain = ctx.createGain();
   364	        osc.connect(gain);
   365	        gain.connect(ctx.destination);
   366	        osc.type = 'sine';
   367	        osc.frequency.setValueAtTime(freq, startTime);
   368	        osc.frequency.exponentialRampToValueAtTime(freq / 2, startTime + duration);
   369	        gain.gain.setValueAtTime(1, startTime);
   370	        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
   371	        osc.start(startTime);
   372	        osc.stop(startTime + duration);
   373	      };
   374	      
   375	      const now = ctx.currentTime;
   376	      playTone(800, now, 0.15);
   377	      playTone(600, now + 0.1, 0.2);
   378	    } catch(e) {
   379	      console.debug('AudioContext not supported');
   380	    }
   381	  },
   382	
   383	  lastTypingTime: 0,
   384	
   385	  handleTyping() {
   386	    if (!this.activeChatUser || !this.socket) return;
   387	    
   388	    const now = Date.now();
   389	    if (now - this.lastTypingTime > 1500) {
   390	      this.socket.emit('private_typing', { targetUsername: this.activeChatUser.username });
   391	      this.lastTypingTime = now;
   392	    }
   393	  },
   394	
   395	  handleIncomingTyping(data) {
   396	    const { byUsername } = data;
   397	
   398	    // Don't show typing for yourself
   399	    if (byUsername === window.state?.currentUser?.username) return;
   400	
   401	    const conv = this.conversations.get(byUsername);
   402	    if (conv) {
   403	      conv.isTyping = true;
   404	      if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === byUsername) {
   405	        this.updateTypingIndicator(true);
   406	      }
   407	      
   408	      // Clear typing indicator after 3 seconds
   409	      if (conv.typingTimer) clearTimeout(conv.typingTimer);
   410	      conv.typingTimer = setTimeout(() => {
   411	        conv.isTyping = false;
   412	        if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === byUsername) {
   413	          this.updateTypingIndicator(false);
   414	        }
   415	      }, 3000);
   416	    }
   417	  },
   418	
   419	  updateTypingIndicator(isTyping) {
   420	    const container = document.getElementById('private-chat-messages-inner');
   421	    if (!container) return;
   422	    
   423	    let indicator = container.querySelector('.private-msg-typing');
   424	    
   425	    if (isTyping && !indicator) {
   426	      const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
   427	      indicator = document.createElement('div');
   428	      indicator.className = 'd-flex align-items-center justify-content-start ps-2 private-msg-typing';
   429	      indicator.style = 'height: 30px; margin: 0; padding: 0;';
   430	      indicator.innerHTML = `
   431	          <div class="d-flex align-items-center gap-1 px-2 py-1 bg-light rounded-pill text-muted small shadow-sm my-1">
   432	            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px;" role="status"></span>
   433	            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px; animation-delay: 0.2s;" role="status"></span>
   434	            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px; animation-delay: 0.4s;" role="status"></span>
   435	            <span class="ms-1" style="font-size: 11px;">يكتب الآن...</span>
   436	          </div>
   437	      `;
   438	      container.appendChild(indicator);
   439	      if (wasNearBottom) {
   440	        this.scrollToBottom();
   441	      }
   442	    } else if (!isTyping && indicator) {
   443	      indicator.remove();
   444	    }
   445	  },
   446	
   447	  handleMessageRead(data) {
   448	    const { byUsername, messageIds } = data;
   449	    const conv = this.conversations.get(byUsername);
   450	    if (conv) {
   451	      conv.messages.forEach(msg => {
   452	        if (messageIds.includes(msg.id)) {
   453	          msg.status = 'read';
   454	        }
   455	      });
   456	      if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === byUsername) {
   457	        messageIds.forEach(id => {
   458	           const el = document.querySelector(`.private-msg-item[data-id="${id}"] .fa-check, .private-msg-item[data-id="${id}"] .fa-check-double`);
   459	           if (el) {
   460	              el.className = 'fas fa-check-double text-primary ms-1';
   461	           }
   462	        });
   463	      }
   464	    }
   465	  },
   466	
   467	  handleMessageDeleted(data) {
   468	    const { byUsername, messageId } = data;
   469	    const conv = this.conversations.get(byUsername);
   470	    if (conv) {
   471	      conv.messages = conv.messages.filter(msg => String(msg.id) !== String(messageId));
   472	      if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === byUsername) {
   473	        this.renderMessages();
   474	      }
   475	      this.renderSidebar();
   476	    }
   477	  },
   478	
   479	  handleMessageEdited(data) {
   480	    const { byUsername, messageId, newText } = data;
   481	    const conv = this.conversations.get(byUsername);
   482	    if (conv) {
   483	      const msg = conv.messages.find(m => String(m.id) === String(messageId));
   484	      if (msg) {
   485	        msg.text = newText;
   486	        if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === byUsername) {
   487	          this.renderMessages();
   488	        }
   489	        this.renderSidebar();
   490	      }
   491	    }
   492	  },
   493	
   494	  handleIncomingMessage(data) {
   495	    const { fromUser, message } = data;
   496	    const username = fromUser.username;
   497	
   498	    if (!this.conversations.has(username)) {
   499	      this.conversations.set(username, {
   500	        user: fromUser,
   501	        messages: [],
   502	        unreadCount: 0,
   503	        lastMessageTime: new Date()
   504	      });
   505	    }
   506	
   507	    const conv = this.conversations.get(username);
   508	    
   509	    // Self-chat check: if we already have this message ID, don't add it again
   510	    if (message.id && conv.messages.some(m => String(m.id) === String(message.id))) {
   511	      return false;
   512	    }
   513	
   514	    const newMessage = { ...message, isMine: false };
   515	    conv.messages.push(newMessage);
   516	    conv.lastMessageTime = new Date(message.timestamp);
   517	
   518	    if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === username) {
   519	      // Chat is open, mark as read
   520	      this.appendMessage(newMessage, conv);
   521	      
   522	      // Send read receipt
   523	      if (this.socket) {
   524	        this.socket.emit('private_message_read', {
   525	          targetUsername: username,
   526	          messageIds: [message.id]
   527	        });
   528	      }
   529	    } else if (username !== window.state?.currentUser?.username) {
   530	      conv.unreadCount++;
   531	      this.updateSidebarBadge();
   532	      
   533	      // If private tab is not open, show toast or badge
   534	      if (window.state && window.state.activeSidebarTab !== 'private') {
   535	        const privateBtn = document.getElementById('private-tab-btn');
   536	        if (privateBtn) {
   537	          let badge = privateBtn.querySelector('.private-badge');
   538	          if (!badge) {
   539	            badge = document.createElement('span');
   540	            badge.className = 'badge rounded-pill bg-danger private-badge ms-1';
   541	            badge.style.fontSize = '0.7rem';
   542	            privateBtn.appendChild(badge);
   543	          }
   544	          const unreadConversations = Array.from(this.conversations.values()).filter(c => c.unreadCount > 0).length;
   545	          badge.innerText = unreadConversations > 99 ? '+99' : unreadConversations;
   546	        }
   547	      }
   548	    }
   549	
   550	    this.renderSidebar();
   551	    return true;
   552	  },
   553	
   554	  handleSentMessage(data) {
   555	    const { toUsername, message, targetUser } = data;
   556	    
   557	    if (!this.conversations.has(toUsername)) {
   558	      this.conversations.set(toUsername, {
   559	        user: targetUser,
   560	        messages: [],
   561	        unreadCount: 0,
   562	        lastMessageTime: new Date()
   563	      });
   564	    }
   565	
   566	    const conv = this.conversations.get(toUsername);
   567	
   568	    // Self-chat check: if we already have this message ID, don't add it again
   569	    if (message.id && conv.messages.some(m => String(m.id) === String(message.id))) {
   570	      // Update isMine to true if it already existed (from incoming handler) 
   571	      // so it shows on the right side if it was sent by the user
   572	      const existing = conv.messages.find(m => String(m.id) === String(message.id));
   573	      if (existing) existing.isMine = true;
   574	      return;
   575	    }
   576	
   577	    const newMessage = { ...message, isMine: true };
   578	    conv.messages.push(newMessage);
   579	    conv.lastMessageTime = new Date(message.timestamp);
   580	
   581	    if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === toUsername) {
   582	      this.appendMessage(newMessage, conv);
   583	    }
   584	
   585	    this.renderSidebar();
   586	  },
   587	
   588	  updateSidebarBadge() {
   589	    const unreadConversations = Array.from(this.conversations.values()).filter(c => c.unreadCount > 0).length;
   590	    const privateBtn = document.getElementById('private-tab-btn');
   591	    if (privateBtn) {
   592	      let badge = privateBtn.querySelector('.private-badge');
   593	      if (unreadConversations > 0) {
   594	        if (!badge) {
   595	          badge = document.createElement('span');
   596	          badge.className = 'badge rounded-pill bg-danger private-badge ms-1';
   597	          badge.style.fontSize = '0.7rem';
   598	          privateBtn.appendChild(badge);
   599	        }
   600	        badge.innerText = unreadConversations > 99 ? '+99' : unreadConversations;
   601	      } else if (badge) {
   602	        badge.remove();
   603	      }
   604	    }
   605	  },
   606	
   607	  openChat(user) {
   608	    if (!user) return;
   609	    
   610	    this.activeChatUser = user;
   611	    this.isWindowOpen = true;
   612	
   613	    if (!this.conversations.has(user.username)) {
   614	      this.conversations.set(user.username, {
   615	        user: user,
   616	        messages: [],
   617	        unreadCount: 0,
   618	        lastMessageTime: new Date()
   619	      });
   620	    }
   621	
   622	    const conv = this.conversations.get(user.username);
   623	    
   624	    // Fetch archived messages from database asynchronously to restore history on demand
   625	    const peerType = user.type || (user.isGuest ? 'guest' : 'user');
   626	    const peerId = user.id || user.userId || user.username;
   627	    const token = sessionStorage.getItem('token');
   628	    if (token) {
   629	      const sessionParam = window.getClientSessionId ? `?clientSessionId=${encodeURIComponent(window.getClientSessionId())}` : '';
   630	      fetch(`/api/private/messages/${peerType}/${peerId}${sessionParam}`, {
   631	        headers: {
   632	          'Authorization': `Bearer ${token}`
   633	        }
   634	      })
   635	      .then(res => {
   636	        if (!res.ok) {
   637	          // Fallback to username endpoint
   638	          return fetch(`/api/private/messages-by-username/${user.username}${sessionParam}`, {
   639	            headers: { 'Authorization': `Bearer ${token}` }
   640	          });
   641	        }
   642	        return res;
   643	      })
   644	      .then(res => res.json())
   645	      .then(data => {
   646	        if (Array.isArray(data)) {
   647	          const existingIds = new Set(conv.messages.map(m => String(m.id)));
   648	          let updated = false;
   649	          data.forEach(msg => {
   650	            if (!existingIds.has(String(msg.id))) {
   651	              conv.messages.push(msg);
   652	              updated = true;
   653	            }
   654	          });
   655	          if (updated) {
   656	            conv.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
   657	            if (this.isWindowOpen && this.activeChatUser && this.activeChatUser.username === user.username) {
   658	              this.renderMessages();
   659	              this.scrollToBottom();
   660	            }
   661	          }
   662	        }
   663	      })
   664	      .catch(err => console.error('[PrivateChatManager] Error loading chat history:', err));
   665	    }
   666	
   667	    // Send read receipts for unread messages
   668	    if (conv.unreadCount > 0 && this.socket) {
   669	      const unreadIds = conv.messages.filter(m => !m.isMine && m.status !== 'read').map(m => m.id);
   670	      if (unreadIds.length > 0) {
   671	        this.socket.emit('private_message_read', {
   672	          targetUsername: user.username,
   673	          messageIds: unreadIds
   674	        });
   675	        conv.messages.forEach(m => {
   676	          if (!m.isMine) m.status = 'read';
   677	        });
   678	      }
   679	    }
   680	    
   681	    conv.unreadCount = 0;
   682	    this.updateSidebarBadge();
   683	    this.renderSidebar();
   684	
   685	    const chatWindow = document.getElementById('private-chat-window');
   686	    if (chatWindow) {
   687	      chatWindow.style.setProperty('display', 'flex', 'important');
   688	      
   689	      // Update header
   690	      const headerName = document.getElementById('private-chat-name');
   691	      const headerAvatar = document.getElementById('private-chat-avatar');
   692	      const headerId = document.getElementById('private-chat-id');
   693	      
   694	      if (headerName) {
   695	        headerName.innerHTML = window.renderUserIdentity(user, {
   696	          onClick: `window.showUserProfile('${user.username}')`,
   697	          tag: 'span',
   698	          containerStyle: 'cursor: pointer;'
   699	        });
   700	      }
   701	      
   702	      if (headerAvatar) {
   703	        headerAvatar.src = window.getAvatarUrl ? window.getAvatarUrl(user) : '/uploads/site/default.png';
   704	        headerAvatar.onerror = function() { window.handleAvatarError(this); };
   705	        headerAvatar.style.cursor = 'pointer';
   706	        headerAvatar.onclick = () => window.showUserProfile(user.username);
   707	      }
   708	      if (headerId) {
   709	        const numId = Math.abs(Number(user.id ?? user.userId ?? NaN));
   710	        headerId.innerText = Number.isFinite(numId) ? '#' + numId : ('#' + (user.username || '')).slice(0, 12);
   711	      }
   712	      
   713	      this.renderMessages();
   714	      if (typeof window.applyRoomMessagesNightMode === 'function') {
   715	        window.applyRoomMessagesNightMode();
   716	      }
   717	      if (window.PrivateCallManager) window.PrivateCallManager.renderCurrentCall();
   718	      this.scrollToBottom();
   719	      
   720	      const input = document.getElementById('private-chat-input');
   721	      if (input) {
   722	        input.focus();
   723	        // Add auto-resize listeners
   724	        input.addEventListener('input', () => {
   725	          this.handleTyping();
   726	        });
   727	        input.addEventListener('keydown', (e) => {
   728	          if (e.key === 'Enter' && !e.shiftKey) {
   729	            e.preventDefault();
   730	            this.sendMessage();
   731	          }
   732	        });
   733	      }
   734	
   735	      // Close sidebar ONLY on mobile/small screens when a chat is opened
   736	      if (window.innerWidth <= 768) {
   737	        const closeBtn = document.getElementById('close-sidebar');
   738	        if (closeBtn && typeof closeBtn.click === 'function') closeBtn.click();
   739	      }
   740	    }
   741	  },
   742	
   743	  closeChat() {
   744	    this.isWindowOpen = false;
   745	    this.activeChatUser = null;
   746	    const chatWindow = document.getElementById('private-chat-window');
   747	    if (chatWindow) {
   748	      chatWindow.style.setProperty('display', 'none', 'important');
   749	    }
   750	  },
   751	
   752	  minimizeChat() {
   753	    this.isWindowOpen = false;
   754	    const chatWindow = document.getElementById('private-chat-window');
   755	    if (chatWindow) {
   756	      chatWindow.style.setProperty('display', 'none', 'important');
   757	    }
   758	  },
   759	
   760	  isMaximized: false,
   761	  isRecording: false,
   762	  mediaRecorder: null,
   763	  audioChunks: [],
   764	  recordingTimer: null,
   765	  recordingSeconds: 0,
   766	
   767	  toggleRecording() {
   768	    if (this.isRecording) {
   769	      this.stopRecording(true);
   770	    } else {
   771	      this.startRecording();
   772	    }
   773	  },
   774	
   775	  startRecording() {
   776	    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
   777	      if (window.showToast) window.showToast('متصفحك لا يدعم تسجيل الصوت', 'error');
   778	      return;
   779	    }
   780	
   781	    navigator.mediaDevices.getUserMedia({ audio: true })
   782	      .then(stream => {
   783	        this.mediaRecorder = new MediaRecorder(stream);
   784	        this.audioChunks = [];
   785	        
   786	        this.mediaRecorder.ondataavailable = (event) => {
   787	          if (event.data.size > 0) {
   788	            this.audioChunks.push(event.data);
   789	          }
   790	        };
   791	
   792	        this.mediaRecorder.onstop = () => {
   793	          if (this.audioChunks.length > 0) {
   794	            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
   795	            this.uploadVoice(audioBlob);
   796	          }
   797	          
   798	          // Stop all tracks
   799	          stream.getTracks().forEach(track => track.stop());
   800	        };
   801	
   802	        this.mediaRecorder.start();
   803	        this.isRecording = true;
   804	        this.recordingSeconds = 0;
   805	        this.updateRecordingUI(true);
   806	        
   807	        this.recordingTimer = setInterval(() => {
   808	          this.recordingSeconds++;
   809	          const timerEl = document.getElementById('private-recording-timer');
   810	          if (timerEl) {
   811	            const mins = Math.floor(this.recordingSeconds / 60);
   812	            const secs = this.recordingSeconds % 60;
   813	            timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
   814	          }
   815	        }, 1000);
   816	      })
   817	      .catch(err => {
   818	        console.error('Error accessing microphone:', err);
   819	        if (window.showToast) window.showToast('لا يمكن الوصول للميكروفون', 'error');
   820	      });
   821	  },
   822	
   823	  stopRecording(send = true) {
   824	    if (this.mediaRecorder && this.isRecording) {
   825	      if (!send) {
   826	        this.mediaRecorder.onstop = () => {
   827	          this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
   828	        };
   829	      }
   830	      this.mediaRecorder.stop();
   831	      this.isRecording = false;
   832	      clearInterval(this.recordingTimer);
   833	      this.updateRecordingUI(false);
   834	    }
   835	  },
   836	
   837	  cancelRecording() {
   838	    this.stopRecording(false);
   839	  },
   840	
   841	  updateRecordingUI(isRecording) {
   842	    const input = document.getElementById('private-chat-input');
   843	    const micBtn = document.getElementById('private-mic-btn');
   844	    const recordingOverlay = document.getElementById('private-recording-overlay');
   845	    
   846	    if (isRecording) {
   847	      input.classList.add('d-none');
   848	      recordingOverlay.classList.remove('d-none');
   849	      recordingOverlay.classList.add('d-flex');
   850	      micBtn.classList.add('text-danger', 'recording-pulse');
   851	    } else {
   852	      input.classList.remove('d-none');
   853	      recordingOverlay.classList.add('d-none');
   854	      recordingOverlay.classList.remove('d-flex');
   855	      micBtn.classList.remove('text-danger', 'recording-pulse');
   856	    }
   857	  },
   858	
   859	  uploadVoice(blob) {
   860	    const formData = new FormData();
   861	    const filename = `voice-${Date.now()}.webm`;
   862	    formData.append('file', blob, filename);
   863	
   864	    fetch('/api/upload/voice', {
   865	      method: 'POST',
   866	      headers: {
   867	        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
   868	      },
   869	      body: formData
   870	    })
   871	    .then(res => res.json())
   872	    .then(data => {
   873	      if (data.url) {
   874	        this.socket.emit('private_message', {
   875	          targetUsername: this.activeChatUser.username,
   876	          message: {
   877	            text: '',
   878	            type: 'audio',
   879	            fileUrl: data.url
   880	          }
   881	        });
   882	      }
   883	    })
   884	    .catch(err => {
   885	      console.error('Error uploading voice:', err);
   886	      if (window.showToast) window.showToast('حدث خطأ أثناء إرسال التسجيل', 'error');
   887	    });
   888	  },
   889	
   890	  toggleMaximize() {
   891	    const chatWindow = document.getElementById('private-chat-window');
   892	    const maximizeBtn = document.getElementById('private-chat-maximize-btn');
   893	    if (!chatWindow || !maximizeBtn) return;
   894	
   895	    this.isMaximized = !this.isMaximized;
   896	    
   897	    if (this.isMaximized) {
   898	      chatWindow.classList.add('maximized');
   899	      maximizeBtn.innerHTML = '';
   900	      maximizeBtn.appendChild(secureCreateElement('i', { class: 'fas fa-compress' }));
   901	
   902	      maximizeBtn.title = 'تصغير';
   903	    } else {
   904	      chatWindow.classList.remove('maximized');
   905	      maximizeBtn.innerHTML = '<i class="fas fa-expand"></i>';
   906	      maximizeBtn.title = 'تكبير';
   907	    }
   908	    
   909	    this.scrollToBottom();
   910	  },
   911	
   912	  deleteConversation(username, event) {
   913	    event.stopPropagation();
   914	    if (confirm('هل أنت متأكد من حذف هذه المحادثة؟')) {
   915	      const conv = this.conversations.get(username);
   916	      const peerId = conv?.user?.id || null;
   917	      const peerType = conv?.user?.type || 'user';
   918	
   919	      this.conversations.delete(username);
   920	      this.renderSidebar();
   921	      if (this.activeChatUser && this.activeChatUser.username === username) {
   922	        this.closeChat();
   923	      }
   924	
   925	      // Notify the server asynchronously about the deletion
   926	      const token = sessionStorage.getItem('token');
   927	      if (token) {
   928	        fetch('/api/private/conversations/delete', {
   929	          method: 'POST',
   930	          headers: {
   931	            'Content-Type': 'application/json',
   932	            'Authorization': `Bearer ${token}`
   933	          },
   934	          body: JSON.stringify({
   935	            peerUsername: username,
   936	            peerType,
   937	            peerId
   938	          })
   939	        })
   940	        .catch(err => console.error('[PrivateChatManager] Error deleting conversation on server:', err));
   941	      }
   942	    }
   943	  },
   944	
   945	  renderSidebar() {
   946	    const container = document.getElementById('sidebar-private-container');
   947	    if (!container) return;
   948	    
   949	    // Sync live user states from global online users if available
   950	    const liveUsers = (window.state && window.state.currentUsers) || window.onlineUsers;
   951	    if (Array.isArray(liveUsers)) {
   952	      this.conversations.forEach(conv => {
   953	        const liveUser = liveUsers.find(u => 
   954	          (conv.user.id && u.id && Number(conv.user.id) === Number(u.id)) ||
   955	          (conv.user.userId && u.userId && Number(conv.user.userId) === Number(u.userId)) ||
   956	          (conv.user.username && u.username && conv.user.username.toLowerCase() === u.username.toLowerCase())
   957	        );
   958	        if (liveUser) {
   959	          conv.user = { ...conv.user, ...liveUser, isOnline: true };
   960	        } else if (!conv.user.isVirtualUser) {
   961	          conv.user.isOnline = false;
   962	          conv.user.isGhost = false;
   963	          conv.user.isIdle = false;
   964	          conv.user.presenceState = 'offline';
   965	        }
   966	      });
   967	    }
   968	
   969	    // Clear existing content
   970	    container.innerHTML = '';
   971	
   972	    const convs = Array.from(this.conversations.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime);
   973	
   974	    if (convs.length === 0) {
   975	      container.innerHTML = '<div class="p-4 text-center text-muted">لا توجد محادثات خاصة حالياً</div>';
   976	      return;
   977	    }
   978	
   979	    let html = '<div class="list-group list-group-flush">';
   980	    convs.forEach(conv => {
   981	      const user = conv.user;
   982	      const avatar = window.getAvatarUrl ? window.getAvatarUrl(user) : '/uploads/site/default.png';
   983	      const name = user.topic || user.username;
   984	      const lastMsg = conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null;
   985	      let lastMsgText = 'بدء المحادثة';
   986	      if (lastMsg) {
   987	        if (lastMsg.type === 'image') lastMsgText = '📷 صورة';
   988	        else if (lastMsg.type === 'file') lastMsgText = '📎 ملف';
   989	        else if (lastMsg.type === 'video') lastMsgText = '🎥 فيديو';
   990	        else {
   991	          const rawText = (lastMsg.text || '').trim();
   992	          if (rawText) {
   993	            // Render placeholders/shortcuts for the preview
   994	            if (window.replacePlaceholders && window.replaceShortcuts && window.escapeHTML) {
   995	               lastMsgText = window.replacePlaceholders(window.replaceShortcuts(window.escapeHTML(rawText)));
   996	            } else {
   997	               lastMsgText = rawText;
   998	            }
   999	          } else {
  1000	            lastMsgText = 'بدء المحادثة';
  1001	          }
  1002	        }
  1003	      }
  1004	      
  1005	      const timeStr = lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
  1006	      const unreadBadge = conv.unreadCount > 0 ? `<span class="badge bg-danger rounded-pill">${conv.unreadCount}</span>` : '';
  1007	      
  1008	      const statusHex = this.getUserStatusHex(user);
  1009	 
  1010	      const wrapper = secureCreateElement('div', { class: 'list-group-item d-flex align-items-center p-2 border-bottom', style: 'cursor: pointer;', 'data-username': user.username, 'data-user-id': user.userId || user.id });
  1011	      wrapper.onclick = (e) => {
  1012	          e.stopPropagation();
  1013	          window.PrivateChatManager.openChatByUsername(user.username);
  1014	      };
  1015	 
  1016	      const imgWrapper = secureCreateElement('div', { class: 'position-relative me-2' });
  1017	      const img = secureCreateElement('img', { src: avatar, class: 'rounded', width: '40', height: '40', style: 'object-fit: cover;', onerror: 'window.handleAvatarError(this)' });
  1018	      const statusSpan = secureCreateElement('span', { class: `position-absolute bottom-0 end-0 border border-light rounded-circle`, style: `width: 10px; height: 10px; background-color: ${statusHex};` });
  1019	      imgWrapper.appendChild(img);
  1020	      imgWrapper.appendChild(statusSpan);
  1021	      
  1022	      const contentWrapper = secureCreateElement('div', { class: 'flex-grow-1 min-width-0 text-end' });
  1023	      const headerDiv = secureCreateElement('div', { class: 'd-flex justify-content-between align-items-baseline mb-1' });
  1024	      
  1025	      const userIdentityHtml = window.renderUserIdentity(user, {
  1026	        nameStyle: `font-size: 0.9rem; font-weight: bold; color: ${user.ucol || '#333'};`,
  1027	        containerStyle: 'max-width: 150px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'
  1028	      });
  1029	      
  1030	      const nameContainer = secureCreateElement('div', { class: 'mb-0' });
  1031	      nameContainer.innerHTML = userIdentityHtml;
  1032	      
  1033	      const timeSmall = secureCreateElement('small', { class: 'text-muted', style: 'font-size: 0.7rem;' }, timeStr);
  1034	      headerDiv.appendChild(nameContainer);
  1035	      headerDiv.appendChild(timeSmall);
  1036	      
  1037	      const bodyDiv = secureCreateElement('div', { class: 'd-flex justify-content-between align-items-center' });
  1038	      const msgSmall = secureCreateElement('small', { class: 'text-muted text-truncate d-block private-sidebar-preview', style: 'max-width: 150px;' });
  1039	      msgSmall.innerHTML = lastMsgText;
  1040	      const actionsDiv = secureCreateElement('div', { class: 'd-flex align-items-center gap-2' });
  1041	      
  1042	      if (conv.unreadCount > 0) {
  1043	          const badge = secureCreateElement('span', { class: 'badge bg-danger rounded-pill' }, conv.unreadCount.toString());
  1044	          actionsDiv.appendChild(badge);
  1045	      }
  1046	      
  1047	      const delBtn = secureCreateElement('button', { class: 'btn btn-sm btn-outline-danger p-0 px-1', title: 'حذف المحادثة' });
  1048	      delBtn.appendChild(secureCreateElement('i', { class: 'fas fa-trash-alt' }));
  1049	      delBtn.onclick = (e) => {
  1050	          e.stopPropagation();
  1051	          window.PrivateChatManager.deleteConversation(user.username, e);
  1052	      };
  1053	      
  1054	      actionsDiv.appendChild(delBtn);
  1055	      
  1056	      bodyDiv.appendChild(msgSmall);
  1057	      bodyDiv.appendChild(actionsDiv);
  1058	      
  1059	      contentWrapper.appendChild(headerDiv);
  1060	      contentWrapper.appendChild(bodyDiv);
  1061	      
  1062	      wrapper.appendChild(imgWrapper);
  1063	      wrapper.appendChild(contentWrapper);
  1064	      
  1065	      container.appendChild(wrapper);
  1066	    });
  1067	  },
  1068	
  1069	  openChatByUsername(username) {
  1070	    const conv = this.conversations.get(username);
  1071	    if (conv) {
  1072	      this.openChat(conv.user);
  1073	    }
  1074	  },
  1075	
  1076	  renderSingleMessage(msg, conv) {
  1077	    if (msg.type === 'system') {
  1078	      return `<div class="text-center text-muted my-2 small fw-bold" style="background: #f8f9fa; padding: 4px; border-radius: 4px; margin: 0 10px;">${msg.text}</div>`;
  1079	    }
  1080	
  1081	    const isMine = msg.isMine;
  1082	    const now = new Date();
  1083	    const msgTime = new Date(msg.timestamp);
  1084	    const diffMs = now - msgTime;
  1085	    const diffMins = Math.floor(diffMs / 60000);
  1086	    let timeStr = '';
  1087	    if (diffMins < 1) {
  1088	      timeStr = 'الآن';
  1089	    } else if (diffMins < 60) {
  1090	      timeStr = `${diffMins}د`;
  1091	    } else if (diffMins < 1440) {
  1092	      timeStr = `${Math.floor(diffMins / 60)}س`;
  1093	    } else {
  1094	      timeStr = `${Math.floor(diffMins / 1440)}ي`;
  1095	    }
  1096	    
  1097	    let contentHtml = '';
  1098	    if (msg.type === 'image') {
  1099	      contentHtml = `<div style="text-align: left;"><img src="${msg.fileUrl}" class="img-fluid rounded mt-1 private-msg-image" style="max-width: 200px; max-height: 150px; object-fit: contain; cursor: pointer;" onclick="window.openLightbox('${msg.fileUrl}')"></div>`;
  1100	    } else if (msg.type === 'video') {
  1101	      contentHtml = `
  1102	        <div class="private-msg-video mt-1" style="width: 200px; position: relative; cursor: pointer;" onclick="window.openVideoLightbox('${msg.fileUrl}')">
  1103	          <video src="${msg.fileUrl}" style="width: 100%; height: 150px; object-fit: contain; background: #000; border-radius: 8px;"></video>
  1104	          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.5); color: white; padding: 5px 10px; border-radius: 50%;">
  1105	            <i class="fas fa-play"></i>
  1106	          </div>
  1107	        </div>
  1108	      `;
  1109	    } else if (msg.type === 'file') {
  1110	      contentHtml = `<a href="${msg.fileUrl}" target="_blank" class="btn btn-sm btn-light d-flex align-items-center gap-2 private-msg-file"><i class="fas fa-file-download"></i> تحميل الملف</a>`;
  1111	    } else if (msg.type === 'audio') {
  1112	      contentHtml = `
  1113	        <div class="private-msg-audio">
  1114	          <audio controls style="width: 100%; height: 30px;">
  1115	            <source src="${msg.fileUrl}" type="audio/webm">
  1116	            متصفحك لا يدعم مشغل الصوت.
  1117	          </audio>
  1118	        </div>
  1119	      `;
  1120	    }
  1121	
  1122	    if (msg.type !== 'text' && msg.text) {
  1123	      contentHtml += `<div class="private-msg-text mt-1">${this.formatMessage(msg.text)}</div>`;
  1124	    } else if (msg.type === 'text') {
  1125	      contentHtml = `<div class="private-msg-text">${this.formatMessage(msg.text)}</div>`;
  1126	    }
  1127	
  1128	    let statusHtml = '';
  1129	    if (isMine) {
  1130	      if (msg.status === 'read') {
  1131	        statusHtml = '<i class="fas fa-check-double text-primary ms-1" style="font-size: 0.7rem;"></i>';
  1132	      } else if (msg.status === 'delivered') {
  1133	        statusHtml = '<i class="fas fa-check-double text-secondary ms-1" style="font-size: 0.7rem;"></i>';
  1134	      } else {
  1135	        statusHtml = '<i class="fas fa-check text-secondary ms-1" style="font-size: 0.7rem;"></i>';
  1136	      }
  1137	    }
  1138	
  1139	    const rawUser = isMine ? window.state.currentUser : conv.user;
  1140	    const user = { ...rawUser };
  1141	
  1142	    const avatarUrl = window.getAvatarUrl ? window.getAvatarUrl(user) : '/uploads/site/default.png';
  1143	    const username = user.topic || user.username;
  1144	    const fontColor = user.fontColor || '#333';
  1145	    
  1146	    const userBgStyle = user.bg ? ((user.bg.startsWith('http') || user.bg.startsWith('/')) ? `background: url('${user.bg}') center / cover;` : `background: ${user.bg};`) : 'background: transparent;';
  1147	    const usernamePadding = user.bg ? 'padding: 2px 6px; border-radius: 3px;' : '';
  1148	
  1149	    const safeUsername = window.escapeHTML ? window.escapeHTML(user.username) : user.username;
  1150	
  1151	    let nameStyle = `font-weight: bold; font-size: 1rem; color: ${user.ucol || '#333'};`;
  1152	
  1153	    return `
  1154	      <div class="private-msg-item" data-id="${msg.id || ''}">
  1155	        <div class="d-flex flex-column align-items-start justify-content-between p-2" style="width: 60px; flex-shrink: 0;">
  1156	          <div class="d-flex align-items-center">
  1157	            <span class="private-msg-time text-muted">${timeStr}</span>
  1158	            ${statusHtml}
  1159	          </div>
  1160	          ${isMine && msg.type === 'text' ? `
  1161	          <div class="private-msg-actions d-flex gap-1 mt-auto">
  1162	            <button class="private-btn-msg-action border-0 p-0 d-flex align-items-center justify-content-center" style="background: #e74c3c; color: white; width: 22px; height: 22px; border-radius: 3px; cursor: pointer; position: relative; z-index: 10;" onclick="window.PrivateChatManager.deleteMessage('${msg.id}')" title="حذف"><i class="fas fa-times" style="font-size: 0.7rem; pointer-events: none;"></i></button>
  1163	            <button class="private-btn-msg-action border-0 p-0 d-flex align-items-center justify-content-center" style="background: #fff; color: #666; width: 22px; height: 22px; border-radius: 3px; border: 1px solid #ddd !important; cursor: pointer; position: relative; z-index: 10;" onclick="window.PrivateChatManager.editMessage('${msg.id}')" title="تعديل"><i class="fas fa-edit" style="font-size: 0.7rem; pointer-events: none;"></i></button>
  1164	          </div>
  1165	          ` : ''}
  1166	        </div>
  1167	        
  1168	        <div class="private-msg-body">
  1169	          <div class="private-msg-header">
  1170	            ${window.renderUserIdentity(user, {
  1171	              nameStyle: nameStyle,
  1172	              onClick: `window.showUserProfile('${safeUsername}')`,
  1173	              containerStyle: 'cursor: pointer;'
  1174	            })}
  1175	          </div>
  1176	          ${msg.replyTo ? `
  1177	          <div class="private-msg-quote">
  1178	            <div class="fw-bold text-primary" style="font-size: 0.8rem;">${window.escapeHTML ? window.escapeHTML(msg.replyTo.username) : msg.replyTo.username}</div>
  1179	            ${msg.replyTo.type === 'image' ? `
  1180	              <div class="mt-1"><img src="${msg.replyTo.fileUrl}" style="max-height: 40px; border-radius: 2px;"></div>
  1181	            ` : `
  1182	              <div class="text-truncate text-muted">${this.formatMessage(msg.replyTo.text)}</div>
  1183	            `}
  1184	          </div>
  1185	          ` : ''}
  1186	          ${contentHtml}
  1187	        </div>
  1188	        
  1189	        <div style="width: 50px; flex-shrink: 0; display: flex; justify-content: center;">
  1190	          <img src="${avatarUrl}" class="private-msg-avatar js-user-profile-btn" referrerPolicy="origin-when-cross-origin" data-username="${safeUsername}" onerror="window.handleAvatarError(this)">
  1191	        </div>
  1192	      </div>
  1193	    `;
  1194	  },
  1195	
  1196	  appendMessage(msg, conv) {
  1197	    privateMessageQueue.push({ msg, conv });
  1198	    this.schedulePrivateMessageRender();
  1199	  },
  1200	
  1201	  schedulePrivateMessageRender() {
  1202	    if (privateMessageRAF) return;
  1203	    privateMessageRAF = requestAnimationFrame(() => {
  1204	      privateMessageRAF = null;
  1205	      if (privateMessageQueue.length === 0) return;
  1206	
  1207	      const messagesContainer = document.getElementById('private-chat-messages-inner');
  1208	      if (!messagesContainer) {
  1209	        privateMessageQueue = [];
  1210	        return;
  1211	      }
  1212	
  1213	      const messagesToProcess = [...privateMessageQueue];
  1214	      privateMessageQueue = [];
  1215	
  1216	      const startMsg = messagesContainer.querySelector('.text-center.text-muted');
  1217	      if (startMsg && startMsg.innerText === 'بدء المحادثة') {
  1218	        startMsg.remove();
  1219	      }
  1220	
  1221	      const wasNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 80;
  1222	      const fragment = document.createDocumentFragment();
  1223	
  1224	      messagesToProcess.forEach(({ msg, conv }) => {
  1225	        if (msg.id) {
  1226	          const existing = messagesContainer.querySelector(`[data-id="${msg.id}"]`);
  1227	          if (existing) return;
  1228	          const inFragment = fragment.querySelector(`[data-id="${msg.id}"]`);
  1229	          if (inFragment) return;
  1230	        }
  1231	
  1232	        const temp = document.createElement('div');
  1233	        temp.innerHTML = this.renderSingleMessage(msg, conv).trim();
  1234	        const el = temp.firstElementChild;
  1235	        if (el) {
  1236	          fragment.appendChild(el);
  1237	        }
  1238	      });
  1239	
  1240	      if (fragment.children.length > 0) {
  1241	        const typingIndicator = messagesContainer.querySelector('.private-msg-typing');
  1242	        if (typingIndicator) {
  1243	          messagesContainer.insertBefore(fragment, typingIndicator);
  1244	        } else {
  1245	          messagesContainer.appendChild(fragment);
  1246	        }
  1247	
  1248	        if (wasNearBottom) {
  1249	          this.scrollToBottom();
  1250	        }
  1251	      }
  1252	    });
  1253	  },
  1254	
  1255	  renderMessages() {
  1256	    const messagesContainer = document.getElementById('private-chat-messages-inner');
  1257	    if (!messagesContainer || !this.activeChatUser) return;
  1258	    
  1259	    // Clear existing messages
  1260	    messagesContainer.innerHTML = '';
  1261	
  1262	    const conv = this.conversations.get(this.activeChatUser.username);
  1263	    if (!conv || conv.messages.length === 0) {
  1264	      messagesContainer.innerHTML = '<div class="text-center text-muted my-4 small">بدء المحادثة</div>';
  1265	      return;
  1266	    }
  1267	
  1268	    let html = '';
  1269	    conv.messages.forEach(msg => {
  1270	      html += this.renderSingleMessage(msg, conv);
  1271	    });
  1272	
  1273	    if (conv.isTyping) {
  1274	      html += `
  1275	        <div class="d-flex align-items-center justify-content-start ps-2 private-msg-typing" style="height: 30px; margin: 0; padding: 0;">
  1276	          <div class="d-flex align-items-center gap-1 px-2 py-1 bg-light rounded-pill text-muted small shadow-sm my-1">
  1277	            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px;" role="status"></span>
  1278	            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px; animation-delay: 0.2s;" role="status"></span>
  1279	            <span class="spinner-grow spinner-grow-sm text-secondary" style="width: 8px; height: 8px; animation-delay: 0.4s;" role="status"></span>
  1280	            <span class="ms-1" style="font-size: 11px;">يكتب الآن...</span>
  1281	          </div>
  1282	        </div>
  1283	      `;
  1284	    }
  1285	
  1286	    messagesContainer.innerHTML = html;
  1287	  },
  1288	
  1289	  formatMessage(text) {
  1290	    if (!text) return '';
  1291	    
  1292	    // Unified escaping using window.escapeHTML
  1293	    let formatted = window.escapeHTML ? window.escapeHTML(text) : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  1294	    
  1295	    // Advance Safe Linkification (Phase 6)
  1296	    formatted = window.safeLinkify ? window.safeLinkify(formatted) : formatted;
  1297	    
  1298	    // Process Shortcuts (ه1 etc) - Added to ensure they work in private chat
  1299	    if (window.replaceShortcuts) {
  1300	      formatted = window.replaceShortcuts(formatted);
  1301	    }
  1302	
  1303	    // Use the unified replacement logic from main.js (handles __SMILEY and __SHT)
  1304	    if (window.replacePlaceholders) {
  1305	      formatted = window.replacePlaceholders(formatted);
  1306	    } else {
  1307	      // Fallback for shortcut placeholders if replacePlaceholders is missing
  1308	      formatted = formatted.replace(/__SHT\|([^|]*)\|([\s\S]*?)__SHT/g, (match, key, val) => {
  1309	        return `<span class="shortcut-text" title="${key}">${val}</span>`;
  1310	      });
  1311	      formatted = formatted.replace(/__SMILEY\|(.*?)\|(.*?)\|(.*?)\|(.*?)\|(.*?)__/g, (match, url, width, height, name, type) => {
  1312	        const className = type === 'sticker' ? 'sticker-img' : 'smiley-img';
  1313	        const style = width && height ? `style="width: ${width}; height: ${height};"` : '';
  1314	        return `<img src="${url}" class="${className}" ${style} alt="" loading="lazy">`;
  1315	      });
  1316	    }
  1317	    
  1318	    return formatted;
  1319	  },
  1320	
  1321	  currentReply: null,
  1322	  lastPingSentTime: 0,
  1323	
  1324	  sendPing() {
  1325	    if (!this.activeChatUser || !this.socket) return;
  1326	    
  1327	    const now = Date.now();
  1328	    if (now - this.lastPingSentTime < 5000) {
  1329	      if (window.showToast) window.showToast('يرجى الانتظار قليلاً قبل إرسال تنبيه آخر', 'warning');
  1330	      return;
  1331	    }
  1332	    this.lastPingSentTime = now;
  1333	
  1334	    this.socket.emit('private_ping', {
  1335	      targetUsername: this.activeChatUser.username
  1336	    });
  1337	
  1338	    const conv = this.conversations.get(this.activeChatUser.username);
  1339	    if (conv) {
  1340	      const pingMsg = {
  1341	        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
  1342	        text: 'لقد قمت بإرسال تنبيه!',
  1343	        type: 'system',
  1344	        timestamp: new Date().toISOString(),
  1345	        isMine: true
  1346	      };
  1347	      conv.messages.push(pingMsg);
  1348	      this.appendMessage(pingMsg, conv);
  1349	    }
  1350	  },
  1351	
  1352	  setReply(msgId, msgText, msgUsername, msgType = 'text', msgFileUrl = null) {
  1353	    this.currentReply = { id: msgId, text: msgText, username: msgUsername, type: msgType, fileUrl: msgFileUrl };
  1354	    const preview = document.getElementById('private-chat-reply-preview');
  1355	    const nameEl = document.getElementById('private-chat-reply-name');
  1356	    const textEl = document.getElementById('private-chat-reply-text');
  1357	    const input = document.getElementById('private-chat-input');
  1358	    
  1359	    if (preview && nameEl && textEl) {
  1360	      nameEl.innerText = msgUsername;
  1361	      if (msgType === 'image') {
  1362	        textEl.innerHTML = `<img src="${msgFileUrl}" style="max-height: 40px; border-radius: 2px;">`;
  1363	      } else {
  1364	        textEl.innerText = msgText;
  1365	      }
  1366	      preview.classList.remove('d-none');
  1367	    }
  1368	    if (input) input.focus();
  1369	  },
  1370	
  1371	  cancelReply() {
  1372	    this.currentReply = null;
  1373	    const preview = document.getElementById('private-chat-reply-preview');
  1374	    if (preview) preview.classList.add('d-none');
  1375	  },
  1376	
  1377	  sendMessage() {
  1378	    if (!this.activeChatUser || !this.socket) return;
  1379	    
  1380	    const input = document.getElementById('private-chat-input');
  1381	    let text = input.value.trim();
  1382	    
  1383	    if (!text) return;
  1384	
  1385	    const msgId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  1386	
  1387	    this.socket.emit('private_message', {
  1388	      targetUsername: this.activeChatUser.username,
  1389	      message: {
  1390	        id: msgId,
  1391	        text: text,
  1392	        type: 'text',
  1393	        replyTo: this.currentReply
  1394	      }
  1395	    });
  1396	
  1397	    input.value = '';
  1398	    this.cancelReply();
  1399	    input.focus();
  1400	  },
  1401	
  1402	  editMessage(messageId) {
  1403	    if (!this.activeChatUser || !this.socket) return;
  1404	    
  1405	    const conv = this.conversations.get(this.activeChatUser.username);
  1406	    if (!conv) return;
  1407	    
  1408	    const message = conv.messages.find(m => String(m.id) === String(messageId));
  1409	    if (!message) {
  1410	      console.warn('Message not found for edit:', messageId);
  1411	      return;
  1412	    }
  1413	    
  1414	    const oldText = message.text;
  1415	
  1416	    Swal.fire({
  1417	      title: 'تعديل الرسالة',
  1418	      input: 'textarea',
  1419	      inputValue: oldText,
  1420	      showCancelButton: true,
  1421	      confirmButtonText: 'حفظ',
  1422	      cancelButtonText: 'إلغاء',
  1423	      inputValidator: (value) => {
  1424	        if (!value || value.trim() === '') {
  1425	          return 'لا يمكن أن تكون الرسالة فارغة!';
  1426	        }
  1427	      },
  1428	      didOpen: () => {
  1429	        const container = Swal.getContainer();
  1430	        if (container) container.style.zIndex = '3000';
  1431	      }
  1432	    }).then((result) => {
  1433	      if (result.isConfirmed) {
  1434	        let newText = result.value.trim();
  1435	        
  1436	        if (newText !== oldText) {
  1437	          this.socket.emit('private_message_edit', {
  1438	            targetUsername: this.activeChatUser.username,
  1439	            messageId: messageId,
  1440	            newText: newText
  1441	          });
  1442	          
  1443	          // Optimistic update
  1444	          message.text = newText;
  1445	          this.renderMessages();
  1446	        }
  1447	      }
  1448	    });
  1449	  },
  1450	
  1451	  deleteMessage(messageId) {
  1452	    if (!this.activeChatUser || !this.socket) return;
  1453	    
  1454	    this.socket.emit('private_message_delete', {
  1455	      targetUsername: this.activeChatUser.username,
  1456	      messageId: messageId
  1457	    });
  1458	    
  1459	    // Optimistic update
  1460	    const conv = this.conversations.get(this.activeChatUser.username);
  1461	    if (conv) {
  1462	      conv.messages = conv.messages.filter(m => String(m.id) !== String(messageId));
  1463	      this.renderMessages();
  1464	    }
  1465	  },
  1466	
  1467	  sendFile(file, type) {
  1468	    if (!this.activeChatUser || !this.socket) return;
  1469	    
  1470	    const formData = new FormData();
  1471	    formData.append('file', file);
  1472	    
  1473	    // Using existing upload endpoint
  1474	    fetch('/api/upload/pmfiles', {
  1475	      method: 'POST',
  1476	      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` },
  1477	      body: formData
  1478	    })
  1479	    .then(res => res.json())
  1480	    .then(data => {
  1481	      if (data.url) {
  1482	        this.socket.emit('private_message', {
  1483	          targetUsername: this.activeChatUser.username,
  1484	          message: {
  1485	            text: '',
  1486	            type: type,
  1487	            fileUrl: data.url
  1488	          }
  1489	        });
  1490	      }
  1491	    })
  1492	    .catch(err => {
  1493	      console.error('Error uploading file:', err);
  1494	      if (window.showToast) window.showToast('حدث خطأ أثناء رفع الملف', 'error');
  1495	    });
  1496	  },
  1497	
  1498	  scrollToBottom() {
  1499	    const container = document.getElementById('private-chat-messages');
  1500	    if (container) {
  1501	      container.scrollTop = container.scrollHeight;
  1502	    }
  1503	  },
  1504	
  1505	  renderChatWindowContainer() {
  1506	    if (document.getElementById('private-chat-window')) return;
  1507	
  1508	    const html = `
  1509	      <div id="private-chat-window" class="private-chat-window d-flex flex-column" style="display: none !important; border: 1px solid #333; overflow: hidden; border-radius: 2px;">
  1510	        <div class="private-chat-header d-flex justify-content-between align-items-stretch" id="private-chat-header" style="background: #333; color: #fff; cursor: move; height: 35px;">
  1511	          <div class="d-flex align-items-center">
  1512	            <div style="background: #555; padding: 0 8px; height: 100%; display: flex; align-items: center;">
  1513	              <i class="fas fa-user text-white"></i>
  1514	            </div>
  1515	            <img id="private-chat-avatar" src="https://placehold.co/100x100?text=Avatar" style="width: 35px; height: 35px; object-fit: cover; border-right: 1px solid #444; cursor: pointer;" onclick="window.PrivateChatManager.openActiveUserProfile()" referrerPolicy="origin-when-cross-origin">
  1516	            <span id="private-chat-name" class="fw-bold text-truncate ms-2" style="max-width: 150px; font-size: 0.9rem; margin-right: 10px;"></span>
  1517	          </div>
  1518	          <div class="d-flex align-items-stretch">
  1519	            <div id="private-chat-id" class="d-flex align-items-center px-2 fw-bold" style="font-size: 0.85rem;"></div>
  1520	            <button id="private-chat-maximize-btn" class="btn border-0 rounded-0 p-0 d-flex align-items-center justify-content-center" style="background: #2ecc71; color: white; width: 35px;" onclick="window.PrivateChatManager.toggleMaximize()" title="تكبير/تصغير">
  1521	              <i class="fas fa-expand"></i>
  1522	            </button>
  1523	            <button class="btn border-0 rounded-0 p-0 d-flex align-items-center justify-content-center" style="background: #e74c3c; color: white; width: 35px;" onclick="window.PrivateChatManager.closeChat()" title="إغلاق">
  1524	              <i class="fas fa-times"></i>
  1525	            </button>
  1526	          </div>
  1527	        </div>
  1528	        
  1529	        <div id="private-chat-call-slot" style="position: absolute; top: 35px; left: 0; right: 0; z-index: 1000; pointer-events: none;"></div>
  1530	        
  1531	        <div id="private-chat-messages" class="private-chat-messages flex-grow-1 p-0 overflow-auto" style="background: #fff; direction: ltr; overflow-x: hidden; overflow-y: auto;">
  1532	          <div id="private-chat-messages-inner" style="direction: rtl;">
  1533	            <!-- Messages will be rendered here -->
  1534	          </div>
  1535	        </div>
  1536	        
  1537	        <div id="upload-preview-container" class="d-none bg-light border-top p-2" style="position: relative;">
  1538	          <div class="d-flex align-items-center gap-2">
  1539	            <div id="upload-preview-content" style="width: 60px; height: 60px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center;"></div>
  1540	            <div class="flex-grow-1">
  1541	              <div class="progress" id="upload-progress-container" style="height: 20px; position: relative;">
  1542	                <div class="progress-bar" id="upload-progress-bar" role="progressbar" style="width: 0%;">0%</div>
  1543	              </div>
  1544	            </div>
  1545	            <button class="btn btn-sm btn-outline-danger" onclick="window.PrivateChatManager.cancelUpload()">إلغاء</button>
  1546	            <button class="btn btn-sm btn-primary" id="send-file-btn">إرسال</button>
  1547	          </div>
  1548	        </div>
  1549	        
  1550	        <div id="private-chat-reply-preview" class="d-none bg-light border-top p-2" style="position: relative; border-right: 3px solid #3498db;">
  1551	          <div class="d-flex justify-content-between align-items-center">
  1552	            <small class="fw-bold text-primary" id="private-chat-reply-name"></small>
  1553	            <button class="btn-close btn-sm" onclick="window.PrivateChatManager.cancelReply()" style="font-size: 0.6rem;"></button>
  1554	          </div>
  1555	          <div class="text-truncate text-muted small mt-1" id="private-chat-reply-text"></div>
  1556	        </div>
  1557	        
  1558	        <div class="private-chat-input-area p-1 border-top d-flex align-items-center gap-1">
  1559	          <button class="btn btn-light btn-sm border" onclick="window.PrivateChatManager.sendPing()" title="إرسال تنبيه (Ping)">
  1560	            <i class="fas fa-bell text-warning"></i>
  1561	          </button>
  1562	          
  1563	          <button id="private-call-btn" class="btn btn-sm border" style="background: #5cb85c; color: #fff;" onclick="window.PrivateCallManager.startCall(window.PrivateChatManager.activeChatUser.userId || window.PrivateChatManager.activeChatUser.id)" title="اتصال صوتي">
  1564	            <i class="fas fa-phone"></i>
  1565	          </button>
  1566	
  1567	          <button id="private-mic-btn" class="btn btn-sm border" style="background: #5cb85c; color: #fff;" onclick="window.PrivateChatManager.toggleRecording()" title="تسجيل صوت">
  1568	            <i class="fas fa-microphone"></i>
  1569	          </button>
  1570	
  1571	          <button class="btn btn-light btn-sm border" onclick="document.getElementById('private-file-input').click()" title="إرفاق ملف/صورة">
  1572	            <i class="fas fa-paperclip text-muted"></i>
  1573	          </button>
  1574	
  1575	          <input type="file" id="private-file-input" class="d-none" accept="image/*,video/*,.mov,.MOV,.pdf,.doc,.docx,.zip" onchange="window.PrivateChatManager.handleFileUpload(event)">
  1576	          <button class="btn btn-sm" style="padding: 5px; width: 34px; background: transparent !important; border: none !important; outline: none !important; box-shadow: none !important;" onclick="window.toggleEmojiPicker(document.getElementById('private-chat-input'))" title="إيموجي">
  1577	            <img src="/emoii.gif" style="width: 34px; padding: 5px;" alt="emoji">
  1578	          </button>
  1579	          <div id="private-recording-overlay" class="d-none flex-grow-1 align-items-center justify-content-between px-2 bg-white rounded" style="height: 31px; border: 1px solid #ced4da;">
  1580	            <div class="d-flex align-items-center">
  1581	              <span class="recording-dot me-2"></span>
  1582	              <span id="private-recording-timer" class="small fw-bold">0:00</span>
  1583	            </div>
  1584	            <div class="d-flex gap-2">
  1585	              <button class="btn btn-link btn-sm text-danger p-0" onclick="window.PrivateChatManager.cancelRecording()">إلغاء</button>
  1586	              <button class="btn btn-link btn-sm text-success p-0 fw-bold" onclick="window.PrivateChatManager.stopRecording()">إرسال</button>
  1587	            </div>
  1588	          </div>
  1589	          <textarea id="private-chat-input" class="form-control form-control-sm chat-input-field" placeholder="اكتب رسالة..." dir="rtl" rows="1" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="${window.state?.limits?.private || 500}"></textarea>
  1590	          <button class="btn btn-secondary btn-sm" onclick="window.PrivateChatManager.sendMessage()">
  1591	            <i class="fas fa-paper-plane"></i>
  1592	          </button>
  1593	        </div>
  1594	      </div>
  1595	    `;
  1596	
  1597	    document.body.insertAdjacentHTML('beforeend', html);
  1598	    
  1599	    // Add styles
  1600	    const style = document.createElement('style');
  1601	    style.innerHTML = `
  1602	      @keyframes nudge-shake {
  1603	        0%, 100% { transform: translateX(0); }
  1604	        10%, 30%, 50%, 70%, 90% { transform: translateX(-10px) rotate(-1deg); }
  1605	        20%, 40%, 60%, 80% { transform: translateX(10px) rotate(1deg); }
  1606	      }
  1607	      .chat-nudge {
  1608	        animation: nudge-shake 0.5s ease-in-out;
  1609	      }
  1610	      .private-chat-window {
  1611	        position: absolute;
  1612	        top: 1px;
  1613	        bottom: 46%;
  1614	        width: 99.8%;
  1615	        min-height: 190px;
  1616	        max-height: 500px;
  1617	        max-width: 500px;
  1618	        border-radius: 2px;
  1619	        background: #f5f5f5;
  1620	        border: 1px solid #ccc;
  1621	        z-index: 1150 !important;
  1622	        box-shadow: 2px 2px 10px rgba(0,0,0,0.1);
  1623	        display: flex;
  1624	        flex-direction: column;
  1625	      }
  1626	      
  1627	      @media (max-width: 767px) {
  1628	        .private-chat-window {
  1629	          bottom: 65% !important;
  1630	        }
  1631	        .private-chat-window.maximized {
  1632	          top: 0 !important;
  1633	          bottom: 0 !important;
  1634	          left: 0 !important;
  1635	          width: 100% !important;
  1636	          height: 100% !important;
  1637	          max-width: none !important;
  1638	          max-height: none !important;
  1639	          border-radius: 0;
  1640	          z-index: 1150 !important;
  1641	          transform: none !important;
  1642	          transition: none !important;
  1643	        }
  1644	      }
  1645	      
  1646	      .private-chat-window.maximized {
  1647	        top: 55px !important;
  1648	        left: 0 !important;
  1649	        width: 100% !important;
  1650	        height: calc(100% - 95px) !important;
  1651	        max-width: none !important;
  1652	        max-height: none !important;
  1653	        bottom: 38px !important;
  1654	        border-radius: 0;
  1655	        z-index: 1150 !important;
  1656	        transform: none !important;
  1657	        transition: none !important;
  1658	      }
  1659	      
  1660	      .private-msg-typing {
  1661	        font-size: 1.2rem;
  1662	        font-weight: bold;
  1663	        color: #666;
  1664	      }
  1665	
  1666	      .private-chat-messages::-webkit-scrollbar {
  1667	        width: 6px !important;
  1668	        display: block !important;
  1669	      }
  1670	      .private-chat-messages::-webkit-scrollbar-track {
  1671	        background: rgba(0, 0, 0, 0.05) !important;
  1672	      }
  1673	      .private-chat-messages::-webkit-scrollbar-thumb {
  1674	        background-color: rgba(0, 0, 0, 0.2) !important;
  1675	        border-radius: 4px !important;
  1676	      }
  1677	      .private-chat-messages::-webkit-scrollbar-thumb:hover {
  1678	        background-color: rgba(0, 0, 0, 0.4) !important;
  1679	      }
  1680	      
  1681	      .recording-pulse {
  1682	        animation: pulse-red 1.5s infinite;
  1683	      }
  1684	      @keyframes pulse-red {
  1685	        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.7); }
  1686	        70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(231, 76, 60, 0); }
  1687	        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(231, 76, 60, 0); }
  1688	      }
  1689	      .recording-dot {
  1690	        width: 10px;
  1691	        height: 10px;
  1692	        background: #e74c3c;
  1693	        border-radius: 50%;
  1694	        display: inline-block;
  1695	        animation: blink 1s infinite;
  1696	      }
  1697	      @keyframes blink {
  1698	        0%, 100% { opacity: 1; }
  1699	        50% { opacity: 0.3; }
  1700	      }
  1701	      
  1702	      @media (max-width: 768px) {
  1703	        .private-chat-window {
  1704	          left: 0;
  1705	          width: 100%;
  1706	          height: calc(100% - 50%);
  1707	          max-height: none;
  1708	          max-width: none;
  1709	          border-radius: 0;
  1710	          border: none;
  1711	          bottom: 38px;
  1712	        }
  1713	      }
  1714	    `;
  1715	    document.head.appendChild(style);
  1716	  },
  1717	
  1718	  handleFileUpload(event) {
  1719	    if (!this.activeChatUser) return;
  1720	    if (!sessionStorage.getItem('token')) {
  1721	      if (window.showToast) window.showToast('انتهت الجلسة، يرجى تسجيل الدخول مجدداً', 'error');
  1722	      else alert('انتهت الجلسة، يرجى تسجيل الدخول مجدداً');
  1723	      return;
  1724	    }
  1725	
  1726	    const file = event.target.files[0];
  1727	    if (!file) return;
  1728	
  1729	    if (file.size > 50 * 1024 * 1024) {
  1730	      if (window.showToast) window.showToast('حجم الملف أكبر من الحد المسموح (50MB)', 'error');
  1731	      else alert('حجم الملف أكبر من الحد المسموح (50MB)');
  1732	      event.target.value = '';
  1733	      return;
  1734	    }
  1735	    
  1736	    let type = 'file';
  1737	    if (file.type.startsWith('image/')) type = 'image';
  1738	    else if (file.type.startsWith('video/') || file.type === 'video/quicktime' || file.name.toLowerCase().endsWith('.mov')) type = 'video';
  1739	    
  1740	    this.showUploadPreview(file, type);
  1741	    event.target.value = ''; // Reset
  1742	  },
  1743	
  1744	  showUploadPreview(file, type) {
  1745	    const previewUrl = URL.createObjectURL(file);
  1746	    const previewContent = document.getElementById('upload-preview-content');
  1747	    previewContent.innerHTML = type === 'image' ? `<img src="${previewUrl}" class="img-fluid" style="max-height: 50px;">` : 
  1748	                                type === 'video' ? `<video src="${previewUrl}" class="img-fluid" style="max-height: 50px;"></video>` :
  1749	                                `<i class="fas fa-file mb-1 d-block fa-2x"></i> <small>${escapeHTML(file.name)}</small>`;
  1750	    
  1751	    document.getElementById('upload-preview-container').classList.remove('d-none');
  1752	    document.getElementById('upload-progress-container').classList.add('d-none');
  1753	    
  1754	    const sendBtn = document.getElementById('send-file-btn');
  1755	    sendBtn.disabled = false;
  1756	
  1757	    sendBtn.onclick = () => {
  1758	      sendBtn.disabled = true;
  1759	      document.getElementById('upload-progress-container').classList.remove('d-none');
  1760	      this.uploadFileWithProgress(file, (progress) => {
  1761	        const bar = document.getElementById('upload-progress-bar');
  1762	        bar.style.width = progress + '%';
  1763	        bar.innerText = progress + '%';
  1764	      }, (url, data) => {
  1765	        // Success
  1766	        sendBtn.disabled = false;
  1767	        document.getElementById('upload-preview-container').classList.add('d-none');
  1768	        
  1769	        let finalType = 'file';
  1770	        if (data.mimetype) {
  1771	          if (data.mimetype.startsWith('image/')) finalType = 'image';
  1772	          else if (data.mimetype.startsWith('video/') || data.mimetype === 'video/quicktime' || (url && url.toLowerCase().endsWith('.mov'))) finalType = 'video';
  1773	        }
  1774	
  1775	        let textContent = '';
  1776	        const input = document.getElementById('private-chat-input');
  1777	        if (input && input.value) {
  1778	          textContent = input.value.trim();
  1779	          input.value = '';
  1780	        }
  1781	
  1782	        this.socket.emit('private_message', {
  1783	          targetUsername: this.activeChatUser.username,
  1784	          message: { text: textContent, type: finalType, fileUrl: url }
  1785	        });
  1786	        URL.revokeObjectURL(previewUrl);
  1787	      }, (errorMsg) => {
  1788	        // Error
  1789	        sendBtn.disabled = false;
  1790	        document.getElementById('upload-progress-container').classList.add('d-none');
  1791	        if (window.showToast) window.showToast(errorMsg, 'error');
  1792	        else alert(errorMsg);
  1793	      });
  1794	    };
  1795	  },
  1796	
  1797	  cancelUpload() {
  1798	    document.getElementById('upload-preview-container').classList.add('d-none');
  1799	    const sendBtn = document.getElementById('send-file-btn');
  1800	    if (sendBtn) sendBtn.disabled = false;
  1801	  },
  1802	
  1803	  uploadFileWithProgress(file, onProgress, onComplete, onError) {
  1804	    const formData = new FormData();
  1805	    formData.append('file', file);
  1806	    
  1807	    const xhr = new XMLHttpRequest();
  1808	    xhr.open('POST', '/api/upload/pmfiles', true);
  1809	    xhr.setRequestHeader('Authorization', `Bearer ${sessionStorage.getItem('token')}`);
  1810	    xhr.timeout = 120000; // 2 minutes timeout
  1811	    
  1812	    xhr.upload.onprogress = (e) => {
  1813	      if (e.lengthComputable) {
  1814	        const progress = Math.round((e.loaded / e.total) * 100);
  1815	        onProgress(progress);
  1816	      }
  1817	    };
  1818	    
  1819	    xhr.onload = () => {
  1820	      let data = {};
  1821	      try {
  1822	        data = JSON.parse(xhr.responseText || '{}');
  1823	      } catch (e) {}
  1824	
  1825	      if (xhr.status >= 200 && xhr.status < 300 && data.url) {
  1826	        onComplete(data.url, data);
  1827	      } else {
  1828	        const msg = data.message || 'تعذر رفع الملف، حاول مرة أخرى';
  1829	        if (typeof onError === 'function') onError(msg);
  1830	      }
  1831	    };
  1832	
  1833	    xhr.onerror = () => {
  1834	      if (typeof onError === 'function') onError('فشل الاتصال بالخادم، يرجى التحقق من اتصالك');
  1835	    };
  1836	
  1837	    xhr.ontimeout = () => {
  1838	      if (typeof onError === 'function') onError('انتهى وقت الاتصال (Timeout) أثناء رفع الملف');
  1839	    };
  1840	    
  1841	    xhr.send(formData);
  1842	  },
  1843	
  1844	  openActiveUserProfile() {
  1845	    if (this.activeChatUser && window.showUserProfile) {
  1846	      window.showUserProfile(this.activeChatUser.username);
  1847	    }
  1848	  },
  1849	
  1850	  sendPrivateSticker(arg1, arg2) {
  1851	    if (!this.socket || !this.activeChatUser) return;
  1852	    
  1853	    // Handle both signatures: (id, shortcut) or (shortcut) or (msgObj)
  1854	    let text = "";
  1855	    if (arg2 && typeof arg2 === 'string') {
  1856	        text = arg2;
  1857	    } else if (typeof arg1 === 'string') {
  1858	        text = arg1;
  1859	    } else if (arg1 && arg1.text) {
  1860	        text = arg1.text;
  1861	    }
  1862	
  1863	    if (!text) return;
  1864	
  1865	    this.socket.emit('private_message', {
  1866	      targetUsername: this.activeChatUser.username,
  1867	      message: {
  1868	        text: text,
  1869	        type: 'text',
  1870	        isSticker: true
  1871	      }
  1872	    });
  1873	  },
  1874	
  1875	  makeDraggable() {
  1876	    const dragItem = document.getElementById('private-chat-window');
  1877	    const dragHeader = document.getElementById('private-chat-header');
  1878	    
  1879	    if (!dragItem || !dragHeader) return;
  1880	
  1881	    let active = false;
  1882	    let currentX;
  1883	    let currentY;
  1884	    let initialX;
  1885	    let initialY;
  1886	    let xOffset = 0;
  1887	    let yOffset = 0;
  1888	
  1889	    const dragStart = (e) => {
  1890	      if (window.innerWidth <= 768 || this.isMaximized) return; // Don't drag on mobile or when maximized
  1891	      
  1892	      if (e.type === "touchstart") {
  1893	        initialX = e.touches[0].clientX - xOffset;
  1894	        initialY = e.touches[0].clientY - yOffset;
  1895	      } else {
  1896	        initialX = e.clientX - xOffset;
  1897	        initialY = e.clientY - yOffset;
  1898	      }
  1899	
  1900	      if (e.target === dragHeader || dragHeader.contains(e.target)) {
  1901	        active = true;
  1902	      }
  1903	    };
  1904	
  1905	    const dragEnd = () => {
  1906	      initialX = currentX;
  1907	      initialY = currentY;
  1908	      active = false;
  1909	    };
  1910	
  1911	    const drag = (e) => {
  1912	      if (active) {
  1913	        e.preventDefault();
  1914	        
  1915	        if (e.type === "touchmove") {
  1916	          currentX = e.touches[0].clientX - initialX;
  1917	          currentY = e.touches[0].clientY - initialY;
  1918	        } else {
  1919	          currentX = e.clientX - initialX;
  1920	          currentY = e.clientY - initialY;
  1921	        }
  1922	
  1923	        xOffset = currentX;
  1924	        yOffset = currentY;
  1925	
  1926	        setTranslate(currentX, currentY, dragItem);
  1927	      }
  1928	    };
  1929	
  1930	    const setTranslate = (xPos, yPos, el) => {
  1931	      el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  1932	    };
  1933	
  1934	    dragHeader.addEventListener("touchstart", dragStart, false);
  1935	    dragHeader.addEventListener("touchend", dragEnd, false);
  1936	    dragHeader.addEventListener("touchmove", drag, false);
  1937	
  1938	    dragHeader.addEventListener("mousedown", dragStart, false);
  1939	    document.addEventListener("mouseup", dragEnd, false);
  1940	    document.addEventListener("mousemove", drag, false);
  1941	  }
  1942	};
  1943	
  1944	window.PrivateChatManager = PrivateChatManager;
  1945	