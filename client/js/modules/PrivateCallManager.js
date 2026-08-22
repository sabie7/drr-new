     1	export const PrivateCallManager = {
     2	  peerConnection: null,
     3	  localStream: null,
     4	  remoteAudio: null,
     5	  callId: null,
     6	  isMuted: false,
     7	  isSpeakerMuted: false,
     8	  callPanel: null,
     9	  timerInterval: null,
    10	  incomingCaller: null,
    11	  currentState: null,
    12	  currentStatus: null,
    13	  currentCallUserId: null,
    14	  pendingIceCandidates: [],
    15	  iceServers: [
    16	    { urls: "stun:stun.l.google.com:19302" },
    17	    { urls: "stun:stun1.l.google.com:19302" },
    18	    { urls: "stun:stun2.l.google.com:19302" },
    19	    { urls: "stun:stun3.l.google.com:19302" },
    20	    { urls: "stun:stun4.l.google.com:19302" },
    21	    { urls: "stun:stun.chat-host.net:5349" },
    22	    { urls: "stun:stun.chat-host.net" },
    23	    { urls: ["turn:eu-0.turn.peerjs.com:3478","turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
    24	    { urls: ["turn:turn.chat-host.net:5349?transport=udp","turn:turn.chat-host.net:5349?transport=tcp","turns:turn.chat-host.net:5349?transport=tcp","turn:turn.chat-host.net:443?transport=udp","turn:turn.chat-host.net:443?transport=tcp","turns:turn.chat-host.net:443?transport=tcp"], username: "gN3yO0cF0uM6mQ2yU4tY3lR9vQ3qA9uA", credential: "fE7lY5-oR5tU0-fE5qY1-oE1oL5-pA5pU0" },
    25	    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelaypassword" },
    26	    { urls: "stun:fr-turn3.xirsys.com" },
    27	    { urls: ["turn:fr-turn3.xirsys.com:80?transport=udp","turn:fr-turn3.xirsys.com:3478?transport=udp","turn:fr-turn3.xirsys.com:80?transport=tcp","turn:fr-turn3.xirsys.com:3478?transport=tcp","turns:fr-turn3.xirsys.com:443?transport=tcp","turns:fr-turn3.xirsys.com:5349?transport=tcp"], username: "tXzcEcDOut6ZNSuKQqTRWklYZwYrMJN0JQK2kly4cJmPews5xLNVT1b3WTleKKByAAAAAGV0k3NtYWhkb3VzaA==", credential: "a90a77d6-96ae-11ee-94a6-0242ac120004" },
    28	    { urls: "stun:stun.relay.metered.ca:80" },
    29	    { urls: "turn:a.relay.metered.ca:80", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    30	    { urls: "turn:a.relay.metered.ca:80?transport=tcp", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    31	    { urls: "turn:a.relay.metered.ca:443", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    32	    { urls: "turn:a.relay.metered.ca:443?transport=tcp", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" }
    33	  ],
    34	  ringtone: new Audio('https://actions.google.com/sounds/v1/alarms/phone_ringing.ogg'), // صوت رنين افتراضي
    35	
    36	  escapeHtml(str) {
    37	    if (!str) return '';
    38	    if (window.escapeHTML) return window.escapeHTML(str);
    39	    return str
    40	      .replace(/&/g, "&amp;")
    41	      .replace(/</g, "&lt;")
    42	      .replace(/>/g, "&gt;")
    43	      .replace(/"/g, "&quot;")
    44	      .replace(/'/g, "&#039;");
    45	  },
    46	
    47	  async startCall(targetUserId) {
    48	    try {
    49	      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    50	      this.currentCallUserId = targetUserId;
    51	      window.socket.emit('pmcall:invite', { targetUserId });
    52	      this.ringtone.loop = true;
    53	      this.ringtone.play().catch(e => console.warn('Autoplay prevented by browser', e));
    54	      this.showCallPanel('calling', 'جارٍ الاتصال...');
    55	    } catch (err) {
    56	      if (window.Swal) Swal.fire('خطأ', 'تعذر الوصول للميكروفون', 'error');
    57	    }
    58	  },
    59	
    60	  async acceptCall(callId) {
    61	    try {
    62	      this.stopRingtone();
    63	      this.callId = callId;
    64	      this.pendingIceCandidates = [];
    65	      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    66	      
    67	      // جهز peerConnection أولاً قبل إرسال القبول للتأكد من الجاهزية الكاملة واستقبال الـ Signals فوراً
    68	      await this.initPeerConnection(callId, false);
    69	      
    70	      window.socket.emit('pmcall:accept', { callId });
    71	      this.showCallPanel('active', 'متصل');
    72	    } catch (err) {
    73	      console.warn('[PrivateCall] acceptCall failed:', err);
    74	      this.hangup('فشل بدء الاتصال');
    75	    }
    76	  },
    77	
    78	  async initPeerConnection(callId, isCaller) {
    79	    this.callId = callId;
    80	    this.pendingIceCandidates = [];
    81	    const servers = (window.CameraIceServers && Array.isArray(window.CameraIceServers)) ? window.CameraIceServers : this.iceServers;
    82	    this.peerConnection = new RTCPeerConnection({ iceServers: servers });
    83	    
    84	    this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track, this.localStream));
    85	    
    86	    this.peerConnection.onicecandidate = (event) => {
    87	      if (event.candidate && this.callId === callId) {
    88	        window.socket.emit('pmcall:signal', { callId, signal: { candidate: event.candidate } });
    89	      }
    90	    };
    91	    
    92	    this.peerConnection.ontrack = (event) => {
    93	      if (!this.remoteAudio) {
    94	        this.remoteAudio = new Audio();
    95	      }
    96	      this.remoteAudio.autoplay = true;
    97	      this.remoteAudio.playsInline = true;
    98	      this.remoteAudio.srcObject = event.streams[0];
    99	      this.remoteAudio.play()
   100	        .then(() => console.log('[PrivateCall] Audio playback started.'))
   101	        .catch(e => console.warn('[PrivateCall] Remote video audio playback prevented', e));
   102	
   103	      this.startTimer();
   104	      this.showCallPanel('active', 'متصل');
   105	    };
   106	    
   107	    if (isCaller) {
   108	      const offer = await this.peerConnection.createOffer();
   109	      await this.peerConnection.setLocalDescription(offer);
   110	      window.socket.emit('pmcall:signal', { callId, signal: { offer } });
   111	    }
   112	  },
   113	
   114	  async handleSignal(data) {
   115	    const { signal, callId } = data;
   116	    // تجاهل أي signal لا يخص callId الحالي
   117	    if (!this.callId || String(callId || data.callId) !== String(this.callId)) {
   118	      return;
   119	    }
   120	    if (!this.peerConnection) {
   121	      console.warn('[PrivateCall] Signal received but peerConnection is not initialized.');
   122	      return;
   123	    }
   124	
   125	    try {
   126	      if (signal.offer) {
   127	        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
   128	        const answer = await this.peerConnection.createAnswer();
   129	        await this.peerConnection.setLocalDescription(answer);
   130	        window.socket.emit('pmcall:signal', { callId: this.callId, signal: { answer } });
   131	        await this.processPendingIceCandidates();
   132	      } else if (signal.answer) {
   133	        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
   134	        await this.processPendingIceCandidates();
   135	      } else if (signal.candidate) {
   136	        const candy = new RTCIceCandidate(signal.candidate);
   137	        if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
   138	          await this.peerConnection.addIceCandidate(candy);
   139	        } else {
   140	          this.pendingIceCandidates.push(candy);
   141	        }
   142	      }
   143	    } catch (err) {
   144	      console.warn('[PrivateCall] Error handling signal:', err);
   145	    }
   146	  },
   147	
   148	  async processPendingIceCandidates() {
   149	    if (this.pendingIceCandidates && this.pendingIceCandidates.length > 0) {
   150	      for (const candy of this.pendingIceCandidates) {
   151	        try {
   152	          await this.peerConnection.addIceCandidate(candy);
   153	        } catch (e) {
   154	          console.warn('[PrivateCall] Error adding buffered ICE candidate:', e);
   155	        }
   156	      }
   157	      this.pendingIceCandidates = [];
   158	    }
   159	  },
   160	
   161	  init(socket) {
   162	    if (window.domainConfig && window.domainConfig.privateCallRingtoneUrl) {
   163	      this.ringtone.src = window.domainConfig.privateCallRingtoneUrl;
   164	    }
   165	    this.ringtone.loop = true; // جعل الرنين مستمراً
   166	
   167	    socket.on('pmcall:incoming', (data) => {
   168	      this.callId = data.callId;
   169	      this.incomingCaller = data.caller;
   170	      this.currentCallUserId = data.caller.userId || data.caller.id;
   171	      
   172	      // Auto-open chat to ensure chat workspace and slot are loaded & active
   173	      if (window.PrivateChatManager) {
   174	        window.PrivateChatManager.openChat(data.caller);
   175	      }
   176	
   177	      // تشغيل صوت الرنين
   178	      this.ringtone.play().catch(e => console.warn('Autoplay prevented by browser', e));
   179	
   180	      this.showCallPanel('incoming', 'مكالمة واردة');
   181	    });
   182	    
   183	    socket.on('pmcall:state', (data) => {
   184	      if (data.callId) {
   185	        this.callId = data.callId;
   186	      }
   187	      if (data.status === 'ringing') {
   188	        this.showCallPanel('calling', 'يرن الآن...');
   189	      }
   190	    });
   191	
   192	    socket.on('pmcall:accept', (data) => {
   193	      this.stopRingtone();
   194	      this.startTimer();
   195	      this.initPeerConnection(data.callId, true);
   196	    });
   197	
   198	    socket.on('pmcall:signal', (data) => this.handleSignal(data));
   199	
   200	    socket.on('pmcall:hangup', (data) => {
   201	      const reason = data && data.reason;
   202	      let statusMsg = 'انتهت المكالمة';
   203	      if (reason === 'rejected') {
   204	        statusMsg = 'تم رفض المكالمة';
   205	      } else if (reason === 'disconnected') {
   206	        statusMsg = 'انقطع الاتصال';
   207	      }
   208	      this.hangup(statusMsg, false); // false يعني لا ترسل pmcall:hangup للسيرفر مرة أخرى
   209	    });
   210	
   211	    socket.on('pmcall:busy', () => this.hangup('مشغول', false));
   212	    socket.on('pmcall:error', (data) => this.hangup(data.message || 'خطأ في الاتصال', false));
   213	  },
   214	
   215	  startTimer() {
   216	    if (this.timerInterval) clearInterval(this.timerInterval);
   217	    let seconds = 0;
   218	    this.timerInterval = setInterval(() => {
   219	      seconds++;
   220	      const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
   221	      const secs = (seconds % 60).toString().padStart(2, '0');
   222	      const timerEl = document.getElementById('call-timer');
   223	      if (timerEl) timerEl.innerText = `${mins}:${secs}`;
   224	    }, 1000);
   225	  },
   226	
   227	  showCallPanel(state, status) {
   228	    this.currentState = state;
   229	    this.currentStatus = status;
   230	
   231	    const activeUser = window.PrivateChatManager?.activeChatUser;
   232	    const activeUserId = activeUser ? (activeUser.userId || activeUser.id) : null;
   233	    
   234	    let chatContainer = null;
   235	    let isGlobalFloating = false;
   236	
   237	    // Check if we should mount inside the opened private chat, or floating globally
   238	    if (activeUser && this.currentCallUserId && String(activeUserId) === String(this.currentCallUserId)) {
   239	      chatContainer = document.getElementById('private-chat-call-slot');
   240	    }
   241	
   242	    if (!chatContainer) {
   243	      // Mount floating globally
   244	      let bodySlot = document.getElementById('global-call-slot');
   245	      if (!bodySlot) {
   246	        bodySlot = document.createElement('div');
   247	        bodySlot.id = 'global-call-slot';
   248	        bodySlot.style.cssText = 'position: fixed; top: 75px; left: 50%; transform: translateX(-50%); z-index: 99999; pointer-events: auto;';
   249	        document.body.appendChild(bodySlot);
   250	      }
   251	      chatContainer = bodySlot;
   252	      isGlobalFloating = true;
   253	    } else {
   254	      // Remove global call panel if moving to slot
   255	      const globalPanel = document.getElementById('global-call-slot');
   256	      if (globalPanel) {
   257	        globalPanel.innerHTML = '';
   258	      }
   259	    }
   260	
   261	    if (!this.callPanel) {
   262	      this.callPanel = document.createElement('div');
   263	      this.callPanel.className = 'call-panel';
   264	      this.callPanel.style.pointerEvents = 'auto';
   265	      this.makeDraggable(this.callPanel);
   266	    }
   267	
   268	    // Adjust calling panel style if global floating vs slot
   269	    if (isGlobalFloating) {
   270	      this.callPanel.style.position = 'relative';
   271	      this.callPanel.style.margin = '0 auto';
   272	      this.callPanel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
   273	      this.callPanel.style.borderRadius = '10px';
   274	      this.callPanel.style.border = '1px solid #444';
   275	      this.callPanel.style.background = '#222';
   276	      this.callPanel.style.color = '#fff';
   277	      this.callPanel.style.width = '280px';
   278	    } else {
   279	      // Reset styles
   280	      this.callPanel.style.position = '';
   281	      this.callPanel.style.margin = '';
   282	      this.callPanel.style.boxShadow = '';
   283	      this.callPanel.style.borderRadius = '';
   284	      this.callPanel.style.border = '';
   285	      this.callPanel.style.background = '';
   286	      this.callPanel.style.color = '';
   287	      this.callPanel.style.width = '';
   288	    }
   289	
   290	    // Attach to selected container
   291	    if (this.callPanel.parentElement !== chatContainer) {
   292	      chatContainer.innerHTML = '';
   293	      chatContainer.appendChild(this.callPanel);
   294	    }
   295	
   296	    const isRinging = state === 'calling' || state === 'incoming';
   297	    const isActive = state === 'active';
   298	    
   299	    // Choose which user metadata to show
   300	    const user = (state === 'incoming' && this.incomingCaller) 
   301	      ? this.incomingCaller 
   302	      : (activeUser && String(activeUserId) === String(this.currentCallUserId) ? activeUser : { username: 'مكالمة غامضة', pic: null });
   303	
   304	    const pic = (window.getAvatarUrl ? window.getAvatarUrl(user) : user.pic) || 'https://placehold.co/100x100?text=User';
   305	    
   306	    let iconHtml = user.icon ? `<img src="${user.icon}" style="width:18px;height:18px;margin-left:5px;vertical-align:middle;">` : '';
   307	    let nameHtml = this.escapeHtml(user.topic || user.username || 'مستخدم');
   308	    let finalNameHtml = `${iconHtml}<span>${nameHtml}</span>`;
   309	
   310	    this.callPanel.innerHTML = `
   311	      <div class="call-avatar-wrapper ${isActive ? 'active-call-waves' : ''}">
   312	        <img src="${pic}" class="call-avatar ${isRinging ? 'ringing' : ''}">
   313	      </div>
   314	      <div class="call-info">
   315	        <div class="call-name">${finalNameHtml}</div>
   316	        <div class="call-status">${this.escapeHtml(status)} ${state === 'active' ? '<span id="call-timer" class="call-timer">00:00</span>' : ''}</div>
   317	      </div>
   318	      <div class="call-controls">
   319	        ${state === 'incoming' ? `
   320	          <button id="call-reject-btn" class="btn btn-call-sm btn-reject"><i class="fas fa-phone-slash"></i></button>
   321	          <button id="call-accept-btn" class="btn btn-call-sm btn-accept"><i class="fas fa-phone"></i></button>
   322	        ` : state === 'active' ? `
   323	          <button id="call-mute-btn" class="btn btn-call-sm" style="background-color: #28a745;"><i class="fas fa-microphone"></i></button>
   324	          <button id="call-speaker-btn" class="btn btn-call-sm" style="background-color: #28a745;"><i class="fas fa-volume-up"></i></button>
   325	          <button id="call-end-btn" class="btn btn-call-sm btn-reject"><i class="fas fa-phone-slash"></i></button>
   326	        ` : `
   327	          <button id="call-end-btn" class="btn btn-call-sm btn-reject"><i class="fas fa-phone-slash"></i></button>
   328	        `}
   329	      </div>
   330	    `;
   331	
   332	    if (state === 'incoming') {
   333	      document.getElementById('call-accept-btn').onclick = (e) => { e.stopPropagation(); this.acceptCall(this.callId); };
   334	      document.getElementById('call-reject-btn').onclick = (e) => { e.stopPropagation(); this.hangup('تم الرفض', true, 'rejected'); };
   335	    } else if (state === 'active') {
   336	      document.getElementById('call-end-btn').onclick = (e) => { e.stopPropagation(); this.hangup('تم الإنهاء', true, 'ended'); };
   337	      document.getElementById('call-mute-btn').onclick = (e) => { e.stopPropagation(); this.toggleMute(); };
   338	      document.getElementById('call-speaker-btn').onclick = (e) => { e.stopPropagation(); this.toggleSpeakerMute(); };
   339	    } else {
   340	      document.getElementById('call-end-btn').onclick = (e) => { e.stopPropagation(); this.hangup('تم الإلغاء', true, 'canceled'); };
   341	    }
   342	  },
   343	
   344	  renderCurrentCall() {
   345	    if (this.callId && this.currentState) {
   346	      this.showCallPanel(this.currentState, this.currentStatus);
   347	    }
   348	  },
   349	
   350	  makeDraggable(el) {
   351	    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
   352	
   353	    const dragStart = (e) => {
   354	      // لا تبدأ السحب إذا كان المستخدم يضغط على الأزرار أو الأيقونات أو عناصر التحكم
   355	      const targetTag = e.target.tagName.toLowerCase();
   356	      if (targetTag === 'button' || targetTag === 'i' || e.target.closest('button')) {
   357	        return;
   358	      }
   359	      
   360	      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
   361	      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
   362	      pos3 = clientX; pos4 = clientY;
   363	      
   364	      document.onmouseup = document.ontouchend = dragEnd;
   365	      document.onmousemove = document.ontouchmove = dragMove;
   366	    };
   367	
   368	    const dragMove = (e) => {
   369	      if (e.cancelable) e.preventDefault(); // منع التمرير الافتراضي فقط أثناء عملية السحب ��لفعلية
   370	      
   371	      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
   372	      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
   373	      
   374	      pos1 = pos3 - clientX; pos2 = pos4 - clientY;
   375	      pos3 = clientX; pos4 = clientY;
   376	      
   377	      el.style.top = (el.offsetTop - pos2) + "px";
   378	      el.style.left = (el.offsetLeft - pos1) + "px";
   379	    };
   380	
   381	    const dragEnd = () => {
   382	      document.onmouseup = document.ontouchend = null;
   383	      document.onmousemove = document.ontouchmove = null;
   384	    };
   385	
   386	    el.onmousedown = el.ontouchstart = dragStart;
   387	    el.style.cursor = 'move';
   388	  },
   389	
   390	  toggleMute() {
   391	    this.isMuted = !this.isMuted;
   392	    if (this.localStream) {
   393	      const track = this.localStream.getAudioTracks()[0];
   394	      if (track) track.enabled = !this.isMuted;
   395	    }
   396	    
   397	    const btn = document.getElementById('call-mute-btn');
   398	    if (btn) {
   399	      btn.style.backgroundColor = this.isMuted ? '#dc3545' : '#28a745';
   400	      btn.innerHTML = this.isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
   401	    }
   402	  },
   403	
   404	  toggleSpeakerMute() {
   405	    this.isSpeakerMuted = !this.isSpeakerMuted;
   406	    
   407	    // Mute all remote audio tracks
   408	    if (this.peerConnection) {
   409	      this.peerConnection.getReceivers().forEach(receiver => {
   410	        if (receiver.track && receiver.track.kind === 'audio') {
   411	          receiver.track.enabled = !this.isSpeakerMuted;
   412	        }
   413	      });
   414	    }
   415	    
   416	    const btn = document.getElementById('call-speaker-btn');
   417	    if (btn) {
   418	      btn.style.backgroundColor = this.isSpeakerMuted ? '#dc3545' : '#28a745';
   419	      btn.innerHTML = this.isSpeakerMuted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
   420	    }
   421	  },
   422	
   423	  hangup(status, notifyServer = true, reason = 'ended') {
   424	    this.stopRingtone();
   425	    if (this.peerConnection) {
   426	      try { this.peerConnection.close(); } catch(e){}
   427	    }
   428	    if (this.localStream) {
   429	      try { this.localStream.getTracks().forEach(t => t.stop()); } catch(e){}
   430	    }
   431	    if (this.remoteAudio) {
   432	      try {
   433	        this.remoteAudio.pause();
   434	        this.remoteAudio.srcObject = null;
   435	      } catch(e){}
   436	      this.remoteAudio = null;
   437	    }
   438	    if (this.timerInterval) clearInterval(this.timerInterval);
   439	    if (this.callPanel) {
   440	      const statusEl = this.callPanel.querySelector('.call-status');
   441	      if (statusEl) statusEl.innerText = status;
   442	      setTimeout(() => { 
   443	        if (this.callPanel) { 
   444	          this.callPanel.remove(); 
   445	          this.callPanel = null; 
   446	        } 
   447	        const globalPanel = document.getElementById('global-call-slot');
   448	        if (globalPanel) {
   449	          globalPanel.innerHTML = '';
   450	        }
   451	      }, 2000);
   452	    }
   453	    
   454	    if (notifyServer && this.callId) {
   455	      window.socket.emit('pmcall:hangup', { callId: this.callId, reason });
   456	    }
   457	    this.callId = null;
   458	    this.currentState = null;
   459	    this.currentStatus = null;
   460	    this.incomingCaller = null;
   461	    this.currentCallUserId = null;
   462	    this.pendingIceCandidates = [];
   463	  },
   464	
   465	  cleanup() {
   466	    // دالة cleanup آمنة تُستدعى لتنظيف المكالمة الحالية دون إرسال إشارات إضافية لعدم التكرار
   467	    this.stopRingtone();
   468	    if (this.peerConnection) {
   469	      try { this.peerConnection.close(); } catch(e){}
   470	      this.peerConnection = null;
   471	    }
   472	    if (this.localStream) {
   473	      try { this.localStream.getTracks().forEach(t => t.stop()); } catch(e){}
   474	      this.localStream = null;
   475	    }
   476	    if (this.remoteAudio) {
   477	      try {
   478	        this.remoteAudio.pause();
   479	        this.remoteAudio.srcObject = null;
   480	      } catch(e){}
   481	      this.remoteAudio = null;
   482	    }
   483	    if (this.timerInterval) {
   484	      clearInterval(this.timerInterval);
   485	      this.timerInterval = null;
   486	    }
   487	    if (this.callPanel) {
   488	      this.callPanel.remove();
   489	      this.callPanel = null;
   490	    }
   491	    const globalPanel = document.getElementById('global-call-slot');
   492	    if (globalPanel) {
   493	      globalPanel.innerHTML = '';
   494	    }
   495	    this.callId = null;
   496	    this.currentState = null;
   497	    this.currentStatus = null;
   498	    this.incomingCaller = null;
   499	    this.currentCallUserId = null;
   500	    this.pendingIceCandidates = [];
   501	    this.isMuted = false;
   502	    this.isSpeakerMuted = false;
   503	  },
   504	
   505	  stopRingtone() {
   506	    if (this.ringtone) {
   507	      try {
   508	        this.ringtone.pause();
   509	        this.ringtone.currentTime = 0;
   510	      } catch(e){}
   511	    }
   512	  }
   513	};
   514	
   515	window.PrivateCallManager = PrivateCallManager;
   516	