     1	/**
     2	 * liveBroadcastManager.js
     3	 * Comprehensive, professional, and independent live broadcasting client implementation using WebRTC.
     4	 * Does not interfere with cameraManager.
     5	 */
     6	
     7	class LiveBroadcastManager {
     8	  constructor(socket) {
     9	    this.socket = socket || window.socket;
    10	    this.localStream = null;
    11	    this.peerConnections = new Map(); // Map of viewerSocketId -> RTCPeerConnection (Broadcaster mode) OR broadcasterSocketId -> RTCPeerConnection (Viewer mode)
    12	    this.pendingCandidates = new Map(); // Map of socketId -> Array of RTCIceCandidate
    13	    this.isBroadcasting = false;
    14	    this.currentSourceType = null;
    15	    this.currentScope = null;
    16	    this.isSwitchingCamera = false;
    17	    this.activeViewers = new Set(); // Set of active viewer socket IDs
    18	    this.watchingBroadcasterSocketId = null; // Stored broadcaster socket ID when watching
    19	    this.watchingBroadcasterUserId = null;
    20	    this.watchingBroadcasterName = null;
    21	    this.recentBroadcastNotifications = new Set();
    22	    
    23	    this.isVideoPaused = false;
    24	    this.currentCameraFacing = 'front';
    25	
    26	    this.iceServers = [
    27	      { urls: "stun:stun.l.google.com:19302" },
    28	      { urls: "stun:stun1.l.google.com:19302" },
    29	      { urls: "stun:stun2.l.google.com:19302" },
    30	      { urls: "stun:stun3.l.google.com:19302" },
    31	      { urls: "stun:stun4.l.google.com:19302" },
    32	      { urls: "stun:stun.chat-host.net:5349" },
    33	      { urls: "stun:stun.chat-host.net" },
    34	      { urls: ["turn:eu-0.turn.peerjs.com:3478","turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
    35	      { urls: ["turn:turn.chat-host.net:5349?transport=udp","turn:turn.chat-host.net:5349?transport=tcp","turns:turn.chat-host.net:5349?transport=tcp","turn:turn.chat-host.net:443?transport=udp","turn:turn.chat-host.net:443?transport=tcp","turns:turn.chat-host.net:443?transport=tcp"], username: "gN3yO0cF0uM6mQ2yU4tY3lR9vQ3qA9uA", credential: "fE7lY5-oR5tU0-fE5qY1-oE1oL5-pA5pU0" },
    36	      { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelaypassword" },
    37	      { urls: "stun:fr-turn3.xirsys.com" },
    38	      { urls: ["turn:fr-turn3.xirsys.com:80?transport=udp","turn:fr-turn3.xirsys.com:3478?transport=udp","turn:fr-turn3.xirsys.com:80?transport=tcp","turn:fr-turn3.xirsys.com:3478?transport=tcp","turns:fr-turn3.xirsys.com:443?transport=tcp","turns:fr-turn3.xirsys.com:5349?transport=tcp"], username: "tXzcEcDOut6ZNSuKQqTRWklYZwYrMJN0JQK2kly4cJmPews5xLNVT1b3WTleKKByAAAAAGV0k3NtYWhkb3VzaA==", credential: "a90a77d6-96ae-11ee-94a6-0242ac120004" },
    39	      { urls: "stun:stun.relay.metered.ca:80" },
    40	      { urls: "turn:a.relay.metered.ca:80", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    41	      { urls: "turn:a.relay.metered.ca:80?transport=tcp", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    42	      { urls: "turn:a.relay.metered.ca:443", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    43	      { urls: "turn:a.relay.metered.ca:443?transport=tcp", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" }
    44	    ];
    45	
    46	    this.init();
    47	  }
    48	
    49	  init() {
    50	    if (!this.socket) {
    51	      this.socket = window.socket;
    52	    }
    53	    if (this.socket) {
    54	      this.setupSocketHandlers();
    55	    } else {
    56	      setTimeout(() => this.init(), 1000);
    57	      return;
    58	    }
    59	
    60	    // Attach click handler to top bar live btn
    61	    const btn = document.getElementById('top-live-broadcast-btn');
    62	    if (btn) {
    63	      btn.onclick = () => {
    64	        if (this.isBroadcasting) {
    65	          this.stopBroadcast();
    66	        } else {
    67	          this.openStartModal();
    68	        }
    69	      };
    70	    }
    71	  }
    72	
    73	  setupSocketHandlers() {
    74	    // A viewer has clicked to watch us
    75	    this.socket.on('liveBroadcast:viewer-request', async (data) => {
    76	      console.log('[Live] Viewer request received from:', data);
    77	      if (!this.isBroadcasting) return;
    78	      this.activeViewers.add(data.viewerSocketId);
    79	      this.updateViewersCountUI();
    80	      await this.initiatePeerForViewer(data.viewerSocketId);
    81	    });
    82	
    83	    // Signaling Offer received (as Viewer)
    84	    this.socket.on('liveBroadcast:offer', async (data) => {
    85	      console.log('[Live] Offer received from:', data.fromUserId);
    86	      this.watchingBroadcasterSocketId = data.fromSocketId;
    87	      this.watchingBroadcasterUserId = data.fromUserId;
    88	      this.watchingBroadcasterName = data.fromName || 'بث مباشر';
    89	      this.showViewerUI(data.fromSocketId, this.watchingBroadcasterName);
    90	      await this.handleOffer(data);
    91	    });
    92	
    93	    // Signaling Answer received (as Broadcaster)
    94	    this.socket.on('liveBroadcast:answer', async (data) => {
    95	      console.log('[Live] Answer received from socket:', data.fromSocketId);
    96	      await this.handleAnswer(data);
    97	    });
    98	
    99	    // Signaling ICE Candidate received
   100	    this.socket.on('liveBroadcast:ice-candidate', async (data) => {
   101	      await this.handleIceCandidate(data);
   102	    });
   103	
   104	    // Error response
   105	    this.socket.on('liveBroadcast:error', (data) => {
   106	      Swal.fire({
   107	        title: 'تنبيه',
   108	        text: data.message || 'حدث خطأ غير متوقع في البث المباشر',
   109	        icon: 'warning',
   110	        confirmButtonText: 'حسناً'
   111	      });
   112	      this.closeViewerUI();
   113	    });
   114	
   115	    // Broadcast ended
   116	    this.socket.on('liveBroadcast:ended', (data) => {
   117	      console.log('[Live] Broadcast ended by Broadcaster');
   118	      if (
   119	        this.watchingBroadcasterUserId &&
   120	        Number(data.broadcasterId) === Number(this.watchingBroadcasterUserId)
   121	      ) {
   122	        Swal.fire({
   123	          title: 'إنهاء البث',
   124	          text: 'تم إنه��ء البث المباشر',
   125	          icon: 'info',
   126	          timer: 2500,
   127	          showConfirmButton: false
   128	        });
   129	        this.stopWatching();
   130	      }
   131	    });
   132	
   133	    // Viewer disconnected
   134	    this.socket.on('liveBroadcast:viewer-left', (data) => {
   135	      console.log('[Live] Viewer disconnected:', data.viewerSocketId);
   136	      this.activeViewers.delete(data.viewerSocketId);
   137	      this.updateViewersCountUI();
   138	      const pc = this.peerConnections.get(data.viewerSocketId);
   139	      if (pc) {
   140	        pc.close();
   141	        this.peerConnections.delete(data.viewerSocketId);
   142	      }
   143	      this.pendingCandidates.delete(data.viewerSocketId);
   144	    });
   145	
   146	    // Broadcast notification
   147	    this.socket.on('liveBroadcast:notify', (data) => {
   148	      this.showBroadcastNotification(data);
   149	    });
   150	  }
   151	
   152	  // --- Start Live Broadcast Selection UI ---
   153	  openStartModal() {
   154	    if (this.isBroadcasting) {
   155	      window.showToast('أنت تبث حالياً بالفعل', 'error');
   156	      return;
   157	    }
   158	
   159	    const htmlContent = `
   160	      <div class="text-end" style="direction: rtl; font-family: sans-serif;">
   161	        <label class="fw-bold mb-2 d-block text-dark" style="font-size: 14px;">1. اختر مصدر البث المباشر:</label>
   162	        <div class="row g-2 mb-4">
   163	          <div class="col-4">
   164	            <div class="live-broadcast-source-option active" data-source="front" style="border: 2px solid #6f42c1; border-radius: 12px; padding: 12px 6px; cursor: pointer; text-align: center; background: #fff; transition: all 0.2s ease-in-out;">
   165	              <i class="fas fa-camera d-block mb-1 text-primary" style="font-size: 22px;"></i>
   166	              <span style="font-size: 12px; font-weight: bold; color: #333;">كاميرا أمامية</span>
   167	            </div>
   168	          </div>
   169	          <div class="col-4">
   170	            <div class="live-broadcast-source-option" data-source="back" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 6px; cursor: pointer; text-align: center; background: #fff; transition: all 0.2s ease-in-out;">
   171	              <i class="fas fa-sync d-block mb-1 text-success" style="font-size: 22px;"></i>
   172	              <span style="font-size: 12px; font-weight: bold; color: #333;">كاميرا خلفية</span>
   173	            </div>
   174	          </div>
   175	          <div class="col-4">
   176	            <div class="live-broadcast-source-option" data-source="screen" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 6px; cursor: pointer; text-align: center; background: #fff; transition: all 0.2s ease-in-out;">
   177	              <i class="fas fa-desktop d-block mb-1 text-warning" style="font-size: 22px;"></i>
   178	              <span style="font-size: 12px; font-weight: bold; color: #333;">مشاركة شاشة</span>
   179	            </div>
   180	          </div>
   181	        </div>
   182	
   183	        <label class="fw-bold mb-2 d-block text-dark" style="font-size: 14px;">2. نطاق البث المباشر:</label>
   184	        <div class="row g-2 mb-2">
   185	          <div class="col-6">
   186	            <div class="live-broadcast-scope-option active" data-scope="global" style="border: 2px solid #6f42c1; border-radius: 12px; padding: 14px 10px; cursor: pointer; text-align: center; background: #fff; transition: all 0.2s ease-in-out;">
   187	              <i class="fas fa-globe d-block mb-1 text-info" style="font-size: 18px;"></i>
   188	              <span style="font-size: 13px; font-weight: bold; color: #333;">بث للجميع</span>
   189	            </div>
   190	          </div>
   191	          <div class="col-6">
   192	            <div class="live-broadcast-scope-option" data-scope="room" style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 10px; cursor: pointer; text-align: center; background: #fff; transition: all 0.2s ease-in-out;">
   193	              <i class="fas fa-door-open d-block mb-1 text-secondary" style="font-size: 18px;"></i>
   194	              <span style="font-size: 13px; font-weight: bold; color: #333;">الغرفة الحالية فقط</span>
   195	            </div>
   196	          </div>
   197	        </div>
   198	      </div>
   199	    `;
   200	
   201	    Swal.fire({
   202	      title: 'بدء بث مباشر',
   203	      html: htmlContent,
   204	      showCancelButton: true,
   205	      confirmButtonText: 'بدء الآن 🚀',
   206	      cancelButtonText: 'إلغاء',
   207	      confirmButtonColor: '#6f42c1',
   208	      cancelButtonColor: '#475569',
   209	      width: '420px',
   210	      didOpen: () => {
   211	        const sources = document.querySelectorAll('.live-broadcast-source-option');
   212	        let selectedSource = 'front';
   213	        sources.forEach(opt => {
   214	          opt.addEventListener('click', () => {
   215	            sources.forEach(o => {
   216	              o.classList.remove('active');
   217	              o.style.borderColor = '#e2e8f0';
   218	              o.style.borderWidth = '1px';
   219	            });
   220	            opt.classList.add('active');
   221	            opt.style.borderColor = '#6f42c1';
   222	            opt.style.borderWidth = '2px';
   223	            selectedSource = opt.getAttribute('data-source');
   224	            window._selectedBroadcastConfig.source = selectedSource;
   225	          });
   226	        });
   227	
   228	        const scopes = document.querySelectorAll('.live-broadcast-scope-option');
   229	        let selectedScope = 'global';
   230	        scopes.forEach(opt => {
   231	          opt.addEventListener('click', () => {
   232	            scopes.forEach(o => {
   233	              o.classList.remove('active');
   234	              o.style.borderColor = '#e2e8f0';
   235	              o.style.borderWidth = '1px';
   236	            });
   237	            opt.classList.add('active');
   238	            opt.style.borderColor = '#6f42c1';
   239	            opt.style.borderWidth = '2px';
   240	            selectedScope = opt.getAttribute('data-scope');
   241	            window._selectedBroadcastConfig.scope = selectedScope;
   242	          });
   243	        });
   244	
   245	        window._selectedBroadcastConfig = { source: selectedSource, scope: selectedScope };
   246	      }
   247	    }).then((result) => {
   248	      if (result.isConfirmed) {
   249	        const cfg = window._selectedBroadcastConfig || { source: 'front', scope: 'global' };
   250	        this.startBroadcast({
   251	          sourceType: cfg.source,
   252	          scope: cfg.scope
   253	        });
   254	      }
   255	    });
   256	  }
   257	
   258	  // --- Start Streaming Logic ---
   259	  async startBroadcast({ sourceType, scope }) {
   260	    console.log('[Live] Starting broadcast with sourceType:', sourceType, 'scope:', scope);
   261	    try {
   262	      if (sourceType === 'screen' && (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia)) {
   263	        Swal.fire('خطأ', 'مشاركة الشاشة غير مدعومة في هذا المتصفح', 'error');
   264	        return;
   265	      }
   266	
   267	      let stream = null;
   268	      if (sourceType === 'front') {
   269	        stream = await navigator.mediaDevices.getUserMedia({
   270	          video: {
   271	            facingMode: 'user',
   272	            width: { ideal: 1280 },
   273	            height: { ideal: 720 },
   274	            frameRate: { ideal: 24 }
   275	          },
   276	          audio: true
   277	        });
   278	      } else if (sourceType === 'back') {
   279	        stream = await navigator.mediaDevices.getUserMedia({
   280	          video: {
   281	            facingMode: { ideal: 'environment' },
   282	            width: { ideal: 1280 },
   283	            height: { ideal: 720 },
   284	            frameRate: { ideal: 24 }
   285	          },
   286	          audio: true
   287	        });
   288	      } else if (sourceType === 'screen') {
   289	        stream = await navigator.mediaDevices.getDisplayMedia({
   290	          video: {
   291	            frameRate: { ideal: 24 }
   292	          },
   293	          audio: true
   294	        });
   295	      }
   296	
   297	      if (!stream) {
   298	        throw new Error('Could not acquire MediaStream');
   299	      }
   300	
   301	      this.localStream = stream;
   302	      this.isBroadcasting = true;
   303	      this.currentSourceType = sourceType;
   304	      this.currentScope = scope;
   305	      this.activeViewers.clear();
   306	      
   307	      this.currentCameraFacing = sourceType === 'back' ? 'back' : 'front';
   308	      this.isVideoPaused = false;
   309	
   310	      // Monitor Screen Sharing stop by user
   311	      const videoTrack = stream.getVideoTracks()[0];
   312	      if (videoTrack && sourceType === 'screen') {
   313	        videoTrack.onended = () => {
   314	          console.log('[Live] Screen sharing track ended');
   315	          this.stopBroadcast();
   316	        };
   317	      } else if (videoTrack) {
   318	        videoTrack.onended = () => {
   319	          if (this.isSwitchingCamera) return;
   320	          console.log('[Live] Camera track ended');
   321	        };
   322	      }
   323	
   324	      // Tell Server about the live broadcast launch
   325	      const currentRoomId = window.currentRoomId || (window.state && window.state.currentRoomId);
   326	      this.socket.emit('liveBroadcast:start', {
   327	        sourceType,
   328	        scope,
   329	        roomId: currentRoomId || null
   330	      });
   331	
   332	      // Show Active UI State for broadcast buttons and previews
   333	      const btn = document.getElementById('top-live-broadcast-btn');
   334	      if (btn) {
   335	        btn.classList.add('active');
   336	        btn.title = 'إنهاء البث المباشر';
   337	      }
   338	
   339	      this.showLocalPreviewUI(sourceType, scope);
   340	
   341	    } catch (err) {
   342	      console.error('[Live] Error starting broadcast:', err);
   343	      Swal.fire('فشل بدء البث', 'يرجى التأكد من توفر الكاميرا والميكروفون وإعطاء الصلاحية', 'error');
   344	      this.stopBroadcast();
   345	    }
   346	  }
   347	
   348	  // Stop broadcasting
   349	  stopBroadcast() {
   350	    console.log('[Live] Stopping broadcast');
   351	    // Tell socket server to stop broadcast
   352	    this.socket.emit('liveBroadcast:stop');
   353	
   354	    // Terminate Peer list
   355	    this.peerConnections.forEach((pc) => {
   356	      try { pc.close(); } catch(e) {}
   357	    });
   358	    this.peerConnections.clear();
   359	    this.pendingCandidates.clear();
   360	
   361	    // Terminate local streams
   362	    if (this.localStream) {
   363	      this.localStream.getTracks().forEach(track => {
   364	        try { track.stop(); } catch(e) {}
   365	      });
   366	      this.localStream = null;
   367	    }
   368	
   369	    this.isBroadcasting = false;
   370	    this.currentSourceType = null;
   371	    this.currentScope = null;
   372	    this.activeViewers.clear();
   373	    this.isVideoPaused = false;
   374	    this.currentCameraFacing = 'front';
   375	
   376	    // Reset button design
   377	    const btn = document.getElementById('top-live-broadcast-btn');
   378	    if (btn) {
   379	      btn.classList.remove('active');
   380	      btn.title = 'بث مباشر';
   381	    }
   382	
   383	    this.closeLocalPreviewUI();
   384	  }
   385	
   386	  // Helper to make panels draggable and resizable
   387	  setupDraggableAndResizable(container, header) {
   388	    if (!container || !header) return;
   389	
   390	    let isDragging = false;
   391	    let isResizing = false;
   392	    let startX, startY;
   393	    let startWidth, startHeight;
   394	    let containerLeft, containerTop;
   395	
   396	    // Set cursor for header
   397	    header.style.cursor = 'move';
   398	
   399	    // 1. Draggable implementation
   400	    const onMouseDown = (e) => {
   401	      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) {
   402	        return;
   403	      }
   404	
   405	      isDragging = true;
   406	      const clientX = e.type.indexOf('touch') !== -1 ? e.touches[0].clientX : e.clientX;
   407	      const clientY = e.type.indexOf('touch') !== -1 ? e.touches[0].clientY : e.clientY;
   408	
   409	      const rect = container.getBoundingClientRect();
   410	      
   411	      startX = clientX - rect.left;
   412	      startY = clientY - rect.top;
   413	
   414	      // Switch positioning styles to explicit left/top to prevent layout shifts
   415	      container.style.bottom = 'auto';
   416	      container.style.right = 'auto';
   417	      container.style.left = rect.left + 'px';
   418	      container.style.top = rect.top + 'px';
   419	
   420	      document.addEventListener('mousemove', onMouseMove);
   421	      document.addEventListener('mouseup', onMouseUp);
   422	      document.addEventListener('touchmove', onMouseMove, { passive: false });
   423	      document.addEventListener('touchend', onMouseUp);
   424	    };
   425	
   426	    const onMouseMove = (e) => {
   427	      if (!isDragging) return;
   428	      if (e.cancelable) e.preventDefault();
   429	
   430	      const clientX = e.type.indexOf('touch') !== -1 ? e.touches[0].clientX : e.clientX;
   431	      const clientY = e.type.indexOf('touch') !== -1 ? e.touches[0].clientY : e.clientY;
   432	
   433	      let left = clientX - startX;
   434	      let top = clientY - startY;
   435	
   436	      const rect = container.getBoundingClientRect();
   437	      const maxLeft = window.innerWidth - rect.width;
   438	      const maxTop = window.innerHeight - rect.height;
   439	
   440	      left = Math.max(0, Math.min(left, maxLeft));
   441	      top = Math.max(0, Math.min(top, maxTop));
   442	
   443	      container.style.left = left + 'px';
   444	      container.style.top = top + 'px';
   445	    };
   446	
   447	    const onMouseUp = () => {
   448	      isDragging = false;
   449	      document.removeEventListener('mousemove', onMouseMove);
   450	      document.removeEventListener('mouseup', onMouseUp);
   451	      document.removeEventListener('touchmove', onMouseMove);
   452	      document.removeEventListener('touchend', onMouseUp);
   453	    };
   454	
   455	    header.addEventListener('mousedown', onMouseDown);
   456	    header.addEventListener('touchstart', onMouseDown, { passive: true });
   457	
   458	    // 2. Resizable implementation (Corners styling & math)
   459	    const handleLeft = document.createElement('div');
   460	    handleLeft.style.position = 'absolute';
   461	    handleLeft.style.bottom = '0';
   462	    handleLeft.style.left = '0';
   463	    handleLeft.style.width = '18px';
   464	    handleLeft.style.height = '18px';
   465	    handleLeft.style.cursor = 'nesw-resize';
   466	    handleLeft.style.zIndex = '10001';
   467	    handleLeft.style.background = 'linear-gradient(45deg, rgba(255, 255, 255, 0.3) 30%, transparent 30%)';
   468	
   469	    const handleRight = document.createElement('div');
   470	    handleRight.style.position = 'absolute';
   471	    handleRight.style.bottom = '0';
   472	    handleRight.style.right = '0';
   473	    handleRight.style.width = '18px';
   474	    handleRight.style.height = '18px';
   475	    handleRight.style.cursor = 'nwse-resize';
   476	    handleRight.style.zIndex = '10001';
   477	    handleRight.style.background = 'linear-gradient(135deg, transparent 70%, rgba(255, 255, 255, 0.3) 70%)';
   478	
   479	    container.appendChild(handleLeft);
   480	    container.appendChild(handleRight);
   481	
   482	    const onResizeStart = (e, isRightSide) => {
   483	      e.preventDefault();
   484	      e.stopPropagation();
   485	      isResizing = true;
   486	
   487	      const clientX = e.type.indexOf('touch') !== -1 ? e.touches[0].clientX : e.clientX;
   488	      const clientY = e.type.indexOf('touch') !== -1 ? e.touches[0].clientY : e.clientY;
   489	
   490	      startX = clientX;
   491	      startY = clientY;
   492	
   493	      const rect = container.getBoundingClientRect();
   494	      startWidth = rect.width;
   495	      startHeight = rect.height;
   496	      containerLeft = rect.left;
   497	      containerTop = rect.top;
   498	
   499	      container.style.bottom = 'auto';
   500	      container.style.right = 'auto';
   501	      container.style.left = containerLeft + 'px';
   502	      container.style.top = containerTop + 'px';
   503	
   504	      const onResizeMove = (moveEvt) => {
   505	        if (!isResizing) return;
   506	        if (moveEvt.cancelable) moveEvt.preventDefault();
   507	
   508	        const currentX = moveEvt.type.indexOf('touch') !== -1 ? moveEvt.touches[0].clientX : moveEvt.clientX;
   509	        const currentY = moveEvt.type.indexOf('touch') !== -1 ? moveEvt.touches[0].clientY : moveEvt.clientY;
   510	
   511	        let deltaX = currentX - startX;
   512	        let newWidth;
   513	
   514	        if (isRightSide) {
   515	          newWidth = startWidth + deltaX;
   516	        } else {
   517	          newWidth = startWidth - deltaX;
   518	        }
   519	
   520	        newWidth = Math.max(220, Math.min(newWidth, window.innerWidth - 40));
   521	
   522	        if (!isRightSide) {
   523	          const shiftLeft = startWidth - newWidth;
   524	          container.style.left = (containerLeft + shiftLeft) + 'px';
   525	        }
   526	
   527	        container.style.width = newWidth + 'px';
   528	      };
   529	
   530	      const onResizeEnd = () => {
   531	        isResizing = false;
   532	        document.removeEventListener('mousemove', onResizeMove);
   533	        document.removeEventListener('mouseup', onResizeEnd);
   534	        document.removeEventListener('touchmove', onResizeMove);
   535	        document.removeEventListener('touchend', onResizeEnd);
   536	      };
   537	
   538	      document.addEventListener('mousemove', onResizeMove);
   539	      document.addEventListener('mouseup', onResizeEnd);
   540	      document.addEventListener('touchmove', onResizeMove, { passive: false });
   541	      document.addEventListener('touchend', onResizeEnd);
   542	    };
   543	
   544	    handleLeft.addEventListener('mousedown', (e) => onResizeStart(e, false));
   545	    handleLeft.addEventListener('touchstart', (e) => onResizeStart(e, false), { passive: false });
   546	
   547	    handleRight.addEventListener('mousedown', (e) => onResizeStart(e, true));
   548	    handleRight.addEventListener('touchstart', (e) => onResizeStart(e, true), { passive: false });
   549	  }
   550	
   551	  // --- Broadcaster Floating Window UI ---
   552	  showLocalPreviewUI(sourceType, scope) {
   553	    this.closeLocalPreviewUI();
   554	
   555	    const parent = document.createElement('div');
   556	    parent.id = 'live-broadcast-preview-container';
   557	    parent.className = 'live-broadcast-preview';
   558	    parent.style.position = 'fixed';
   559	    parent.style.bottom = '15px';
   560	    parent.style.right = '15px';
   561	    parent.style.width = '240px';
   562	    parent.style.backgroundColor = '#1e1e2e';
   563	    parent.style.border = '2.5px solid #ff4757';
   564	    parent.style.borderRadius = '14px';
   565	    parent.style.boxShadow = '0 10px 25px rgba(0,0,0,0.4)';
   566	    parent.style.zIndex = '9999';
   567	    parent.style.overflow = 'hidden';
   568	    parent.style.color = '#fff';
   569	    parent.style.direction = 'rtl';
   570	
   571	    let typeText = 'كاميرا أمامية';
   572	    if (sourceType === 'back') typeText = 'كاميرا خلفية';
   573	    if (sourceType === 'screen') typeText = 'مشاركة شاشة';
   574	
   575	    let scopeText = scope === 'room' ? 'الغرفة الحالية فقط' : 'للجميع';
   576	
   577	    parent.innerHTML = `
   578	      <div id="live-local-header" style="background: rgba(0,0,0,0.5); padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;">
   579	        <div style="display: flex; align-items: center; gap: 6px;">
   580	          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: #ff4757; animation: livePulse 1s infinite; display: inline-block;"></span>
   581	          <span style="font-size: 11px; font-weight: bold;">معاينة البث</span>
   582	        </div>
   583	        <button id="live-btn-close-local" class="btn btn-sm btn-outline-light" style="padding: 1px 6px; font-size: 10px; border-radius: 4px;">إنهاء البث</button>
   584	      </div>
   585	      <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000;">
   586	        <video id="live-local-video" autoplay muted playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
   587	      </div>
   588	      <div class="live-broadcast-preview-actions" style="${sourceType === 'screen' ? 'display: none !important;' : ''}">
   589	        <button id="live-btn-switch-camera" ${sourceType === 'screen' ? 'style="display:none"' : ''} title="تبديل الكاميرا">
   590	          <i class="fas fa-sync-alt"></i>
   591	        </button>
   592	        <button id="live-btn-toggle-video">
   593	          <i class="fas fa-video-slash"></i> إيقاف الكاميرا
   594	        </button>
   595	      </div>
   596	      <div style="padding: 8px 12px; font-size: 11px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.08);">
   597	        <div style="margin-bottom: 2px;">• المصدر: <strong>${typeText}</strong></div>
   598	        <div style="margin-bottom: 2px;">• النطاق: <strong>${scopeText}</strong></div>
   599	        <div>• المشاهدون: <strong id="live-broadcast-viewers-count" class="live-broadcast-badge" style="background: #6f42c1; color: white; padding: 1px 7px; border-radius: 10px; font-size: 11px;">0</strong></div>
   600	      </div>
   601	    `;
   602	
   603	    document.body.appendChild(parent);
   604	
   605	    const header = parent.querySelector('#live-local-header');
   606	    this.setupDraggableAndResizable(parent, header);
   607	
   608	    const video = document.getElementById('live-local-video');
   609	    if (video) video.srcObject = this.localStream;
   610	
   611	    const stopBtn = document.getElementById('live-btn-close-local');
   612	    if (stopBtn) {
   613	      stopBtn.onclick = () => this.stopBroadcast();
   614	    }
   615	
   616	    const switchBtn = document.getElementById('live-btn-switch-camera');
   617	    if (switchBtn) {
   618	      switchBtn.onclick = () => this.switchBroadcastCamera();
   619	    }
   620	
   621	    const toggleVideoBtn = document.getElementById('live-btn-toggle-video');
   622	    if (toggleVideoBtn) {
   623	      toggleVideoBtn.onclick = () => this.toggleBroadcastVideo();
   624	    }
   625	  }
   626	
   627	  closeLocalPreviewUI() {
   628	    const el = document.getElementById('live-broadcast-preview-container');
   629	    if (el) el.remove();
   630	  }
   631	
   632	  async switchBroadcastCamera() {
   633	    if (!this.isBroadcasting) return;
   634	
   635	    if (this.currentSourceType === 'screen') {
   636	      window.showToast('لا يمكن تبديل الكاميرا أثناء مشاركة الشاشة', 'warning');
   637	      return;
   638	    }
   639	
   640	    if (this.isSwitchingCamera) return;
   641	
   642	    const nextFacing = this.currentCameraFacing === 'front' ? 'back' : 'front';
   643	    this.isSwitchingCamera = true;
   644	
   645	    let newStream = null;
   646	    let newVideoTrack = null;
   647	
   648	    try {
   649	      newStream = await navigator.mediaDevices.getUserMedia({
   650	        video: {
   651	          facingMode: nextFacing === 'front' ? 'user' : { ideal: 'environment' },
   652	          width: { ideal: 640 },
   653	          height: { ideal: 480 },
   654	          frameRate: { ideal: 20, max: 24 }
   655	        },
   656	        audio: false
   657	      });
   658	
   659	      newVideoTrack = newStream.getVideoTracks()[0];
   660	      if (!newVideoTrack) {
   661	        throw new Error('No video track found');
   662	      }
   663	
   664	      const oldVideoTrack = this.localStream?.getVideoTracks?.()[0];
   665	
   666	      // استبدال الفيديو في جميع اتصالات المشاهدين
   667	      const replaceTasks = [];
   668	
   669	      this.peerConnections.forEach((pc) => {
   670	        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
   671	        if (sender) {
   672	          replaceTasks.push(sender.replaceTrack(newVideoTrack));
   673	        }
   674	      });
   675	
   676	      await Promise.allSettled(replaceTasks);
   677	
   678	      // استبدال التراك داخل localStream مع الحفاظ على الصوت
   679	      if (this.localStream) {
   680	        if (oldVideoTrack) {
   681	          // Remove from local stream
   682	          this.localStream.removeTrack(oldVideoTrack);
   683	        }
   684	
   685	        this.localStream.addTrack(newVideoTrack);
   686	      } else {
   687	        this.localStream = new MediaStream([newVideoTrack]);
   688	      }
   689	
   690	      if (oldVideoTrack) {
   691	        oldVideoTrack.onended = null;
   692	        try { oldVideoTrack.stop(); } catch (e) {}
   693	      }
   694	
   695	      // تحديث المعاينة المحلية
   696	      const localVideo = document.getElementById('live-local-video');
   697	      if (localVideo) {
   698	        localVideo.srcObject = this.localStream;
   699	        await localVideo.play().catch(() => {});
   700	      }
   701	
   702	      this.currentCameraFacing = nextFacing;
   703	      this.currentSourceType = nextFacing === 'front' ? 'front' : 'back';
   704	      this.isVideoPaused = false;
   705	
   706	      const toggleBtn = document.getElementById('live-btn-toggle-video');
   707	      if (toggleBtn) {
   708	        toggleBtn.innerHTML = '<i class="fas fa-video-slash"></i> إيقاف الكاميرا';
   709	      }
   710	
   711	    } catch (err) {
   712	      console.error('[Live] switch camera error:', err);
   713	
   714	      if (newVideoTrack) {
   715	        try { newVideoTrack.stop(); } catch (e) {}
   716	      }
   717	
   718	      window.showToast('تعذر تبديل الكاميرا، تأكد من توفر الكاميرا الأخرى', 'error');
   719	    } finally {
   720	      this.isSwitchingCamera = false;
   721	    }
   722	  }
   723	
   724	  toggleBroadcastVideo() {
   725	    if (!this.isBroadcasting || !this.localStream) return;
   726	
   727	    if (this.currentSourceType === 'screen') {
   728	      window.showToast('إيقاف الفيديو المؤقت غير متاح أثناء مشاركة الشاشة، يمكنك إنهاء مشاركة الشاشة', 'warning');
   729	      return;
   730	    }
   731	
   732	    const videoTrack = this.localStream.getVideoTracks()[0];
   733	    if (!videoTrack) return;
   734	
   735	    this.isVideoPaused = !this.isVideoPaused;
   736	    videoTrack.enabled = !this.isVideoPaused;
   737	
   738	    const btn = document.getElementById('live-btn-toggle-video');
   739	    if (btn) {
   740	      btn.innerHTML = this.isVideoPaused
   741	        ? '<i class="fas fa-video"></i> تشغيل الكاميرا'
   742	        : '<i class="fas fa-video-slash"></i> إيقاف الكاميرا';
   743	    }
   744	
   745	    const localVideo = document.getElementById('live-local-video');
   746	    if (localVideo) {
   747	      localVideo.style.opacity = this.isVideoPaused ? '0.35' : '1';
   748	    }
   749	  }
   750	
   751	  updateViewersCountUI() {
   752	    const countEl = document.getElementById('live-broadcast-viewers-count');
   753	    if (countEl) {
   754	      countEl.innerText = this.activeViewers.size;
   755	    }
   756	  }
   757	
   758	  // --- WebRTC Broadcaster signaling connections ---
   759	  async initiatePeerForViewer(viewerSocketId) {
   760	    if (this.peerConnections.has(viewerSocketId)) {
   761	      try { this.peerConnections.get(viewerSocketId).close(); } catch(e) {}
   762	    }
   763	
   764	    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
   765	    this.peerConnections.set(viewerSocketId, pc);
   766	
   767	    pc.onconnectionstatechange = () => {
   768	      console.log('[Live] Broadcaster PC state:', viewerSocketId, pc.connectionState);
   769	      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
   770	        console.warn('[Live] Viewer connection failed/disconnected:', viewerSocketId);
   771	      }
   772	    };
   773	
   774	    pc.oniceconnectionstatechange = () => {
   775	      console.log('[Live] Broadcaster ICE state:', viewerSocketId, pc.iceConnectionState);
   776	    };
   777	
   778	    // Add local tracks
   779	    if (this.localStream) {
   780	      this.localStream.getTracks().forEach((track) => {
   781	        pc.addTrack(track, this.localStream);
   782	      });
   783	    }
   784	
   785	    pc.onicecandidate = (event) => {
   786	      if (event.candidate) {
   787	        this.socket.emit('liveBroadcast:ice-candidate', {
   788	          targetSocketId: viewerSocketId,
   789	          candidate: event.candidate
   790	        });
   791	      }
   792	    };
   793	
   794	    try {
   795	      const offer = await pc.createOffer();
   796	      await pc.setLocalDescription(offer);
   797	      this.socket.emit('liveBroadcast:offer', {
   798	        targetSocketId: viewerSocketId,
   799	        offer: offer
   800	      });
   801	    } catch (err) {
   802	      console.error('[Live] Error generating initial offer for viewer:', err);
   803	    }
   804	  }
   805	
   806	  // --- Watching a Stream (Viewer mode) ---
   807	  watchBroadcast(broadcasterUserId) {
   808	    console.log('[Live] Requesting to watch broadcaster:', broadcasterUserId);
   809	    this.socket.emit('liveBroadcast:watch', { broadcasterId: broadcasterUserId });
   810	  }
   811	
   812	  // Handle Offer coming from broadcaster
   813	  async handleOffer(data) {
   814	    const { fromSocketId, offer } = data;
   815	    console.log('[Live] Creating peer as viewer to respond offer');
   816	
   817	    if (this.peerConnections.has(fromSocketId)) {
   818	      try { this.peerConnections.get(fromSocketId).close(); } catch(e) {}
   819	    }
   820	
   821	    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
   822	    this.peerConnections.set(fromSocketId, pc);
   823	
   824	    pc.onconnectionstatechange = () => {
   825	      console.log('[Live] Viewer PC state:', fromSocketId, pc.connectionState);
   826	
   827	      if (pc.connectionState === 'connected') {
   828	        const video = document.getElementById('live-remote-video');
   829	        if (video && video.paused) {
   830	          video.play().catch(() => this.showTapToPlayOverlay(video));
   831	        }
   832	      }
   833	
   834	      if (pc.connectionState === 'failed') {
   835	        window.showToast('فشل الاتصال بالبث المباشر، حاول مرة أخرى', 'error');
   836	      }
   837	    };
   838	
   839	    pc.oniceconnectionstatechange = () => {
   840	      console.log('[Live] Viewer ICE state:', fromSocketId, pc.iceConnectionState);
   841	    };
   842	
   843	    // Track listener
   844	    const remoteStream = new MediaStream();
   845	    pc.ontrack = (event) => {
   846	      console.log('[Live] Track received from broadcaster:', event.track.kind);
   847	      const video = document.getElementById('live-remote-video');
   848	      if (video) {
   849	        if (event.streams && event.streams[0]) {
   850	          video.srcObject = event.streams[0];
   851	        } else {
   852	          remoteStream.addTrack(event.track);
   853	          video.srcObject = remoteStream;
   854	        }
   855	
   856	        video.muted = false;
   857	        video.playsInline = true;
   858	        video.autoplay = true;
   859	
   860	        const playPromise = video.play();
   861	        if (playPromise && typeof playPromise.catch === 'function') {
   862	          playPromise.catch(() => {
   863	            this.showTapToPlayOverlay(video);
   864	          });
   865	        }
   866	      }
   867	    };
   868	
   869	    pc.onicecandidate = (event) => {
   870	      if (event.candidate) {
   871	        this.socket.emit('liveBroadcast:ice-candidate', {
   872	          targetSocketId: fromSocketId,
   873	          candidate: event.candidate
   874	        });
   875	      }
   876	    };
   877	
   878	    try {
   879	      await pc.setRemoteDescription(new RTCSessionDescription(offer));
   880	
   881	      // Handle any buffered candidates
   882	      const pending = this.pendingCandidates.get(fromSocketId);
   883	      if (pending) {
   884	        for (const cand of pending) {
   885	          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch(e) {}
   886	        }
   887	        this.pendingCandidates.delete(fromSocketId);
   888	      }
   889	
   890	      const answer = await pc.createAnswer();
   891	      await pc.setLocalDescription(answer);
   892	
   893	      // Respond with answer
   894	      this.socket.emit('liveBroadcast:answer', {
   895	        targetSocketId: fromSocketId,
   896	        answer: answer
   897	      });
   898	
   899	    } catch (err) {
   900	      console.error('[Live] Error during setRemoteDescription/createAnswer:', err);
   901	      window.showToast('فشل الاستجابة لطلب البث', 'error');
   902	    }
   903	  }
   904	
   905	  // Handle Answer
   906	  async handleAnswer(data) {
   907	    const pc = this.peerConnections.get(data.fromSocketId);
   908	    if (!pc) return;
   909	    try {
   910	      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
   911	
   912	      const pending = this.pendingCandidates.get(data.fromSocketId);
   913	      if (pending) {
   914	        for (const cand of pending) {
   915	          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch(e) {}
   916	        }
   917	        this.pendingCandidates.delete(data.fromSocketId);
   918	      }
   919	    } catch (err) {
   920	      console.error('[Live] Error setRemoteDescription of answer:', err);
   921	    }
   922	  }
   923	
   924	  // Handle ICE Candidate
   925	  async handleIceCandidate(data) {
   926	    const pc = this.peerConnections.get(data.fromSocketId);
   927	    if (pc && pc.remoteDescription) {
   928	      try {
   929	        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
   930	      } catch (err) {
   931	        console.error('[Live] Error adding received candidate:', err);
   932	      }
   933	    } else {
   934	      if (!this.pendingCandidates.has(data.fromSocketId)) {
   935	        this.pendingCandidates.set(data.fromSocketId, []);
   936	      }
   937	      this.pendingCandidates.get(data.fromSocketId).push(data.candidate);
   938	    }
   939	  }
   940	
   941	  // Stop watching stream
   942	  stopWatching() {
   943	    console.log('[Live] Stop watching broadcaster');
   944	    if (this.watchingBroadcasterSocketId) {
   945	      this.socket.emit('liveBroadcast:viewer-left', {
   946	        broadcasterId: this.watchingBroadcasterUserId
   947	      });
   948	      const pc = this.peerConnections.get(this.watchingBroadcasterSocketId);
   949	      if (pc) {
   950	        try { pc.close(); } catch(e) {}
   951	        this.peerConnections.delete(this.watchingBroadcasterSocketId);
   952	      }
   953	    }
   954	    this.watchingBroadcasterSocketId = null;
   955	    this.watchingBroadcasterUserId = null;
   956	    this.watchingBroadcasterName = null;
   957	    this.closeViewerUI();
   958	  }
   959	
   960	  // --- Viewer Floating Screen UI ---
   961	  showViewerUI(broadcasterSocketId, broadcasterName = 'بث مباشر') {
   962	    this.closeViewerUI();
   963	
   964	    const parent = document.createElement('div');
   965	    parent.id = 'live-broadcast-viewer-container';
   966	    parent.className = 'live-broadcast-viewer';
   967	    parent.style.position = 'fixed';
   968	    parent.style.bottom = '15px';
   969	    parent.style.left = '15px';
   970	    parent.style.width = '300px';
   971	    parent.style.backgroundColor = '#181824';
   972	    parent.style.border = '2.5px solid #6f42c1';
   973	    parent.style.borderRadius = '16px';
   974	    parent.style.boxShadow = '0 12px 30px rgba(0,0,0,0.5)';
   975	    parent.style.zIndex = '9999';
   976	    parent.style.overflow = 'hidden';
   977	    parent.style.color = '#fff';
   978	    parent.style.direction = 'rtl';
   979	
   980	    parent.innerHTML = `
   981	      <div id="live-viewer-header" style="background: rgba(0,0,0,0.6); padding: 9px 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(111, 66, 193, 0.25);">
   982	        <div style="display: flex; align-items: center; gap: 6px;">
   983	          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: #2ed573; animation: livePulse 1s infinite; display: inline-block;"></span>
   984	          <span style="font-size: 12px; font-weight: bold;">مشاهدة بث: ${broadcasterName}</span>
   985	        </div>
   986	        <button id="live-btn-close-viewer" class="btn btn-sm btn-outline-danger" style="padding: 1px 8px; font-size: 11px; font-weight: bold; border-radius: 5px;">إغلاق</button>
   987	      </div>
   988	      <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #000;">
   989	        <video id="live-remote-video" autoplay playsinline controls style="width: 100%; height: 100%; object-fit: cover;"></video>
   990	      </div>
   991	    `;
   992	
   993	    document.body.appendChild(parent);
   994	
   995	    const header = parent.querySelector('#live-viewer-header');
   996	    this.setupDraggableAndResizable(parent, header);
   997	
   998	    const closeViewer = document.getElementById('live-btn-close-viewer');
   999	    if (closeViewer) {
  1000	      closeViewer.onclick = () => this.stopWatching();
  1001	    }
  1002	  }
  1003	
  1004	  closeViewerUI() {
  1005	    const el = document.getElementById('live-broadcast-viewer-container');
  1006	    if (el) el.remove();
  1007	  }
  1008	
  1009	  showTapToPlayOverlay(video) {
  1010	    const container = document.getElementById('live-broadcast-viewer-container');
  1011	    if (!container || container.querySelector('.live-tap-play-overlay')) return;
  1012	
  1013	    const overlay = document.createElement('div');
  1014	    overlay.className = 'live-tap-play-overlay';
  1015	    overlay.innerHTML = `
  1016	      <button type="button" class="live-tap-play-btn">
  1017	        <i class="fas fa-play"></i>
  1018	        اضغط لتشغيل البث
  1019	      </button>
  1020	    `;
  1021	
  1022	    overlay.style.position = 'absolute';
  1023	    overlay.style.inset = '0';
  1024	    overlay.style.background = 'rgba(0,0,0,0.55)';
  1025	    overlay.style.display = 'flex';
  1026	    overlay.style.alignItems = 'center';
  1027	    overlay.style.justifyContent = 'center';
  1028	    overlay.style.zIndex = '5';
  1029	
  1030	    const videoParent = video.parentElement;
  1031	    if (videoParent) {
  1032	      videoParent.style.position = 'relative';
  1033	      videoParent.appendChild(overlay);
  1034	    }
  1035	
  1036	    overlay.querySelector('button').onclick = async () => {
  1037	      try {
  1038	        await video.play();
  1039	        overlay.remove();
  1040	      } catch (e) {
  1041	        console.error('[Live] manual play failed:', e);
  1042	      }
  1043	    };
  1044	  }
  1045	
  1046	  showBroadcastNotification(data) {
  1047	    if (!data || !data.broadcasterId) return;
  1048	
  1049	    const key = `${data.broadcasterId}-${data.scope}-${data.roomId || 'global'}`;
  1050	    if (this.recentBroadcastNotifications.has(key)) {
  1051	      return;
  1052	    }
  1053	
  1054	    this.recentBroadcastNotifications.add(key);
  1055	    setTimeout(() => {
  1056	      this.recentBroadcastNotifications.delete(key);
  1057	    }, 30000);
  1058	
  1059	    const broadcasterName = data.broadcasterName || 'مستخدم';
  1060	    
  1061	    let iconClass = 'fas fa-video';
  1062	    let sourceText = 'بث مباشر';
  1063	    if (data.sourceType === 'screen') {
  1064	      iconClass = 'fas fa-desktop';
  1065	      sourceText = 'مشاركة شاشة مباشرة';
  1066	    } else if (data.sourceType === 'front') {
  1067	      iconClass = 'fas fa-camera';
  1068	      sourceText = 'بث مباشر بالكاميرا الأمامية';
  1069	    } else if (data.sourceType === 'back') {
  1070	      iconClass = 'fas fa-sync';
  1071	      sourceText = 'بث مباشر بالكاميرا الخلفية';
  1072	    }
  1073	
  1074	    let scopeText = 'هذا البث متاح للجميع';
  1075	    if (data.scope === 'room') {
  1076	      scopeText = 'هذا البث مخصص للغرفة الحالية';
  1077	    }
  1078	
  1079	    Swal.fire({
  1080	      title: 'بث مباشر جديد',
  1081	      html: `
  1082	        <div class="live-broadcast-alert">
  1083	          <div class="live-broadcast-alert-icon">
  1084	            <i class="${iconClass}"></i>
  1085	          </div>
  1086	          <div class="live-broadcast-alert-title">
  1087	            قام <b>${broadcasterName}</b> ببدء بث مباشر
  1088	          </div>
  1089	          <div class="live-broadcast-alert-desc">
  1090	            ${sourceText}
  1091	          </div>
  1092	          <div class="live-broadcast-alert-scope">
  1093	            ${scopeText}
  1094	          </div>
  1095	        </div>
  1096	      `,
  1097	      showCancelButton: true,
  1098	      confirmButtonText: 'مشاهدة البث',
  1099	      cancelButtonText: 'تجاهل',
  1100	      confirmButtonColor: '#dc3545',
  1101	      cancelButtonColor: '#6c757d',
  1102	      customClass: {
  1103	        popup: 'live-broadcast-swal-popup'
  1104	      }
  1105	    }).then((result) => {
  1106	      if (result.isConfirmed) {
  1107	        this.watchBroadcast(data.broadcasterId);
  1108	      }
  1109	    });
  1110	  }
  1111	}
  1112	
  1113	// Instantiate globally
  1114	window.liveBroadcastManager = new LiveBroadcastManager(window.socket);
  1115	