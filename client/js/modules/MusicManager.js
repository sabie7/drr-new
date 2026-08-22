     1	// MusicManager.js
     2	const _fetch = (...args) => (window.apiFetch || window.fetch)(...args);
     3	export class MusicManager {
     4	    constructor(socket) {
     5	        this.socket = socket;
     6	        this.player = null;
     7	        this.isApiReady = false;
     8	        this.currentMusic = null;
     9	        this.queue = [];
    10	        this.localVolume = parseFloat(sessionStorage.getItem('musicVolume') || '0.5');
    11	        this.isLocalMuted = sessionStorage.getItem('musicMuted') === 'true';
    12	        this.timeUpdateInterval = null;
    13	        
    14	        this.audioPlaybackUnlocked = false;
    15	        this.pendingAutoplay = false;
    16	        this.autoplayBlocked = false;
    17	        this.gestureListenersAdded = false;
    18	        
    19	        this.initYouTubeApi();
    20	        this.initSocketListeners();
    21	        this.startTimeUpdater();
    22	        this.initGestureListeners();
    23	        this.initVisibilityListeners();
    24	    }
    25	
    26	    initGestureListeners() {
    27	        if (this.gestureListenersAdded) return;
    28	        
    29	        const unlockHandler = () => {
    30	            this.unlockPlaybackFromGesture();
    31	        };
    32	
    33	        document.addEventListener('click', unlockHandler, { passive: true });
    34	        document.addEventListener('touchend', unlockHandler, { passive: true });
    35	        document.addEventListener('pointerup', unlockHandler, { passive: true });
    36	        document.addEventListener('keydown', unlockHandler, { passive: true });
    37	        
    38	        this.gestureListenersAdded = true;
    39	    }
    40	    
    41	    initVisibilityListeners() {
    42	        document.addEventListener('visibilitychange', () => {
    43	            if (document.visibilityState === 'visible') {
    44	                if (window.voiceManager && typeof window.voiceManager.unlockAudioSession === 'function') {
    45	                    window.voiceManager.unlockAudioSession();
    46	                }
    47	                if (this.autoplayBlocked || this.pendingAutoplay) {
    48	                    this.pendingAutoplay = true;
    49	                } else {
    50	                    if (this.currentMusic && this.currentMusic.isPlaying) {
    51	                        this.syncPlayer();
    52	                    }
    53	                }
    54	            }
    55	        });
    56	        
    57	        window.addEventListener('pageshow', () => {
    58	             if (this.currentMusic && this.currentMusic.isPlaying) {
    59	                 this.syncPlayer();
    60	             }
    61	        });
    62	    }
    63	
    64	    unlockPlaybackFromGesture() {
    65	        if (!this.audioPlaybackUnlocked) {
    66	            if (window.voiceManager && typeof window.voiceManager.unlockAudioSession === 'function') {
    67	                window.voiceManager.unlockAudioSession();
    68	            }
    69	            this.audioPlaybackUnlocked = true;
    70	        }
    71	
    72	        if (this.pendingAutoplay && this.player && typeof this.player.playVideo === 'function') {
    73	            if (this.currentMusic && this.currentMusic.isPlaying) {
    74	                 this.applyLocalSettings();
    75	                 try {
    76	                     this.player.playVideo();
    77	                 } catch (e) {
    78	                     console.error('Error playing video during gesture unlock:', e);
    79	                 }
    80	            }
    81	        }
    82	    }
    83	
    84	    showAutoplayAlert() {
    85	        if (this.isLocalMuted) return; // Don't bother user if they muted music anyway
    86	        
    87	        let alertEl = document.getElementById('music-autoplay-alert');
    88	        if (!alertEl) {
    89	            alertEl = document.createElement('div');
    90	            alertEl.id = 'music-autoplay-alert';
    91	            alertEl.style.cssText = 'position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: var(--classic-primary, #007bff); color: white; padding: 10px 20px; border-radius: 20px; z-index: 9999; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 14px; display: flex; align-items: center; gap: 8px; animation: slideUp 0.3s ease-out;';
    92	            alertEl.innerHTML = '<i class="fas fa-play-circle"></i> <span>اضغط لتفعيل صوت الموسيقى</span>';
    93	            
    94	            alertEl.onclick = () => {
    95	                this.unlockPlaybackFromGesture();
    96	                this.applyLocalSettings();
    97	                if (this.player && typeof this.player.playVideo === 'function') {
    98	                    this.player.playVideo();
    99	                }
   100	            };
   101	            document.body.appendChild(alertEl);
   102	        }
   103	        alertEl.style.display = 'flex';
   104	    }
   105	
   106	    hideAutoplayAlert() {
   107	        const alertEl = document.getElementById('music-autoplay-alert');
   108	        if (alertEl) {
   109	            alertEl.style.display = 'none';
   110	        }
   111	    }
   112	
   113	    startTimeUpdater() {
   114	        if (this.timeUpdateInterval) clearInterval(this.timeUpdateInterval);
   115	        this.timeUpdateInterval = setInterval(() => {
   116	            this.updateTimeUI();
   117	        }, 1000);
   118	    }
   119	
   120	    formatTime(seconds) {
   121	        if (!seconds || isNaN(seconds)) return '00:00';
   122	        const mins = Math.floor(seconds / 60);
   123	        const secs = Math.floor(seconds % 60);
   124	        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
   125	    }
   126	
   127	    getLatestUserInfo(playedBy) {
   128	        if (!playedBy) return null;
   129	        if (window.state && window.state.users) {
   130	            const liveUser = window.state.users.find(u => u.id === playedBy.userId);
   131	            if (liveUser) {
   132	                return {
   133	                    ...playedBy,
   134	                    pic: liveUser.pic,
   135	                    username: liveUser.username,
   136	                    topic: liveUser.topic,
   137	                    superIcon: liveUser.superIcon
   138	                };
   139	            }
   140	        }
   141	        return playedBy;
   142	    }
   143	
   144	    getValidPicUrl(pic) {
   145	        if (!pic) return '/uploads/site/default.png';
   146	        if (pic.startsWith('http')) return pic;
   147	        if (pic.startsWith('/')) return pic;
   148	        return '/' + pic;
   149	    }
   150	
   151	    updateTimeUI() {
   152	        const timeDisplay = document.getElementById('music-time-display');
   153	        if (!timeDisplay || !this.currentMusic) {
   154	            if (timeDisplay) timeDisplay.classList.add('d-none');
   155	            return;
   156	        }
   157	
   158	        timeDisplay.classList.remove('d-none');
   159	        
   160	        let playerTime = 0;
   161	        let playerDuration = 0;
   162	
   163	        const isPlayerReady = this.player && typeof this.player.getCurrentTime === 'function' && typeof this.player.getDuration === 'function';
   164	        
   165	        let playerVideoId = null;
   166	        try {
   167	            if (isPlayerReady && this.player.getVideoData) {
   168	                playerVideoId = this.player.getVideoData().video_id;
   169	            }
   170	        } catch (e) {}
   171	
   172	        if (isPlayerReady && playerVideoId === this.currentMusic.videoId) {
   173	            playerTime = this.player.getCurrentTime() || 0;
   174	            playerDuration = this.player.getDuration() || 0;
   175	        }
   176	
   177	        // Manual calculation fallback
   178	        let calcTime = this.currentMusic.seekTo || 0;
   179	        if (this.currentMusic.isPlaying && this.currentMusic.startedAt) {
   180	            const elapsed = (Date.now() - this.currentMusic.startedAt) / 1000;
   181	            calcTime += elapsed;
   182	        }
   183	
   184	        // Use the most "advanced" time to keep things moving
   185	        const currentTime = Math.max(playerTime, calcTime);
   186	        const duration = playerDuration;
   187	
   188	        const currentEl = document.getElementById('music-current-time');
   189	        const durationEl = document.getElementById('music-duration');
   190	        const progressEl = document.getElementById('music-progress-bar');
   191	
   192	        if (currentEl) currentEl.textContent = this.formatTime(currentTime);
   193	        
   194	        // Only update duration if we have a valid one (> 0)
   195	        if (duration > 0) {
   196	            if (durationEl) durationEl.textContent = this.formatTime(duration);
   197	            if (progressEl) {
   198	                const percent = Math.min((currentTime / duration) * 100, 100);
   199	                progressEl.style.width = `${percent}%`;
   200	            }
   201	        } else if (durationEl && durationEl.textContent === '00:00') {
   202	             durationEl.textContent = '--:--';
   203	        }
   204	    }
   205	
   206	    initYouTubeApi() {
   207	        if (window.YT && window.YT.Player) {
   208	            this.isApiReady = true;
   209	            return;
   210	        }
   211	        
   212	        // Check if script already exists
   213	        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
   214	            const tag = document.createElement('script');
   215	            tag.src = "https://www.youtube.com/iframe_api";
   216	            const firstScriptTag = document.getElementsByTagName('script')[0];
   217	            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
   218	        }
   219	
   220	        const checkYT = setInterval(() => {
   221	            if (window.YT && window.YT.Player) {
   222	                this.isApiReady = true;
   223	                clearInterval(checkYT);
   224	                console.log('YouTube API Ready via interval');
   225	                if (this.currentMusic) {
   226	                    this.syncPlayer();
   227	                }
   228	            }
   229	        }, 100);
   230	
   231	        window.onYouTubeIframeAPIReady = () => {
   232	            this.isApiReady = true;
   233	            console.log('YouTube API Ready via callback');
   234	            if (this.currentMusic) {
   235	                this.syncPlayer();
   236	            }
   237	        };
   238	    }
   239	
   240	    async search(query) {
   241	        try {
   242	            const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`, {
   243	                headers: {
   244	                    'Authorization': `Bearer ${sessionStorage.getItem('token')}`
   245	                }
   246	            });
   247	            if (!res.ok) throw new Error('Search failed');
   248	            return await res.json();
   249	        } catch (error) {
   250	            console.error('Search error:', error);
   251	            return [];
   252	        }
   253	    }
   254	
   255	    initSocketListeners() {
   256	        this.socket.on('room-music:state', (state) => {
   257	            // Guard: Only process if authenticated and in a room
   258	            if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
   259	                if (this.currentMusic) this.reset();
   260	                return;
   261	            }
   262	            console.log('Music state received:', state);
   263	            this.currentMusic = state;
   264	            this.syncPlayer();
   265	            this.updateUI();
   266	            this.updateTimeUI();
   267	        });
   268	
   269	        this.socket.on('room-music:queue-update', (queue) => {
   270	            // Guard: Only process if authenticated and in a room
   271	            if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
   272	                return;
   273	            }
   274	            console.log('Queue update received:', queue);
   275	            this.queue = queue;
   276	            this.updateQueueUI();
   277	        });
   278	
   279	        this.socket.on('room-music:error', (data) => {
   280	            if (window.showToast) window.showToast((data && data.message) || 'خطأ في الموسيقى', 'error');
   281	        });
   282	
   283	        this.socket.on('connect', () => {
   284	            if (window.state && window.state.currentRoomId && window.state.currentRoomId !== 0 && window.state.currentUser) {
   285	                this.socket.emit('room-music:get-state', { roomId: window.state.currentRoomId });
   286	            }
   287	        });
   288	    }
   289	
   290	    createPlayer() {
   291	        if (!this.isApiReady) return;
   292	        
   293	        // Guard: Prevent player creation if not logged in or not in a proper room
   294	        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
   295	            console.warn('[MusicManager] Attempted to create player while unauthenticated or not in a room.');
   296	            return;
   297	        }
   298	
   299	        // Create hidden container if not exists
   300	        let container = document.getElementById('youtube-player-container');
   301	        if (!container) {
   302	            container = document.createElement('div');
   303	            container.id = 'youtube-player-container';
   304	            container.style.position = 'absolute';
   305	            container.style.top = '-9999px';
   306	            container.style.left = '-9999px';
   307	            container.style.width = '1px';
   308	            container.style.height = '1px';
   309	            container.style.overflow = 'hidden';
   310	            container.style.pointerEvents = 'none';
   311	            document.body.appendChild(container);
   312	        }
   313	
   314	        // Ensure player div exists (it might have been removed by destroy())
   315	        let playerDiv = document.getElementById('yt-player');
   316	        if (!playerDiv) {
   317	            playerDiv = document.createElement('div');
   318	            playerDiv.id = 'yt-player';
   319	            container.appendChild(playerDiv);
   320	        }
   321	
   322	        this.player = new YT.Player('yt-player', {
   323	            height: '1',
   324	            width: '1',
   325	            videoId: this.currentMusic ? this.currentMusic.videoId : '',
   326	            playerVars: {
   327	                'autoplay': 1,
   328	                'controls': 0,
   329	                'disablekb': 1,
   330	                'fs': 0,
   331	                'rel': 0,
   332	                'modestbranding': 1,
   333	                'playsinline': 1,
   334	                'enablejsapi': 1,
   335	                'origin': window.location.origin
   336	            },
   337	            events: {
   338	                'onReady': (event) => {
   339	                    console.log('Player Ready');
   340	                    this.applyLocalSettings();
   341	                    this.syncPlayer();
   342	                    
   343	                    // Add allow autoplay if not present
   344	                    const iframe = document.getElementById('yt-player');
   345	                    if (iframe && iframe.tagName.toLowerCase() === 'iframe') {
   346	                        let allowAttr = iframe.getAttribute('allow') || '';
   347	                        if (!allowAttr.includes('autoplay')) {
   348	                            iframe.setAttribute('allow', allowAttr ? allowAttr + '; autoplay' : 'autoplay');
   349	                        }
   350	                    }
   351	                },
   352	                'onStateChange': (event) => {
   353	                    if (event.data === YT.PlayerState.PLAYING) {
   354	                        this.pendingAutoplay = false;
   355	                        this.autoplayBlocked = false;
   356	                        this.hideAutoplayAlert();
   357	                    }
   358	                    // Handle autoplay blocks
   359	                    if (event.data === YT.PlayerState.UNSTARTED || event.data === YT.PlayerState.CUED) {
   360	                        if (this.currentMusic && this.currentMusic.isPlaying) {
   361	                            // Check if it's blocked from playing
   362	                            if (!this.audioPlaybackUnlocked) {
   363	                                this.pendingAutoplay = true;
   364	                                this.autoplayBlocked = true;
   365	                                this.showAutoplayAlert();
   366	                            } else {
   367	                                event.target.playVideo();
   368	                            }
   369	                        }
   370	                    }
   371	                    // If video ended
   372	                    if (event.data === YT.PlayerState.ENDED) {
   373	                        const user = window.state.currentUser;
   374	                        const isAdmin = false;
   375	                        const hasMusicPerm = user && user.group && user.group.canUseRoomMusic;
   376	                        
   377	                        // Only the person who played it (or admin) should emit stop to keep it clean
   378	                        if (isAdmin || hasMusicPerm) {
   379	                            let endedVideoId = null;
   380	                            try {
   381	                                endedVideoId = event.target.getVideoData().video_id;
   382	                            } catch (e) {
   383	                                endedVideoId = this.currentMusic ? this.currentMusic.videoId : null;
   384	                            }
   385	                            this.stop(endedVideoId);
   386	                        }
   387	                    }
   388	                },
   389	                'onAutoplayBlocked': (event) => {
   390	                    console.log('Autoplay blocked by browser');
   391	                    this.pendingAutoplay = true;
   392	                    this.autoplayBlocked = true;
   393	                    this.showAutoplayAlert();
   394	                },
   395	                'onError': (e) => {
   396	                    console.error('YouTube Player Error:', e.data);
   397	                }
   398	            }
   399	        });
   400	    }
   401	
   402	    syncPlayer() {
   403	        if (!this.currentMusic || !window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
   404	            this.reset();
   405	            return;
   406	        }
   407	
   408	        // Ensure timer is running
   409	        if (!this.timeUpdateInterval) {
   410	            this.startTimeUpdater();
   411	        }
   412	
   413	        if (!this.player || !this.player.loadVideoById) {
   414	            this.createPlayer();
   415	            return;
   416	        }
   417	
   418	        const videoId = this.currentMusic.videoId;
   419	        const isPlaying = this.currentMusic.isPlaying;
   420	        
   421	        // Calculate current time
   422	        let currentTime = this.currentMusic.seekTo;
   423	        if (isPlaying) {
   424	            const elapsed = (Date.now() - this.currentMusic.startedAt) / 1000;
   425	            currentTime += elapsed;
   426	        }
   427	
   428	        let currentVideoId = null;
   429	        try {
   430	            if (this.player.getVideoData) {
   431	                currentVideoId = this.player.getVideoData().video_id;
   432	            }
   433	        } catch (e) {}
   434	
   435	        if (currentVideoId !== videoId) {
   436	            this.player.loadVideoById({
   437	                videoId: videoId,
   438	                startSeconds: currentTime
   439	            });
   440	        }
   441	
   442	        if (isPlaying) {
   443	            const playerTime = this.player.getCurrentTime ? this.player.getCurrentTime() : 0;
   444	            if (Math.abs(playerTime - currentTime) > 3) {
   445	                this.player.seekTo(currentTime, true);
   446	            }
   447	            if (this.player.playVideo) {
   448	                try {
   449	                    this.player.playVideo();
   450	                    if (typeof window.pendingAutoPlayMusic !== 'undefined') window.pendingAutoPlayMusic = false;
   451	                } catch (e) {
   452	                    console.error('Error playing video:', e);
   453	                }
   454	            }
   455	        } else {
   456	            // Force pause multiple times if needed to ensure it stops
   457	            const forcePause = () => {
   458	                if (this.player && this.player.pauseVideo) {
   459	                    this.player.pauseVideo();
   460	                    if (this.player.seekTo) this.player.seekTo(currentTime, true);
   461	                }
   462	            };
   463	            forcePause();
   464	            setTimeout(forcePause, 500);
   465	            setTimeout(forcePause, 1000);
   466	        }
   467	        
   468	        this.applyLocalSettings();
   469	    }
   470	
   471	    applyLocalSettings() {
   472	        if (!this.player || !this.player.setVolume) return;
   473	        
   474	        // Use global volume if available, otherwise use local volume
   475	        const globalVol = (this.currentMusic && typeof this.currentMusic.volume === 'number') ? this.currentMusic.volume : 100;
   476	        const finalVolume = (globalVol / 100) * (this.localVolume * 100);
   477	
   478	        if (this.isLocalMuted) {
   479	            this.player.mute();
   480	        } else {
   481	            this.player.unMute();
   482	            this.player.setVolume(finalVolume);
   483	        }
   484	    }
   485	
   486	    setLocalVolume(vol) {
   487	        this.localVolume = vol;
   488	        sessionStorage.setItem('musicVolume', vol);
   489	        this.applyLocalSettings();
   490	    }
   491	
   492	    setLocalMute(isMuted) {
   493	        this.isLocalMuted = isMuted;
   494	        sessionStorage.setItem('musicMuted', isMuted);
   495	        this.applyLocalSettings();
   496	    }
   497	
   498	    updateUI() {
   499	        const musicBtn = document.getElementById('btn-room-music');
   500	        if (!musicBtn) return;
   501	
   502	        const room = window.roomsData ? window.roomsData[window.state.currentRoomId] : null;
   503	        if (room && room.allowRoomMusic === false) {
   504	            musicBtn.classList.add('d-none');
   505	            return;
   506	        } else {
   507	            musicBtn.classList.remove('d-none');
   508	        }
   509	
   510	        this.updateQueueUI();
   511	
   512	        const titleEl = document.getElementById('current-music-title');
   513	
   514	        if (this.currentMusic && this.currentMusic.playedBy) {
   515	            musicBtn.classList.add('active');
   516	            const p = this.getLatestUserInfo(this.currentMusic.playedBy);
   517	            const avatarUrl = window.getAvatarUrl(p);
   518	            
   519	            // Priority for display name: Super Icon or Topic or Username
   520	            let displayName = p.username;
   521	            if (p.superIcon) displayName = "سوبر";
   522	            else if (p.topic) displayName = p.topic;
   523	            
   524	            musicBtn.setAttribute('title', `تم طلبها بواسطة: ${displayName}`);
   525	            
   526	            // Update Title
   527	            if (titleEl) {
   528	                titleEl.textContent = this.currentMusic.title || 'أغنية غير معروفة';
   529	                titleEl.classList.remove('d-none');
   530	            }
   531	
   532	            // Visualizer HTML
   533	            const visualizerHtml = `
   534	                <div class="music-visualizer-container ${this.currentMusic.isPlaying ? '' : 'd-none'}">
   535	                    <div class="music-bar"></div>
   536	                    <div class="music-bar"></div>
   537	                    <div class="music-bar"></div>
   538	                    <div class="music-bar"></div>
   539	                </div>
   540	            `;
   541	
   542	            musicBtn.innerHTML = `
   543	                <img src="${avatarUrl}" class="music-user-avatar" onerror="this.src='/uploads/site/default.png'">
   544	                ${visualizerHtml}
   545	            `;
   546	            
   547	            if (this.currentMusic.isPlaying) {
   548	                musicBtn.classList.add('playing');
   549	            } else {
   550	                musicBtn.classList.remove('playing');
   551	            }
   552	
   553	            const infoSection = document.getElementById('current-music-info');
   554	            const playedByContainer = document.getElementById('music-played-by-container');
   555	            const playbackControls = document.getElementById('music-playback-controls');
   556	            const globalVolumeContainer = document.getElementById('music-global-volume-container');
   557	            const globalVolumeSlider = document.getElementById('music-global-volume-slider');
   558	            const globalVolumeValue = document.getElementById('music-global-volume-value');
   559	            
   560	            if (infoSection) infoSection.classList.remove('d-none');
   561	            
   562	            // Update Global Volume UI
   563	            if (globalVolumeContainer) {
   564	                globalVolumeContainer.classList.remove('d-none');
   565	                const vol = typeof this.currentMusic.volume === 'number' ? this.currentMusic.volume : 100;
   566	                if (globalVolumeSlider) {
   567	                    globalVolumeSlider.value = vol;
   568	                    globalVolumeSlider.disabled = true; // Default to disabled, enable if authorized below
   569	                }
   570	                if (globalVolumeValue) globalVolumeValue.textContent = `${vol}%`;
   571	            }
   572	
   573	            if (playedByContainer) {
   574	                let identifierHtml = '';
   575	                if (p.superIcon) {
   576	                    identifierHtml = `<img src="${p.superIcon}" class="super-icon-small" style="max-height: 18px; width: auto; vertical-align: middle;">`;
   577	                } else if (p.topic) {
   578	                    identifierHtml = `<span class="user-topic-badge ms-1" style="font-size: 0.9em; padding: 4px 8px;">${window.escapeHTML(p.topic)}</span>`;
   579	                } else {
   580	                    identifierHtml = `<span class="small fw-bold text-dark" style="font-size: 0.9em;">${window.escapeHTML(p.username)}</span>`;
   581	                }
   582	
   583	                playedByContainer.innerHTML = '';
   584	                const wrapper = window.secureCreateElement('div', { class: 'd-flex align-items-center justify-content-center gap-3' });
   585	                wrapper.appendChild(window.secureCreateElement('img', { 
   586	                    src: window.getAvatarUrl(p), 
   587	                    class: 'rounded-circle border', 
   588	                    style: 'width: 42px; height: 42px; object-fit: cover;',
   589	                    onerror: "this.src='/uploads/site/default.png'",
   590	                    referrerPolicy: 'no-referrer'
   591	                }));
   592	                const identifierWrapper = window.secureCreateElement('div', { class: 'd-flex align-items-center' });
   593	                identifierWrapper.innerHTML = identifierHtml; // identifierHtml is already safe/constructed
   594	                wrapper.appendChild(identifierWrapper);
   595	                playedByContainer.appendChild(wrapper);
   596	            }
   597	            
   598	            const user = window.state.currentUser;
   599	            const isAdmin = user && user.group && user.group.id === 1;
   600	            const hasMusicPerm = user && user.group && user.group.canUseRoomMusic;
   601	            const isOwner = user && this.currentMusic.playedBy && this.currentMusic.playedBy.userId === user.id;
   602	            
   603	            if (playbackControls && (isAdmin || hasMusicPerm || isOwner)) {
   604	                playbackControls.classList.remove('d-none');
   605	                
   606	                // Enable volume slider for authorized users
   607	                if (globalVolumeSlider) globalVolumeSlider.disabled = false;
   608	
   609	                // Update play/pause button visibility
   610	                const playBtn = document.getElementById('btn-music-play');
   611	                const pauseBtn = document.getElementById('btn-music-pause');
   612	                if (this.currentMusic.isPlaying) {
   613	                    playBtn?.classList.add('d-none');
   614	                    pauseBtn?.classList.remove('d-none');
   615	                } else {
   616	                    playBtn?.classList.remove('d-none');
   617	                    pauseBtn?.classList.add('d-none');
   618	                }
   619	            }
   620	        } else {
   621	            musicBtn.classList.remove('active');
   622	            musicBtn.classList.remove('playing');
   623	            musicBtn.innerHTML = `<i class="fas fa-music"></i>`;
   624	            musicBtn.removeAttribute('title');
   625	
   626	            if (titleEl) {
   627	                titleEl.classList.add('d-none');
   628	                titleEl.textContent = '';
   629	            }
   630	
   631	            const globalVolumeContainer = document.getElementById('music-global-volume-container');
   632	            if (globalVolumeContainer) globalVolumeContainer.classList.add('d-none');
   633	
   634	            const infoSection = document.getElementById('current-music-info');
   635	            const playbackControls = document.getElementById('music-playback-controls');
   636	            if (infoSection) infoSection.classList.add('d-none');
   637	            if (playbackControls) playbackControls.classList.add('d-none');
   638	        }
   639	    }
   640	
   641	    updateQueueUI() {
   642	        const queueList = document.getElementById('music-queue-list');
   643	        const queueActions = document.getElementById('music-queue-actions');
   644	        if (!queueList || !queueActions) return;
   645	
   646	        if (this.queue.length === 0) {
   647	            queueList.innerHTML = '<div class="text-center text-muted py-4 small">القائمة فارغة</div>';
   648	        } else {
   649	            queueList.innerHTML = this.queue.map((item, index) => {
   650	                const p = this.getLatestUserInfo(item.playedBy);
   651	                const picUrl = this.getValidPicUrl(p.pic);
   652	                return `
   653	                <div class="d-flex align-items-center gap-2 p-2 border-bottom bg-white mb-1">
   654	                    <div class="fw-bold text-primary small">#${index + 1}</div>
   655	                    <img src="${picUrl}" class="rounded-circle border" style="width: 24px; height: 24px; object-fit: cover;" onerror="this.src='/uploads/site/default.png'">
   656	                    <div class="flex-grow-1 overflow-hidden">
   657	                        <div class="small fw-bold text-truncate">${p.topic || p.username}</div>
   658	                    </div>
   659	                    ${this.canManageQueue() ? `
   660	                        <button class="btn btn-link btn-sm text-danger p-0" onclick="window.musicManager.removeFromQueue('${item.id}')">
   661	                            <i class="fas fa-times-circle"></i>
   662	                        </button>
   663	                    ` : ''}
   664	                </div>
   665	            `}).join('');
   666	        }
   667	
   668	        const user = window.state.currentUser;
   669	        const isInQueue = this.queue.some(item => item.playedBy.userId === user?.id);
   670	        const hasMusicPerm = window.state.hasPermission(user, 'canUseRoomMusic');
   671	        const hasRequestPerm = user && user.group && user.group.canRequestMusic;
   672	
   673	        if (hasMusicPerm || hasRequestPerm) {
   674	            if (isInQueue) {
   675	                queueActions.innerHTML = `
   676	                    <button class="btn btn-danger btn-sm w-100 rounded-0" onclick="window.musicManager.leaveQueue()">
   677	                        <i class="fas fa-sign-out-alt"></i> مغادرة قائمة الانتظار
   678	                    </button>
   679	                `;
   680	            } else {
   681	                queueActions.innerHTML = `
   682	                    <button class="btn btn-primary btn-sm w-100 rounded-0" onclick="window.musicManager.showQueueJoinModal()">
   683	                        <i class="fas fa-plus-circle"></i> طلب دور (إضافة أغنية)
   684	                    </button>
   685	                `;
   686	            }
   687	        } else {
   688	            queueActions.innerHTML = '<div class="alert alert-info p-2 small mb-0">لا تملك صلاحية طلب دور</div>';
   689	        }
   690	    }
   691	
   692	    canManageQueue() {
   693	        const user = window.state.currentUser;
   694	        if (!user) return false;
   695	        if (false) return true;
   696	        
   697	        return user.group && user.group.canUseRoomMusic;
   698	    }
   699	
   700	    showQueueJoinModal() {
   701	        const room = window.roomsData ? window.roomsData[window.state.currentRoomId] : null;
   702	        const user = window.state.currentUser;
   703	        const isAdmin = user && user.group && user.group.id === 1;
   704	        const isModerator = room && (room.ownerId === user.id || (room.moderators || []).some(m => (typeof m === 'number' ? m === user.id : m.userId === user.id)));
   705	        
   706	        // Check if members can request music
   707	        if (room && room.membersCanRequestMusic === false && !isAdmin && !(room.moderatorsCanManageMusic && isModerator)) {
   708	            Swal.fire('خطأ', 'طلب الأغاني معطل في هذه الغرفة', 'error');
   709	            return;
   710	        }
   711	
   712	        Swal.fire({
   713	            title: 'طلب دور',
   714	            text: 'أدخل رابط يوتيوب أو اسم الأغنية التي تود إضافتها للقائمة',
   715	            input: 'text',
   716	            inputPlaceholder: 'رابط يوتيوب أو اسم الأغنية...',
   717	            showCancelButton: true,
   718	            confirmButtonText: 'إضافة',
   719	            cancelButtonText: 'إلغاء',
   720	            inputValidator: (value) => {
   721	                if (!value) return 'يرجى إدخال شيء ما';
   722	            }
   723	        }).then(async (result) => {
   724	            if (result.isConfirmed) {
   725	                const query = result.value.trim();
   726	                
   727	                // Check if it's a direct link
   728	                const getYouTubeId = (url) => {
   729	                    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
   730	                    const match = url.match(regExp);
   731	                    return (match && match[2].length === 11) ? match[2] : null;
   732	                };
   733	                const videoId = getYouTubeId(query);
   734	                const isId = query.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(query);
   735	
   736	                if (videoId || isId) {
   737	                    const id = videoId || query;
   738	                    try {
   739	                        const res = await fetch(`/api/youtube/info?videoId=${id}`, {
   740	                            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
   741	                        });
   742	                        const data = await res.json();
   743	                        this.addToQueue(id, data.title || 'أغنية يوتيوب');
   744	                    } catch (e) {
   745	                        this.addToQueue(id, 'أغنية يوتيوب');
   746	                    }
   747	                    return;
   748	                }
   749	
   750	                const results = await this.search(query);
   751	                if (results.length > 0) {
   752	                    // Show selection modal
   753	                    const options = results.map(r => `
   754	                        <div class="d-flex align-items-center gap-2 p-2 border-bottom cursor-pointer hover-bg-light" onclick="Swal.clickConfirm(); window.musicManager.addToQueue('${r.id}', '${r.title.replace(/'/g, "\\'")}')">
   755	                            <img src="${r.thumbnail}" style="width: 60px; height: 45px; object-fit: cover;">
   756	                            <div class="small fw-bold text-truncate">${r.title}</div>
   757	                        </div>
   758	                    `).join('');
   759	
   760	                    Swal.fire({
   761	                        title: 'اختر الأغنية',
   762	                        html: `<div class="text-start">${options}</div>`,
   763	                        showCancelButton: true,
   764	                        showConfirmButton: false,
   765	                        cancelButtonText: 'إلغاء'
   766	                    });
   767	                } else {
   768	                    Swal.fire('خطأ', 'لم يتم العثور على نتائج', 'error');
   769	                }
   770	            }
   771	        });
   772	    }
   773	
   774	    addToQueue(videoId, title) {
   775	        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
   776	            showToast('يجب تسجيل الدخول والدخول إلى غرفة أولاً', 'error');
   777	            return;
   778	        }
   779	        this.socket.emit('room-music:add-to-queue', {
   780	            videoId,
   781	            title
   782	        });
   783	        Swal.close();
   784	    }
   785	
   786	    leaveQueue() {
   787	        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
   788	        this.socket.emit('room-music:leave-queue');
   789	    }
   790	
   791	    removeFromQueue(queueId) {
   792	        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
   793	        this.socket.emit('room-music:remove-from-queue', {
   794	            queueId
   795	        });
   796	    }
   797	
   798	    play(videoId, title) {
   799	        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) {
   800	            showToast('يجب تسجيل الدخول والدخول إلى غرفة أولاً', 'error');
   801	            return;
   802	        }
   803	        this.socket.emit('room-music:play', {
   804	            videoId,
   805	            title
   806	        });
   807	    }
   808	
   809	    pause(currentTime) {
   810	        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
   811	        this.socket.emit('room-music:pause', {
   812	            currentTime
   813	        });
   814	    }
   815	
   816	    resume() {
   817	        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
   818	        this.socket.emit('room-music:resume');
   819	    }
   820	
   821	    stop(videoId = null) {
   822	        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
   823	        this.socket.emit('room-music:stop', {
   824	            videoId: videoId
   825	        });
   826	    }
   827	
   828	    setGlobalVolume(volume) {
   829	        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
   830	        this.socket.emit('room-music:set-volume', {
   831	            volume: parseInt(volume)
   832	        });
   833	    }
   834	
   835	    seek(currentTime) {
   836	        if (!window.state?.currentUser || !window.state?.currentRoomId || window.state.currentRoomId === 0) return;
   837	        this.socket.emit('room-music:seek', {
   838	            currentTime
   839	        });
   840	    }
   841	
   842	    resetState() {
   843	        console.log('[MusicManager] Resetting music state...');
   844	        this.currentMusic = null;
   845	        this.queue = [];
   846	        
   847	        // Clear time updater
   848	        if (this.timeUpdateInterval) {
   849	            clearInterval(this.timeUpdateInterval);
   850	            this.timeUpdateInterval = null;
   851	        }
   852	
   853	        if (this.player && typeof this.player.pauseVideo === 'function') {
   854	            try {
   855	                this.player.pauseVideo();
   856	            } catch (e) {
   857	                console.error('[MusicManager] Error during player pause:', e);
   858	            }
   859	        }
   860	
   861	        this.updateUI();
   862	        this.updateQueueUI();
   863	        this.updateTimeUI();
   864	    }
   865	
   866	    destroyPlayer() {
   867	        if (this.player) {
   868	            try {
   869	                if (typeof this.player.destroy === 'function') {
   870	                    this.player.destroy();
   871	                    console.log('[MusicManager] Player destroyed');
   872	                }
   873	            } catch (e) {
   874	                console.error('[MusicManager] Error during player destruction:', e);
   875	            }
   876	            this.player = null;
   877	        }
   878	
   879	        // Remove player container from DOM
   880	        const container = document.getElementById('youtube-player-container');
   881	        if (container) {
   882	            container.remove();
   883	            console.log('[MusicManager] Player container removed from DOM');
   884	        }
   885	    }
   886	
   887	    reset(options = { destroyPlayer: false }) {
   888	        this.resetState();
   889	        if (options && options.destroyPlayer) {
   890	            this.destroyPlayer();
   891	        }
   892	        console.log('[MusicManager] Reset complete');
   893	    }
   894	
   895	    refreshState() {
   896	        if (window.state && window.state.currentRoomId && window.state.currentRoomId !== 0 && window.state.currentUser) {
   897	            this.socket.emit('room-music:get-state');
   898	        }
   899	    }
   900	}
   901	