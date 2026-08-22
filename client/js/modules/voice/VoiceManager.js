     1	import { voiceState } from './voiceState.js';
     2	
     3	const IceServerURL = [
     4	  { urls: "stun:stun.l.google.com:19302" },
     5	  { urls: "stun:stun1.l.google.com:19302" },
     6	  { urls: "stun:stun2.l.google.com:19302" },
     7	  { urls: "stun:stun3.l.google.com:19302" },
     8	  { urls: "stun:stun4.l.google.com:19302" },
     9	  { urls: "stun:stun.chat-host.net:5349" },
    10	  { urls: "stun:stun.chat-host.net" },
    11	  { urls: ["turn:eu-0.turn.peerjs.com:3478","turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" },
    12	  { urls: ["turn:turn.chat-host.net:5349?transport=udp","turn:turn.chat-host.net:5349?transport=tcp","turns:turn.chat-host.net:5349?transport=tcp","turn:turn.chat-host.net:443?transport=udp","turn:turn.chat-host.net:443?transport=tcp","turns:turn.chat-host.net:443?transport=tcp"], username: "gN3yO0cF0uM6mQ2yU4tY3lR9vQ3qA9uA", credential: "fE7lY5-oR5tU0-fE5qY1-oE1oL5-pA5pU0" },
    13	  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelaypassword" },
    14	  { urls: "stun:fr-turn3.xirsys.com" },
    15	  { urls: ["turn:fr-turn3.xirsys.com:80?transport=udp","turn:fr-turn3.xirsys.com:3478?transport=udp","turn:fr-turn3.xirsys.com:80?transport=tcp","turn:fr-turn3.xirsys.com:3478?transport=tcp","turns:fr-turn3.xirsys.com:443?transport=tcp","turns:fr-turn3.xirsys.com:5349?transport=tcp"], username: "tXzcEcDOut6ZNSuKQqTRWklYZwYrMJN0JQK2kly4cJmPews5xLNVT1b3WTleKKByAAAAAGV0k3NtYWhkb3VzaA==", credential: "a90a77d6-96ae-11ee-94a6-0242ac120004" },
    16	  { urls: "stun:stun.relay.metered.ca:80" },
    17	  { urls: "turn:a.relay.metered.ca:80", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    18	  { urls: "turn:a.relay.metered.ca:80?transport=tcp", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    19	  { urls: "turn:a.relay.metered.ca:443", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" },
    20	  { urls: "turn:a.relay.metered.ca:443?transport=tcp", username: "5f025bd8d5e77a4b4de579ef", credential: "G2tiPbvwxPK9UliE" }
    21	];
    22	
    23	export class VoiceManager {
    24	  constructor(socket) {
    25	    this.socket = socket;
    26	    this.state = voiceState;
    27	    this.audioSessionUnlocked = false;
    28	    this.silentAudioEl = null;
    29	    this.pendingRemoteAudio = new Set();
    30	    this.visualizerAudioContext = null;
    31	    this.visualizers = new Map();
    32	    this.visualizerAnimationFrame = null;
    33	    this.pendingIceCandidates = new Map();
    34	    this.isMicOperationPending = false;
    35	    this.pendingBroadcasterSignals = new Map();
    36	    this.signalingQueues = new Map();
    37	    this.pendingLocalStream = null;
    38	    this.audioContextResumePromise = null;
    39	    this.initSocketListeners();
    40	    this.initVisibilityListeners();
    41	  }
    42	
    43	  initVisibilityListeners() {
    44	    document.addEventListener('visibilitychange', async () => {
    45	        if (document.visibilityState === 'visible') {
    46	            console.warn('[VoiceAudio] Page became visible. Ensuring AudioContext is running.');
    47	            void this.ensureVoiceAudioContextRunning();
    48	            if (this.audioSessionUnlocked && this.silentAudioEl && this.silentAudioEl.paused) {
    49	                this.silentAudioEl.play().catch(() => {});
    50	            }
    51	            this.retryPendingRemoteAudio();
    52	            for (const socketId in this.state.audioElements) {
    53	                const el = this.state.audioElements[socketId];
    54	                if (el && el.paused && (!el.muted || el.volume > 0)) {
    55	                    this.playRemoteAudio(el, socketId);
    56	                }
    57	            }
    58	        }
    59	    });
    60	    
    61	    window.addEventListener('pageshow', async () => {
    62	        console.warn('[VoiceAudio] Page show event. Ensuring AudioContext is running.');
    63	        void this.ensureVoiceAudioContextRunning();
    64	        this.retryPendingRemoteAudio();
    65	    });
    66	    
    67	    window.addEventListener('focus', async () => {
    68	        console.warn('[VoiceAudio] Page focused. Ensuring AudioContext is running.');
    69	        void this.ensureVoiceAudioContextRunning();
    70	        this.retryPendingRemoteAudio();
    71	    });
    72	    
    73	    const interactionHandler = async () => {
    74	        if (!this.audioSessionUnlocked) {
    75	            this.unlockAudioSession();
    76	        }
    77	        void this.ensureVoiceAudioContextRunning();
    78	        this.retryPendingRemoteAudio();
    79	    };
    80	    
    81	    document.addEventListener('pointerdown', interactionHandler, { passive: true });
    82	    document.addEventListener('touchstart', interactionHandler, { passive: true });
    83	    document.addEventListener('click', interactionHandler, { passive: true });
    84	  }
    85	
    86	  unlockAudioSession() {
    87	    if (this.audioSessionUnlocked) return;
    88	    this.startSilentAudioSession();
    89	    void this.ensureVoiceAudioContextRunning();
    90	  }
    91	
    92	  startSilentAudioSession() {
    93	    if (this.silentAudioEl) {
    94	      if (this.silentAudioEl.paused) {
    95	        this.silentAudioEl.play().catch(() => {});
    96	      }
    97	      return;
    98	    }
    99	
   100	    let existingAnchor = document.getElementById('voice-audio-session-anchor');
   101	    if (existingAnchor) {
   102	      this.silentAudioEl = existingAnchor;
   103	    } else {
   104	      try {
   105	        this.silentAudioEl = document.createElement('audio');
   106	        this.silentAudioEl.id = 'voice-audio-session-anchor';
   107	        Object.assign(this.silentAudioEl.style, {
   108	          position: 'fixed',
   109	          left: '-9999px',
   110	          top: '-9999px',
   111	          width: '1px',
   112	          height: '1px',
   113	          opacity: '0',
   114	          pointerEvents: 'none'
   115	        });
   116	        this.silentAudioEl.autoplay = false;
   117	        this.silentAudioEl.loop = true;
   118	        this.silentAudioEl.preload = 'auto';
   119	        this.silentAudioEl.playsInline = true;
   120	        this.silentAudioEl.setAttribute('playsinline', '');
   121	        this.silentAudioEl.setAttribute('webkit-playsinline', '');
   122	        this.silentAudioEl.src = '/sounds/voice-silence.mp3';
   123	        document.body.appendChild(this.silentAudioEl);
   124	      } catch (e) {
   125	        console.warn('Error creating silent audio session element:', e);
   126	        return;
   127	      }
   128	    }
   129	
   130	    try {
   131	      const playPromise = this.silentAudioEl.play();
   132	      if (playPromise !== undefined) {
   133	        playPromise.then(() => {
   134	          this.audioSessionUnlocked = true;
   135	          this.retryPendingRemoteAudio();
   136	        }).catch(err => {
   137	          console.warn('Silent audio session failed to start:', err);
   138	          // Keep element to retry on next interaction
   139	        });
   140	      } else {
   141	        this.audioSessionUnlocked = true;
   142	        this.retryPendingRemoteAudio();
   143	      }
   144	    } catch (e) {
   145	      console.warn('Error starting silent audio session play:', e);
   146	    }
   147	  }
   148	
   149	  stopSilentAudioSession() {
   150	    if (this.silentAudioEl) {
   151	      try { this.silentAudioEl.pause(); } catch (e) {}
   152	      this.silentAudioEl.src = '';
   153	      try { this.silentAudioEl.removeAttribute('src'); } catch (e) {}
   154	      try { this.silentAudioEl.remove(); } catch (e) {}
   155	      this.silentAudioEl = null;
   156	    }
   157	    const existingAnchor = document.getElementById('voice-audio-session-anchor');
   158	    if (existingAnchor) {
   159	      try { existingAnchor.pause(); } catch (e) {}
   160	      existingAnchor.src = '';
   161	      try { existingAnchor.remove(); } catch (e) {}
   162	    }
   163	    this.audioSessionUnlocked = false;
   164	  }
   165	
   166	  async playRemoteAudio(audioEl, socketId) {
   167	    if (!audioEl) return;
   168	
   169	    try {
   170	      await audioEl.play();
   171	      this.pendingRemoteAudio.delete(socketId);
   172	    } catch (err) {
   173	      if (
   174	        err.name === 'NotAllowedError' ||
   175	        err.name === 'AbortError'
   176	      ) {
   177	        this.pendingRemoteAudio.add(socketId);
   178	      } else {
   179	        console.warn(
   180	          `[VoiceAudio] Failed to play remote audio for ${socketId}:`,
   181	          err
   182	        );
   183	      }
   184	    }
   185	  }
   186	
   187	  retryPendingRemoteAudio() {
   188	    if (!this.pendingRemoteAudio || this.pendingRemoteAudio.size === 0) return;
   189	    for (const socketId of this.pendingRemoteAudio) {
   190	      const audioEl = this.state.audioElements[socketId];
   191	      if (audioEl) {
   192	        this.playRemoteAudio(audioEl, socketId);
   193	      } else {
   194	        this.pendingRemoteAudio.delete(socketId);
   195	      }
   196	    }
   197	  }
   198	
   199	  initSocketListeners() {
   200	    this.socket.on('voice:state', (data) => {
   201	      if (data.roomId !== window.state.currentRoomId) return;
   202	      
   203	      const oldMicsState = { ...this.state.micsState };
   204	      this.state.micsState = data.mics || {};
   205	      
   206	      // Pass 1: Identify moved sessions before processing leave/join
   207	      const movedSessions = new Set();
   208	      for (const newIdx in this.state.micsState) {
   209	          const newUser = this.state.micsState[newIdx];
   210	          if (!newUser) continue;
   211	          
   212	          for (const oldIdx in oldMicsState) {
   213	              const oldUser = oldMicsState[oldIdx];
   214	              if (!oldUser) continue;
   215	              
   216	              if (oldUser.socketId === newUser.socketId && oldUser.voiceSessionId === newUser.voiceSessionId && oldIdx !== newIdx) {
   217	                  movedSessions.add(newUser.voiceSessionId);
   218	                  
   219	                  if (newUser.socketId === this.socket.id) {
   220	                      this.state.currentMicIndex = parseInt(newIdx);
   221	                  }
   222	                  break;
   223	              }
   224	          }
   225	      }
   226	      
   227	      this.updateUI();
   228	      
   229	      const allIndices = new Set([
   230	        ...Object.keys(oldMicsState),
   231	        ...Object.keys(this.state.micsState)
   232	      ]);
   233	      
   234	      for (const idx of allIndices) {
   235	        const oldUser = oldMicsState[idx];
   236	        const newUser = this.state.micsState[idx];
   237	        
   238	        // Case 1: New user joined or changed on this mic
   239	        if (newUser && (!oldUser || oldUser.socketId !== newUser.socketId)) {
   240	          if (!movedSessions.has(newUser.voiceSessionId)) {
   241	            if (newUser.socketId !== this.socket.id) {
   242	              this.connectToPeer(newUser.socketId, parseInt(idx), newUser.voiceSessionId);
   243	            } else {
   244	              if (newUser.isMutedSelf !== undefined) {
   245	                this.state.isMuted = newUser.isMutedSelf;
   246	                if (this.state.localStream) {
   247	                  this.state.localStream.getAudioTracks().forEach(track => {
   248	                    track.enabled = !this.state.isMuted;
   249	                  });
   250	                }
   251	              }
   252	            }
   253	          }
   254	        }
   255	        
   256	        // Case 2: User left this mic
   257	        if (oldUser && (!newUser || oldUser.socketId !== newUser.socketId)) {
   258	          if (!movedSessions.has(oldUser.voiceSessionId)) {
   259	            if (oldUser.socketId === this.socket.id) {
   260	              console.log('Detected we are no longer on mic via voice:state');
   261	              this.stopBroadcasting();
   262	            } else {
   263	              this.disconnectFromPeer(oldUser.socketId, oldUser.voiceSessionId);
   264	            }
   265	          }
   266	        }
   267	
   268	        // Case 3: Existing user changed state
   269	        if (newUser && oldUser && newUser.socketId === oldUser.socketId && newUser.voiceSessionId === oldUser.voiceSessionId) {
   270	          if (newUser.socketId === this.socket.id) {
   271	            if (newUser.isMutedSelf !== undefined && newUser.isMutedSelf !== this.state.isMuted) {
   272	              this.state.isMuted = newUser.isMutedSelf;
   273	              if (this.state.localStream) {
   274	                this.state.localStream.getAudioTracks().forEach(track => {
   275	                  track.enabled = !this.state.isMuted;
   276	                });
   277	              }
   278	            }
   279	          }
   280	        }
   281	      }
   282	    });
   283	
   284	    this.socket.on('voice:cleanup', () => {
   285	      console.log('Received voice:cleanup from server');
   286	      this.stopBroadcasting();
   287	      const menu = document.querySelector('.mic-context-menu');
   288	      if (menu) menu.remove();
   289	    });
   290	
   291	    this.socket.on('disconnect', (reason) => {
   292	      console.warn('[VoiceManager] Socket disconnected:', reason);
   293	      this.cleanup();
   294	    });
   295	
   296	    this.socket.on('connect', () => {
   297	      console.log('[VoiceManager] Socket connected/reconnected.');
   298	      this.state.currentMicIndex = null;
   299	      this.state.currentVoiceSessionId = null;
   300	    });
   301	
   302	    this.socket.on('voice:signal', async (data) => {
   303	      const { senderSocketId, signalData, voiceSessionId } = data;
   304	      
   305	      const isBroadcaster = this.isOurVoiceSession(voiceSessionId) || (this.state.currentVoiceSessionId === voiceSessionId);
   306	      
   307	      if (isBroadcaster) {
   308	        const outgoingStream = this.state.localStream || this.pendingLocalStream;
   309	        if (!outgoingStream) {
   310	          console.warn('[VoiceRTC] broadcaster signal received but no local/pending stream yet. Queueing signal.');
   311	          this.queueBroadcasterSignal(voiceSessionId, senderSocketId, signalData);
   312	          return;
   313	        }
   314	      }
   315	
   316	      const key = this.getConnectionKey(voiceSessionId, senderSocketId, isBroadcaster);
   317	      
   318	      await this.enqueueSignal(key, async () => {
   319	        let pc = this.state.peerConnections[key];
   320	        if (pc && pc.connectionState === 'closed') {
   321	          pc = null;
   322	        }
   323	        if (!pc) {
   324	          pc = this.createPeerConnection(senderSocketId, isBroadcaster, voiceSessionId);
   325	        }
   326	        await this.handleSignal(pc, senderSocketId, signalData, voiceSessionId);
   327	      });
   328	    });
   329	  }
   330	
   331	  async handleSignal(pc, senderSocketId, signalData, voiceSessionId) {
   332	    try {
   333	      if (signalData.type === 'offer') {
   334	        if (pc.signalingState !== 'stable') {
   335	          console.warn('[VoiceRTC] Ignoring duplicate/invalid offer in signaling state:', pc.signalingState);
   336	          return;
   337	        }
   338	        await pc.setRemoteDescription(new RTCSessionDescription(signalData));
   339	        const answer = await pc.createAnswer();
   340	        await pc.setLocalDescription(answer);
   341	        
   342	        this.socket.emit('voice:signal', {
   343	          targetSocketId: senderSocketId,
   344	          signalData: pc.localDescription || answer,
   345	          roomId: window.state.currentRoomId,
   346	          voiceSessionId
   347	        });
   348	        await this.processPendingIceCandidates(pc);
   349	      } else if (signalData.type === 'answer') {
   350	        if (pc.signalingState !== 'have-local-offer') {
   351	          console.warn('[VoiceRTC] Ignoring duplicate/invalid answer in signaling state:', pc.signalingState);
   352	          return;
   353	        }
   354	        await pc.setRemoteDescription(new RTCSessionDescription(signalData));
   355	        await this.processPendingIceCandidates(pc);
   356	      } else if (signalData.candidate) {
   357	        if (pc.remoteDescription && pc.remoteDescription.type) {
   358	          await pc.addIceCandidate(new RTCIceCandidate(signalData));
   359	        } else {
   360	          let candidates = this.pendingIceCandidates.get(pc) || [];
   361	          candidates.push(signalData);
   362	          this.pendingIceCandidates.set(pc, candidates);
   363	        }
   364	      }
   365	    } catch (err) {
   366	      console.error('WebRTC Signal Error:', err);
   367	    }
   368	  }
   369	
   370	  async processPendingIceCandidates(pc) {
   371	    const candidates = this.pendingIceCandidates.get(pc);
   372	    if (candidates && candidates.length > 0) {
   373	      for (const candidateData of candidates) {
   374	        try {
   375	          await pc.addIceCandidate(new RTCIceCandidate(candidateData));
   376	        } catch (e) {
   377	          console.error('Error adding pending ICE candidate:', e);
   378	        }
   379	      }
   380	    }
   381	    this.pendingIceCandidates.delete(pc);
   382	  }
   383	
   384	  async toggleMic(roomId, micIndex) {
   385	    if (this.isMicOperationPending) return;
   386	    
   387	    console.warn('[VoiceAudio] User toggling mic.');
   388	    void this.ensureVoiceAudioContextRunning();
   389	
   390	    const isActive = this.state.currentRoomId === roomId && this.state.currentMicIndex === micIndex;
   391	    
   392	    if (isActive) {
   393	      await this.leaveMic(roomId, micIndex);
   394	    } else if (this.state.currentMicIndex !== null && this.state.currentRoomId === roomId) {
   395	      await this.moveMic(roomId, micIndex);
   396	    } else {
   397	      await this.takeMic(roomId, micIndex);
   398	    }
   399	  }
   400	
   401	  async moveMic(roomId, toMicIndex) {
   402	    if (this.isMicOperationPending) return;
   403	    this.isMicOperationPending = true;
   404	    
   405	    try {
   406	      return new Promise((resolve) => {
   407	        this.socket.emit('voice:move-mic', { roomId, toMicIndex }, (res) => {
   408	          if (res && res.ok) {
   409	            this.state.currentMicIndex = toMicIndex;
   410	            // The visualizer DOM movement is handled by updateUI,
   411	            // which will be triggered by voice:state or here
   412	            this.updateUI();
   413	          } else {
   414	            const reason = res ? res.reason : 'unknown';
   415	            if (reason === 'mic-busy') {
   416	              window.showToast('هذا المايك مشغول حالياً', 'error');
   417	            } else if (reason === 'mic-locked') {
   418	              window.showToast('هذا المايك مقفل حالياً', 'error');
   419	            } else {
   420	              window.showToast('لا يمكنك الانتقال لهذا المايك حالياً', 'error');
   421	            }
   422	          }
   423	          resolve();
   424	        });
   425	      });
   426	    } finally {
   427	      this.isMicOperationPending = false;
   428	    }
   429	  }
   430	
   431	  async takeMic(roomId, micIndex) {
   432	    if (this.isMicOperationPending) return;
   433	    
   434	    console.warn('[VoiceAudio] User taking mic.');
   435	    void this.ensureVoiceAudioContextRunning();
   436	
   437	    this.isMicOperationPending = true;
   438	    
   439	    if (this.state.currentMicIndex !== null) {
   440	      window.showToast('أنت متواجد على مايك آخر بالفعل');
   441	      this.isMicOperationPending = false;
   442	      return;
   443	    }
   444	    
   445	    let tempStream = null;
   446	    try {
   447	      // Get media first to ensure permission with proper constraints for speech
   448	      const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
   449	      const audioConstraints = {
   450	        echoCancellation: supportedConstraints.echoCancellation ? true : undefined,
   451	        noiseSuppression: supportedConstraints.noiseSuppression ? true : undefined,
   452	        autoGainControl: supportedConstraints.autoGainControl ? true : undefined,
   453	        channelCount: 1
   454	      };
   455	      
   456	      tempStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
   457	      
   458	      // Hint to OS that this is speech
   459	      tempStream.getAudioTracks().forEach(track => {
   460	         if ('contentHint' in track) {
   461	             track.contentHint = 'speech';
   462	         }
   463	      });
   464	      
   465	      this.pendingLocalStream = tempStream;
   466	      console.warn('[VoiceRTC] local stream ready. Setting pendingLocalStream.');
   467	
   468	      // Second resume after getUserMedia to keep session active on iOS
   469	      void this.ensureVoiceAudioContextRunning();
   470	      
   471	      return new Promise((resolve) => {
   472	        // Ask server for permission
   473	        this.socket.emit('voice:take-mic', { roomId, micIndex }, async (res) => {
   474	          if (res && res.ok) {
   475	            this.state.localStream = this.pendingLocalStream;
   476	            this.pendingLocalStream = null;
   477	
   478	            this.state.currentRoomId = roomId;
   479	            this.state.currentMicIndex = micIndex;
   480	            this.state.currentVoiceSessionId = res.voiceSessionId;
   481	            this.state.isMuted = false;
   482	            
   483	            // Third resume to secure running audio state
   484	            void this.ensureVoiceAudioContextRunning();
   485	
   486	            // Create shared visualizer context on first mic take if not present
   487	            this.getOrCreateVisualizerAudioContext();
   488	            this.setupVisualizer(this.state.localStream, this.socket.id, res.voiceSessionId);
   489	            
   490	            this.updateUI();
   491	
   492	            // Flush broadcaster signals
   493	            await this.flushPendingBroadcasterSignals();
   494	          } else {
   495	            if (this.pendingLocalStream) {
   496	              this.pendingLocalStream.getTracks().forEach(track => track.stop());
   497	              this.pendingLocalStream = null;
   498	            }
   499	            if (tempStream) {
   500	              tempStream.getTracks().forEach(track => track.stop());
   501	            }
   502	
   503	            const rejectedSessionId = res ? res.voiceSessionId : null;
   504	            if (rejectedSessionId) {
   505	              for (const key of this.pendingBroadcasterSignals.keys()) {
   506	                if (key.startsWith(rejectedSessionId + '_')) {
   507	                  this.pendingBroadcasterSignals.delete(key);
   508	                }
   509	              }
   510	            }
   511	
   512	            const reason = res ? res.reason : 'unknown';
   513	            if (reason === 'mic-busy') {
   514	              window.showToast('هذا المايك مشغول حالياً', 'error');
   515	            } else if (reason === 'mic-locked') {
   516	              window.showToast('هذا المايك مقفل حالياً', 'error');
   517	            } else if (reason === 'already-on-mic') {
   518	              window.showToast('أنت متواجد على مايك آخر بالفعل', 'error');
   519	            } else if (reason.includes('تحتاج إلى') || reason.includes('لايك') || reason.includes('requiredLikes')) {
   520	              if (window.showLikesLimitAlert) {
   521	                window.showLikesLimitAlert(reason);
   522	              } else {
   523	                Swal.fire({
   524	                  title: 'عذراً',
   525	                  text: reason,
   526	                  icon: 'warning',
   527	                  confirmButtonText: 'موافق'
   528	                });
   529	              }
   530	            } else {
   531	              window.showToast('لا يمكنك الصعود على المايك حالياً', 'error');
   532	            }
   533	          }
   534	          resolve();
   535	        });
   536	      });
   537	    } catch (err) {
   538	      if (tempStream) {
   539	        tempStream.getTracks().forEach(track => track.stop());
   540	      }
   541	      if (this.pendingLocalStream) {
   542	        this.pendingLocalStream.getTracks().forEach(track => track.stop());
   543	        this.pendingLocalStream = null;
   544	      }
   545	      window.showToast('فشل في الوصول للمايكروفون');
   546	      console.error(err);
   547	    } finally {
   548	      this.isMicOperationPending = false;
   549	    }
   550	  }
   551	
   552	  async leaveMic(roomId, micIndex) {
   553	    if (this.isMicOperationPending) return;
   554	    this.isMicOperationPending = true;
   555	    try {
   556	      this.socket.emit('voice:leave-mic', { roomId, micIndex });
   557	      this.stopBroadcasting();
   558	    } finally {
   559	      this.isMicOperationPending = false;
   560	    }
   561	  }
   562	
   563	  getOrCreateVisualizerAudioContext() {
   564	    if (!this.visualizerAudioContext || this.visualizerAudioContext.state === 'closed') {
   565	      this.visualizerAudioContext = new (window.AudioContext || window.webkitAudioContext)();
   566	      this.setupAudioContextStateChangeListener(this.visualizerAudioContext);
   567	    }
   568	    return this.visualizerAudioContext;
   569	  }
   570	
   571	  setupAudioContextStateChangeListener(ctx) {
   572	    if (!ctx) return;
   573	    ctx.onstatechange = () => {
   574	      console.warn('[VoiceAudio] context state changed to:', ctx.state);
   575	      if (ctx.state === 'running') {
   576	        this.onVoiceAudioContextResumed();
   577	      }
   578	    };
   579	  }
   580	
   581	  onVoiceAudioContextResumed() {
   582	    console.warn('[VoiceAudio] AudioContext running.');
   583	    this.retryPendingRemoteAudio();
   584	  }
   585	
   586	  async ensureVoiceAudioContextRunning() {
   587	    const ctx = this.getOrCreateVisualizerAudioContext();
   588	    if (!ctx) return null;
   589	    
   590	    if (ctx.state !== 'running' && ctx.state !== 'closed') {
   591	      if (this.audioContextResumePromise) {
   592	        return this.audioContextResumePromise;
   593	      }
   594	      
   595	      console.warn('[VoiceAudio] attempting to resume context, current state:', ctx.state);
   596	      this.audioContextResumePromise = ctx.resume().then(() => {
   597	        this.audioContextResumePromise = null;
   598	        if (ctx.state === 'running') {
   599	          console.warn('[VoiceAudio] context successfully resumed and running');
   600	          this.onVoiceAudioContextResumed();
   601	        }
   602	      }).catch(err => {
   603	        this.audioContextResumePromise = null;
   604	        console.warn('[VoiceAudio] Failed to resume voice audio context:', err);
   605	      });
   606	      
   607	      return this.audioContextResumePromise;
   608	    }
   609	    return ctx;
   610	  }
   611	
   612	  resumeVisualizerAudioContext() {
   613	    void this.ensureVoiceAudioContextRunning();
   614	  }
   615	
   616	  setupVisualizer(stream, socketId, voiceSessionId) {
   617	    if (!stream || !socketId || !voiceSessionId) return;
   618	    const ctx = this.getOrCreateVisualizerAudioContext();
   619	    
   620	    // Don't duplicate if already exists for this session
   621	    if (this.visualizers.has(voiceSessionId)) return;
   622	    
   623	    try {
   624	      const analyser = ctx.createAnalyser();
   625	      analyser.fftSize = 512;
   626	      analyser.smoothingTimeConstant = 0.75;
   627	      
   628	      const source = ctx.createMediaStreamSource(stream);
   629	      source.connect(analyser);
   630	      
   631	      this.visualizers.set(voiceSessionId, {
   632	        analyser,
   633	        source,
   634	        stream,
   635	        socketId,
   636	        dataArray: new Uint8Array(analyser.frequencyBinCount)
   637	      });
   638	      
   639	      if (!this.visualizerAnimationFrame) {
   640	        this.renderVisualizerFrame();
   641	      }
   642	    } catch (err) {
   643	      console.warn('Failed to setup visualizer:', err);
   644	    }
   645	  }
   646	
   647	  stopVisualizer(voiceSessionId) {
   648	    const viz = this.visualizers.get(voiceSessionId);
   649	    if (viz) {
   650	      try { viz.source.disconnect(); } catch (e) {}
   651	      this.visualizers.delete(voiceSessionId);
   652	    }
   653	  }
   654	
   655	  stopAllVisualizers() {
   656	    for (const [voiceSessionId, viz] of this.visualizers.entries()) {
   657	      try { viz.source.disconnect(); } catch (e) {}
   658	    }
   659	    this.visualizers.clear();
   660	    if (this.visualizerAnimationFrame) {
   661	      cancelAnimationFrame(this.visualizerAnimationFrame);
   662	      this.visualizerAnimationFrame = null;
   663	    }
   664	  }
   665	
   666	  renderVisualizerFrame() {
   667	    if (this.visualizers.size === 0 || !window.state.currentRoomId) {
   668	      this.visualizerAnimationFrame = null;
   669	      return;
   670	    }
   671	    
   672	    for (const [voiceSessionId, viz] of this.visualizers.entries()) {
   673	      // Find current mic index for this session
   674	      let currentMicIndex = null;
   675	      for (const idx in this.state.micsState) {
   676	        const user = this.state.micsState[idx];
   677	        if (user && user.socketId === viz.socketId && user.voiceSessionId === voiceSessionId) {
   678	          currentMicIndex = parseInt(idx);
   679	          break;
   680	        }
   681	      }
   682	      
   683	      if (currentMicIndex === null) {
   684	        // User is no longer on a mic with this session, but we wait for cleanup to remove them
   685	        continue;
   686	      }
   687	      
   688	      const micButtons = document.querySelectorAll('.btn-mic');
   689	      const btn = micButtons[currentMicIndex - 1];
   690	      if (!btn) continue;
   691	      
   692	      // Ensure DOM exists
   693	      let visualizer = btn.querySelector('.mic-visualizer');
   694	      if (!visualizer) {
   695	        visualizer = document.createElement('div');
   696	        visualizer.className = 'mic-visualizer';
   697	        for (let i = 0; i < 7; i++) {
   698	          const bar = document.createElement('div');
   699	          bar.className = 'visualizer-bar';
   700	          visualizer.appendChild(bar);
   701	        }
   702	        btn.appendChild(visualizer);
   703	      }
   704	      
   705	      viz.analyser.getByteTimeDomainData(viz.dataArray);
   706	      
   707	      let rms = 0;
   708	      for (let i = 0; i < viz.dataArray.length; i++) {
   709	        const val = (viz.dataArray[i] - 128) / 128;
   710	        rms += val * val;
   711	      }
   712	      rms = Math.sqrt(rms / viz.dataArray.length);
   713	      
   714	      const isSpeaking = rms > 0.015; // Threshold for speech
   715	      
   716	      if (isSpeaking) {
   717	        const level = Math.min(1, rms * 5); // Scale RMS for UI
   718	        btn.style.setProperty('--mic-level', level.toFixed(2));
   719	        btn.classList.add('speaking');
   720	        
   721	        // Update bars
   722	        viz.analyser.getByteFrequencyData(viz.dataArray);
   723	        const bars = visualizer.querySelectorAll('.visualizer-bar');
   724	        const step = Math.floor(viz.dataArray.length / bars.length);
   725	        
   726	        bars.forEach((bar, i) => {
   727	          const val = viz.dataArray[i * step];
   728	          const height = Math.max(2, (val / 255) * 20); // Max height 20px
   729	          bar.style.height = `${height}px`;
   730	        });
   731	        
   732	        const icon = btn.querySelector('i');
   733	        if (icon) icon.style.color = '#28a745';
   734	      } else {
   735	        btn.style.setProperty('--mic-level', '0');
   736	        btn.classList.remove('speaking');
   737	        
   738	        const bars = visualizer.querySelectorAll('.visualizer-bar');
   739	        bars.forEach(bar => bar.style.height = '2px');
   740	        
   741	        const icon = btn.querySelector('i');
   742	        if (icon) icon.style.color = '';
   743	      }
   744	    }
   745	    
   746	    this.visualizerAnimationFrame = requestAnimationFrame(() => this.renderVisualizerFrame());
   747	  }
   748	
   749	  stopBroadcasting() {
   750	    console.log('Stopping broadcasting and cleaning up local voice state...');
   751	    
   752	    // Stop our own visualizer
   753	    if (this.state.currentVoiceSessionId) {
   754	       this.stopVisualizer(this.state.currentVoiceSessionId);
   755	    }
   756	    
   757	    // Stop pendingLocalStream if any
   758	    if (this.pendingLocalStream) {
   759	      this.pendingLocalStream.getTracks().forEach(track => {
   760	        try { track.stop(); } catch (e) {}
   761	        console.log('[VoiceRTC] stopped pendingLocalStream track:', track.kind);
   762	      });
   763	      this.pendingLocalStream = null;
   764	    }
   765	
   766	    // 1. Stop local stream tracks
   767	    if (this.state.localStream) {
   768	      this.state.localStream.getTracks().forEach(track => {
   769	        try { track.stop(); } catch (e) {}
   770	        console.log('Stopped track:', track.kind);
   771	      });
   772	      this.state.localStream = null;
   773	    }
   774	
   775	    // Clear queues
   776	    this.pendingBroadcasterSignals.clear();
   777	
   778	    // 2. Close all peer connections where we were the broadcaster
   779	    for (const key in this.state.peerConnections) {
   780	      const pc = this.state.peerConnections[key];
   781	      // If this PC has an outgoing audio track, it's a broadcast connection
   782	      const isBroadcaster = pc.getSenders().some(sender => sender.track && sender.track.kind === 'audio');
   783	      
   784	      if (isBroadcaster) {
   785	        console.log('Closing broadcast connection:', key);
   786	        try { pc.close(); } catch (e) {}
   787	        delete this.state.peerConnections[key];
   788	        this.pendingIceCandidates.delete(pc);
   789	      }
   790	    }
   791	
   792	    // 3. Reset local state
   793	    this.state.currentMicIndex = null;
   794	    this.state.currentRoomId = null;
   795	    this.state.currentVoiceSessionId = null;
   796	    this.state.isMuted = false;
   797	    
   798	    // 4. Reset UI styles for ALL mic buttons to be safe
   799	    const micButtons = document.querySelectorAll('.btn-mic');
   800	    micButtons.forEach(btn => {
   801	      btn.style.removeProperty('box-shadow');
   802	      btn.style.removeProperty('border');
   803	      btn.style.removeProperty('border-color');
   804	      btn.style.removeProperty('--mic-level');
   805	      btn.blur();
   806	      // Remove any visualizer classes if they exist
   807	      btn.classList.remove('speaking'); 
   808	      
   809	      const visualizer = btn.querySelector('.mic-visualizer');
   810	      if (visualizer) visualizer.remove();
   811	      
   812	      const icon = btn.querySelector('i');
   813	      if (icon) {
   814	        icon.style.textShadow = 'none';
   815	        icon.style.color = '';
   816	      }
   817	    });
   818	    
   819	    this.updateUI();
   820	  }
   821	
   822	  cleanup() {
   823	    console.log('Cleaning up VoiceManager (local-only)...');
   824	    
   825	    // Stop silent audio session
   826	    try {
   827	      this.stopSilentAudioSession();
   828	    } catch (e) {
   829	      console.warn('[VoiceManager] Error stopping silent audio session in cleanup:', e);
   830	    }
   831	
   832	    // Stop local broadcasting (stops local stream tracks & resets mic button UI)
   833	    try {
   834	      this.stopBroadcasting();
   835	    } catch (e) {
   836	      console.warn('[VoiceManager] Error in stopBroadcasting during cleanup:', e);
   837	    }
   838	
   839	    // Stop all visualizers & Web Audio context
   840	    try {
   841	      this.stopAllVisualizers();
   842	    } catch (e) {
   843	      console.warn('[VoiceManager] Error in stopAllVisualizers during cleanup:', e);
   844	    }
   845	
   846	    if (this.visualizerAudioContext) {
   847	      try {
   848	        if (this.visualizerAudioContext.state !== 'closed') {
   849	          this.visualizerAudioContext.close().catch(() => {});
   850	        }
   851	      } catch (e) {}
   852	      this.visualizerAudioContext = null;
   853	    }
   854	
   855	    // Close all peer connections and stop sender/receiver tracks
   856	    if (this.state && this.state.peerConnections) {
   857	      for (const key in this.state.peerConnections) {
   858	        const pc = this.state.peerConnections[key];
   859	        if (pc) {
   860	          try {
   861	            if (typeof pc.getSenders === 'function') {
   862	              pc.getSenders().forEach(sender => {
   863	                if (sender && sender.track) {
   864	                  try { sender.track.stop(); } catch (e) {}
   865	                }
   866	              });
   867	            }
   868	            if (typeof pc.getReceivers === 'function') {
   869	              pc.getReceivers().forEach(receiver => {
   870	                if (receiver && receiver.track) {
   871	                  try { receiver.track.stop(); } catch (e) {}
   872	                }
   873	              });
   874	            }
   875	            pc.close();
   876	          } catch (e) {}
   877	        }
   878	        delete this.state.peerConnections[key];
   879	      }
   880	    }
   881	
   882	    if (this.pendingIceCandidates) {
   883	      try { this.pendingIceCandidates.clear(); } catch (e) {}
   884	    }
   885	    if (this.pendingBroadcasterSignals) {
   886	      try { this.pendingBroadcasterSignals.clear(); } catch (e) {}
   887	    }
   888	    if (this.signalingQueues) {
   889	      try { this.signalingQueues.clear(); } catch (e) {}
   890	    }
   891	
   892	    // Remove all remote audio elements & stop their media streams
   893	    if (this.state && this.state.audioElements) {
   894	      for (const socketId in this.state.audioElements) {
   895	        const audioEl = this.state.audioElements[socketId];
   896	        if (audioEl) {
   897	          try {
   898	            audioEl.pause();
   899	            if (audioEl.srcObject && typeof audioEl.srcObject.getTracks === 'function') {
   900	              audioEl.srcObject.getTracks().forEach(track => {
   901	                try { track.stop(); } catch (e) {}
   902	              });
   903	            }
   904	            audioEl.srcObject = null;
   905	            audioEl.src = '';
   906	            audioEl.removeAttribute('src');
   907	            try { audioEl.load(); } catch (e) {}
   908	            audioEl.remove();
   909	          } catch (e) {}
   910	        }
   911	        delete this.state.audioElements[socketId];
   912	      }
   913	    }
   914	
   915	    if (this.pendingRemoteAudio) {
   916	      try { this.pendingRemoteAudio.clear(); } catch (e) {}
   917	    }
   918	
   919	    // Reset state & update UI
   920	    if (this.state) {
   921	      this.state.micsState = {};
   922	    }
   923	    try {
   924	      this.updateUI();
   925	    } catch (e) {}
   926	  }
   927	
   928	  applyRemoteGain(socketId) {
   929	    const isMuted = this.state.localMutedUsers.has(socketId) || this.state.isIncomingMuted;
   930	    const userVolume = this.state.localVolumes[socketId] ?? 1;
   931	    const masterVolume = this.state.masterIncomingVolume ?? 1;
   932	    
   933	    const effectiveVolume = Math.max(0, Math.min(1, userVolume * masterVolume));
   934	    
   935	    const audioEl = this.state.audioElements[socketId];
   936	    if (audioEl) {
   937	      audioEl.muted = isMuted || effectiveVolume === 0;
   938	      try {
   939	        audioEl.volume = audioEl.muted ? 0 : effectiveVolume;
   940	      } catch (err) {
   941	        console.debug('[VoiceAudio] Browser does not support programmatic volume', err);
   942	      }
   943	    }
   944	  }
   945	
   946	  setIncomingVolume(volume) {
   947	    const vol = Math.max(0, Math.min(1, parseFloat(volume) || 0));
   948	    this.state.masterIncomingVolume = vol;
   949	    for (const socketId in this.state.audioElements) {
   950	       this.applyRemoteGain(socketId);
   951	    }
   952	    this.resumeVisualizerAudioContext();
   953	  }
   954	
   955	  setIncomingMuted(isMuted) {
   956	    this.state.isIncomingMuted = isMuted;
   957	    for (const socketId in this.state.audioElements) {
   958	      this.applyRemoteGain(socketId);
   959	      
   960	      const audioEl = this.state.audioElements[socketId];
   961	      if (audioEl && !isMuted && !this.state.localMutedUsers.has(socketId)) {
   962	          this.playRemoteAudio(audioEl, socketId);
   963	      }
   964	    }
   965	    if (!isMuted) {
   966	        this.retryPendingRemoteAudio();
   967	    }
   968	  }
   969	
   970	  toggleMuteSelf() {
   971	    if (!this.state.currentMicIndex) return;
   972	    const newMuteState = !this.state.isMuted;
   973	    this.state.isMuted = newMuteState;
   974	    
   975	    if (this.state.localStream) {
   976	      this.state.localStream.getAudioTracks().forEach(track => {
   977	        track.enabled = !newMuteState;
   978	      });
   979	    }
   980	    
   981	    this.socket.emit('voice:toggle-mute-self', {
   982	      roomId: this.state.currentRoomId,
   983	      micIndex: this.state.currentMicIndex,
   984	      isMuted: newMuteState
   985	    });
   986	    
   987	    this.updateUI();
   988	  }
   989	
   990	  toggleLocalMute(socketId) {
   991	    if (this.state.localMutedUsers.has(socketId)) {
   992	      this.state.localMutedUsers.delete(socketId);
   993	    } else {
   994	      this.state.localMutedUsers.add(socketId);
   995	    }
   996	    
   997	    this.applyRemoteGain(socketId);
   998	    
   999	    const audioEl = this.state.audioElements[socketId];
  1000	    if (audioEl && !this.state.localMutedUsers.has(socketId) && !this.state.isIncomingMuted) {
  1001	        this.playRemoteAudio(audioEl, socketId);
  1002	    }
  1003	    
  1004	    if (!this.state.localMutedUsers.has(socketId)) {
  1005	        this.retryPendingRemoteAudio();
  1006	    }
  1007	    
  1008	    this.updateUI();
  1009	  }
  1010	
  1011	  setLocalVolume(socketId, volume) {
  1012	    const vol = Math.max(0, Math.min(1, parseFloat(volume) || 0));
  1013	    this.state.localVolumes[socketId] = vol;
  1014	    this.applyRemoteGain(socketId);
  1015	  }
  1016	
  1017	  kickFromMic(micIndex) {
  1018	    this.socket.emit('voice:kick-from-mic', {
  1019	      roomId: window.state.currentRoomId,
  1020	      micIndex
  1021	    });
  1022	  }
  1023	
  1024	  pullFromMic(micIndex) {
  1025	    this.socket.emit('voice:pull-from-mic', {
  1026	      roomId: window.state.currentRoomId,
  1027	      micIndex
  1028	    }, (res) => {
  1029	      if (!res.ok) {
  1030	        window.showToast(res.reason || 'فشل سحب المايك', 'error');
  1031	      }
  1032	    });
  1033	  }
  1034	
  1035	  showMicMenu(event, micIndex) {
  1036	    event.preventDefault();
  1037	    event.stopPropagation();
  1038	    
  1039	    const user = this.state.micsState[micIndex];
  1040	    if (!user) return;
  1041	
  1042	    // Remove existing menu
  1043	    const existingMenu = document.querySelector('.mic-context-menu');
  1044	    if (existingMenu) existingMenu.remove();
  1045	
  1046	    const isSelf = user.socketId === this.socket.id;
  1047	    const menu = document.createElement('div');
  1048	    menu.className = 'mic-context-menu';
  1049	    
  1050	    // Position menu centered horizontally but starting below the mic
  1051	    const btn = event.currentTarget;
  1052	    const rect = btn.getBoundingClientRect();
  1053	    const centerX = rect.left + rect.width / 2;
  1054	    const bottomY = rect.bottom + 5;
  1055	    
  1056	    menu.style.top = `${bottomY}px`;
  1057	    menu.style.left = `${centerX}px`;
  1058	    menu.style.transform = 'translateX(-50%)'; // Only center horizontally
  1059	
  1060	    let html = '';
  1061	    if (isSelf) {
  1062	      html = `
  1063	        <div class="menu-item" id="menu-leave-mic">
  1064	          <i class="fas fa-sign-out-alt"></i> <span>ترك المايك</span>
  1065	        </div>
  1066	        <div class="menu-item" id="menu-toggle-mute">
  1067	          <i class="fas ${this.state.isMuted ? 'fa-microphone' : 'fa-microphone-slash'}"></i> 
  1068	          <span>${this.state.isMuted ? 'تفعيل المايك' : 'كتم المايك'}</span>
  1069	        </div>
  1070	        <div class="menu-item" id="menu-profile">
  1071	          <i class="fas fa-user"></i> <span>البروفايل</span>
  1072	        </div>
  1073	        <div class="menu-divider"></div>
  1074	        <div class="menu-volume">
  1075	          <i class="fas fa-volume-up"></i>
  1076	          <input type="range" min="0" max="1" step="0.01" value="${this.state.masterIncomingVolume !== undefined ? this.state.masterIncomingVolume : 1}" id="menu-master-volume">
  1077	        </div>
  1078	      `;
  1079	    } else {
  1080	      const isLocalMuted = this.state.localMutedUsers.has(user.socketId);
  1081	      const localVol = this.state.localVolumes[user.socketId] !== undefined ? this.state.localVolumes[user.socketId] : 1;
  1082	      
  1083	      // Check admin permissions
  1084	      const currentUser = window.state.currentUser;
  1085	      const room = window.roomsData ? window.roomsData[window.state.currentRoomId] : null;
  1086	      const isRoomOwner = room && currentUser && room.ownerId === currentUser.userId;
  1087	      const isGlobalAdmin = window.state.hasPermission(currentUser, 'canManageRooms');
  1088	      const perms = (currentUser && currentUser.permissions && typeof currentUser.permissions === 'object') ? currentUser.permissions : {};
  1089	      const canManageMics = isRoomOwner || isGlobalAdmin || perms.canTakeMic === true || perms.canRemoveMic === true;
  1090	      
  1091	      const hasPullPermission = isGlobalAdmin || window.state.hasPermission(currentUser, 'canPullFromMic');
  1092	      const isTargetLowerRank = currentUser && user && currentUser.group && (currentUser.group.roleRank > user.roleRank);
  1093	      const isPullDisabled = !isTargetLowerRank;
  1094	
  1095	html = `
  1096	  ${hasPullPermission ? `
  1097	  <div class="menu-item danger ${isPullDisabled ? 'disabled' : ''}" id="menu-pull-mic" title="${isPullDisabled ? 'لا يمكنك سحب عضو بنفس رتبتك أو أعلى منك' : ''}">
  1098	    <i class="fas fa-hand-rock"></i>
  1099	    <span>سحب المايك</span>
  1100	  </div>
  1101	  ` : ''}
  1102	
  1103	  <div class="menu-item" id="menu-local-mute">
  1104	    <i class="fas ${isLocalMuted ? 'fa-volume-up' : 'fa-volume-mute'}"></i> 
  1105	    <span>${isLocalMuted ? 'إلغاء كتم العضو' : 'كتم العضو محلياً'}</span>
  1106	  </div>
  1107	
  1108	  <div class="menu-item" id="menu-profile">
  1109	    <i class="fas fa-user"></i>
  1110	    <span>البروفايل</span>
  1111	  </div>
  1112	
  1113	  <div class="menu-divider"></div>
  1114	
  1115	  <div class="menu-volume">
  1116	    <i class="fas fa-volume-down"></i>
  1117	    <input type="range" min="0" max="1" step="0.01" value="${localVol}" id="menu-local-volume">
  1118	  </div>
  1119	`;
  1120	    }
  1121	
  1122	    menu.innerHTML = html;
  1123	    document.body.appendChild(menu);
  1124	
  1125	    // Add listeners
  1126	    if (isSelf) {
  1127	      menu.querySelector('#menu-leave-mic').onclick = () => {
  1128	        this.leaveMic(window.state.currentRoomId, micIndex);
  1129	        menu.remove();
  1130	      };
  1131	      menu.querySelector('#menu-toggle-mute').onclick = () => {
  1132	        this.toggleMuteSelf();
  1133	        menu.remove();
  1134	      };
  1135	      menu.querySelector('#menu-master-volume').oninput = (e) => {
  1136	        const val = parseFloat(e.target.value);
  1137	        this.setIncomingVolume(val);
  1138	      };
  1139	    } else {
  1140	      if (menu.querySelector('#menu-kick-mic')) {
  1141	        menu.querySelector('#menu-kick-mic').onclick = () => {
  1142	          this.kickFromMic(micIndex);
  1143	          menu.remove();
  1144	        };
  1145	      }
  1146	      if (menu.querySelector('#menu-pull-mic')) {
  1147	        menu.querySelector('#menu-pull-mic').onclick = () => {
  1148	          if (menu.querySelector('#menu-pull-mic').classList.contains('disabled')) {
  1149	            // Check why it's disabled and show toast
  1150	            const currentUser = window.state.currentUser;
  1151	            if (currentUser && user && currentUser.group) {
  1152	              if (user.roleRank > currentUser.group.roleRank) {
  1153	                window.showToast('لا يمكنك سحب عضو أعلى منك رتبة', 'error');
  1154	              } else if (user.roleRank === currentUser.group.roleRank) {
  1155	                window.showToast('لا يمكنك سحب عضو بنفس رتبتك', 'error');
  1156	              }
  1157	            }
  1158	            return;
  1159	          }
  1160	          this.pullFromMic(micIndex);
  1161	          menu.remove();
  1162	        };
  1163	      }
  1164	      menu.querySelector('#menu-local-mute').onclick = () => {
  1165	        this.toggleLocalMute(user.socketId);
  1166	        menu.remove();
  1167	      };
  1168	      menu.querySelector('#menu-local-volume').oninput = (e) => {
  1169	        this.setLocalVolume(user.socketId, parseFloat(e.target.value));
  1170	      };
  1171	    }
  1172	
  1173	    menu.querySelector('#menu-profile').onclick = () => {
  1174	      if (window.showUserProfile) window.showUserProfile(user.username);
  1175	      menu.remove();
  1176	    };
  1177	
  1178	    // Close on click outside
  1179	    const closeMenu = (e) => {
  1180	      if (!menu.contains(e.target)) {
  1181	        menu.remove();
  1182	        document.removeEventListener('mousedown', closeMenu);
  1183	      }
  1184	    };
  1185	    document.addEventListener('mousedown', closeMenu);
  1186	  }
  1187	
  1188	  getMicIndexBySocketId(socketId) {
  1189	    for (const [idx, user] of Object.entries(this.state.micsState)) {
  1190	      if (user && user.socketId === socketId) return parseInt(idx);
  1191	    }
  1192	    return 0;
  1193	  }
  1194	
  1195	  isOurVoiceSession(voiceSessionId) {
  1196	    for (const user of Object.values(this.state.micsState)) {
  1197	      if (user && user.voiceSessionId === voiceSessionId && user.socketId === this.socket.id) {
  1198	        return true;
  1199	      }
  1200	    }
  1201	    return false;
  1202	  }
  1203	
  1204	  getConnectionKey(voiceSessionId, otherSocketId, isBroadcaster) {
  1205	    const listenerSocketId = isBroadcaster ? otherSocketId : this.socket.id;
  1206	    return `${voiceSessionId}_${listenerSocketId}`;
  1207	  }
  1208	
  1209	  async enqueueSignal(key, fn) {
  1210	    if (!this.signalingQueues) {
  1211	      this.signalingQueues = new Map();
  1212	    }
  1213	    if (!this.signalingQueues.has(key)) {
  1214	      this.signalingQueues.set(key, Promise.resolve());
  1215	    }
  1216	    const currentPromise = this.signalingQueues.get(key);
  1217	    const nextPromise = currentPromise.then(async () => {
  1218	      try {
  1219	        await fn();
  1220	      } catch (err) {
  1221	        console.error(`[VoiceRTC] Error processing queued signal for key ${key}:`, err);
  1222	      }
  1223	    });
  1224	    this.signalingQueues.set(key, nextPromise);
  1225	    return nextPromise;
  1226	  }
  1227	
  1228	  queueBroadcasterSignal(voiceSessionId, senderSocketId, signalData) {
  1229	    const key = `${voiceSessionId}:::${senderSocketId}`;
  1230	    if (!this.pendingBroadcasterSignals.has(key)) {
  1231	      this.pendingBroadcasterSignals.set(key, {
  1232	        voiceSessionId,
  1233	        senderSocketId,
  1234	        signals: [],
  1235	        processing: false
  1236	      });
  1237	    }
  1238	    const record = this.pendingBroadcasterSignals.get(key);
  1239	    record.signals.push(signalData);
  1240	    console.warn(`[VoiceRTC] Queued broadcaster signal for session ${voiceSessionId}, sender ${senderSocketId}. Type: ${signalData.type || 'candidate'}`);
  1241	  }
  1242	
  1243	  async flushPendingBroadcasterSignals() {
  1244	    console.warn('[VoiceRTC] Flushing pending broadcaster signals. Total queued keys:', this.pendingBroadcasterSignals.size);
  1245	    const activeVoiceSessionId = this.state.currentVoiceSessionId;
  1246	    if (!activeVoiceSessionId) {
  1247	      console.warn('[VoiceRTC] No active voiceSessionId to flush.');
  1248	      return;
  1249	    }
  1250	
  1251	    for (const [key, record] of this.pendingBroadcasterSignals.entries()) {
  1252	      if (record.voiceSessionId !== activeVoiceSessionId) {
  1253	        continue;
  1254	      }
  1255	      
  1256	      if (record.processing) {
  1257	        continue;
  1258	      }
  1259	      
  1260	      record.processing = true;
  1261	      const { senderSocketId, signals } = record;
  1262	      const isBroadcaster = true;
  1263	      const connKey = this.getConnectionKey(activeVoiceSessionId, senderSocketId, isBroadcaster);
  1264	      
  1265	      console.warn(`[VoiceRTC] Queueing flush of ${signals.length} signals for session: ${activeVoiceSessionId}, sender: ${senderSocketId}`);
  1266	      
  1267	      await this.enqueueSignal(connKey, async () => {
  1268	        try {
  1269	          let pc = this.state.peerConnections[connKey];
  1270	          if (pc && pc.connectionState === 'closed') {
  1271	            pc = null;
  1272	          }
  1273	          if (!pc) {
  1274	            pc = this.createPeerConnection(senderSocketId, isBroadcaster, activeVoiceSessionId);
  1275	          }
  1276	          
  1277	          for (const signalData of signals) {
  1278	            await this.handleSignal(pc, senderSocketId, signalData, activeVoiceSessionId);
  1279	          }
  1280	          
  1281	          this.pendingBroadcasterSignals.delete(key);
  1282	          console.warn(`[VoiceRTC] Successfully flushed and cleared signals for key: ${key}`);
  1283	        } catch (err) {
  1284	          record.processing = false;
  1285	          console.error('[VoiceRTC] Error processing flush for key:', key, err);
  1286	        }
  1287	      });
  1288	    }
  1289	  }
  1290	
  1291	  createPeerConnection(targetSocketId, isBroadcaster, voiceSessionId) {
  1292	    const key = this.getConnectionKey(voiceSessionId, targetSocketId, isBroadcaster);
  1293	    
  1294	    if (this.state.peerConnections[key] && this.state.peerConnections[key].connectionState !== 'closed') {
  1295	      console.warn('[VoiceRTC] PeerConnection already exists for key inside createPeerConnection:', key);
  1296	      return this.state.peerConnections[key];
  1297	    }
  1298	
  1299	    const pc = new RTCPeerConnection({ iceServers: IceServerURL });
  1300	    this.state.peerConnections[key] = pc;
  1301	
  1302	    pc.onconnectionstatechange = () => {
  1303	      console.warn(`[VoiceRTC] PC connectionState changed for key ${key}:`, pc.connectionState);
  1304	    };
  1305	    pc.oniceconnectionstatechange = () => {
  1306	      console.warn(`[VoiceRTC] PC iceConnectionState changed for key ${key}:`, pc.iceConnectionState);
  1307	    };
  1308	
  1309	    pc.onicecandidate = (event) => {
  1310	      if (event.candidate) {
  1311	        this.socket.emit('voice:signal', {
  1312	          targetSocketId,
  1313	          signalData: event.candidate,
  1314	          roomId: window.state.currentRoomId,
  1315	          voiceSessionId
  1316	        });
  1317	      }
  1318	    };
  1319	
  1320	    if (isBroadcaster) {
  1321	      const outgoingStream = this.state.localStream || this.pendingLocalStream;
  1322	      const belongsToUs = this.isOurVoiceSession(voiceSessionId) || (this.state.currentVoiceSessionId === voiceSessionId);
  1323	      if (outgoingStream && belongsToUs) {
  1324	        outgoingStream.getTracks().forEach(track => {
  1325	          const alreadyAdded = pc.getSenders().some(sender => sender.track === track);
  1326	          if (!alreadyAdded) {
  1327	            pc.addTrack(track, outgoingStream);
  1328	            console.warn('[VoiceRTC] outgoing track attached for key:', key);
  1329	          }
  1330	        });
  1331	      } else {
  1332	        console.warn('[VoiceRTC] broadcaster requested but no local/pending stream or session doesn\'t belong to us:', key);
  1333	      }
  1334	    } else {
  1335	      console.warn('[VoiceRTC] Receiver transceiver added');
  1336	      pc.addTransceiver('audio', { direction: 'recvonly' });      pc.ontrack = async (event) => {
  1337	        console.warn('[VoiceRTC] remote track received for key:', key);
  1338	        
  1339	        const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
  1340	
  1341	        let audioEl = this.state.audioElements[targetSocketId];
  1342	        if (!audioEl) {
  1343	          audioEl = document.createElement('audio');
  1344	          audioEl.autoplay = true;
  1345	          audioEl.playsInline = true;
  1346	          audioEl.setAttribute('playsinline', '');
  1347	          audioEl.setAttribute('webkit-playsinline', '');
  1348	          
  1349	          audioEl.addEventListener('loadedmetadata', () => {
  1350	            this.playRemoteAudio(audioEl, targetSocketId);
  1351	          });
  1352	          audioEl.addEventListener('canplay', () => {
  1353	             this.playRemoteAudio(audioEl, targetSocketId);
  1354	          });
  1355	          
  1356	          this.state.audioElements[targetSocketId] = audioEl;
  1357	          document.body.appendChild(audioEl);
  1358	        }
  1359	        
  1360	        if (audioEl.srcObject !== remoteStream) {
  1361	          audioEl.srcObject = remoteStream;
  1362	        }
  1363	        
  1364	        this.applyRemoteGain(targetSocketId);
  1365	        this.setupVisualizer(remoteStream, targetSocketId, voiceSessionId);
  1366	        await this.playRemoteAudio(audioEl, targetSocketId);
  1367	        
  1368	        event.track.onunmute = async () => {
  1369	             await this.playRemoteAudio(audioEl, targetSocketId);
  1370	        };
  1371	
  1372	        // Try to resume AudioContext in the background
  1373	        void this.ensureVoiceAudioContextRunning();
  1374	      };
  1375	    }
  1376	    return pc;
  1377	  }
  1378	
  1379	  async connectToPeer(targetSocketId, micIndex, voiceSessionId) {
  1380	    const key = this.getConnectionKey(voiceSessionId, targetSocketId, false);
  1381	    let pc = this.state.peerConnections[key];
  1382	    if (pc && pc.connectionState !== 'closed') {
  1383	      console.warn('[VoiceRTC] PeerConnection already exists and is active for key:', key);
  1384	      return;
  1385	    }
  1386	
  1387	    try {
  1388	      pc = this.createPeerConnection(targetSocketId, false, voiceSessionId);
  1389	      const offer = await pc.createOffer();
  1390	      await pc.setLocalDescription(offer);
  1391	      
  1392	      this.socket.emit('voice:signal', {
  1393	        targetSocketId,
  1394	        signalData: pc.localDescription || offer,
  1395	        roomId: window.state.currentRoomId,
  1396	        voiceSessionId
  1397	      });
  1398	      console.warn(`[VoiceRTC] connectToPeer: sent offer to ${targetSocketId} for session ${voiceSessionId}`);
  1399	    } catch (err) {
  1400	      console.error('[VoiceRTC] connectToPeer failed:', err);
  1401	      if (pc) {
  1402	        try { pc.close(); } catch (e) {}
  1403	        delete this.state.peerConnections[key];
  1404	        this.pendingIceCandidates.delete(pc);
  1405	      }
  1406	    }
  1407	  }
  1408	
  1409	  disconnectFromPeer(targetSocketId, voiceSessionId) {
  1410	    const key = this.getConnectionKey(voiceSessionId, targetSocketId, false);
  1411	    const pc = this.state.peerConnections[key];
  1412	    if (pc) {
  1413	      try { pc.close(); } catch (e) {}
  1414	      delete this.state.peerConnections[key];
  1415	      this.pendingIceCandidates.delete(pc);
  1416	    }
  1417	    if (this.state.audioElements[targetSocketId]) {
  1418	      const audioEl = this.state.audioElements[targetSocketId];
  1419	      audioEl.pause();
  1420	      audioEl.srcObject = null;
  1421	      audioEl.remove();
  1422	      delete this.state.audioElements[targetSocketId];
  1423	    }
  1424	    
  1425	    this.pendingRemoteAudio.delete(targetSocketId);
  1426	    this.stopVisualizer(voiceSessionId);
  1427	  }
  1428	
  1429	  updateUser(updatedUser) {
  1430	    if (!updatedUser) return;
  1431	
  1432	    const updatedUserId = Number(updatedUser.userId ?? updatedUser.id);
  1433	
  1434	    if (!Number.isFinite(updatedUserId)) {
  1435	      console.warn('[VoiceManager.updateUser] ignored update without valid id:', updatedUser);
  1436	      return;
  1437	    }
  1438	
  1439	    let updated = false;
  1440	
  1441	    for (const micIndex in this.state.micsState) {
  1442	      const micUser = this.state.micsState[micIndex];
  1443	      if (!micUser) continue;
  1444	
  1445	      const micUserId = Number(micUser.userId ?? micUser.id);
  1446	
  1447	      if (!Number.isFinite(micUserId)) {
  1448	        continue;
  1449	      }
  1450	
  1451	      if (micUserId === updatedUserId) {
  1452	        this.state.micsState[micIndex] = {
  1453	          ...micUser,
  1454	          ...updatedUser,
  1455	          id: updatedUserId,
  1456	          userId: updatedUserId
  1457	        };
  1458	
  1459	        updated = true;
  1460	      }
  1461	    }
  1462	
  1463	    if (updated) {
  1464	      this.updateUI();
  1465	    }
  1466	  }
  1467	
  1468	  updateUI() {
  1469	    const micContainer = document.querySelector('.mic-container');
  1470	    if (!micContainer) return;
  1471	
  1472	    const micButtons = micContainer.querySelectorAll('.btn-mic');
  1473	    micButtons.forEach((btn, index) => {
  1474	      const micIndex = index + 1;
  1475	      const user = this.state.micsState[micIndex];
  1476	      const content = btn.querySelector('.mic-content');
  1477	      if (!content) return;
  1478	
  1479	      if (user) {
  1480	        btn.classList.add('active');
  1481	        const avatarUrl = window.getAvatarUrl(user);
  1482	        const currentImg = content.querySelector('img');
  1483	        
  1484	        if (!currentImg || currentImg.getAttribute('src') !== avatarUrl) {
  1485	          content.innerHTML = '';
  1486	          const imgOptions = { 
  1487	            src: avatarUrl, 
  1488	            class: 'mic-user-avatar',
  1489	            referrerPolicy: 'no-referrer',
  1490	            'data-username': user.username,
  1491	            'data-is-hidden': user.isHidden ? 'true' : 'false',
  1492	            'data-role-rank': user.roleRank || 0
  1493	          };
  1494	          const resolvedUserId = user.userId || user.id;
  1495	          if (resolvedUserId) {
  1496	            imgOptions['data-user-id'] = resolvedUserId;
  1497	          }
  1498	          content.appendChild(window.secureCreateElement('img', imgOptions));
  1499	        }
  1500	
  1501	        let nameLabel = btn.querySelector('.mic-user-label');
  1502	        if (!nameLabel) {
  1503	          nameLabel = window.secureCreateElement('div', { class: 'mic-user-label' });
  1504	          btn.appendChild(nameLabel);
  1505	        }
  1506	
  1507	        // 1. Priority: Super Icon
  1508	        if (user.superIcon) {
  1509	          nameLabel.innerHTML = `<img src="${user.superIcon}" style="max-height: 100%; max-width: 100%; object-fit: contain; vertical-align: middle; display: inline-block;">`;
  1510	        } 
  1511	        // 2. Secondary: Topic (Decorated Name)
  1512	        else if (user.topic && user.topic !== user.username) {
  1513	          nameLabel.textContent = user.topic;
  1514	        }
  1515	        // 3. Last: Original Username
  1516	        else {
  1517	          nameLabel.textContent = user.username;
  1518	        }
  1519	
  1520	        nameLabel.setAttribute('data-username', user.username);
  1521	        const resolvedUserIdForLabel = user.userId ?? user.id;
  1522	        if (resolvedUserIdForLabel) {
  1523	            nameLabel.setAttribute('data-user-id', resolvedUserIdForLabel);
  1524	        }
  1525	        
  1526	        btn.title = user.topic || user.username;
  1527	
  1528	        // Show mute icons
  1529	        const isMutedSelf = user.isMutedSelf;
  1530	        const isLocalMuted = this.state.localMutedUsers.has(user.socketId);
  1531	        
  1532	        let muteIcon = btn.querySelector('.mic-mute-status');
  1533	        if (isMutedSelf || isLocalMuted) {
  1534	          if (!muteIcon) {
  1535	            muteIcon = document.createElement('div');
  1536	            muteIcon.className = 'mic-mute-status';
  1537	            btn.appendChild(muteIcon);
  1538	          }
  1539	          muteIcon.innerHTML = `<i class="fas ${isLocalMuted ? 'fa-volume-mute' : 'fa-microphone-slash'}"></i>`;
  1540	        } else if (muteIcon) {
  1541	          muteIcon.remove();
  1542	        }
  1543	
  1544	        // Change click behavior if occupied
  1545	        btn.onclick = (e) => {
  1546	          if (e && e.currentTarget) e.currentTarget.blur();
  1547	          this.showMicMenu(e, micIndex);
  1548	        };
  1549	      } else {
  1550	        btn.classList.remove('active');
  1551	        btn.classList.remove('speaking');
  1552	        const visualizer = btn.querySelector('.mic-visualizer');
  1553	        if (visualizer) visualizer.remove();
  1554	        
  1555	        const muteIcon = btn.querySelector('.mic-mute-status');
  1556	        if (muteIcon) muteIcon.remove();
  1557	        
  1558	        const nameLabel = btn.querySelector('.mic-user-label');
  1559	        if (nameLabel) nameLabel.remove();
  1560	        
  1561	        btn.title = btn.classList.contains('locked') ? 'المايك مقفل' : `مايك ${micIndex}`;
  1562	
  1563	        if (!content.querySelector('i.fa-microphone') && !btn.classList.contains('locked')) {
  1564	          content.innerHTML = `<i class="fas fa-microphone"></i>`;
  1565	        }
  1566	
  1567	        // Restore default click behavior if empty
  1568	        btn.onclick = (e) => {
  1569	          if (e && e.currentTarget) e.currentTarget.blur();
  1570	          this.toggleMic(window.state.currentRoomId, micIndex);
  1571	        };
  1572	      }
  1573	    });
  1574	  }
  1575	}
  1576	