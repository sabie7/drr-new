     1	/**
     2	 * CameraManager.js
     3	 * Independent system for camera viewing requests and P2P streaming via WebRTC.
     4	 * Enhanced with ICE Candidate buffering, viewer-ready flow, and shared iceServers.
     5	 */
     6	
     7	const CameraIceServers = [
     8	  { urls: "stun:stun.l.google.com:19302" },
     9	  { urls: "stun:stun1.l.google.com:19302" },
    10	  { urls: "stun:stun2.l.google.com:19302" },
    11	  { urls: "stun:stun3.l.google.com:19302" },
    12	  { urls: "stun:stun4.l.google.com:19302" },
    13	  { urls: "stun:stun.chat-host.net:5349" },
    14	  { urls: "stun:stun.chat-host.net" },
    15	  { urls: ["turn:eu-0.turn.peerjs.com:3478","turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
    16	  { urls: ["turn:turn.chat-host.net:5349?transport=udp","turn:turn.chat-host.net:5349?transport=tcp","turns:turn.chat-host.net:5349?transport=tcp","turn:turn.chat-host.net:443?transport=udp","turn:turn.chat-host.net:443?transport=tcp","turns:turn.chat-host.net:443?transport=tcp"], username: "gN3yO0cF0uM6mQ2yU4tY3lR9vQ3qA9uA", credential: "fE7lY5-oR5tU0-fE5qY1-oE1oL5-pA5pU0" },
    17	  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelaypassword" },
    18	  { urls: "stun:fr-turn3.xirsys.com" },
    19	  { urls: ["turn:fr-turn3.xirsys.com:80?transport=udp","turn:fr-turn3.xirsys.com:3478?transport=udp","turn:fr-turn3.xirsys.com:80?transport=tcp","turn:fr-turn3.xirsys.com:3478?transport=tcp","turns:fr-turn3.xirsys.com:443?transport=tcp","turns:fr-turn3.xirsys.com:5349?transport=tcp"], username: "tXzcEcDOut6ZNSuKQqTRWklYZwYrMJN0JQK2kly4cJmPews5xLNVT1b3WTleKKByAAAAAGV0k3NtYWhkb3VzaA==", credential: "a90a77d6-96ae-11ee-94a6-0242ac120004" },
    20	  { urls: "stun:stun.relay.metered.ca:80" },
    21	  { urls: "turn:a.relay.metered.ca:80", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    22	  { urls: "turn:a.relay.metered.ca:80?transport=tcp", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    23	  { urls: "turn:a.relay.metered.ca:443", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    24	  { urls: "turn:a.relay.metered.ca:443?transport=tcp", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" }
    25	];
    26	window.CameraIceServers = CameraIceServers;
    27	
    28	class CameraManager {
    29	  constructor(socket, state) {
    30	    this.socket = socket || window.socket;
    31	    this.state = state || window.state;
    32	    this.localStream = null;
    33	    this.peerConnections = {}; // Map of userId -> peerConnection
    34	    this.pendingCandidates = {}; // Map of userId -> [candidate]
    35	    this.remoteStreams = {}; // Map of userId -> stream (buffer if element not ready)
    36	    
    37	    this.config = {
    38	      iceServers: CameraIceServers
    39	    };
    40	    
    41	    if (this.socket) {
    42	      this.setupSocketHandlers();
    43	    } else {
    44	      console.warn('[Camera] Socket not ready in constructor, manual init needed if not using dev server reload');
    45	    }
    46	  }
    47	
    48	  setupSocketHandlers() {
    49	    if (!this.socket) return;
    50	    console.log('[Camera] Setting up socket handlers');
    51	
    52	    // Incoming request from someone wanting to see my camera
    53	    this.socket.on('camera:request', (data) => {
    54	      console.log('[Camera] Received request from', data.requester?.username);
    55	      this.handleIncomingRequest(data);
    56	    });
    57	
    58	    // Request was accepted by the user I wanted to see
    59	    this.socket.on('camera:accepted', (data) => {
    60	      console.log('[Camera] Request accepted by', data.ownerUsername);
    61	      this.handleRequestAccepted(data);
    62	    });
    63	
    64	    // Owner should start broadcasting because viewer is ready
    65	    this.socket.on('camera:start-broadcast', (data) => {
    66	      console.log('[Camera] Viewer ready, starting broadcast to', data.viewerId);
    67	      this.startBroadcasting(data.viewerId);
    68	    });
    69	
    70	    // Request was rejected
    71	    this.socket.on('camera:rejected', (data) => {
    72	      Swal.fire({
    73	        title: 'تم الرفض',
    74	        text: `لقد رفض ${data.username} طلب مشاهدة الكاميرا`,
    75	        icon: 'info',
    76	        timer: 3000,
    77	        showConfirmButton: false
    78	      });
    79	    });
    80	
    81	    // Server-side rejection (target offline / not in same room / not approved)
    82	    this.socket.on('camera:error', (data) => {
    83	      Swal.fire({
    84	        title: 'خطأ',
    85	        text: (data && data.message) || 'تعذر إتمام طلب الكاميرا',
    86	        icon: 'error',
    87	        timer: 3000,
    88	        showConfirmButton: false
    89	      });
    90	    });
    91	
    92	    // Signaling: Offer received
    93	    this.socket.on('camera:offer', async (data) => {
    94	      await this.handleOffer(data);
    95	    });
    96	
    97	    // Signaling: Answer received
    98	    this.socket.on('camera:answer', async (data) => {
    99	      await this.handleAnswer(data);
   100	    });
   101	
   102	    // Signaling: ICE candidiate received
   103	    this.socket.on('camera:candidate', async (data) => {
   104	      await this.handleCandidate(data);
   105	    });
   106	
   107	    // Signaling: Session ended
   108	    this.socket.on('camera:ended', (data) => {
   109	      this.cleanupSession(data.userId);
   110	    });
   111	
   112	    // Camera paused/resumed by owner
   113	    this.socket.on('camera:paused', (data) => {
   114	      const { userId, paused } = data;
   115	      const overlay = document.getElementById(`camera-muted-overlay-${userId}`);
   116	      if (overlay) {
   117	        overlay.style.display = paused ? 'flex' : 'none';
   118	      }
   119	    });
   120	  }
   121	
   122	  /**
   123	   * Send a request to watch someone's camera
   124	   */
   125	  requestView(targetUser) {
   126	    if (!this.state.currentUser) {
   127	       window.showToast('يجب تسجيل الدخول أولاً', 'warning');
   128	       return;
   129	    }
   130	    
   131	    const targetUserId = targetUser.userId || targetUser.id;
   132	    if (targetUserId === (this.state.currentUser.userId || this.state.currentUser.id)) return;
   133	
   134	    Swal.fire({
   135	      title: 'طلب مشاهدة',
   136	      text: `هل تريد إرسال طلب لمشاهدة الكاميرا الخاصة بـ ${targetUser.topic || targetUser.username}؟`,
   137	      icon: 'question',
   138	      showCancelButton: true,
   139	      confirmButtonText: 'إرسال الطلب',
   140	      cancelButtonText: 'إلغاء'
   141	    }).then((result) => {
   142	      if (result.isConfirmed) {
   143	        this.socket.emit('camera:request', { targetId: targetUserId });
   144	        window.showToast('تم إرسال الطلب، بانتظار الموافقة...', 'info');
   145	      }
   146	    });
   147	  }
   148	
   149	  /**
   150	   * Handle incoming request popup
   151	   */
   152	  async handleIncomingRequest(data) {
   153	    const { requester } = data;
   154	    const requesterId = requester.userId || requester.id;
   155	    
   156	    const result = await Swal.fire({
   157	      title: 'طلب مشاهدة كاميرا',
   158	      html: `
   159	        <div class="d-flex flex-column align-items-center gap-2">
   160	          <img src="${requester.pic || '/default-avatar.png'}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
   161	          <div class="fw-bold">${requester.topic || requester.username} يريد مشاهدة الكاميرا الخاصة بك</div>
   162	          <div class="text-muted small">المشاهدة ستكون فيديو فقط وبدون صوت</div>
   163	        </div>
   164	      `,
   165	      showCancelButton: true,
   166	      confirmButtonText: 'قبول',
   167	      cancelButtonText: 'رفض',
   168	      confirmButtonColor: '#28a745',
   169	      cancelButtonColor: '#dc3545',
   170	      allowOutsideClick: false
   171	    });
   172	
   173	    if (result.isConfirmed) {
   174	      this.socket.emit('camera:accept', { targetId: requesterId });
   175	    } else {
   176	      this.socket.emit('camera:reject', { targetId: requesterId });
   177	    }
   178	  }
   179	
   180	  /**
   181	   * Logic for the person sharing their camera (The Broadcaster)
   182	   */
   183	  async startBroadcasting(viewerId) {
   184	    if (this.peerConnections[viewerId] && this.peerConnections[viewerId].connectionState === 'connected') {
   185	      console.log('[Camera] Already broadcasting to', viewerId);
   186	      return;
   187	    }
   188	
   189	    try {
   190	      if (!this.localStream) {
   191	        const facingMode = this.currentFacingMode || 'user';
   192	        this.localStream = await navigator.mediaDevices.getUserMedia({
   193	          video: {
   194	            facingMode: facingMode,
   195	            width: { ideal: 640 },
   196	            height: { ideal: 480 },
   197	            frameRate: { ideal: 15 }
   198	          },
   199	          audio: false
   200	        });
   201	        console.log('[Camera] Local stream started with facingMode:', facingMode);
   202	        this.createLocalPreview();
   203	        this.socket.emit('camera:status', { isBroadcasting: true });
   204	      }
   205	
   206	      const pc = this.getOrCreatePeerConnection(viewerId, true);
   207	      const existingSenders = pc.getSenders();
   208	      
   209	      this.localStream.getTracks().forEach(track => {
   210	        const alreadyAdded = existingSenders.some(sender => sender.track && sender.track.id === track.id);
   211	        if (!alreadyAdded) {
   212	          pc.addTrack(track, this.localStream);
   213	        }
   214	      });
   215	
   216	      const offer = await pc.createOffer();
   217	      await pc.setLocalDescription(offer);
   218	
   219	      this.socket.emit('camera:offer', {
   220	        targetId: viewerId,
   221	        offer: offer
   222	      });
   223	
   224	    } catch (err) {
   225	      console.error('[Camera] Error broadcasting:', err);
   226	      window.showToast('فشل تشغيل الكاميرا. يرجى التأكد من الصلاحيات.', 'error');
   227	      this.socket.emit('camera:end', { targetId: viewerId });
   228	      this.cleanupSession(viewerId);
   229	    }
   230	  }
   231	
   232	  async switchCamera() {
   233	    console.log('[Camera] Switching camera...');
   234	    try {
   235	      this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
   236	      
   237	      if (this.localStream) {
   238	        this.localStream.getTracks().forEach(track => track.stop());
   239	      }
   240	      
   241	      this.localStream = await navigator.mediaDevices.getUserMedia({
   242	        video: {
   243	          facingMode: this.currentFacingMode,
   244	          width: { ideal: 640 },
   245	          height: { ideal: 480 }
   246	        },
   247	        audio: false
   248	      });
   249	      
   250	      const videoEl = document.getElementById('video-local-preview');
   251	      if (videoEl) videoEl.srcObject = this.localStream;
   252	      
   253	      const videoTrack = this.localStream.getVideoTracks()[0];
   254	      for (const userId in this.peerConnections) {
   255	        const pc = this.peerConnections[userId];
   256	        const senders = pc.getSenders();
   257	        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
   258	        if (videoSender) {
   259	          await videoSender.replaceTrack(videoTrack);
   260	        }
   261	      }
   262	      
   263	      // No toast notification as requested
   264	    } catch (err) {
   265	      console.error('[Camera] Error switching camera:', err);
   266	      window.showToast('فشل تحويل الكاميرا', 'error');
   267	    }
   268	  }
   269	
   270	  toggleCameraMute(btn) {
   271	    if (!this.localStream) return;
   272	    const videoTrack = this.localStream.getVideoTracks()[0];
   273	    if (!videoTrack) return;
   274	
   275	    const isEnabled = videoTrack.enabled;
   276	    videoTrack.enabled = !isEnabled;
   277	
   278	    const icon = btn.querySelector('i');
   279	    const overlay = document.getElementById('local-camera-muted-overlay');
   280	
   281	    if (videoTrack.enabled) {
   282	      icon.className = 'fas fa-eye';
   283	      btn.style.background = 'rgba(255,255,255,0.1)';
   284	      if (overlay) overlay.style.display = 'none';
   285	      this.socket.emit('camera:pause', { paused: false });
   286	    } else {
   287	      icon.className = 'fas fa-eye-slash';
   288	      btn.style.background = '#dc3545';
   289	      if (overlay) overlay.style.display = 'flex';
   290	      this.socket.emit('camera:pause', { paused: true });
   291	    }
   292	  }
   293	
   294	  /**
   295	   * Logic for the person watching (The Viewer)
   296	   */
   297	  async handleRequestAccepted(data) {
   298	    const { ownerId, ownerUsername } = data;
   299	    console.log('[Camera] Preparing viewer window for', ownerUsername);
   300	    
   301	    // Check if we are already viewing or setting up
   302	    if (document.getElementById(`camera-view-${ownerId}`)) {
   303	      console.log('[Camera] Already viewing or window exists for', ownerId);
   304	      return;
   305	    }
   306	
   307	    // 1. Create UI
   308	    this.createVideoWindow(ownerId, ownerUsername);
   309	    
   310	    // 2. Peer is ready to handle signals
   311	    this.getOrCreatePeerConnection(ownerId, false);
   312	
   313	    // 3. Inform owner that viewer is ready
   314	    this.socket.emit('camera:viewer-ready', { targetId: ownerId });
   315	  }
   316	
   317	  createLocalPreview() {
   318	    if (document.getElementById('camera-local-preview')) return;
   319	    console.log('[Camera] Creating local preview window');
   320	
   321	    const container = document.createElement('div');
   322	    container.id = 'camera-local-preview';
   323	    container.className = 'camera-viewer-window local-preview';
   324	    container.style.cssText = `
   325	      transition: width 0.2s;
   326	      position: fixed !important;
   327	      top: 60px !important;
   328	      left: 10px !important;
   329	      z-index: 2000 !important;
   330	      display: flex !important;
   331	      flex-direction: column !important;
   332	      background: #000 !important;
   333	      border: 2px solid rgb(51, 51, 51) !important;
   334	      box-shadow: rgba(0, 0, 0, 0.6) 0px 0px 30px !important;
   335	      width: 320px !important;
   336	      height: auto !important;
   337	      min-height: auto !important;
   338	      max-height: 90vh !important;
   339	      overflow: hidden !important;
   340	      border-radius: 8px !important;
   341	    `;
   342	
   343	    container.innerHTML = `
   344	      <div class="camera-window-header" style="background: #333 !important; color: white !important; padding: 8px 12px !important; cursor: move !important; display: flex !important; justify-content: space-between !important; align-items: center !important; font-weight: bold !important; font-size: 14px !important; border-bottom: 1px solid #444 !important; flex-shrink: 0 !important; height: 40px !important;">
   345	        <div class="d-flex align-items-center" style="pointer-events: none;">
   346	            <i class="fas fa-video me-2"></i>
   347	            <span>معاينة (أنت)</span>
   348	        </div>
   349	        <div class="d-flex gap-2">
   350	            <button class="camera-mute-btn" title="كتم/تشغيل الكاميرا" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 4px !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
   351	              <i class="fas fa-eye"></i>
   352	            </button>
   353	            <button class="camera-zoom-out-btn" title="تصغير" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 4px !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
   354	              <i class="fas fa-search-minus"></i>
   355	            </button>
   356	            <button class="camera-zoom-in-btn" title="تكبير" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 4px !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
   357	              <i class="fas fa-search-plus"></i>
   358	            </button>
   359	            <button class="camera-switch-btn" title="قلب الكاميرا" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 50% !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
   360	              <i class="fas fa-sync-alt"></i>
   361	            </button>
   362	            <button class="camera-window-close" style="color: white !important; border: none !important; background: none !important; font-size: 24px !important; padding: 0 5px !important; line-height: 1 !important; cursor: pointer !important;">&times;</button>
   363	        </div>
   364	      </div>
   365	      <div class="camera-window-body" style="position: relative !important; background: black !important; display: block !important; width: 100% !important; aspect-ratio: 4/3 !important; overflow: hidden !important; flex-shrink: 0 !important; flex-grow: 0 !important;">
   366	        <video id="video-local-preview" autoplay playsinline muted style="width: 100% !important; height: 100% !important; object-fit: cover !important; display: block !important;"></video>
   367	        <div id="local-camera-muted-overlay" style="position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.8) !important; display: none !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; color: white !important; z-index: 5 !important;">
   368	           <i class="fas fa-eye-slash fa-3x mb-2"></i><span>الكاميرا متوقفة مؤقتاً</span>
   369	        </div>
   370	      </div>
   371	    `;
   372	
   373	    document.body.appendChild(container);
   374	    
   375	    const videoEl = document.getElementById('video-local-preview');
   376	    if (videoEl && this.localStream) {
   377	      videoEl.srcObject = this.localStream;
   378	    }
   379	
   380	    const muteBtn = container.querySelector('.camera-mute-btn');
   381	    if (muteBtn) muteBtn.onclick = () => this.toggleCameraMute(muteBtn);
   382	
   383	    const switchBtn = container.querySelector('.camera-switch-btn');
   384	    if (switchBtn) switchBtn.onclick = () => this.switchCamera();
   385	
   386	    const zoomInBtn = container.querySelector('.camera-zoom-in-btn');
   387	    const zoomOutBtn = container.querySelector('.camera-zoom-out-btn');
   388	    
   389	    if (zoomInBtn) zoomInBtn.onclick = () => this.handleZoom(container, 'in');
   390	    if (zoomOutBtn) zoomOutBtn.onclick = () => this.handleZoom(container, 'out');
   391	
   392	    const closeBtn = container.querySelector('.camera-window-close');
   393	    closeBtn.onclick = () => {
   394	      Swal.fire({
   395	        title: 'إيقاف الكاميرا',
   396	        text: 'هل تريد إيقاف بث الكاميرا لجميع المشاهدين؟',
   397	        icon: 'warning',
   398	        showCancelButton: true,
   399	        confirmButtonText: 'نعم، أوقف البث',
   400	        cancelButtonText: 'إلغاء'
   401	      }).then(result => {
   402	        if (result.isConfirmed) {
   403	          this.stopAllBroadcasting();
   404	        }
   405	      });
   406	    };
   407	
   408	    this.makeDraggable(container);
   409	  }
   410	
   411	  stopAllBroadcasting() {
   412	    Object.keys(this.peerConnections).forEach(userId => {
   413	      this.socket.emit('camera:end', { targetId: userId });
   414	      this.cleanupSession(userId);
   415	    });
   416	    
   417	    if (this.localStream) {
   418	        this.localStream.getTracks().forEach(track => track.stop());
   419	        this.localStream = null;
   420	    }
   421	    const localPrev = document.getElementById('camera-local-preview');
   422	    if (localPrev) {
   423	      localPrev.remove();
   424	      this.socket.emit('camera:status', { isBroadcasting: false });
   425	    }
   426	  }
   427	
   428	  createVideoWindow(userId, username) {
   429	    if (document.getElementById(`camera-view-${userId}`)) return;
   430	    console.log('[Camera] Appending viewer window to body for', username);
   431	
   432	    const container = document.createElement('div');
   433	    container.id = `camera-view-${userId}`;
   434	    container.className = 'camera-viewer-window';
   435	    container.style.cssText = `
   436	      transition: width 0.2s;
   437	      position: fixed !important;
   438	      top: 60px !important;
   439	      left: 10px !important;
   440	      z-index: 2000 !important;
   441	      display: flex !important;
   442	      flex-direction: column !important;
   443	      background: #000 !important;
   444	      border: 2px solid rgb(51, 51, 51) !important;
   445	      box-shadow: rgba(0, 0, 0, 0.6) 0px 0px 30px !important;
   446	      width: 320px !important;
   447	      height: auto !important;
   448	      min-height: auto !important;
   449	      max-height: 90vh !important;
   450	      overflow: hidden !important;
   451	      border-radius: 8px !important;
   452	    `;
   453	    
   454	    container.innerHTML = `
   455	      <div class="camera-window-header" style="background: #333 !important; color: white !important; padding: 8px 12px !important; cursor: move !important; display: flex !important; justify-content: space-between !important; align-items: center !important; font-weight: bold !important; font-size: 14px !important; border-bottom: 1px solid #444 !important; flex-shrink: 0 !important; height: 40px !important;">
   456	        <div class="d-flex align-items-center" style="pointer-events: none;">
   457	            <i class="fas fa-camera me-2"></i>
   458	            <span>مشاهدة: ${username}</span>
   459	        </div>
   460	        <div class="d-flex gap-2">
   461	            <button class="camera-zoom-out-btn" title="تصغير" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 4px !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
   462	              <i class="fas fa-search-minus"></i>
   463	            </button>
   464	            <button class="camera-zoom-in-btn" title="تكبير" style="color: white !important; border: none !important; background: rgba(255,255,255,0.1) !important; width: 28px !important; height: 28px !important; border-radius: 4px !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 0 !important; cursor: pointer !important;">
   465	              <i class="fas fa-search-plus"></i>
   466	            </button>
   467	            <button class="camera-window-close" style="color: white !important; border: none !important; background: none !important; font-size: 24px !important; padding: 0 5px !important; line-height: 1 !important; cursor: pointer !important;">&times;</button>
   468	        </div>
   469	      </div>
   470	      <div class="camera-window-body" style="position: relative !important; background: black !important; display: block !important; width: 100% !important; aspect-ratio: 4/3 !important; overflow: hidden !important; flex-shrink: 0 !important; flex-grow: 0 !important;">
   471	        <video id="video-remote-${userId}" autoplay playsinline muted style="width: 100% !important; height: 100% !important; object-fit: cover !important; display: block !important;"></video>
   472	        <div class="camera-loading" style="position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; color: white !important; background: rgba(0,0,0,0.6) !important; display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 10px !important;">
   473	           <i class="fas fa-spinner fa-spin"></i>
   474	           <span>جاري الاتصال...</span>
   475	        </div>
   476	        <div id="camera-muted-overlay-${userId}" style="position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0,0,0,0.8) !important; display: none !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; color: white !important; z-index: 5 !important;">
   477	           <i class="fas fa-eye-slash fa-3x mb-2"></i><span>الكاميرا متوقفة مؤقتاً</span>
   478	        </div>
   479	      </div>
   480	    `;
   481	
   482	    document.body.appendChild(container);
   483	
   484	    const zoomInBtn = container.querySelector('.camera-zoom-in-btn');
   485	    const zoomOutBtn = container.querySelector('.camera-zoom-out-btn');
   486	    
   487	    if (zoomInBtn) zoomInBtn.onclick = () => this.handleZoom(container, 'in');
   488	    if (zoomOutBtn) zoomOutBtn.onclick = () => this.handleZoom(container, 'out');
   489	
   490	    const closeBtn = container.querySelector('.camera-window-close');
   491	    closeBtn.onclick = () => {
   492	      this.stopViewing(userId);
   493	    };
   494	
   495	    this.makeDraggable(container);
   496	
   497	    if (this.remoteStreams[userId]) {
   498	      this.bindStreamToVideo(userId, this.remoteStreams[userId]);
   499	    }
   500	  }
   501	
   502	  handleZoom(el, type) {
   503	    const currentWidth = parseFloat(getComputedStyle(el, null).getPropertyValue('width'));
   504	    const step = 60;
   505	    
   506	    let newWidth;
   507	    
   508	    if (type === 'in') {
   509	      newWidth = currentWidth + step;
   510	      if (newWidth > 800) return; 
   511	    } else {
   512	      newWidth = currentWidth - step;
   513	      if (newWidth < 200) return; 
   514	    }
   515	    
   516	    el.style.width = newWidth + 'px';
   517	    // Removed minHeight setting to let aspect-ratio of the body handle the height naturally
   518	    el.style.minHeight = 'auto'; 
   519	  }
   520	
   521	  bindStreamToVideo(userId, stream) {
   522	    const videoEl = document.getElementById(`video-remote-${userId}`);
   523	    if (videoEl) {
   524	      videoEl.srcObject = stream;
   525	      videoEl.play().catch(e => console.warn('[Camera] Auto-play prevented', e));
   526	      
   527	      const loading = videoEl.parentElement.querySelector('.camera-loading');
   528	      if (loading) loading.style.display = 'none';
   529	      
   530	      delete this.remoteStreams[userId];
   531	    } else {
   532	      this.remoteStreams[userId] = stream;
   533	    }
   534	  }
   535	
   536	  makeDraggable(el) {
   537	    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
   538	    const header = el.querySelector('.camera-window-header');
   539	    
   540	    const dragMouseDown = (e) => {
   541	      e = e || window.event;
   542	      // Handle both mouse and touch
   543	      const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
   544	      const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
   545	      
   546	      pos3 = clientX;
   547	      pos4 = clientY;
   548	      
   549	      if (e.type === 'mousedown') {
   550	        document.onmouseup = closeDragElement;
   551	        document.onmousemove = elementDrag;
   552	      } else {
   553	        document.ontouchend = closeDragElement;
   554	        document.ontouchmove = elementDrag;
   555	      }
   556	    };
   557	
   558	    const elementDrag = (e) => {
   559	      e = e || window.event;
   560	      // Prevent scrolling while dragging on touch
   561	      if (e.type === 'touchmove') e.preventDefault();
   562	      
   563	      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
   564	      const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
   565	      
   566	      pos1 = pos3 - clientX;
   567	      pos2 = pos4 - clientY;
   568	      pos3 = clientX;
   569	      pos4 = clientY;
   570	      
   571	      el.style.top = (el.offsetTop - pos2) + "px";
   572	      el.style.left = (el.offsetLeft - pos1) + "px";
   573	      // Clear right/transform if dragged
   574	      el.style.right = 'auto';
   575	      el.style.transform = 'none';
   576	    };
   577	
   578	    const closeDragElement = () => {
   579	      document.onmouseup = null;
   580	      document.onmousemove = null;
   581	      document.ontouchend = null;
   582	      document.ontouchmove = null;
   583	    };
   584	    
   585	    header.onmousedown = dragMouseDown;
   586	    header.addEventListener('touchstart', dragMouseDown, { passive: false });
   587	  }
   588	
   589	  stopViewing(userId) {
   590	    this.socket.emit('camera:end', { targetId: userId });
   591	    this.cleanupSession(userId);
   592	  }
   593	
   594	  getOrCreatePeerConnection(userId, isOwner) {
   595	    if (this.peerConnections[userId]) return this.peerConnections[userId];
   596	
   597	    const pc = new RTCPeerConnection(this.config);
   598	
   599	    pc.onicecandidate = (event) => {
   600	      if (event.candidate) {
   601	        this.socket.emit('camera:candidate', {
   602	          targetId: userId,
   603	          candidate: event.candidate
   604	        });
   605	      }
   606	    };
   607	
   608	    pc.ontrack = (event) => {
   609	      console.log('[Camera] Received remote track for', userId);
   610	      this.bindStreamToVideo(userId, event.streams[0]);
   611	    };
   612	
   613	    pc.oniceconnectionstatechange = () => {
   614	      console.log(`[Camera] ICE Status (${userId}):`, pc.iceConnectionState);
   615	      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
   616	        this.cleanupSession(userId);
   617	      }
   618	    };
   619	
   620	    this.peerConnections[userId] = pc;
   621	    this.flushPendingCandidates(userId);
   622	    return pc;
   623	  }
   624	
   625	  async handleOffer(data) {
   626	    const { fromId, offer } = data;
   627	    const pc = this.getOrCreatePeerConnection(fromId, false);
   628	    
   629	    try {
   630	      await pc.setRemoteDescription(new RTCSessionDescription(offer));
   631	      const answer = await pc.createAnswer();
   632	      await pc.setLocalDescription(answer);
   633	
   634	      this.socket.emit('camera:answer', {
   635	        targetId: fromId,
   636	        answer: answer
   637	      });
   638	
   639	      this.flushPendingCandidates(fromId);
   640	    } catch (e) {
   641	      console.error('[Camera] Error handling offer:', e);
   642	    }
   643	  }
   644	
   645	  async handleAnswer(data) {
   646	    const { fromId, answer } = data;
   647	    const pc = this.peerConnections[fromId];
   648	    if (pc) {
   649	      try {
   650	        await pc.setRemoteDescription(new RTCSessionDescription(answer));
   651	        this.flushPendingCandidates(fromId);
   652	      } catch (e) {
   653	        console.error('[Camera] Error handling answer:', e);
   654	      }
   655	    }
   656	  }
   657	
   658	  async handleCandidate(data) {
   659	    const { fromId, candidate } = data;
   660	    const pc = this.peerConnections[fromId];
   661	    
   662	    if (!pc || !pc.remoteDescription) {
   663	      if (!this.pendingCandidates[fromId]) this.pendingCandidates[fromId] = [];
   664	      this.pendingCandidates[fromId].push(candidate);
   665	      return;
   666	    }
   667	
   668	    try {
   669	      await pc.addIceCandidate(new RTCIceCandidate(candidate));
   670	    } catch (e) {
   671	      console.error('[Camera] Error adding ice candidate', e);
   672	    }
   673	  }
   674	
   675	  async flushPendingCandidates(userId) {
   676	    const pc = this.peerConnections[userId];
   677	    if (!pc || !pc.remoteDescription || !this.pendingCandidates[userId]) return;
   678	
   679	    const candidates = this.pendingCandidates[userId];
   680	    delete this.pendingCandidates[userId];
   681	
   682	    for (const cand of candidates) {
   683	      try {
   684	        await pc.addIceCandidate(new RTCIceCandidate(cand));
   685	      } catch (e) {
   686	        console.warn('[Camera] ICE candidate buffer flush error', e);
   687	      }
   688	    }
   689	  }
   690	
   691	  cleanupSession(userId) {
   692	    const pc = this.peerConnections[userId];
   693	    if (pc) {
   694	      pc.close();
   695	      delete this.peerConnections[userId];
   696	    }
   697	
   698	    delete this.pendingCandidates[userId];
   699	    delete this.remoteStreams[userId];
   700	
   701	    const videoWindow = document.getElementById(`camera-view-${userId}`);
   702	    if (videoWindow) {
   703	      videoWindow.remove();
   704	    }
   705	
   706	    if (Object.keys(this.peerConnections).length === 0 && this.localStream) {
   707	      this.localStream.getTracks().forEach(track => track.stop());
   708	      this.localStream = null;
   709	      console.log('[Camera] Local stream stopped');
   710	      const localPrev = document.getElementById('camera-local-preview');
   711	      if (localPrev) localPrev.remove();
   712	    }
   713	  }
   714	}
   715	
   716	window.CameraManager = CameraManager;
   717	