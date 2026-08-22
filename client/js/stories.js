     1	var _fetch = window.apiFetch || window.fetch;
     2	
     3	let stories = [];
     4	let currentStoryIndex = 0;
     5	let currentStoryUserIndex = 0;
     6	let storyTimer = null;
     7	let groupedStories = [];
     8	let currentStoryUploadXhr = null;
     9	
    10	// --- Sidebar Story Indicators ---
    11	
    12	window.getSidebarStoryInfo = function(userId) {
    13	  if (
    14	    window.featuresSettings?.storiesEnabled === false ||
    15	    window.featuresSettings?.storySidebarIndicatorEnabled === false
    16	  ) {
    17	    return { hasUnviewed: false, count: 0 };
    18	  }
    19	
    20	  const group = groupedStories.find(g => sameId(g.user.id, userId));
    21	  if (!group || !Array.isArray(group.stories)) {
    22	    return { hasUnviewed: false, count: 0 };
    23	  }
    24	
    25	  const currentUserId =
    26	    window.state?.currentUser?.id ||
    27	    window.currentUser?.id ||
    28	    null;
    29	
    30	  const localViewed = JSON.parse(sessionStorage.getItem('viewedStories') || '[]');
    31	
    32	  const unviewedStories = group.stories.filter(story => {
    33	    const storyId = String(story.id);
    34	
    35	    if (localViewed.includes(storyId)) {
    36	      return false;
    37	    }
    38	
    39	    const views = Array.isArray(story.views) ? story.views : [];
    40	
    41	    if (!currentUserId) {
    42	      return true;
    43	    }
    44	
    45	    return !views.some(v => sameId(v.userId || v.id, currentUserId));
    46	  });
    47	
    48	  return {
    49	    hasUnviewed: unviewedStories.length > 0,
    50	    count: unviewedStories.length
    51	  };
    52	};
    53	
    54	window.openUserStoriesFromSidebar = function(e, userId) {
    55	  if (e) {
    56	    e.stopPropagation();
    57	    e.preventDefault();
    58	  }
    59	
    60	  const userIndex = groupedStories.findIndex(g => sameId(g.user.id, userId));
    61	  if (userIndex !== -1) {
    62	    window.openStoryViewer(userIndex, 0);
    63	  }
    64	};
    65	
    66	window.refreshSidebarStoryIndicators = function() {
    67	    if (typeof window.renderUsersInSidebar === 'function') {
    68	        const users = window.state?.currentUsers || window.onlineUsers || [];
    69	        window.renderUsersInSidebar(users);
    70	    }
    71	};
    72	
    73	// --- End Sidebar Story Indicators ---
    74	
    75	window.cancelStoryUpload = function(event, containerId) {
    76	  if (event) event.stopPropagation();
    77	  if (currentStoryUploadXhr) {
    78	    currentStoryUploadXhr.abort();
    79	    currentStoryUploadXhr = null;
    80	    window.renderStoriesBar(containerId);
    81	    Swal.fire('تنبيه', 'تم إلغاء الرفع', 'info');
    82	  }
    83	};
    84	
    85	// Lightweight image preparation (9gag-style): downscale + compress images
    86	// client-side before upload so the site stays fast. Videos pass through.
    87	window.prepareStoryMedia = async function(file) {
    88	  if (!file) return null;
    89	  const isImage = /^image\//.test(file.type) && !/gif/.test(file.type);
    90	  if (!isImage) return file;
    91	  try {
    92	    const maxDim = 1280;          // Instagram-ish cap
    93	    const quality = 0.82;         // JPEG quality balance size vs clarity
    94	    const bitmap = await createImageBitmap(file);
    95	    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    96	    const w = Math.max(1, Math.round(bitmap.width * scale));
    97	    const h = Math.max(1, Math.round(bitmap.height * scale));
    98	    const canvas = document.createElement('canvas');
    99	    canvas.width = w; canvas.height = h;
   100	    const ctx = canvas.getContext('2d');
   101	    ctx.drawImage(bitmap, 0, 0, w, h);
   102	    bitmap.close && bitmap.close();
   103	    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
   104	    if (!blob) return file;
   105	    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
   106	    return new File([blob], name, { type: 'image/jpeg' });
   107	  } catch (e) {
   108	    console.warn('[stories] image prep failed, uploading original:', e);
   109	    return file;
   110	  }
   111	};
   112	
   113	window.fetchStories = async function() {
   114	  try {
   115	    const token = sessionStorage.getItem('token');
   116	    const res = await fetch('/api/stories', {
   117	      headers: { 
   118	        'Authorization': `Bearer ${token}`,
   119	        'X-Chat-Token': token
   120	      }
   121	    });
   122	    if (res.ok) {
   123	      stories = await res.json();
   124	      window.renderStoriesBar('wall-stories-container');
   125	      if (typeof window.refreshSidebarStoryIndicators === 'function') {
   126	        window.refreshSidebarStoryIndicators();
   127	      }
   128	    }
   129	  } catch (err) {
   130	    console.error('Error fetching stories:', err);
   131	  }
   132	}
   133	
   134	window.renderStoriesBar = function(containerId = 'wall-stories-container') {
   135	  const container = document.getElementById(containerId);
   136	  if (!container) return;
   137	
   138	  // Check if stories are enabled in features settings
   139	  if (window.featuresSettings && window.featuresSettings.storiesEnabled === false) {
   140	    container.style.setProperty('display', 'none', 'important');
   141	    return;
   142	  }
   143	
   144	  container.style.setProperty('display', 'flex', 'important');
   145	
   146	  // If currentUser is not yet loaded, wait and retry
   147	  if (!window.state || !window.state.currentUser) {
   148	    console.debug('Waiting for currentUser to load...');
   149	    setTimeout(() => {
   150	        window.renderStoriesBar(containerId);
   151	    }, 500);
   152	    return;
   153	  }
   154	
   155	  // Group stories by user
   156	  const userStoriesMap = new Map();
   157	  stories.forEach(story => {
   158	    if (!userStoriesMap.has(story.userId)) {
   159	      userStoriesMap.set(story.userId, {
   160	        user: story.user,
   161	        stories: []
   162	      });
   163	    }
   164	    userStoriesMap.get(story.userId).stories.push(story);
   165	  });
   166	
   167	  groupedStories = Array.from(userStoriesMap.values());
   168	  
   169	  // Sort: current user first, then others
   170	  const currentUserId = window.state?.currentUser?.id;
   171	  groupedStories.sort((a, b) => {
   172	    if (sameId(a.user.id, currentUserId)) return -1;
   173	    if (sameId(b.user.id, currentUserId)) return 1;
   174	    return 0;
   175	  });
   176	
   177	  // Always show the add story button
   178	  let html = `
   179	    <div class="story-add-btn ${currentStoryUploadXhr ? 'story-uploading' : ''}" id="story-add-btn-${containerId}" onclick="openAddStoryDirectly('${containerId}')">
   180	      <img src="${window.getAvatarUrl(window.state?.currentUser)}" alt="Avatar" class="story-avatar" data-username="${window.state?.currentUser ? window.state.currentUser.username : ''}">
   181	      <div class="plus-icon">+</div>
   182	      <svg class="story-upload-ring" viewBox="0 0 100 100">
   183	        <circle cx="50" cy="50" r="45" fill="none" stroke="#ddd" stroke-width="5" />
   184	        <circle id="story-upload-progress-circle-${containerId}" cx="50" cy="50" r="45" fill="none" stroke="#007bff" stroke-width="5" stroke-dasharray="283" stroke-dashoffset="283" />
   185	      </svg>
   186	      <div class="story-upload-cancel" onclick="cancelStoryUpload(event, '${containerId}')">
   187	        <i class="fas fa-times"></i>
   188	      </div>
   189	      <div class="story-upload-percentage" id="story-upload-perc-${containerId}">0%</div>
   190	    </div>
   191	    <input type="file" id="direct-story-media-input-${containerId}" class="d-none" accept="image/*,video/*,audio/*,.mov,.MOV" onchange="window.submitDirectStory(this.files[0], '${containerId}')">
   192	  `;
   193	
   194	  groupedStories.forEach((group, index) => {
   195	    // Check if all stories viewed by current user (views are private now —
   196	    // fall back to the local sessionStorage record for non-owners)
   197	    const localViewed = JSON.parse(sessionStorage.getItem('viewedStories') || '[]');
   198	    const allViewed = group.stories.every(s =>
   199	      localViewed.includes(String(s.id)) ||
   200	      (s.views || []).some(v => sameId(v.userId, currentUserId))
   201	    );
   202	    const borderClass = allViewed ? 'viewed' : '';
   203	    
   204	    html += `
   205	      <div class="story-circle ${borderClass}" onclick="openStoryViewer(${index})">
   206	        <img src="${window.getAvatarUrl(group.user)}" alt="${group.user.username}" class="story-avatar" data-username="${group.user.username}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
   207	        <span class="story-count-badge">${group.stories.length}</span>
   208	      </div>
   209	    `;
   210	  });
   211	
   212	  container.innerHTML = html;
   213	}
   214	
   215	window.openAddStoryDirectly = function(containerId) {
   216	  document.getElementById(`direct-story-media-input-${containerId}`).click();
   217	};
   218	
   219	window.submitDirectStory = async function(file, containerId) {
   220	  file = await window.prepareStoryMedia(file);
   221	  if (!file) return;
   222	  const formData = new FormData();
   223	  formData.append('file', file);
   224	  
   225	  try {
   226	      const token = sessionStorage.getItem('token');
   227	      
   228	      // Update UI to uploading state
   229	      const btn = document.getElementById(`story-add-btn-${containerId}`);
   230	      if (btn) btn.classList.add('story-uploading');
   231	      
   232	      // 1. Upload using XHR for progress
   233	      const uploadRes = await new Promise((resolve, reject) => {
   234	          const xhr = new XMLHttpRequest();
   235	          currentStoryUploadXhr = xhr;
   236	          
   237	          xhr.open('POST', '/api/upload/stories');
   238	          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
   239	          xhr.setRequestHeader('X-Chat-Token', token || '');
   240	          
   241	          xhr.upload.onprogress = (e) => {
   242	              if (e.lengthComputable) {
   243	                  const percent = Math.round((e.loaded / e.total) * 100);
   244	                  const circle = document.getElementById(`story-upload-progress-circle-${containerId}`);
   245	                  const percText = document.getElementById(`story-upload-perc-${containerId}`);
   246	                  
   247	                  if (circle) {
   248	                      // Circumference is 2 * PI * r = 2 * 3.14 * 45 = 282.6
   249	                      const offset = 283 - (percent / 100) * 283;
   250	                      circle.style.strokeDashoffset = offset;
   251	                  }
   252	                  if (percText) percText.innerText = percent + '%';
   253	              }
   254	          };
   255	          
   256	          xhr.statusText = ''; // help keep track
   257	          xhr.onload = () => {
   258	              currentStoryUploadXhr = null;
   259	              if (xhr.status === 200) {
   260	                  try {
   261	                      resolve(JSON.parse(xhr.responseText));
   262	                  } catch (e) {
   263	                      reject(new Error('Invalid response from server'));
   264	                  }
   265	              } else {
   266	                  let errorMessage = 'فشل رفع الملف';
   267	                  try {
   268	                      const errorData = JSON.parse(xhr.responseText);
   269	                      errorMessage = errorData.message || errorMessage;
   270	                  } catch (e) {}
   271	                  reject(new Error(errorMessage));
   272	              }
   273	          };
   274	          
   275	          xhr.onerror = () => {
   276	              currentStoryUploadXhr = null;
   277	              reject(new Error('خطأ في الاتصال بالسيرفر'));
   278	          };
   279	          
   280	          xhr.onabort = () => {
   281	             currentStoryUploadXhr = null;
   282	             reject(new Error('UPLOAD_ABORTED'));
   283	          };
   284	          
   285	          xhr.send(formData);
   286	      });
   287	      
   288	      // 2. Post story
   289	      const postRes = await fetch('/api/stories', {
   290	        method: 'POST',
   291	        headers: {
   292	          'Content-Type': 'application/json',
   293	          'Authorization': `Bearer ${token}`,
   294	          'X-Chat-Token': token
   295	        },
   296	        body: JSON.stringify({ mediaUrl: uploadRes.url, mediaType: uploadRes.mediaType })
   297	      });
   298	      
   299	      if (postRes.ok) {
   300	        window.fetchStories();
   301	      } else {
   302	        let errorMessage = 'خطأ غير معروف';
   303	        try {
   304	          const errorData = await postRes.json();
   305	          errorMessage = errorData.message || errorMessage;
   306	        } catch (e) {
   307	          errorMessage = 'فشل نشر الستوري (خطأ في السيرفر)';
   308	        }
   309	        
   310	        if (errorMessage.includes('لايك') || errorMessage.includes('requiredLikes')) {
   311	          window.showLikesLimitAlert(errorMessage);
   312	        } else {
   313	          Swal.fire('عذراً', errorMessage, 'error');
   314	        }
   315	      }
   316	  } catch (err) {
   317	      if (err.message === 'UPLOAD_ABORTED') return;
   318	      
   319	      console.error(err);
   320	      if (err.message && (err.message.includes('لايك') || err.message.includes('requiredLikes'))) {
   321	        window.showLikesLimitAlert(err.message);
   322	      } else {
   323	        Swal.fire('عذراً', err.message, 'error');
   324	      }
   325	  } finally {
   326	      currentStoryUploadXhr = null;
   327	      const input = document.getElementById(`direct-story-media-input-${containerId}`);
   328	      if (input) input.value = '';
   329	      window.renderStoriesBar(containerId);
   330	  }
   331	}
   332	
   333	window.submitStory = async function() {
   334	  const mediaInput = document.getElementById('story-media-input');
   335	  const textInput = document.getElementById('story-text-input').value;
   336	  const bgInput = document.getElementById('story-bg-input').value;
   337	  const textColorInput = document.getElementById('story-text-color-input').value;
   338	  const textBgInput = document.getElementById('story-text-bg-input').value;
   339	  
   340	  let mediaUrl = null;
   341	  let mediaType = null;
   342	  
   343	  if (mediaInput.files.length > 0) {
   344	    const prepared = await window.prepareStoryMedia(mediaInput.files[0]);
   345	    if (!prepared) { mediaInput.value = ''; return; }
   346	    const formData = new FormData();
   347	    formData.append('file', prepared);
   348	    
   349	    const progressBar = document.getElementById('upload-progress-bar');
   350	    const progressContainer = document.getElementById('upload-progress-container');
   351	    progressContainer.style.display = 'block';
   352	    
   353	    try {
   354	      const token = sessionStorage.getItem('token');
   355	      // Using XMLHttpRequest for progress tracking
   356	      const uploadResult = await new Promise((resolve, reject) => {
   357	        const xhr = new XMLHttpRequest();
   358	        currentStoryUploadXhr = xhr;
   359	        xhr.open('POST', '/api/upload/stories');
   360	        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
   361	        xhr.setRequestHeader('X-Chat-Token', token || '');
   362	        
   363	        xhr.upload.onprogress = (e) => {
   364	          if (e.lengthComputable) {
   365	            const percent = Math.round((e.loaded / e.total) * 100);
   366	            progressBar.style.width = percent + '%';
   367	            
   368	            // Also update the circular progress if it exists in the background
   369	            const circle = document.getElementById('story-upload-progress-circle');
   370	            const percText = document.getElementById('story-upload-perc');
   371	            const btn = document.getElementById('story-add-btn');
   372	            
   373	            if (btn) btn.classList.add('story-uploading');
   374	            if (circle) {
   375	                const offset = 283 - (percent / 100) * 283;
   376	                circle.style.strokeDashoffset = offset;
   377	            }
   378	            if (percText) percText.innerText = percent + '%';
   379	          }
   380	        };
   381	        
   382	        xhr.onload = () => {
   383	          currentStoryUploadXhr = null;
   384	          if (xhr.status === 200) {
   385	            resolve(JSON.parse(xhr.responseText));
   386	          } else {
   387	            let errorMsg = 'Upload failed';
   388	            try {
   389	                const response = JSON.parse(xhr.responseText);
   390	                errorMsg = response.message || errorMsg;
   391	            } catch (e) {
   392	                // If not JSON, try to extract from HTML
   393	                const doc = new DOMParser().parseFromString(xhr.responseText, 'text/html');
   394	                const textContent = doc.body.textContent || doc.head.textContent || xhr.responseText;
   395	                if (textContent && textContent.includes('Forbidden')) {
   396	                    errorMsg = 'عذراً، لا تملك الصلاحية لرفع الملف.';
   397	                }
   398	            }
   399	            reject(new Error(errorMsg));
   400	          }
   401	        };
   402	        xhr.onerror = () => {
   403	          currentStoryUploadXhr = null;
   404	          reject(new Error('خطأ في الاتصال بالسيرفر'));
   405	        };
   406	        xhr.onabort = () => {
   407	          currentStoryUploadXhr = null;
   408	          reject(new Error('UPLOAD_ABORTED'));
   409	        };
   410	        xhr.send(formData);
   411	      });
   412	      mediaUrl = uploadResult.url || null;
   413	      mediaType = uploadResult.mediaType || null;
   414	    } catch (err) {
   415	      if (err.message === 'UPLOAD_ABORTED') {
   416	        progressContainer.style.display = 'none';
   417	        return;
   418	      }
   419	      console.error('Upload failed', err);
   420	      if (err.message && (err.message.includes('لايك') || err.message.includes('requiredLikes'))) {
   421	        window.showLikesLimitAlert(err.message);
   422	      } else {
   423	        Swal.fire('عذراً', 'فشل رفع الملف: ' + err.message, 'error');
   424	      }
   425	      progressContainer.style.display = 'none';
   426	      return;
   427	    }
   428	  }
   429	  
   430	  if (!mediaUrl && !textInput.trim()) {
   431	    Swal.fire('تنبيه', 'يجب إضافة صورة أو نص', 'warning');
   432	    return;
   433	  }
   434	  
   435	  try {
   436	    const token = sessionStorage.getItem('token');
   437	    const res = await fetch('/api/stories', {
   438	      method: 'POST',
   439	      headers: {
   440	        'Content-Type': 'application/json',
   441	        'Authorization': `Bearer ${token}`,
   442	        'X-Chat-Token': token
   443	      },
   444	      body: JSON.stringify({
   445	        mediaUrl,
   446	        mediaType,
   447	        text: textInput,
   448	        backgroundColor: bgInput,
   449	        textColor: textColorInput,
   450	        textBackgroundColor: textBgInput
   451	      })
   452	    });
   453	    
   454	    if (res.ok) {
   455	      const modalEl = document.getElementById('addStoryModal');
   456	      const modal = bootstrap.Modal.getInstance(modalEl);
   457	      if (modal) modal.hide();
   458	      window.fetchStories();
   459	    } else {
   460	      let errorData = { message: 'خطأ غير معروف' };
   461	      try {
   462	        const rawText = await res.text();
   463	        try {
   464	          errorData = JSON.parse(rawText);
   465	        } catch (e) {
   466	          // If not JSON, try to extract error from HTML if possible
   467	          const doc = new DOMParser().parseFromString(rawText, 'text/html');
   468	          const textContent = doc.body.textContent || doc.head.textContent || rawText;
   469	          const cleanText = textContent.replace(/\s+/g, ' ').trim();
   470	          
   471	          if (cleanText.includes('Forbidden')) {
   472	              errorData.message = 'عذراً، لا تملك الصلاحية للقيام بهذا الإجراء.';
   473	          } else {
   474	              errorData.message = cleanText.length < 100 ? cleanText : 'خطأ غير معروف من السيرفر';
   475	          }
   476	        }
   477	      } catch (e) {
   478	        console.error('Error parsing error response', e);
   479	      }
   480	
   481	      if (errorData.message && (errorData.message.includes('لايك') || errorData.message.includes('requiredLikes'))) {
   482	        showLikesLimitAlert(errorData.message);
   483	      } else {
   484	        Swal.fire('عذراً', 'فشل نشر الستوري: ' + errorData.message, 'error');
   485	      }
   486	    }
   487	  } catch (err) {
   488	    Swal.fire('عذراً', 'فشل نشر الستوري: ' + err.message, 'error');
   489	  } finally {
   490	    currentStoryUploadXhr = null;
   491	    const progressContainer = document.getElementById('upload-progress-container');
   492	    if (progressContainer) progressContainer.style.display = 'none';
   493	    window.renderStoriesBar('wall-stories-container');
   494	  }
   495	}
   496	
   497	window.openStoryViewer = function(userIndex, storyIndex = 0) {
   498	  if (!groupedStories[userIndex]) return;
   499	  
   500	  currentStoryUserIndex = userIndex;
   501	  currentStoryIndex = storyIndex;
   502	  
   503	  renderStoryViewer();
   504	}
   505	
   506	function sameId(a, b) { return String(a) === String(b); }
   507	
   508	function isAdminUser() {
   509	  const cu = window.state?.currentUser || window.currentUser || null;
   510	  if (!cu) return false;
   511	  return !!(cu.isAdmin || cu.role === 'admin' || cu.power === 'admin' ||
   512	    (typeof window.hasPermission === 'function' && window.hasPermission('canManageRooms')));
   513	}
   514	
   515	function canUserModerateStory(story) {
   516	  const cu = window.state?.currentUser || window.currentUser || null;
   517	  if (!cu) return false;
   518	  return sameId(story.userId, cu.id || cu.userId) || isAdminUser();
   519	}
   520	
   521	window.canCurrentUserModerateStory = canUserModerateStory;
   522	window.isAdminUser = isAdminUser; // references in inline onclick
   523	
   524	function getRelativeTime(dateString) {
   525	  const date = new Date(dateString);
   526	  const now = new Date();
   527	  const diffInSeconds = Math.floor((now - date) / 1000);
   528	  
   529	  if (diffInSeconds < 60) return "الآن";
   530	  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} د`;
   531	  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} س`;
   532	  
   533	  const days = Math.floor(diffInSeconds / 86400);
   534	  if (days === 1) return "يوم";
   535	  if (days === 2) return "يومان";
   536	  if (days < 11) return `${days} أيام`;
   537	  return `${days} يوم`;
   538	}
   539	
   540	let storyRemainingTime = 0;
   541	let storyLastStartTime = 0;
   542	let isPaused = false;
   543	let storyTotalDuration = 10000;
   544	
   545	window.renderStoryViewer = function(resume = false) {
   546	  const group = groupedStories[currentStoryUserIndex];
   547	  if (!group) {
   548	    closeStoryViewer();
   549	    return;
   550	  }
   551	  
   552	  const story = group.stories[currentStoryIndex];
   553	  if (!story) {
   554	    // Move to next user
   555	    if (currentStoryUserIndex + 1 < groupedStories.length) {
   556	      openStoryViewer(currentStoryUserIndex + 1, 0);
   557	    } else {
   558	      closeStoryViewer();
   559	    }
   560	    return;
   561	  }
   562	  
   563	  if (!resume) {
   564	    const currentUserId = window.state?.currentUser?.id || window.currentUser?.id || null;
   565	    const isOwnerStory = currentUserId != null && sameId(story.userId, currentUserId);
   566	
   567	    // Record view locally for immediate UI response
   568	    const localViewed = JSON.parse(sessionStorage.getItem('viewedStories') || '[]');
   569	    if (!localViewed.includes(String(story.id))) {
   570	        localViewed.push(String(story.id));
   571	        sessionStorage.setItem('viewedStories', JSON.stringify(localViewed));
   572	    }
   573	    
   574	    // Refresh indicators immediately
   575	    if (typeof window.refreshSidebarStoryIndicators === 'function') {
   576	        window.refreshSidebarStoryIndicators();
   577	    }
   578	
   579	    // Mark as viewed in DB (skip own stories — owner never counts as viewer)
   580	    if (!isOwnerStory) {
   581	      const token = sessionStorage.getItem('token');
   582	      fetch(`/api/stories/${story.id}/view`, {
   583	        method: 'POST',
   584	        headers: { 
   585	          'Authorization': `Bearer ${token}`,
   586	          'X-Chat-Token': token
   587	        }
   588	      });
   589	    }
   590	  }
   591	  
   592	  let viewerContainer = document.getElementById('story-viewer-container');
   593	  if (!viewerContainer) {
   594	    viewerContainer = document.createElement('div');
   595	    viewerContainer.id = 'story-viewer-container';
   596	    viewerContainer.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.9); backdrop-filter: blur(5px);';
   597	    document.body.appendChild(viewerContainer);
   598	
   599	    // Protection: disallow right-click, drag-open, screenshot-style save on story media
   600	    viewerContainer.addEventListener('contextmenu', (e) => {
   601	      if (e.target.closest('.story-media, .story-text, .story-right-actions, .story-header, .story-modal-content')) {
   602	        e.preventDefault();
   603	        if (window.showToast) window.showToast('غير مسموح بحفظ محتوى الستوري', 'warning');
   604	      }
   605	    });
   606	    viewerContainer.addEventListener('keydown', (e) => {
   607	      if (e.ctrlKey && (e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P' || e.key === 'c' || e.key === 'C')) {
   608	        e.preventDefault();
   609	      }
   610	    });
   611	    viewerContainer.addEventListener('dragstart', (e) => {
   612	      if (e.target.closest('.story-media')) e.preventDefault();
   613	    }, true);
   614	
   615	    // Lightweight screenshot deterrent: blur/hide media when the tab or
   616	    // window loses focus, restore on focus. One class toggle, no polling.
   617	    function storyProtect() {
   618	      viewerContainer.classList.add('story-viewer-protected');
   619	      const v = document.getElementById('current-story-video');
   620	      if (v && !v.paused) { try { v.pause(); } catch (e) {} }
   621	      const a = document.getElementById('current-story-audio');
   622	      if (a && !a.paused) { try { a.pause(); } catch (e) {} }
   623	    }
   624	    function storyUnprotect() {
   625	      viewerContainer.classList.remove('story-viewer-protected');
   626	      const v = document.getElementById('current-story-video');
   627	      if (v) { try { v.play().catch(() => {}); } catch (e) {} }
   628	      const a = document.getElementById('current-story-audio');
   629	      if (a) { try { a.play().catch(() => {}); } catch (e) {} }
   630	    }
   631	    window._storyBlurH = () => storyProtect();
   632	    window._storyFocusH = () => storyUnprotect();
   633	    window._storyVisH = () => {
   634	      if (document.hidden) storyProtect();
   635	      else storyUnprotect();
   636	    };
   637	    window.addEventListener('blur', window._storyBlurH);
   638	    window.addEventListener('focus', window._storyFocusH);
   639	    document.addEventListener('visibilitychange', window._storyVisH);
   640	
   641	    // Add styles for the new UI
   642	    const style = document.createElement('style');
   643	    style.innerHTML = `
   644	      #story-viewer-container .story-media {
   645	        -webkit-user-drag: none;
   646	        -webkit-touch-callout: none;
   647	        -webkit-user-select: none;
   648	        user-select: none;
   649	        touch-action: none;
   650	        pointer-events: none;
   651	        max-width: 100%;
   652	        max-height: 100%;
   653	        object-fit: contain;
   654	      }
   655	      #story-viewer-container .story-media.story-audio {
   656	        display: flex;
   657	        flex-direction: column;
   658	        align-items: center;
   659	        justify-content: center;
   660	        width: 100%;
   661	        height: 100%;
   662	        max-width: 100%;
   663	        max-height: 100%;
   664	        background: radial-gradient(circle at 30% 20%, #2a2a4a 0%, #10102a 70%);
   665	      }
   666	      #story-viewer-container .story-music-cover {
   667	        width: 100%;
   668	        height: 100%;
   669	        max-width: 400px;
   670	        max-height: 400px;
   671	        border-radius: 20px;
   672	        background: linear-gradient(135deg, #ff5f6d, #ffc371, #38ef7d);
   673	        background-size: 300% 300%;
   674	        -webkit-touch-callout: none;
   675	        -webkit-user-select: none;
   676	        user-select: none;
   677	        display: flex;
   678	        align-items: center;
   679	        justify-content: center;
   680	        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), inset 0 0 0 3px rgba(255, 255, 255, 0.25);
   681	        animation: storyMusicGradient 6s ease infinite;
   682	      }
   683	      @keyframes storyMusicGradient {
   684	        0% { background-position: 0% 50%; }
   685	        50% { background-position: 100% 50%; }
   686	        100% { background-position: 0% 50%; }
   687	      }
   688	      #story-viewer-container .story-music-cover-icon {
   689	        font-size: 64px;
   690	        color: rgba(255, 255, 255, 0.92);
   691	        text-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
   692	      }
   693	      #story-viewer-container .story-media-wrapper {
   694	        -webkit-touch-callout: none;
   695	        -webkit-user-select: none;
   696	        user-select: none;
   697	      }
   698	      #story-viewer-container.story-viewer-protected .story-media,
   699	      #story-viewer-container.story-viewer-protected .story-text,
   700	      #story-viewer-container.story-viewer-protected .story-header,
   701	      #story-viewer-container.story-viewer-protected .story-right-actions {
   702	        filter: blur(14px) opacity(0.25) !important;
   703	        transition: filter 0.15s ease;
   704	      }
   705	      .story-right-actions {
   706	        position: absolute;
   707	        right: 15px;
   708	        top: 50%;
   709	        transform: translateY(-50%);
   710	        display: flex;
   711	        flex-direction: column;
   712	        gap: 18px;
   713	        z-index: 20;
   714	        background: rgba(0, 0, 0, 0.3);
   715	        padding: 20px 10px;
   716	        border-radius: 40px;
   717	        backdrop-filter: blur(12px);
   718	        border: 1px solid rgba(255, 255, 255, 0.15);
   719	        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
   720	      }
   721	      .story-action-item {
   722	        display: flex;
   723	        flex-direction: column;
   724	        align-items: center;
   725	        color: white;
   726	        cursor: pointer;
   727	        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
   728	      }
   729	      .story-action-item:hover {
   730	        transform: scale(1.15);
   731	        color: #ddd;
   732	      }
   733	      .story-action-item:active { 
   734	        transform: scale(0.85); 
   735	      }
   736	      .story-action-item i { 
   737	        font-size: 19px; 
   738	        margin-bottom: 5px;
   739	      }
   740	      .story-action-item span { 
   741	        font-size: 10px; 
   742	        font-weight: 600; 
   743	        opacity: 0.9;
   744	        letter-spacing: 0.5px;
   745	      }
   746	      
   747	      .story-header-info {
   748	        display: flex;
   749	        flex-direction: column;
   750	        margin-left: 10px;
   751	      }
   752	      .story-time-text {
   753	        font-size: 11px;
   754	        color: rgba(255,255,255,0.7);
   755	      }
   756	      
   757	      .story-like-anim { animation: heartBeat 0.4s ease-in-out; }
   758	      @keyframes heartBeat {
   759	        0% { transform: scale(1); }
   760	        50% { transform: scale(1.4); }
   761	        100% { transform: scale(1); }
   762	      }
   763	      
   764	      #story-interactions-modal, #story-comments-modal {
   765	        position: absolute;
   766	        bottom: 0;
   767	        left: 0;
   768	        right: 0;
   769	        background: white;
   770	        border-radius: 20px 20px 0 0;
   771	        max-height: 70%;
   772	        overflow-y: auto;
   773	        z-index: 100;
   774	        padding: 20px;
   775	        transform: translateY(100%);
   776	        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
   777	      }
   778	      #story-interactions-modal.show, #story-comments-modal.show { transform: translateY(0); }
   779	      .interaction-row, .comment-row {
   780	        display: flex;
   781	        align-items: flex-start;
   782	        padding: 12px 0;
   783	        border-bottom: 1px solid #f0f0f0;
   784	      }
   785	      .interaction-avatar, .comment-avatar { 
   786	        width: 35px; height: 35px; border-radius: 50%; margin-right: 12px; border: 1px solid #eee; flex-shrink: 0;
   787	      }
   788	      .comment-content { flex: 1; }
   789	      .comment-user { font-weight: bold; font-size: 13px; display: flex; align-items: center; }
   790	      .comment-text { font-size: 14px; color: #333; margin-top: 2px; line-height: 1.4; word-break: break-word; }
   791	      .story-comment-input-area {
   792	        display: flex;
   793	        gap: 10px;
   794	        margin-top: 15px;
   795	        padding-top: 15px;
   796	        border-top: 1px solid #eee;
   797	      }
   798	      .story-comment-input {
   799	        flex: 1;
   800	        border: 1px solid #ddd;
   801	        border-radius: 20px;
   802	        padding: 8px 15px;
   803	        outline: none;
   804	        font-size: 14px;
   805	      }
   806	      .story-comment-send {
   807	        background: #007bff;
   808	        color: white;
   809	        border: none;
   810	        width: 36px;
   811	        height: 36px;
   812	        border-radius: 50%;
   813	        cursor: pointer;
   814	        display: flex;
   815	        align-items: center;
   816	        justify-content: center;
   817	      }
   818	    `;
   819	    document.head.appendChild(style);
   820	  }
   821	  
   822	  const currentUser = window.state?.currentUser || null;
   823	  const currentUserId = currentUser?.id || null;
   824	
   825	  if (!resume) {
   826	    let progressHtml = '';
   827	    for (let i = 0; i < group.stories.length; i++) {
   828	        let stateClass = '';
   829	        if (i < currentStoryIndex) stateClass = 'completed';
   830	        else if (i === currentStoryIndex) stateClass = 'active';
   831	        
   832	        progressHtml += `
   833	        <div class="story-progress-segment ${stateClass}">
   834	            <div class="story-progress-fill"></div>
   835	        </div>
   836	        `;
   837	    }
   838	    
   839	    const isOwner = sameId(story.userId, currentUserId);
   840	    const isAdmin = isAdminUser();
   841	    const ownerCanViewStats = isOwner; // only the owner sees likes/views counts & lists
   842	    const isLiked = story.likedByMe != null ? !!story.likedByMe : (story.likes || []).some(l => sameId(l.userId, currentUserId));
   843	    const canDelete = isOwner || isAdmin;
   844	    
   845	    let mediaHtml = '';
   846	    if (story.mediaUrl) {
   847	        if (story.mediaUrl.match(/\.(mp4|webm|mov|avi|m4v|ogg)$/i) || story.mediaType === 'video') {
   848	        mediaHtml = `<video src="${story.mediaUrl}" id="current-story-video" class="story-media" autoplay playsinline draggable="false" oncontextmenu="return false;"></video>`;
   849	        } else if (story.mediaType === 'audio' || story.mediaUrl.match(/\.(mp3|wav|oga|m4a|aac|flac|opus|weba)$/i)) {
   850	        mediaHtml = `
   851	          <div class="story-media story-audio" draggable="false" oncontextmenu="return false;">
   852	            <div class="story-music-cover">
   853	              <div class="story-music-cover-icon"><i class="fas fa-music"></i></div>
   854	            </div>
   855	            <audio id="current-story-audio" src="${story.mediaUrl}" autoplay preload="auto" playsinline style="display: none;"></audio>
   856	          </div>
   857	        `;
   858	        } else {
   859	        mediaHtml = `<img src="${story.mediaUrl}" class="story-media" draggable="false" oncontextmenu="return false;" alt="">`;
   860	        }
   861	    }
   862	    
   863	    viewerContainer.innerHTML = `
   864	        <div class="story-modal-content" style="position: relative; width: 100%; max-width: 400px; height: 80%; max-height: 80vh; background: ${story.backgroundColor || '#000'}; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
   865	        <div class="story-progress-bar">${progressHtml}</div>
   866	        <div class="story-header" style="display: flex; align-items: center; padding: 15px; background: linear-gradient(to bottom, rgba(0,0,0,0.5), transparent); position: absolute; top:0; left:0; right:0; z-index: 10;">
   867	            <img src="${window.getAvatarUrl(group.user)}" class="story-user-avatar story-avatar" style="width:38px; height:38px; border: 2px solid white;" data-username="${group.user.username}">
   868	            <div class="story-header-info">
   869	            <div class="text-white fw-bold text-shadow" style="font-size: 14px; display: flex; align-items: center;">
   870	             ${window.renderUserIdentity(group.user, {
   871	                 nameStyle: 'color: white; font-weight: bold;',
   872	                 containerClasses: 'user-addon-container'
   873	             })}
   874	            </div>
   875	            <span class="story-time-text">${getRelativeTime(story.createdAt)}</span>
   876	            </div>
   877	            <button class="btn btn-link text-white ms-auto" onclick="closeStoryViewer()"><i class="fas fa-times"></i></button>
   878	        </div>
   879	        
   880	        <div class="story-nav-btn left" style="position: absolute; left:0; top:0; bottom:0; width:30%; z-index: 5;" onclick="prevStory(event)"></div>
   881	        <div class="story-nav-btn right" style="position: absolute; right:0; top:0; bottom:0; width:30%; z-index: 5;" onclick="nextStory(event)"></div>
   882	        
   883	        <div class="story-media-wrapper" style="width:100%; height:100%; display: flex; align-items: center; justify-content: center;">
   884	            ${mediaHtml}
   885	        </div>
   886	
   887	        ${story.text ? `
   888	            <div class="story-text-container" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80%; text-align: center; z-index: 6;">
   889	            <div class="story-text text-shadow" style="color: ${story.textColor || '#fff'}; background-color: ${story.textBackgroundColor || 'transparent'}; padding: 12px 18px; border-radius: 8px; font-size: 18px; font-weight: 500; display: inline-block;">${story.text}</div>
   890	            </div>
   891	        ` : ''}
   892	        
   893	        <!-- Right Side Vertical Panel -->
   894	        <div class="story-right-actions">
   895	            ${isOwner ? `
   896	            <div class="story-action-item" onclick="showStoryInteractions('views')" title="المشاهدات">
   897	                <i class="fas fa-eye"></i>
   898	                <span>${story.views ? story.views.length : 0}</span>
   899	            </div>
   900	            <div class="story-action-item" onclick="showStoryInteractions('likes')" title="قائمة المعجبين">
   901	                <i class="fas fa-users"></i>
   902	                <span>${story.likes ? story.likes.length : 0}</span>
   903	            </div>
   904	            ` : ''}
   905	            ${!isOwner ? `
   906	            <div class="story-action-item ${isLiked ? 'story-liked' : ''}" onclick="likeStory('${story.id}', event)" title="أعجبني">
   907	                <i class="fas fa-heart ${isLiked ? 'text-danger story-like-anim' : ''}"></i>
   908	                <span>${isLiked ? 'لايك' : 'أعجبني'}</span>
   909	            </div>
   910	            ` : ''}
   911	            <div class="story-action-item" onclick="toggleStoryComments()" title="التعليقات">
   912	                <i class="fas fa-comment"></i>
   913	                <span>${story.comments ? story.comments.length : 0}</span>
   914	            </div>
   915	            ${canDelete ? `
   916	            <div class="story-action-item text-danger" onclick="deleteStory('${story.id}')" title="حذف">
   917	                <i class="fas fa-trash"></i>
   918	                <span>حذف</span>
   919	            </div>
   920	            ` : ''}
   921	            ${isAdmin && !isOwner ? `
   922	            <div class="story-action-item text-warning" onclick="toggleStoryBan('${story.userId}')" title="منع من نشر الستوريات">
   923	                <i class="fas fa-ban"></i>
   924	                <span>منع النشر</span>
   925	            </div>
   926	            ` : ''}
   927	        </div>
   928	
   929	        <!-- Modals -->
   930	        <div id="story-interactions-modal"></div>
   931	        <div id="story-comments-modal"></div>
   932	        </div>
   933	    `;
   934	  }
   935	
   936	  // Update interaction UI (likes, views, comments) even if just resuming/refreshing
   937	  const rightActions = viewerContainer.querySelector('.story-right-actions');
   938	  if (rightActions) {
   939	      const isOwner = sameId(story.userId, currentUserId);
   940	      const isAdmin = isAdminUser();
   941	      const isLiked = story.likedByMe != null ? !!story.likedByMe : (story.likes || []).some(l => sameId(l.userId, currentUserId));
   942	      const canDelete = isOwner || isAdmin;
   943	      rightActions.innerHTML = `
   944	          ${isOwner ? `
   945	          <div class="story-action-item" onclick="showStoryInteractions('views')" title="المشاهدات">
   946	              <i class="fas fa-eye"></i>
   947	              <span>${story.views ? story.views.length : 0}</span>
   948	          </div>
   949	          <div class="story-action-item" onclick="showStoryInteractions('likes')" title="قائمة المعجبين">
   950	          <i class="fas fa-users"></i>
   951	          <span>${story.likes ? story.likes.length : 0}</span>
   952	          </div>
   953	          ` : ''}
   954	          ${!isOwner ? `
   955	          <div class="story-action-item ${isLiked ? 'story-liked' : ''}" onclick="likeStory('${story.id}', event)" title="أعجبني">
   956	          <i class="fas fa-heart ${isLiked ? 'text-danger story-like-anim' : ''}"></i>
   957	          <span>${isLiked ? 'لايك' : 'أعجبني'}</span>
   958	          </div>
   959	          ` : ''}
   960	          <div class="story-action-item" onclick="toggleStoryComments()" title="التعليقات">
   961	          <i class="fas fa-comment"></i>
   962	          <span>${story.comments ? story.comments.length : 0}</span>
   963	          </div>
   964	          ${canDelete ? `
   965	          <div class="story-action-item text-danger" onclick="deleteStory('${story.id}')" title="حذف">
   966	              <i class="fas fa-trash"></i>
   967	              <span>حذف</span>
   968	          </div>
   969	          ` : ''}
   970	          ${isAdmin && !isOwner ? `
   971	          <div class="story-action-item text-warning" onclick="toggleStoryBan('${story.userId}')" title="منع من نشر الستوريات">
   972	              <i class="fas fa-ban"></i>
   973	              <span>منع النشر</span>
   974	          </div>
   975	          ` : ''}
   976	      `;
   977	  }
   978	
   979	  const video = viewerContainer.querySelector('#current-story-video');
   980	  const fill = viewerContainer.querySelector('.story-progress-segment.active .story-progress-fill');
   981	  
   982	  if (!resume) {
   983	    clearTimeout(storyTimer);
   984	    const audio = viewerContainer.querySelector('#current-story-audio');
   985	    if (video) {
   986	        video.onloadedmetadata = () => {
   987	           const vDur = video.duration;
   988	           storyTotalDuration = vDur * 1000;
   989	           storyRemainingTime = storyTotalDuration;
   990	           if (fill) fill.style.animationDuration = `${vDur}s`;
   991	           startStoryTimer(storyRemainingTime);
   992	        };
   993	        video.onended = () => window.nextStory();
   994	    } else if (audio) {
   995	        audio.onloadedmetadata = () => {
   996	           const aDur = (Number.isFinite(audio.duration) && audio.duration > 0) ? audio.duration : 10000;
   997	           storyTotalDuration = aDur * 1000;
   998	           storyRemainingTime = storyTotalDuration;
   999	           if (fill) fill.style.animationDuration = `${aDur}s`;
  1000	           startStoryTimer(storyRemainingTime);
  1001	        };
  1002	        audio.onended = () => window.nextStory();
  1003	        audio.onerror = () => { audio.onerror = null; startStoryTimer(10000); };
  1004	    } else {
  1005	        storyTotalDuration = 10000;
  1006	        storyRemainingTime = storyTotalDuration;
  1007	        startStoryTimer(storyRemainingTime);
  1008	        if (fill) fill.style.animationDuration = `10s`;
  1009	    }
  1010	  } else {
  1011	    // Resume
  1012	    startStoryTimer(storyRemainingTime);
  1013	  }
  1014	}
  1015	
  1016	function startStoryTimer(duration) {
  1017	    clearTimeout(storyTimer);
  1018	    storyLastStartTime = Date.now();
  1019	    isPaused = false;
  1020	    
  1021	    storyTimer = setTimeout(() => {
  1022	        window.nextStory();
  1023	    }, duration);
  1024	}
  1025	
  1026	window.showStoryInteractions = function(type) {
  1027	  const group = groupedStories[currentStoryUserIndex];
  1028	  const story = group.stories[currentStoryIndex];
  1029	  const data = type === 'likes' ? (story.likes || []) : (story.views || []);
  1030	  const title = type === 'likes' ? 'المعجبون' : 'المشاهدون';
  1031	  
  1032	  const modal = document.getElementById('story-interactions-modal');
  1033	  if (!modal) return;
  1034	
  1035	  // Pause
  1036	  pauseStory();
  1037	
  1038	  let html = `
  1039	    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
  1040	      <h5 style="margin: 0; font-weight: bold; color: #333;">${title} (${data.length})</h5>
  1041	      <button class="btn-close" onclick="closeInteractionsModal()"></button>
  1042	    </div>
  1043	    <div style="max-height: 400px; overflow-y: auto;">
  1044	  `;
  1045	
  1046	  if (data.length === 0) {
  1047	    html += `<div style="text-align:center; color: #888; padding: 20px;">لا يوجد بيانات حتى الآن</div>`;
  1048	  } else {
  1049	    data.forEach(item => {
  1050	      const u = item.user || item;
  1051	      if (!u) return;
  1052	      
  1053	      html += `
  1054	        <div class="interaction-row" onclick="openUserProfile('${u.id || u.userId}')" style="cursor: pointer;">
  1055	          <img src="${window.getAvatarUrl(u)}" class="interaction-avatar">
  1056	          <div style="flex: 1;">
  1057	            <div style="font-weight: bold; display: flex; align-items: center;">
  1058	              ${window.renderUserIdentity(u, {
  1059	                  nameStyle: `color: ${u.ucol || '#333'}; font-weight: bold;`,
  1060	                  containerClasses: 'user-addon-container'
  1061	              })}
  1062	            </div>
  1063	          </div>
  1064	        </div>
  1065	      `;
  1066	    });
  1067	  }
  1068	  html += `</div>`;
  1069	  
  1070	  modal.innerHTML = html;
  1071	  modal.classList.add('show');
  1072	}
  1073	
  1074	function pauseStory() {
  1075	    if (isPaused) return;
  1076	    isPaused = true;
  1077	    clearTimeout(storyTimer);
  1078	    const elapsed = Date.now() - storyLastStartTime;
  1079	    storyRemainingTime = Math.max(0, storyRemainingTime - elapsed);
  1080	    
  1081	    const video = document.getElementById('current-story-video');
  1082	    if (video) video.pause();
  1083	    const audio = document.getElementById('current-story-audio');
  1084	    if (audio && !audio.paused) { try { audio.pause(); } catch (e) {} }
  1085	    
  1086	    const fill = document.querySelector('.story-progress-segment.active .story-progress-fill');
  1087	    if (fill) {
  1088	        fill.style.animationPlayState = 'paused';
  1089	    }
  1090	}
  1091	
  1092	function resumeStory() {
  1093	    if (!isPaused) return;
  1094	    const video = document.getElementById('current-story-video');
  1095	    if (video) video.play();
  1096	    const audio = document.getElementById('current-story-audio');
  1097	    if (audio) { try { audio.play().catch(() => {}); } catch (e) {} }
  1098	    
  1099	    const fill = document.querySelector('.story-progress-segment.active .story-progress-fill');
  1100	    if (fill) fill.style.animationPlayState = 'running';
  1101	    
  1102	    startStoryTimer(storyRemainingTime);
  1103	}
  1104	
  1105	window.closeInteractionsModal = function() {
  1106	  const modal = document.getElementById('story-interactions-modal');
  1107	  if (modal) modal.classList.remove('show');
  1108	  resumeStory();
  1109	}
  1110	
  1111	window.toggleStoryComments = function() {
  1112	  const modal = document.getElementById('story-comments-modal');
  1113	  if (!modal) return;
  1114	  
  1115	  if (modal.classList.contains('show')) {
  1116	    modal.classList.remove('show');
  1117	    resumeStory();
  1118	  } else {
  1119	    pauseStory();
  1120	    renderStoryComments();
  1121	    modal.classList.add('show');
  1122	  }
  1123	}
  1124	
  1125	window.renderStoryComments = function() {
  1126	  const modal = document.getElementById('story-comments-modal');
  1127	  const group = groupedStories[currentStoryUserIndex];
  1128	  const story = group.stories[currentStoryIndex];
  1129	  const comments = story.comments || [];
  1130	  
  1131	  let html = `
  1132	    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
  1133	      <h5 style="margin: 0; font-weight: bold; color: #333;">التعليقات (${comments.length})</h5>
  1134	      <button class="btn-close" onclick="toggleStoryComments()"></button>
  1135	    </div>
  1136	    <div id="comments-list" style="max-height: 300px; overflow-y: auto;">
  1137	  `;
  1138	  
  1139	  if (comments.length === 0) {
  1140	    html += `<div id="no-comments" style="text-align:center; color: #888; padding: 20px;">لا يوجد تعليقات بعد</div>`;
  1141	  } else {
  1142	    comments.forEach(c => {
  1143	      html += `
  1144	        <div class="comment-row">
  1145	          <img src="${window.getAvatarUrl(c.user)}" class="comment-avatar">
  1146	          <div class="comment-content">
  1147	            <div class="comment-user" style="display: flex; align-items: center;">
  1148	                ${window.renderUserIdentity(c.user, {
  1149	                    nameStyle: `color: ${c.user.ucol || '#333'}; font-weight: bold;`,
  1150	                    containerClasses: 'user-addon-container'
  1151	                })}
  1152	            </div>
  1153	            <div class="comment-text">${c.msg}</div>
  1154	            <div style="font-size: 10px; color: #999; margin-top: 4px;">${getRelativeTime(c.createdAt)}</div>
  1155	          </div>
  1156	        </div>
  1157	      `;
  1158	    });
  1159	  }
  1160	  
  1161	  html += `
  1162	    </div>
  1163	    <div class="story-comment-input-area">
  1164	      <input type="text" id="story-comment-field" class="story-comment-input" placeholder="اكتب تعليقاً..." onkeypress="if(event.key === 'Enter') sendStoryComment('${story.id}')">
  1165	      <button class="story-comment-send" onclick="sendStoryComment('${story.id}')">
  1166	        <i class="fas fa-paper-plane"></i>
  1167	      </button>
  1168	    </div>
  1169	  `;
  1170	  
  1171	  modal.innerHTML = html;
  1172	}
  1173	
  1174	window.sendStoryComment = async function(storyId) {
  1175	  const input = document.getElementById('story-comment-field');
  1176	  const msg = input.value.trim();
  1177	  if (!msg) return;
  1178	  
  1179	  try {
  1180	    const token = sessionStorage.getItem('token');
  1181	    const res = await fetch(`/api/stories/${storyId}/comment`, {
  1182	      method: 'POST',
  1183	      headers: {
  1184	        'Content-Type': 'application/json',
  1185	        'Authorization': `Bearer ${token}`,
  1186	        'X-Chat-Token': token
  1187	      },
  1188	      body: JSON.stringify({ msg })
  1189	    });
  1190	    
  1191	    if (res.ok) {
  1192	      input.value = '';
  1193	      const comment = await res.json();
  1194	      
  1195	      // Update local state
  1196	      const group = groupedStories[currentStoryUserIndex];
  1197	      const story = group.stories[currentStoryIndex];
  1198	      if (!story.comments) story.comments = [];
  1199	      story.comments.push(comment);
  1200	      
  1201	      // Refresh UI
  1202	      renderStoryComments();
  1203	      renderStoryViewer(true);
  1204	    }
  1205	  } catch (err) {
  1206	    console.error('Error sending comment:', err);
  1207	  }
  1208	}
  1209	
  1210	
  1211	
  1212	window.nextStory = function(e) {
  1213	  if (e) e.stopPropagation();
  1214	  clearTimeout(storyTimer);
  1215	  
  1216	  const group = groupedStories[currentStoryUserIndex];
  1217	  if (currentStoryIndex + 1 < group.stories.length) {
  1218	    // Next story in current user's list
  1219	    openStoryViewer(currentStoryUserIndex, currentStoryIndex + 1);
  1220	  } else if (currentStoryUserIndex + 1 < groupedStories.length) {
  1221	    // Next user's first story
  1222	    openStoryViewer(currentStoryUserIndex + 1, 0);
  1223	  } else {
  1224	    // No more stories, close
  1225	    closeStoryViewer();
  1226	  }
  1227	}
  1228	
  1229	window.prevStory = function(e) {
  1230	  if (e) e.stopPropagation();
  1231	  clearTimeout(storyTimer);
  1232	  if (currentStoryIndex > 0) {
  1233	    openStoryViewer(currentStoryUserIndex, currentStoryIndex - 1);
  1234	  } else if (currentStoryUserIndex > 0) {
  1235	    const prevGroup = groupedStories[currentStoryUserIndex - 1];
  1236	    openStoryViewer(currentStoryUserIndex - 1, prevGroup.stories.length - 1);
  1237	  }
  1238	}
  1239	
  1240	window.closeStoryViewer = function() {
  1241	  clearTimeout(storyTimer);
  1242	  const container = document.getElementById('story-viewer-container');
  1243	  if (container) container.remove();
  1244	  if (window._storyBlurH) window.removeEventListener('blur', window._storyBlurH);
  1245	  if (window._storyFocusH) window.removeEventListener('focus', window._storyFocusH);
  1246	  if (window._storyVisH) document.removeEventListener('visibilitychange', window._storyVisH);
  1247	  fetchStories(); // Refresh to update viewed status
  1248	  if (typeof window.refreshSidebarStoryIndicators === 'function') window.refreshSidebarStoryIndicators();
  1249	}
  1250	
  1251	window.deleteStory = async function(storyId) {
  1252	  try {
  1253	    const token = sessionStorage.getItem('token');
  1254	    const res = await fetch(`/api/stories/${storyId}`, {
  1255	      method: 'DELETE',
  1256	      headers: {
  1257	        'Authorization': `Bearer ${token}`,
  1258	        'X-Chat-Token': token
  1259	      }
  1260	    });
  1261	    if (res.ok) {
  1262	      closeStoryViewer();
  1263	      fetchStories();
  1264	    } else {
  1265	      let msg = 'تعذر الحذف';
  1266	      try { msg = (await res.json()).error || msg; } catch (e) {}
  1267	      if (window.showClassicAlert) window.showClassicAlert(msg);
  1268	    }
  1269	  } catch (err) {
  1270	    console.error(err);
  1271	  }
  1272	};
  1273	
  1274	window.toggleStoryBan = async function(userId) {
  1275	  const token = sessionStorage.getItem('token');
  1276	  // discover current ban state from any story by this user
  1277	  const byUser = stories.find(s => sameId(s.userId, userId));
  1278	  let currentlyBanned = false;
  1279	  try {
  1280	    const bans = await (await fetch('/api/admin/stories/bans', { headers: { 'Authorization': `Bearer ${token}`, 'X-Chat-Token': token } })).json();
  1281	    currentlyBanned = !!(bans.banned || []).some(id => sameId(id, userId));
  1282	  } catch (e) {}
  1283	  const action = currentlyBanned ? 'إلغاء منع النشر' : 'منع المستخدم من نشر الستوريات';
  1284	  if (!window.confirm('تأكيد: ' + action + '؟')) return;
  1285	  const res = await fetch('/api/admin/stories/ban', {
  1286	    method: 'POST',
  1287	    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Chat-Token': token },
  1288	    body: JSON.stringify({ userId, banned: !currentlyBanned })
  1289	  });
  1290	  if (res.ok) {
  1291	    const data = await res.json();
  1292	    if (window.showClassicAlert) window.showClassicAlert(data.banned ? 'تم منع المستخدم من نشر الستوريات' : 'تم إلغاء المنع');
  1293	    else alert(data.banned ? 'تم المنع' : 'تم إلغاء المنع');
  1294	    fetchStories();
  1295	  } else {
  1296	    let msg = 'المنع فشل';
  1297	    try { msg = (await res.json()).error || msg; } catch (e) {}
  1298	    if (window.showClassicAlert) window.showClassicAlert(msg); else alert(msg);
  1299	  }
  1300	};
  1301	
  1302	let isLikingStory = false;
  1303	window.likeStory = async function(storyId, event) {
  1304	  if (event) {
  1305	    event.preventDefault();
  1306	    event.stopPropagation();
  1307	  }
  1308	
  1309	  if (isLikingStory) return;
  1310	
  1311	  const currentUser = window.state?.currentUser;
  1312	  if (!currentUser) return;
  1313	
  1314	  const currentUserId = String(currentUser.id || currentUser.userId);
  1315	  
  1316	  // Find the story in local state
  1317	  const story = stories.find(s => sameId(s.id, storyId));
  1318	  if (!story) return;
  1319	
  1320	  // Optimistic UI: Update local state immediately.
  1321	  // For non-owners the likes array is private — track via likedByMe.
  1322	  const wasLiked = story.likedByMe != null ? !!story.likedByMe : (story.likes || []).some(l => sameId(l.userId, currentUserId));
  1323	  story.likedByMe = !wasLiked;
  1324	  if (story.likes) {
  1325	    const existingLikeIndex = story.likes.findIndex(l => sameId(l.userId, currentUserId));
  1326	    if (story.likedByMe) {
  1327	      if (existingLikeIndex === -1) story.likes.push({ userId: currentUserId, user: currentUser, username: currentUser.username, pic: currentUser.pic || 'pic.png' });
  1328	    } else if (existingLikeIndex !== -1) {
  1329	      story.likes.splice(existingLikeIndex, 1);
  1330	    }
  1331	  }
  1332	
  1333	  // Update groupedStories as well (it references the same story objects, but let's be sure)
  1334	  // Since groupedStories is derived from stories array, updating stories objects usually reflects there 
  1335	  // but if it was deep cloned we'd need to find it there too. 
  1336	  // In the current renderStoriesBar, it creates new arrays but same objects.
  1337	
  1338	  // Refresh the viewer UI immediately
  1339	  window.renderStoryViewer(true);
  1340	  
  1341	  isLikingStory = true;
  1342	  try {
  1343	    const token = sessionStorage.getItem('token');
  1344	    const res = await fetch(`/api/stories/${storyId}/like`, {
  1345	      method: 'POST',
  1346	      headers: { 
  1347	        'Authorization': `Bearer ${token}`,
  1348	        'X-Chat-Token': token
  1349	      }
  1350	    });
  1351	
  1352	    const data = await res.json().catch(() => ({}));
  1353	
  1354	    if (!res.ok) {
  1355	      // Revert state on failure
  1356	      story.likedByMe = wasLiked;
  1357	      window.renderStoryViewer(true);
  1358	      
  1359	      console.error('Failed to like story:', data);
  1360	      if (window.showClassicAlert) {
  1361	        window.showClassicAlert(data.message || 'تعذر تسجيل اللايك');
  1362	      } else {
  1363	        alert(data.message || 'تعذر تسجيل اللايك');
  1364	      }
  1365	    } else {
  1366	        // Success: optionally update with server data if needed, but local is usually enough
  1367	        story.likedByMe = !!data.liked;
  1368	        window.renderStoryViewer(true);
  1369	    }
  1370	  } catch (err) {
  1371	    // Revert state on network error
  1372	    story.likedByMe = wasLiked;
  1373	    window.renderStoryViewer(true);
  1374	    console.error('Error liking story:', err);
  1375	  } finally {
  1376	    isLikingStory = false;
  1377	  }
  1378	}
  1379	
  1380	// Initialize
  1381	document.addEventListener('DOMContentLoaded', () => {
  1382	  // Wait a bit for token to be available
  1383	  setTimeout(fetchStories, 1000);
  1384	});
  1385	
  1386	// Listen for socket events if socket is available
  1387	if (window.socket) {
  1388	  window.socket.on('new-story', (story) => {
  1389	    fetchStories();
  1390	  });
  1391	  window.socket.on('stories_cleared', () => {
  1392	    stories = [];
  1393	    groupedStories = [];
  1394	    if (typeof window.closeStoryViewer === 'function') window.closeStoryViewer();
  1395	    if (typeof window.renderStoriesBar === 'function') window.renderStoriesBar('wall-stories-container');
  1396	  });
  1397	  window.socket.on('stories:updated', () => {
  1398	    fetchStories();
  1399	  });
  1400	  // Lightweight targeted updates (no full refetch)
  1401	  function currentViewedStoryId() {
  1402	    const group = groupedStories[currentStoryUserIndex];
  1403	    if (!group) return null;
  1404	    const s = group.stories[currentStoryIndex];
  1405	    return s ? String(s.id) : null;
  1406	  }
  1407	  window.socket.on('story:like', (data) => {
  1408	    const story = stories.find(s => String(s.id) === String(data.storyId));
  1409	    if (!story) { fetchStories(); return; }
  1410	    const me = window.state?.currentUser;
  1411	    const meId = me ? String(me.id || me.userId) : null;
  1412	    if (meId && data.liked === true && meId === String(data.byUserId)) {
  1413	      story.likedByMe = true;
  1414	    } else if (meId && data.liked === false && meId === String(data.byUserId)) {
  1415	      story.likedByMe = false;
  1416	    }
  1417	    // Owner: keep the local likes list/count in sync
  1418	    if (meId && String(story.userId) === meId && data.like) {
  1419	      if (!story.likes) story.likes = [];
  1420	      const idx = story.likes.findIndex(l => String(l.userId) === String(data.like.userId));
  1421	      if (data.liked && idx === -1) {
  1422	        story.likes.unshift(data.like);
  1423	      } else if (!data.liked && idx !== -1) {
  1424	        story.likes.splice(idx, 1);
  1425	      }
  1426	      story.likesCount = story.likes.length;
  1427	    }
  1428	    const isViewerOpen = document.getElementById('story-viewer-container');
  1429	    const isOwnerViewing = meId != null && String(story.userId) === meId;
  1430	    if (isViewerOpen && currentViewedStoryId() === String(story.id)) {
  1431	      window.renderStoryViewer(true);
  1432	      const ownersModal = document.getElementById('story-interactions-modal');
  1433	      if (ownersModal && ownersModal.classList.contains('show') && isOwnerViewing) {
  1434	        window.showStoryInteractions('likes');
  1435	      }
  1436	    }
  1437	    renderStoriesBar('wall-stories-container');
  1438	  });
  1439	  window.socket.on('story:view', (data) => {
  1440	    const story = stories.find(s => String(s.id) === String(data.storyId));
  1441	    if (!story) { fetchStories(); return; }
  1442	    const me = window.state?.currentUser;
  1443	    const meId = me ? String(me.id || me.userId) : null;
  1444	    // Only the owner receives view entries into their private list
  1445	    if (meId && String(story.userId) === meId && data.view) {
  1446	      if (!story.views) story.views = [];
  1447	      if (!story.views.some(v => String(v.userId) === String(data.view.userId))) {
  1448	        story.views.unshift(data.view);
  1449	      }
  1450	      story.viewsCount = story.views.length;
  1451	    }
  1452	    const isViewerOpen = document.getElementById('story-viewer-container');
  1453	    const isOwnerViewer = meId != null && String(story.userId) === meId;
  1454	    if (isViewerOpen && currentViewedStoryId() === String(story.id)) {
  1455	      window.renderStoryViewer(true);
  1456	      const intModal = document.getElementById('story-interactions-modal');
  1457	      if (intModal && intModal.classList.contains('show') && isOwnerViewer) {
  1458	        window.showStoryInteractions('views');
  1459	      }
  1460	    }
  1461	    renderStoriesBar('wall-stories-container');
  1462	  });
  1463	  window.socket.on('story:comment', (data) => {
  1464	    const story = stories.find(s => String(s.id) === String(data.storyId));
  1465	    if (!story) { fetchStories(); return; }
  1466	    if (!story.comments) story.comments = [];
  1467	    story.comments.push(data.comment);
  1468	    renderStoriesBar('wall-stories-container');
  1469	  });
  1470	  window.socket.on('story:delete', (data) => {
  1471	    const before = stories.length;
  1472	    stories = stories.filter(s => String(s.id) !== String(data.storyId));
  1473	    if (stories.length !== before) {
  1474	      groupedStories = [];
  1475	      if (typeof window.closeStoryViewer === 'function') window.closeStoryViewer();
  1476	      if (typeof window.renderStoriesBar === 'function') window.renderStoriesBar('wall-stories-container');
  1477	      if (typeof window.refreshSidebarStoryIndicators === 'function') window.refreshSidebarStoryIndicators();
  1478	    }
  1479	  });
  1480	}
  1481	