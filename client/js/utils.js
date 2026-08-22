     1	var _fetch = window.apiFetch || window.fetch;
     2	
     3	async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
     4	  try {
     5	    const res = await _fetch(url, options);
     6	    return res;
     7	  } catch (err) {
     8	    if (retries > 0) {
     9	      console.warn(`Fetch failed for ${url}, retrying in ${backoff}ms... (${retries} retries left)`);
    10	      await new Promise(resolve => setTimeout(resolve, backoff));
    11	      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    12	    }
    13	    throw err;
    14	  }
    15	}
    16	
    17	window.fetchWithRetry = fetchWithRetry;
    18	
    19	function escapeHTML(str) {
    20	  if (!str) return '';
    21	  return str.toString()
    22	    .replace(/&/g, '&amp;')
    23	    .replace(/</g, '&lt;')
    24	    .replace(/>/g, '&gt;')
    25	    .replace(/"/g, '&quot;')
    26	    .replace(/'/g, '&#039;');
    27	}
    28	
    29	window.escapeHTML = escapeHTML;
    30	window.escapeHtml = escapeHTML;
    31	
    32	/**
    33	 * Robust fetch with authentication header and error handling
    34	 */
    35	async function safeFetch(url, options = {}) {
    36	  const token = sessionStorage.getItem('token');
    37	  const headers = {
    38	    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    39	    ...options.headers
    40	  };
    41	  
    42	  // Only set default Content-Type if not already specified and body is NOT FormData
    43	  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    44	    headers['Content-Type'] = 'application/json';
    45	  }
    46	  
    47	  const res = await _fetch(url, { ...options, headers });
    48	  
    49	  if (res.status === 401) {
    50	    const hasToken = !!sessionStorage.getItem('token');
    51	    sessionStorage.removeItem('token');
    52	    if (window.location.pathname.startsWith('/cp') || window.location.pathname.startsWith('/admin')) {
    53	      Swal.fire({
    54	        title: 'انتهت الجلسة',
    55	        text: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد',
    56	        icon: 'error',
    57	        confirmButtonText: 'حسناً'
    58	      }).then(() => {
    59	        window.location.href = '/';
    60	      });
    61	    } else {
    62	      if (hasToken) {
    63	        window.location.reload();
    64	      }
    65	    }
    66	    throw new Error('Session expired');
    67	  }
    68	
    69	  if (res.ok) {
    70	    return res;
    71	  }
    72	  
    73	  // Handle error
    74	  const contentType = res.headers.get('content-type');
    75	  let errorMessage = 'تعذر إتمام العملية، يرجى التحقق من الجلسة والصلاحيات';
    76	  let responseText = '';
    77	  
    78	  try {
    79	    responseText = await res.text();
    80	  } catch (e) {
    81	    console.error('Failed to read response body text:', e);
    82	  }
    83	
    84	  if (contentType && contentType.includes('application/json') && responseText) {
    85	    try {
    86	      const errorData = JSON.parse(responseText);
    87	      errorMessage = errorData.message || errorMessage;
    88	      
    89	      // Auto-detect likes limit error and show unified alert
    90	      if (errorMessage && (errorMessage.includes('لايك') || errorMessage.includes('requiredLikes'))) {
    91	        if (window.showLikesLimitAlert) {
    92	          window.showLikesLimitAlert(errorMessage);
    93	          // We still throw to let the caller handle it if needed
    94	        }
    95	      }
    96	    } catch (e) {
    97	      console.error('Failed to parse error response as JSON:', e, responseText);
    98	      // Fallback to text cleanup if it's actually an HTML error page
    99	      if (responseText.includes('<html') || responseText.includes('<body')) {
   100	        const doc = new DOMParser().parseFromString(responseText, 'text/html');
   101	        const textContent = doc.body?.textContent?.trim() || doc.head?.textContent?.trim() || responseText;
   102	        const cleanText = textContent.replace(/\s+/g, ' ').trim();
   103	        if (cleanText && cleanText.length < 300) {
   104	          errorMessage = cleanText;
   105	        } else {
   106	          errorMessage = 'حدث خطأ في السيرفر أثناء معالجة الطلب';
   107	        }
   108	      } else {
   109	        errorMessage = 'حدث خطأ أثناء الاتصال بالسيرفر';
   110	      }
   111	    }
   112	  } else {
   113	    console.error('Non-JSON error response:', responseText);
   114	    if (responseText && (responseText.includes('<html') || responseText.includes('<body'))) {
   115	      try {
   116	        const doc = new DOMParser().parseFromString(responseText, 'text/html');
   117	        const textContent = doc.body?.textContent?.trim() || doc.head?.textContent?.trim() || responseText;
   118	        const cleanText = textContent.replace(/\s+/g, ' ').trim();
   119	        if (cleanText && cleanText.length < 300) {
   120	          errorMessage = cleanText;
   121	        } else {
   122	          errorMessage = 'حدث خطأ في السيرفر أثناء معالجة الطلب';
   123	        }
   124	      } catch (e) {
   125	        errorMessage = 'حدث خطأ أثناء الاتصال بالسيرفر';
   126	      }
   127	    } else if (responseText) {
   128	      errorMessage = responseText;
   129	    } else {
   130	      errorMessage = 'حدث خطأ أثناء الاتصال بالسيرفر';
   131	    }
   132	  }
   133	  
   134	  throw new Error(errorMessage);
   135	}
   136	window.safeFetch = safeFetch;
   137	
   138	function secureCreateElement(tagName, attributes = {}, textContent = null) {
   139	  const el = document.createElement(tagName);
   140	  for (const [key, value] of Object.entries(attributes)) {
   141	    el.setAttribute(key, value);
   142	  }
   143	  if (textContent) {
   144	    el.textContent = textContent;
   145	  }
   146	  return el;
   147	}
   148	window.secureCreateElement = secureCreateElement;
   149	
   150	/**
   151	 * Phase 6: Safe Linkification helper.
   152	 * Categorizes and neutralizes links based on safety classification.
   153	 */
   154	function safeLinkify(text) {
   155	  if (!text) return '';
   156	  
   157	  let processed = text;
   158	
   159	  // 1. Identify suspicious patterns already neutralized by the server (example [dot] com)
   160	  // We wrap them in a span that looks different and isn't clickable
   161	  processed = processed.replace(/([^\s]+)\s+\[dot\]\s+([^\s]+)/gi, (match) => {
   162	    return `<span class="text-muted fw-bold link-neutralized" title="رابط تم تحييده أمنياً">[رابط مشبوه: ${match}]</span>`;
   163	  });
   164	
   165	  // 2. Identify remaining raw URLs
   166	  const urlRegex = /(https?:\/\/[^\s]+)/g;
   167	  processed = processed.replace(urlRegex, (url) => {
   168	    // Basic safety check for characters that indicate obfuscation
   169	    if (url.includes('[dot]') || url.includes('@') || url.includes('%2e') || url.includes('%2f')) {
   170	      return `<span class="text-danger fw-bold link-blocked" title="حماية أمنية">[رابط مشبوه أو محجوب]</span>`;
   171	    }
   172	
   173	    // Wrap in a secure redirector
   174	    const encodedUrl = encodeURIComponent(url);
   175	    return `<a href="/api/redirect?url=${encodedUrl}" target="_blank" rel="noopener noreferrer" class="safe-link text-decoration-none border-bottom border-primary" title="رابط خارجي مآمن"><i class="fas fa-external-link-alt fa-xs me-1"></i>${url}</a>`;
   176	  });
   177	
   178	  return processed;
   179	}
   180	window.safeLinkify = safeLinkify;
   181	
   182	window.showClassicAlert = function(text, icon = 'info') {
   183	  let title = 'تنبيه';
   184	  if (icon === 'success') title = 'نجاح';
   185	  if (icon === 'error') title = 'عذراً';
   186	  if (icon === 'warning') title = 'عذراً';
   187	  
   188	  if (window.Swal && window.Swal.fire) {
   189	    window.Swal.fire(title, text, icon);
   190	  } else {
   191	    alert(text);
   192	  }
   193	};
   194	
   195	window.superIconWideCache = window.superIconWideCache || {};
   196	
   197	window.renderUserIdentity = function(user, options = {}) {
   198	    if (!user) return '';
   199	
   200	    const superIcon = user.superIcon || '';
   201	    const gifts = user.gifts || [];
   202	    const topic = user.topic || '';
   203	    const username = user.username || 'مستخدم';
   204	    // Defense-in-depth: these values end up inside inline style="..." so strip
   205	    // anything that could break out of the attribute (quotes, angle brackets,
   206	    // backticks, semicolons, backslashes).
   207	    const safeCssValue = (v) => String(v || '').replace(/["'<>`;\\]/g, '');
   208	    const ucol = safeCssValue(user.ucol || '');
   209	    const bg = safeCssValue(user.bg || '');
   210	    const userId = user.id || user.userId || '';
   211	
   212	    const nameStyle = options.nameStyle || (ucol ? `color: ${ucol};` : '');
   213	    const nameClasses = options.nameClasses || '';
   214	    let containerClasses = options.containerClasses || '';
   215	    
   216	    // Clean up any old state classes that might have been passed in
   217	    containerClasses = containerClasses
   218	        .replace(/\buser-identity-super-(wide|normal)\b/g, '')
   219	        .trim();
   220	
   221	    const containerStyle = options.containerStyle || '';
   222	    const tag = options.tag || 'span';
   223	    const href = options.href ? `href="${escapeHTML(options.href)}"` : 'href="#"';
   224	    const linkOnClick = options.onClick ? `onclick="event.preventDefault(); ${escapeHTML(options.onClick)}"` : 'onclick="event.preventDefault();"';
   225	    const spanOnClick = options.onClick ? `onclick="${escapeHTML(options.onClick)}"` : '';
   226	    
   227	    let bgStyle = '';
   228	    if (bg && bg !== 'transparent') {
   229	        if (bg.startsWith('http') || bg.startsWith('/')) {
   230	            bgStyle = `background: url('${bg}') center/cover;`;
   231	        } else {
   232	            bgStyle = `background: ${bg};`;
   233	        }
   234	        bgStyle += ' padding: 0 4px; border-radius: 2px; display: inline-block;';
   235	    }
   236	
   237	    const isWideCached = superIcon ? window.superIconWideCache[escapeHTML(superIcon)] : false;
   238	    const wideClass = isWideCached === true ? 'user-identity-super-wide' : (isWideCached === false && superIcon ? 'user-identity-super-normal' : '');
   239	
   240	    const displayName = escapeHTML(topic || username);
   241	    const escapedUsername = escapeHTML(username);
   242	    
   243	    // We need to differentiate name/decoration if it is wide
   244	    let nameHtml = '';
   245	    if (tag === 'a') {
   246	      nameHtml = `<a ${href} ${linkOnClick} class="user-identity-name ${nameClasses}" style="${nameStyle} ${bgStyle}" data-username="${escapedUsername}" data-is-hidden="${user.isHidden ? 'true' : 'false'}" data-role-rank="${user.roleRank || 0}">${displayName}</a>`;
   247	    } else {
   248	      nameHtml = `<span class="user-identity-name ${nameClasses}" style="${nameStyle} ${bgStyle}" data-username="${escapedUsername}" ${spanOnClick} data-is-hidden="${user.isHidden ? 'true' : 'false'}" data-role-rank="${user.roleRank || 0}">${displayName}</span>`;
   249	    }
   250	
   251	    let html = `<span class="user-identity ${containerClasses} ${wideClass}" style="${containerStyle}" data-username="${escapedUsername}" data-user-id="${userId}" data-is-hidden="${user.isHidden ? 'true' : 'false'}" data-role-rank="${user.roleRank || 0}">`;
   252	
   253	    // Always output nameHtml first
   254	    html += nameHtml;
   255	
   256	    // Output speaker muted icon if applicable (always, not only in messages)
   257	    if (user.isSpeakerMuted === true || user.isSpeakerMuted === 'true') {
   258	        html += `<span class="user-identity-speaker-muted" title="كاتم صوت المايكات"><i class="fas fa-volume-mute"></i></span>`;
   259	    }
   260	
   261	    // Always output gifts if applicable
   262	    if (gifts && gifts.length > 0 && typeof gifts === 'object') {
   263	        html += `<img src="${escapeHTML(gifts[0])}" class="user-identity-gifts" alt="Gift">`;
   264	    }
   265	
   266	    // If superIcon exists, append it next to the name/decoration
   267	    if (superIcon) {
   268	        const iconUrl = escapeHTML(superIcon);
   269	        html += `<img src="${iconUrl}" class="user-identity-super" onload="window.handleUserIdentitySuperLoad(this, '${iconUrl}')" onerror="this.style.display='none'" alt="SuperIcon">`;
   270	    }
   271	
   272	    html += `</span>`;
   273	    return html;
   274	};
   275	
   276	window.handleUserIdentitySuperLoad = function(img, url) {
   277	    if (!img) return;
   278	
   279	    const parent = img.closest('.user-identity');
   280	    if (!parent) return;
   281	
   282	    const SUPER_BANNER_MIN_WIDTH = 120;
   283	    const SUPER_BANNER_MIN_ASPECT_RATIO = 1.8;
   284	
   285	    const naturalWidth = Number(img.naturalWidth || 0);
   286	    const naturalHeight = Number(img.naturalHeight || 0);
   287	
   288	    const isWideBanner =
   289	        naturalWidth >= SUPER_BANNER_MIN_WIDTH &&
   290	        naturalHeight > 0 &&
   291	        (naturalWidth / naturalHeight) >= SUPER_BANNER_MIN_ASPECT_RATIO;
   292	
   293	    if (isWideBanner) {
   294	        if (url && window.superIconWideCache) {
   295	            window.superIconWideCache[url] = true;
   296	        }
   297	
   298	        parent.classList.remove('user-identity-super-normal');
   299	        parent.classList.add('user-identity-super-wide');
   300	    } else {
   301	        if (url && window.superIconWideCache) {
   302	            window.superIconWideCache[url] = false;
   303	        }
   304	
   305	        parent.classList.remove('user-identity-super-wide');
   306	        parent.classList.add('user-identity-super-normal');
   307	    }
   308	};
   309	
   310	window.updateSpeakerMutedIcon = function(userId, username, isMuted) {
   311	  const selectors = [];
   312	
   313	  if (userId) {
   314	    selectors.push(`#messages-container .user-identity[data-user-id="${CSS.escape(String(userId))}"]`);
   315	  }
   316	
   317	  if (username) {
   318	    selectors.push(`#messages-container .user-identity[data-username="${CSS.escape(String(username))}"]`);
   319	  }
   320	
   321	  if (!selectors.length) return;
   322	
   323	  document.querySelectorAll(selectors.join(',')).forEach(el => {
   324	    let existing = el.querySelector('.user-identity-speaker-muted');
   325	    if (existing) existing.remove();
   326	
   327	    if (isMuted) {
   328	      const iconSpan = document.createElement('span');
   329	      iconSpan.className = 'user-identity-speaker-muted';
   330	      iconSpan.title = 'كاتم صوت المايكات';
   331	      iconSpan.innerHTML = '<i class="fas fa-volume-mute"></i>';
   332	
   333	      const nameEl = el.querySelector('.user-identity-name');
   334	      if (nameEl && nameEl.nextSibling) {
   335	        el.insertBefore(iconSpan, nameEl.nextSibling);
   336	      } else {
   337	        el.appendChild(iconSpan);
   338	      }
   339	    }
   340	  });
   341	};
   342	
   343	window.getThumbUrl = function(url) {
   344	  if (!url || typeof url !== 'string') return url;
   345	  const trimmed = url.trim();
   346	  if (trimmed.includes('/uploads/site/default.png') || trimmed.includes('default-avatar')) return trimmed;
   347	  if (trimmed.includes('_thumb.')) return trimmed;
   348	  if (!trimmed.includes('/uploads/')) return trimmed;
   349	  
   350	  const dotIdx = trimmed.lastIndexOf('.');
   351	  if (dotIdx > -1) {
   352	    return trimmed.substring(0, dotIdx) + '_thumb.webp';
   353	  }
   354	  return trimmed;
   355	};
   356	
   357	window.getAvatarUrl = function(user, useThumb = false) {
   358	  let pic = user;
   359	  if (user && typeof user === 'object') {
   360	    pic = user.pic !== undefined ? user.pic : (user.avatar !== undefined ? user.avatar : user.senderAvatar);
   361	  }
   362	
   363	  if (pic !== null && pic !== undefined) {
   364	    if (typeof pic === 'string') {
   365	      const trimmed = pic.trim();
   366	      const lower = trimmed.toLowerCase();
   367	      const isInvalid = !trimmed ||
   368	        lower === 'null' ||
   369	        lower === 'undefined' ||
   370	        lower === 'none' ||
   371	        lower.includes('placehold.co') ||
   372	        lower.includes('flaticon.com') ||
   373	        lower === '/default-avatar.png' ||
   374	        lower === '/img/default-avatar.png' ||
   375	        lower === '/images/default-avatar.png' ||
   376	        lower === '/uploads/site/default.png';
   377	
   378	      if (!isInvalid) {
   379	        if (useThumb && typeof window.getThumbUrl === 'function') {
   380	          return window.getThumbUrl(trimmed);
   381	        }
   382	        return trimmed;
   383	      }
   384	    }
   385	  }
   386	
   387	  var showDefault = window.showDefaultAvatar;
   388	  if (showDefault === undefined && window.domainConfig) {
   389	    showDefault = window.domainConfig.showDefaultAvatar;
   390	  }
   391	
   392	  if (showDefault !== false && showDefault !== 'false') {
   393	    var customDefault = window.defaultAvatarUrl;
   394	    if (!customDefault && window.domainConfig && window.domainConfig.defaultAvatarUrl) {
   395	      customDefault = window.domainConfig.defaultAvatarUrl;
   396	    }
   397	    if (customDefault && typeof customDefault === 'string' && customDefault.trim() !== '') {
   398	      var trimmedDefault = customDefault.trim();
   399	      var lowerDefault = trimmedDefault.toLowerCase();
   400	      if (lowerDefault !== 'null' && lowerDefault !== 'undefined' && lowerDefault !== 'none') {
   401	        return trimmedDefault;
   402	      }
   403	    }
   404	  }
   405	
   406	  return '/uploads/site/default.png';
   407	};
   408	
   409	window.handleAvatarError = function(imgEl) {
   410	  if (!imgEl) return;
   411	
   412	  if (imgEl.src && imgEl.src.includes('_thumb.')) {
   413	    var origSrc = imgEl.dataset.originalSrc || imgEl.src.replace('_thumb.webp', '.webp').replace('_thumb.', '.');
   414	    delete imgEl.dataset.originalSrc;
   415	    if (origSrc && origSrc !== imgEl.src) {
   416	      imgEl.src = origSrc;
   417	      return;
   418	    }
   419	  }
   420	
   421	  var currentStage = imgEl.dataset.avatarFallbackStage || 'none';
   422	  var localFallback = '/uploads/site/default.png';
   423	
   424	  if (currentStage === 'none') {
   425	    imgEl.dataset.avatarFallbackStage = 'customDefault';
   426	
   427	    var showDefault = window.showDefaultAvatar;
   428	    if (showDefault === undefined && window.domainConfig) {
   429	      showDefault = window.domainConfig.showDefaultAvatar;
   430	    }
   431	
   432	    var customDefault = window.defaultAvatarUrl;
   433	    if (!customDefault && window.domainConfig && window.domainConfig.defaultAvatarUrl) {
   434	      customDefault = window.domainConfig.defaultAvatarUrl;
   435	    }
   436	
   437	    if (showDefault !== false && showDefault !== 'false' && customDefault && typeof customDefault === 'string' && customDefault.trim() !== '') {
   438	      var targetUrl = customDefault.trim();
   439	      if (!imgEl.src.endsWith(targetUrl) && imgEl.src !== targetUrl) {
   440	        imgEl.src = targetUrl;
   441	        return;
   442	      }
   443	    }
   444	  }
   445	
   446	  if (currentStage !== 'localFallback') {
   447	    imgEl.dataset.avatarFallbackStage = 'localFallback';
   448	    if (!imgEl.src.endsWith(localFallback) && imgEl.src !== localFallback) {
   449	      imgEl.src = localFallback;
   450	      return;
   451	    }
   452	  }
   453	
   454	  imgEl.onerror = null;
   455	};
   456	
   457	window.getFrameUrl = function(url, useSmall = true) {
   458	  if (!url || typeof url !== 'string') return url;
   459	  const trimmed = url.trim();
   460	  if (trimmed.includes('_small.')) return trimmed;
   461	  if (!trimmed.includes('/uploads/')) return trimmed;
   462	  if (useSmall && trimmed.endsWith('.webp')) {
   463	    return trimmed.replace(/\.webp$/, '_small.webp');
   464	  }
   465	  return trimmed;
   466	};
   467	
   468	window.handleFrameError = function(imgEl) {
   469	  if (!imgEl) return;
   470	  if (imgEl.src && imgEl.src.includes('_small.webp')) {
   471	    const origSrc = imgEl.dataset.originalFrame || imgEl.src.replace('_small.webp', '.webp');
   472	    delete imgEl.dataset.originalFrame;
   473	    imgEl.src = origSrc;
   474	  }
   475	};
   476	
   477	window.renderAvatar = function(user, sizeClass = '', extraStyles = '', imgStyles = '', useThumb = true) {
   478	  const fullAvatarUrl = window.getAvatarUrl(user, false);
   479	  const avatarUrl = useThumb ? window.getAvatarUrl(user, true) : fullAvatarUrl;
   480	  const fullFrameUrl = user && user.membershipFrame ? user.membershipFrame : null;
   481	  const frameUrl = (useThumb && fullFrameUrl) ? window.getFrameUrl(fullFrameUrl, true) : fullFrameUrl;
   482	  
   483	  if (frameUrl) {
   484	    return `
   485	      <div class="avatar-with-frame ${sizeClass}" style="position: relative; display: inline-flex; align-items: center; justify-content: center; overflow: visible; flex-shrink: 0; ${extraStyles}">
   486	        <img src="${avatarUrl}" data-original-src="${fullAvatarUrl}" class="avatar-img" loading="lazy" decoding="async" style="width: 78%; height: 78%; object-fit: cover; border-radius: 50%; z-index: 1; ${imgStyles}" onerror="window.handleAvatarError(this)">
   487	        <img src="${frameUrl}" data-original-frame="${fullFrameUrl || ''}" class="avatar-frame" loading="lazy" decoding="async" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; object-fit: cover; box-sizing: border-box;" onerror="window.handleFrameError(this)">
   488	      </div>
   489	    `;
   490	  } else {
   491	    const borderColor = user && user.ucol ? user.ucol : '#222';
   492	    return `
   493	      <div class="avatar-animated-wrapper ${sizeClass}" style="display: inline-flex; align-items: center; justify-content: center; position: relative; border: 2px dotted ${borderColor}; border-radius: 50%; box-sizing: border-box; flex-shrink: 0; animation: spin-border 8s linear infinite; ${extraStyles}">
   494	        <img src="${avatarUrl}" data-original-src="${fullAvatarUrl}" class="avatar-img-inner" loading="lazy" decoding="async" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block; animation: spin-border-reverse 8s linear infinite; ${imgStyles}" onerror="window.handleAvatarError(this)">
   495	      </div>
   496	    `;
   497	  }
   498	};
   499	
   500	window.normalizeAssetUrl = function(url) {
   501	  if (!url) return '';
   502	  try {
   503	    return new URL(url, window.location.origin).href;
   504	  } catch (e) {
   505	    return String(url);
   506	  }
   507	};
   508	
   509	window.syncNodes = function(oldNode, newNode) {
   510	  if (!oldNode || !newNode) return;
   511	  if (oldNode.nodeType !== newNode.nodeType) {
   512	    oldNode.replaceWith(newNode.cloneNode(true));
   513	    return;
   514	  }
   515	  if (oldNode.nodeType === Node.TEXT_NODE) {
   516	    if (oldNode.nodeValue !== newNode.nodeValue) {
   517	      oldNode.nodeValue = newNode.nodeValue;
   518	    }
   519	    return;
   520	  }
   521	  if (oldNode.nodeType === Node.ELEMENT_NODE) {
   522	    if (oldNode.tagName !== newNode.tagName) {
   523	      oldNode.replaceWith(newNode.cloneNode(true));
   524	      return;
   525	    }
   526	
   527	    // Sync attributes
   528	    const oldAttrs = oldNode.attributes;
   529	    const newAttrs = newNode.attributes;
   530	    
   531	    // Add/Update new attributes
   532	    for (let i = 0; i < newAttrs.length; i++) {
   533	      const attr = newAttrs[i];
   534	      if (attr.name === 'src' || attr.name === 'background-image' || attr.name === 'href') {
   535	        const oldVal = window.normalizeAssetUrl(oldNode.getAttribute(attr.name));
   536	        const newVal = window.normalizeAssetUrl(attr.value);
   537	        if (oldVal !== newVal) {
   538	          oldNode.setAttribute(attr.name, attr.value);
   539	        }
   540	      } else if (attr.name === 'style') {
   541	         // Special handling for style
   542	         if (oldNode.style.cssText !== newNode.style.cssText) {
   543	             oldNode.style.cssText = newNode.style.cssText;
   544	         }
   545	      } else {
   546	        if (oldNode.getAttribute(attr.name) !== attr.value) {
   547	          oldNode.setAttribute(attr.name, attr.value);
   548	        }
   549	      }
   550	    }
   551	    
   552	    // Remove old attributes that don't exist in new node
   553	    for (let i = oldAttrs.length - 1; i >= 0; i--) {
   554	      const attr = oldAttrs[i];
   555	      if (!newNode.hasAttribute(attr.name)) {
   556	        if (attr.name !== 'data-signature' && attr.name !== 'data-user-sig') {
   557	          oldNode.removeAttribute(attr.name);
   558	        }
   559	      }
   560	    }
   561	
   562	    // Sync children
   563	    const oldChildren = Array.from(oldNode.childNodes);
   564	    const newChildren = Array.from(newNode.childNodes);
   565	    const maxLen = Math.max(oldChildren.length, newChildren.length);
   566	    for (let i = 0; i < maxLen; i++) {
   567	      if (!oldChildren[i]) {
   568	        oldNode.appendChild(newChildren[i].cloneNode(true));
   569	      } else if (!newChildren[i]) {
   570	        oldNode.removeChild(oldChildren[i]);
   571	      } else {
   572	        window.syncNodes(oldChildren[i], newChildren[i]);
   573	      }
   574	    }
   575	  }
   576	};
   577	
   578	