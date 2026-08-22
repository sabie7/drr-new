     1	/**
     2	 * Battle Challenge / نظام تحدي الجولات داخل الغرف
     3	 * Client-Side Socket integration and responsive live visual controls
     4	 */
     5	
     6	(function () {
     7	  const PANEL_ID = 'battle-challenge-panel';
     8	  let activeBattleId = null;
     9	  let activePlayer1Id = null;
    10	  let activePlayer2Id = null;
    11	  let currentBattle = null;
    12	  let isBattleMinimized = false;
    13	
    14	  function toggleBattleMinimization(minimize) {
    15	    isBattleMinimized = !!minimize;
    16	    const panel = document.getElementById('battle-challenge-panel');
    17	    const indicator = document.getElementById('battle-minimized-indicator');
    18	    
    19	    if (minimize) {
    20	      if (panel) {
    21	        panel.classList.add('d-none');
    22	        panel.style.display = 'none';
    23	      }
    24	      if (indicator) {
    25	        indicator.classList.remove('d-none');
    26	        updateMinimizedIndicatorValues();
    27	      }
    28	    } else {
    29	      if (panel) {
    30	        panel.classList.remove('d-none');
    31	        panel.style.display = 'block';
    32	      }
    33	      if (indicator) {
    34	        indicator.classList.add('d-none');
    35	      }
    36	    }
    37	  }
    38	
    39	  function updateMinimizedIndicatorValues() {
    40	    const roundEl = document.getElementById('mini-bt-round');
    41	    const timerEl = document.getElementById('mini-bt-timer');
    42	    const p1ScoreEl = document.getElementById('mini-bt-p1-score');
    43	    const p2ScoreEl = document.getElementById('mini-bt-p2-score');
    44	
    45	    const mainRound = '1';
    46	    const mainTimer = document.getElementById('bt-timer-value')?.textContent || '60';
    47	    const mainP1Score = document.getElementById('bt-player1-score')?.textContent || '0';
    48	    const mainP2Score = document.getElementById('bt-player2-score')?.textContent || '0';
    49	
    50	    if (roundEl) roundEl.textContent = mainRound;
    51	    if (timerEl) timerEl.textContent = mainTimer;
    52	    if (p1ScoreEl) p1ScoreEl.textContent = mainP1Score;
    53	    if (p2ScoreEl) p2ScoreEl.textContent = mainP2Score;
    54	  }
    55	
    56	  function renderBattleIdentity(player, options = {}) {
    57	    if (!player) return 'عضو';
    58	    if (typeof window.renderUserIdentity === 'function') {
    59	      return window.renderUserIdentity(player, { tag: 'span', ...options });
    60	    }
    61	    return player.topic || player.username || player.name || 'عضو';
    62	  }
    63	
    64	  function getBattlePlainName(player) {
    65	    return player?.topic || player?.username || player?.name || 'عضو';
    66	  }
    67	
    68	  function getBattleAvatarUrl(player) {
    69	    if (typeof window.getAvatarUrl === 'function') {
    70	      return window.getAvatarUrl(player);
    71	    }
    72	
    73	    if (player && typeof player.pic === 'string' && player.pic.trim() !== '') {
    74	      return player.pic;
    75	    }
    76	
    77	    return window.defaultAvatarUrl || '/uploads/site/default.png';
    78	  }
    79	
    80	  function setBattleAvatar(imgId, player) {
    81	    const img = document.getElementById(imgId);
    82	    if (!img) return;
    83	
    84	    img.src = getBattleAvatarUrl(player);
    85	    img.setAttribute('referrerpolicy', 'origin-when-cross-origin');
    86	
    87	    img.onerror = function () {
    88	      window.handleAvatarError(this);
    89	    };
    90	  }
    91	
    92	  function getActiveRoundArabicWord(round) {
    93	    switch (Number(round)) {
    94	      case 1: return 'الأولى';
    95	      case 2: return 'الثانية';
    96	      case 3: return 'الثالثة';
    97	      case 4: return 'الرابعة';
    98	      case 5: return 'الخامسة';
    99	      default: return String(round);
   100	    }
   101	  }
   102	
   103	  function showRoundEndedAnnouncement(data) {
   104	    const parent = document.getElementById('messages-container')?.parentNode || document.body;
   105	    
   106	    // Remove any previous round result overlays
   107	    const oldAnnouncements = document.querySelectorAll('.bt-round-ended-announcement');
   108	    oldAnnouncements.forEach(el => el.remove());
   109	
   110	    const container = document.createElement('div');
   111	    container.className = 'bt-round-ended-announcement';
   112	    container.style.cssText = `
   113	      position: absolute;
   114	      top: 50%;
   115	      left: 50%;
   116	      transform: translate(-50%, -50%);
   117	      z-index: 10000;
   118	      background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
   119	      border: 2px solid rgba(255, 215, 0, 0.45);
   120	      border-radius: 16px;
   121	      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(234, 179, 8, 0.25);
   122	      padding: 24px;
   123	      width: 90%;
   124	      max-width: 380px;
   125	      color: #f8fafc;
   126	      font-family: 'Tajawal', sans-serif;
   127	      direction: rtl;
   128	      text-align: center;
   129	      transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
   130	      opacity: 0;
   131	      scale: 0.9;
   132	    `;
   133	
   134	    // Determine Winner and Loser info
   135	    const isTie = !data.roundWinnerId;
   136	    const winnerId = data.roundWinnerId;
   137	    
   138	    let winnerObj = null;
   139	    let winnerName = 'التعادل';
   140	    let winnerPic = window.defaultAvatarUrl || '/uploads/site/default.png';
   141	    let settlementMsg = '';
   142	
   143	    if (!isTie) {
   144	      if (currentBattle) {
   145	        winnerObj = Number(winnerId) === Number(activePlayer1Id) ? currentBattle.player1 : currentBattle.player2;
   146	      }
   147	      winnerName = data.roundWinnerName || (winnerObj ? getBattlePlainName(winnerObj) : 'البطل');
   148	      winnerPic = data.roundWinnerPic || getBattleAvatarUrl(winnerObj);
   149	    }
   150	
   151	    // Settlement Status/Summary
   152	    const settlement = data.coinSettlement || {};
   153	    if (settlement.status === 'paid_to_winner') {
   154	      settlementMsg = `🏆 تم تحويل <span style="color: #eab308; font-weight: 800;">${settlement.poolAmount} كوينز</span> (كامل ريع الجولة) لرصيد الفائز!`;
   155	    } else if (settlement.status === 'refunded') {
   156	      settlementMsg = `🤝 ا��تهت الجولة بالتعادل! تم إعادة <span style="color: #eab308; font-weight: 800;">${settlement.poolAmount} كوينز</span> للداعمين.`;
   157	    } else {
   158	      settlementMsg = `لم يتم إرسال هدايا دعم خلال هذه الجولة.`;
   159	    }
   160	
   161	    const roundArabic = getActiveRoundArabicWord(data.currentRound);
   162	    
   163	    let winnerSection = '';
   164	    if (isTie) {
   165	      winnerSection = `
   166	        <div style="margin: 15px 0;">
   167	          <div style="width: 72px; height: 72px; border-radius: 50%; border: 3px solid #94a3b8; background: #334155; display: flex; align-items: center; justify-content: center; font-size: 30px; margin: 0 auto 10px;">
   168	            🤝
   169	          </div>
   170	          <h4 style="font-size: 18px; font-weight: 800; color: #cbd5e1; margin: 0;">انتهت الجولة بالتعادل!</h4>
   171	        </div>
   172	      `;
   173	    } else {
   174	      const formattedWinner = winnerObj ? renderBattleIdentity(winnerObj) : `<span style="color: #eab308; font-weight: bold;">${winnerName}</span>`;
   175	      winnerSection = `
   176	        <div style="margin: 15px 0;">
   177	          <img src="${winnerPic}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid #eab308; box-shadow: 0 0 15px rgba(234, 179, 8, 0.4); object-fit: cover; margin-bottom: 10px;" onerror="this.src=window.defaultAvatarUrl">
   178	          <div style="font-size: 11px; color: #a1a1aa; margin-bottom: 4px;">الفائز بالجولة</div>
   179	          <h4 style="font-size: 16px; font-weight: 800; margin: 0; display: flex; align-items: center; justify-content: center; gap: 4px;">
   180	            ${formattedWinner}
   181	          </h4>
   182	        </div>
   183	      `;
   184	    }
   185	
   186	    container.innerHTML = `
   187	      <div style="font-size: 11px; font-weight: 700; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 15px;">
   188	        📢 نتيجة الجولة ${roundArabic}
   189	      </div>
   190	      
   191	      ${winnerSection}
   192	
   193	      <!-- Score Comparison -->
   194	      <div style="background: rgba(15, 23, 42, 0.6); border-radius: 10px; padding: 12px; margin: 15px 0; border: 1px solid rgba(255,255,255,0.05);">
   195	        <div style="display: flex; justify-content: space-around; align-items: center; margin-bottom: 6px;">
   196	          <div>
   197	            <div style="font-size: 10px; color: #94a3b8; margin-bottom: 2px;">نقاط الأول</div>
   198	            <div style="font-size: 18px; font-weight: 800; color: #3b82f6;">${data.player1Score}</div>
   199	          </div>
   200	          <div style="font-size: 12px; font-weight: 800; color: #64748b;">مقابل</div>
   201	          <div>
   202	            <div style="font-size: 10px; color: #94a3b8; margin-bottom: 2px;">نقاط الثاني</div>
   203	            <div style="font-size: 18px; font-weight: 800; color: #ec4899;">${data.player2Score}</div>
   204	          </div>
   205	        </div>
   206	        
   207	        <div style="font-size: 11px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px; color: #94a3b8; font-weight: 500;">
   208	          الجولات حتى الآن: 
   209	          <span style="color: #3b82f6; font-weight: bold;">${data.player1RoundsWon}</span>
   210	          -
   211	          <span style="color: #ec4899; font-weight: bold;">${data.player2RoundsWon}</span>
   212	        </div>
   213	      </div>
   214	
   215	      <!-- Coin Settlement Message -->
   216	      <div style="font-size: 11px; font-weight: 600; line-height: 1.5; color: #e2e8f0; background: rgba(234, 179, 8, 0.1); border-radius: 8px; padding: 10px; border: 1px solid rgba(234, 179, 8, 0.2);">
   217	        ${settlementMsg}
   218	      </div>
   219	    `;
   220	
   221	    parent.appendChild(container);
   222	
   223	    // Trigger transition
   224	    setTimeout(() => {
   225	      container.style.opacity = '1';
   226	      container.style.scale = '1';
   227	    }, 50);
   228	
   229	    // Auto fade out
   230	    setTimeout(() => {
   231	      container.style.opacity = '0';
   232	      container.style.scale = '0.9';
   233	      setTimeout(() => {
   234	        container.remove();
   235	      }, 500);
   236	    }, 3800);
   237	  }
   238	
   239	  function showBattleFinalResultOverlay(data) {
   240	    if (typeof confetti === 'function') {
   241	      confetti({
   242	        particleCount: 150,
   243	        spread: 80,
   244	        origin: { y: 0.6 }
   245	      });
   246	    }
   247	
   248	    const parent = document.body;
   249	    
   250	    const old = document.getElementById('battle-final-result-overlay');
   251	    if (old) old.remove();
   252	
   253	    const overlay = document.createElement('div');
   254	    overlay.id = 'battle-final-result-overlay';
   255	    overlay.style.cssText = `
   256	      position: fixed;
   257	      top: 0;
   258	      left: 0;
   259	      width: 100%;
   260	      height: 100%;
   261	      background: rgba(15, 23, 42, 0.85);
   262	      backdrop-filter: blur(8px);
   263	      -webkit-backdrop-filter: blur(8px);
   264	      z-index: 100000;
   265	      display: flex;
   266	      justify-content: center;
   267	      align-items: center;
   268	      direction: rtl;
   269	      font-family: 'Tajawal', sans-serif;
   270	      transition: opacity 0.5s ease-in-out;
   271	      opacity: 0;
   272	    `;
   273	
   274	    const p1 = currentBattle?.player1 || { id: activePlayer1Id, username: currentBattle?.player1Name };
   275	    const p2 = currentBattle?.player2 || { id: activePlayer2Id, username: currentBattle?.player2Name };
   276	
   277	    const p1Name = renderBattleIdentity(p1, { nameStyle: 'color: #ffffff !important;' });
   278	    const p2Name = renderBattleIdentity(p2, { nameStyle: 'color: #ffffff !important;' });
   279	
   280	    const p1Avatar = getBattleAvatarUrl(p1);
   281	    const p2Avatar = getBattleAvatarUrl(p2);
   282	
   283	    const winnerId = data.winnerId;
   284	    const isTie = !winnerId;
   285	
   286	    let titleText = '🏆 نهاية التحدي المثير!';
   287	    let winnerSectionHtml = '';
   288	
   289	    if (isTie) {
   290	      titleText = '🤝 انتهى التحدي بالتعادل!';
   291	      winnerSectionHtml = `
   292	        <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin: 20px 0;">
   293	          <div style="text-align: center;">
   294	            <img src="${p1Avatar}" style="width: 70px; height: 70px; border-radius: 50%; border: 3px solid #3b82f6; object-fit: cover; margin-bottom: 8px;">
   295	            <div>${p1Name}</div>
   296	          </div>
   297	          <div style="font-size: 28px; font-weight: bold; color: #cbd5e1;">VS</div>
   298	          <div style="text-align: center;">
   299	            <img src="${p2Avatar}" style="width: 70px; height: 70px; border-radius: 50%; border: 3px solid #ec4899; object-fit: cover; margin-bottom: 8px;">
   300	            <div>${p2Name}</div>
   301	          </div>
   302	        </div>
   303	        <h4 style="color: #facc15; font-weight: 800; font-size: 18px;">تعادل فخم بين العمالقة!</h4>
   304	      `;
   305	    } else {
   306	      const isP1Winner = Number(winnerId) === Number(activePlayer1Id);
   307	      const winnerName = isP1Winner ? p1Name : p2Name;
   308	      const winnerAvatar = isP1Winner ? p1Avatar : p2Avatar;
   309	      const winnerColor = isP1Winner ? '#3b82f6' : '#ec4899';
   310	      
   311	      titleText = '🏆 انتصار ساحق!';
   312	      winnerSectionHtml = `
   313	        <div style="text-align: center; margin: 20px 0; position: relative;">
   314	          <div style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%) rotate(-10deg); background: #eab308; color: #1e1b4b; font-weight: 800; font-size: 11px; padding: 4px 10px; border-radius: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
   315	            👑 الفائز بالتحدي
   316	          </div>
   317	          <img src="${winnerAvatar}" style="width: 100px; height: 100px; border-radius: 50%; border: 4px solid ${winnerColor}; box-shadow: 0 0 25px ${winnerColor}80; object-fit: cover; margin-bottom: 12px;" onerror="this.src=window.defaultAvatarUrl">
   318	          <h3 style="font-size: 18px; font-weight: 800; margin: 0;">${winnerName}</h3>
   319	        </div>
   320	      `;
   321	    }
   322	
   323	    let forfeitHtml = '';
   324	    if (data.forfeitReason) {
   325	      forfeitHtml = `
   326	        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 10px; padding: 12px; margin-bottom: 20px; color: #fca5a5; font-size: 12px; line-height: 1.5; font-weight: 600;">
   327	          ⚠️ ${data.forfeitReason}
   328	        </div>
   329	      `;
   330	    }
   331	
   332	    // Compiling coin settlement summary description
   333	    let coinsSettlementDesc = 'تم تسوية كوينز الجولات بنجاح لصالح المستحقين.';
   334	    if (data.coinSettlement) {
   335	      if (data.coinSettlement.status === 'paid_to_winner') {
   336	        coinsSettlementDesc = `تم تسوية <span style="color: #eab308; font-weight: bold;">${data.coinSettlement.poolAmount} كوينز</span> لصالح البطل.`;
   337	      } else if (data.coinSettlement.status === 'refunded') {
   338	        coinsSettlementDesc = `انتهت الجولة بالتعادل وتم استرجاع <span style="color: #eab308; font-weight: bold;">${data.coinSettlement.poolAmount} كوينز</span> للداعمين.`;
   339	      }
   340	    }
   341	
   342	    overlay.innerHTML = `
   343	      <div style="background: linear-gradient(180deg, #1e1b4b 0%, #0b0f19 100%); border: 3px solid rgba(255, 215, 0, 0.35); border-radius: 24px; width: 95%; max-width: 460px; padding: 28px; box-shadow: 0 30px 60px rgba(0, 0, 0, 0.8), 0 0 50px rgba(234, 179, 8, 0.15); color: #f8fafc; position: relative; text-align: center; transform: scale(0.9); transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
   344	        
   345	        <h2 style="font-size: 22px; font-weight: 900; color: #eab308; text-shadow: 0 0 10px rgba(234, 179, 8, 0.3); margin-top: 10px; margin-bottom: 5px;">${titleText}</h2>
   346	        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 15px;">نهاية جولات المتحدين الأقوياء</div>
   347	
   348	        ${forfeitHtml}
   349	
   350	        ${winnerSectionHtml}
   351	
   352	        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 16px; margin: 20px 0; text-align: right;">
   353	          
   354	          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 10px;">
   355	            <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">الجولات المكتسبة:</div>
   356	            <div style="font-size: 14px; font-weight: 800;">
   357	              <span style="color: #3b82f6;">${data.player1RoundsWon} جولات</span>
   358	              <span style="color: #64748b; margin: 0 8px;">مقابل</span>
   359	              <span style="color: #ec4899;">${data.player2RoundsWon} جولات</span>
   360	            </div>
   361	          </div>
   362	
   363	          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 10px;">
   364	            <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">إجمالي النقاط بالتحدي:</div>
   365	            <div style="font-size: 14px; font-weight: 800;">
   366	              <span style="color: #3b82f6;">${data.player1TotalScore} نقطة</span>
   367	              <span style="color: #64748b; margin: 0 8px;">مقابل</span>
   368	              <span style="color: #ec4899;">${data.player2TotalScore} نقطة</span>
   369	            </div>
   370	          </div>
   371	
   372	          <div style="display: flex; justify-content: space-between; align-items: center;">
   373	            <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">حالة تسوية الكوينز:</div>
   374	            <div style="font-size: 12px; font-weight: 700; color: #eab308; max-width: 65%; text-align: left; line-height: 1.4;">
   375	              ${coinsSettlementDesc}
   376	            </div>
   377	          </div>
   378	
   379	        </div>
   380	
   381	        <button type="button" id="battle-close-result-btn" style="background: linear-gradient(90deg, #eab308 0%, #ca8a04 100%); color: #1e1b4b; border: none; font-size: 14px; font-weight: 800; padding: 12px 32px; border-radius: 12px; cursor: pointer; width: 100%; box-shadow: 0 10px 20px rgba(234, 179, 8, 0.25); transition: all 0.2s ease;">
   382	          إغلاق النتيجة والعودة للشات
   383	        </button>
   384	
   385	      </div>
   386	    `;
   387	
   388	    parent.appendChild(overlay);
   389	
   390	    setTimeout(() => {
   391	      overlay.style.opacity = '1';
   392	      overlay.querySelector('div').style.transform = 'scale(1)';
   393	    }, 50);
   394	
   395	    let autoCloseTimer = setTimeout(() => {
   396	      closeOverlay();
   397	    }, 7000);
   398	
   399	    const closeOverlay = () => {
   400	      if (autoCloseTimer) {
   401	        clearTimeout(autoCloseTimer);
   402	        autoCloseTimer = null;
   403	      }
   404	      overlay.style.opacity = '0';
   405	      const dialog = overlay.querySelector('div');
   406	      if (dialog) dialog.style.transform = 'scale(0.9)';
   407	      setTimeout(() => {
   408	        if (overlay.parentNode) overlay.remove();
   409	        collapseBattleWidget();
   410	      }, 400);
   411	    };
   412	
   413	    const closeBtn = overlay.querySelector('#battle-close-result-btn');
   414	    if (closeBtn) {
   415	      closeBtn.onclick = closeOverlay;
   416	  
   417	    // Auto-close overlay after 10 seconds and clean up
   418	    setTimeout(() => {
   419	      if (overlay && overlay.parentNode) {
   420	        closeOverlay();
   421	      }
   422	    }, 10000);
   423	  }
   424	  }
   425	
   426	  const updateInteractiveTapButtons = () => {
   427	    const trigger1 = document.getElementById('bt-support-player1');
   428	    const trigger2 = document.getElementById('bt-support-player2');
   429	    if (!trigger1 || !trigger2 || !currentBattle) return;
   430	
   431	    const p1Plain = getBattlePlainName(currentBattle.player1);
   432	    const p2Plain = getBattlePlainName(currentBattle.player2);
   433	
   434	    const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);
   435	
   436	    trigger1.style.backgroundColor = '#2563eb';
   437	    trigger1.style.color = '#ffffff';
   438	    trigger1.style.border = 'none';
   439	    trigger1.style.opacity = '1';
   440	    trigger1.disabled = false;
   441	    trigger1.innerHTML = `👍 دعم ${p1Plain} <span class="badge" id="bt-p1-tap-badge" style="background: rgba(255,255,255,0.2); margin-right: 4px;">+1</span>`;
   442	
   443	    trigger2.style.backgroundColor = '#db2777';
   444	    trigger2.style.color = '#ffffff';
   445	    trigger2.style.border = 'none';
   446	    trigger2.style.opacity = '1';
   447	    trigger2.disabled = false;
   448	    trigger2.innerHTML = `👍 دعم ${p2Plain} <span class="badge" id="bt-p2-tap-badge" style="background: rgba(255,255,255,0.2); margin-right: 4px;">+1</span>`;
   449	
   450	    if (meId && Number(meId) === Number(activePlayer1Id)) {
   451	      trigger1.disabled = true;
   452	      trigger1.style.opacity = '0.4';
   453	      trigger1.style.cursor = 'not-allowed';
   454	      trigger1.innerHTML = `🔒 ممنوع دعم نفسك`;
   455	    }
   456	    if (meId && Number(meId) === Number(activePlayer2Id)) {
   457	      trigger2.disabled = true;
   458	      trigger2.style.opacity = '0.4';
   459	      trigger2.style.cursor = 'not-allowed';
   460	      trigger2.innerHTML = `🔒 ممنوع دعم نفسك`;
   461	    }
   462	  };
   463	
   464	  const seenOperationIds = new Set();
   465	
   466	  function generateOperationId(prefix = 'op') {
   467	    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
   468	      return window.crypto.randomUUID();
   469	    }
   470	    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
   471	  }
   472	
   473	  function limitTapBubbles() {
   474	    const bubbles = document.querySelectorAll('.bt-tap-avatar-bubble');
   475	    if (bubbles.length > 15) {
   476	      bubbles[0].remove();
   477	    }
   478	  }
   479	
   480	  function clearAllSupportBubbles() {
   481	    const bubbles = document.querySelectorAll('.bt-tap-avatar-bubble');
   482	    bubbles.forEach(b => b.remove());
   483	  }
   484	
   485	  function handleSupportAnimationBubble(data) {
   486	    if (!data || !data.battleId) return;
   487	    if (activeBattleId && Number(data.battleId) !== Number(activeBattleId)) return;
   488	
   489	    const targetUserId = Number(data.targetUserId || data.receiverId);
   490	    if (targetUserId !== Number(activePlayer1Id) && targetUserId !== Number(activePlayer2Id)) return;
   491	
   492	    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
   493	      return;
   494	    }
   495	
   496	    const opId = data.operationId;
   497	    if (opId) {
   498	      if (seenOperationIds.has(opId)) return;
   499	      seenOperationIds.add(opId);
   500	      if (seenOperationIds.size > 500) {
   501	        const first = seenOperationIds.values().next().value;
   502	        seenOperationIds.delete(first);
   503	      }
   504	    }
   505	
   506	    const supporterAvatar = data.supporterAvatar || getBattleAvatarUrl(data.tapper || {});
   507	    const supportType = data.supportType || 'tap';
   508	
   509	    const spawnBubble = () => {
   510	      const btnId = targetUserId === Number(activePlayer1Id) ? 'bt-support-player1' : 'bt-support-player2';
   511	      const cardId = targetUserId === Number(activePlayer1Id) ? 'bt-player1-card' : 'bt-player2-card';
   512	      const targetEl = document.getElementById(btnId) || document.getElementById(cardId);
   513	      const panel = document.getElementById('battle-challenge-panel');
   514	
   515	      if (!targetEl || !panel) return;
   516	
   517	      const targetRect = targetEl.getBoundingClientRect();
   518	      const panelRect = panel.getBoundingClientRect();
   519	
   520	      const bubble = document.createElement('div');
   521	      bubble.className = 'bt-tap-avatar-bubble';
   522	
   523	      const badgeText = supportType === 'gift' ? '🎁' : '+1';
   524	      const badgeBg = supportType === 'gift' ? '#ec4899' : '#facc15';
   525	
   526	      bubble.innerHTML = `
   527	        <img src="${supporterAvatar}" class="bt-tap-avatar-img" onerror="this.src=window.defaultAvatarUrl || '/uploads/site/default.png'">
   528	        <span class="bt-bubble-badge" style="position: absolute; right: -6px; top: -6px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 999px; background: ${badgeBg}; color: #111827; font-size: 10px; font-weight: 900; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.8);">${badgeText}</span>
   529	      `;
   530	
   531	      const startLeft = targetRect.left - panelRect.left + (targetRect.width / 2) - 18;
   532	      const startTop = targetRect.top - panelRect.top - 5;
   533	
   534	      bubble.style.left = `${startLeft}px`;
   535	      bubble.style.top = `${startTop}px`;
   536	
   537	      const randomX = Math.floor(Math.random() * 60) - 30;
   538	      bubble.style.setProperty('--bt-tap-random-x', `${randomX}px`);
   539	
   540	      limitTapBubbles();
   541	      panel.appendChild(bubble);
   542	
   543	      const removeBubble = () => {
   544	        if (bubble.parentNode) bubble.remove();
   545	      };
   546	
   547	      bubble.addEventListener('animationend', removeBubble);
   548	      setTimeout(removeBubble, 1600);
   549	    };
   550	
   551	    spawnBubble();
   552	    if (supportType === 'gift') {
   553	      setTimeout(spawnBubble, 150);
   554	    }
   555	  }
   556	
   557	  function createTapAvatarBubble(data) {
   558	    handleSupportAnimationBubble(data);
   559	  }
   560	
   561	  function renderBattleFinalResult(data) {
   562	    const p1 = currentBattle?.player1 || { id: activePlayer1Id, username: currentBattle?.player1Name };
   563	    const p2 = currentBattle?.player2 || { id: activePlayer2Id, username: currentBattle?.player2Name };
   564	
   565	    const p1NameWinner = renderBattleIdentity(p1, { nameStyle: 'color: #ffffff !important;' });
   566	    const p2NameWinner = renderBattleIdentity(p2, { nameStyle: 'color: #ffffff !important;' });
   567	
   568	    const p1NameDetail = renderBattleIdentity(p1, { nameStyle: 'color: #93c5fd !important;' });
   569	    const p2NameDetail = renderBattleIdentity(p2, { nameStyle: 'color: #fbcfe8 !important;' });
   570	
   571	    const p1Avatar = getBattleAvatarUrl(p1);
   572	    const p2Avatar = getBattleAvatarUrl(p2);
   573	
   574	    let winnerHtml = "";
   575	
   576	    const isP1Winner = Number(data.winnerId) === Number(activePlayer1Id);
   577	    const isP2Winner = Number(data.winnerId) === Number(activePlayer2Id);
   578	
   579	    if (isP1Winner) {
   580	      winnerHtml = `
   581	        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 3px solid #eab308; border-radius: 20px; padding: 24px 16px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(234, 179, 8, 0.2); text-align: center; position: relative; overflow: hidden;">
   582	          <div style="position: absolute; top: -50px; left: -50px; width: 150px; height: 150px; background: rgba(234, 179, 8, 0.08); filter: blur(50px); border-radius: 50%; pointer-events: none;"></div>
   583	          <div style="position: absolute; bottom: -50px; right: -50px; width: 150px; height: 150px; background: rgba(37, 99, 235, 0.08); filter: blur(50px); border-radius: 50%; pointer-events: none;"></div>
   584	          
   585	          <div style="font-size: 46px; line-height: 1; margin-bottom: -10px; z-index: 2; position: relative; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">👑</div>
   586	          
   587	          <div style="position: relative; width: 96px; height: 96px; margin: 0 auto 12px; z-index: 1;">
   588	            <img src="${p1Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 4px solid #eab308; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);" />
   589	            <span style="position: absolute; bottom: -4px; right: 50%; transform: translateX(50%); background: #eab308; color: #0f172a; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; border: 2px solid #111827; white-space: nowrap;">الفائز</span>
   590	          </div>
   591	          
   592	          <div style="font-size: 16px; font-weight: 800; color: #ffffff; margin-bottom: 6px;">${p1NameWinner}</div>
   593	          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 20px; padding: 4px 14px;">
   594	            <span style="color: #facc15; font-size: 11px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">🏆 بطل التحدي الحالي</span>
   595	          </div>
   596	        </div>
   597	      `;
   598	    } else if (isP2Winner) {
   599	      winnerHtml = `
   600	        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 3px solid #ec4899; border-radius: 20px; padding: 24px 16px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(236, 72, 153, 0.2); text-align: center; position: relative; overflow: hidden;">
   601	          <div style="position: absolute; top: -50px; left: -50px; width: 150px; height: 150px; background: rgba(236, 72, 153, 0.08); filter: blur(50px); border-radius: 50%; pointer-events: none;"></div>
   602	          <div style="position: absolute; bottom: -50px; right: -50px; width: 150px; height: 150px; background: rgba(234, 179, 8, 0.08); filter: blur(50px); border-radius: 50%; pointer-events: none;"></div>
   603	          
   604	          <div style="font-size: 46px; line-height: 1; margin-bottom: -10px; z-index: 2; position: relative; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">👑</div>
   605	          
   606	          <div style="position: relative; width: 96px; height: 96px; margin: 0 auto 12px; z-index: 1;">
   607	            <img src="${p2Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 4px solid #ec4899; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4);" />
   608	            <span style="position: absolute; bottom: -4px; right: 50%; transform: translateX(50%); background: #ec4899; color: #ffffff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; border: 2px solid #111827; white-space: nowrap;">الفائز</span>
   609	          </div>
   610	          
   611	          <div style="font-size: 16px; font-weight: 800; color: #ffffff; margin-bottom: 6px;">${p2NameWinner}</div>
   612	          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(236, 72, 153, 0.15); border: 1px solid rgba(236, 72, 153, 0.3); border-radius: 20px; padding: 4px 14px;">
   613	            <span style="color: #f472b6; font-size: 11px; font-weight: bold; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">🏆 بطل التحدي الحالي</span>
   614	          </div>
   615	        </div>
   616	      `;
   617	    } else {
   618	      winnerHtml = `
   619	        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 3px solid #64748b; border-radius: 20px; padding: 24px 16px; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(100, 116, 139, 0.2); text-align: center; position: relative; overflow: hidden;">
   620	          <div style="position: absolute; top: -50px; left: -50px; width: 150px; height: 150px; background: rgba(100, 116, 139, 0.08); filter: blur(50px); border-radius: 50%; pointer-events: none;"></div>
   621	          
   622	          <div style="font-size: 40px; line-height: 1; margin-bottom: 12px; z-index: 2; position: relative;">🤝</div>
   623	          
   624	          <div style="display: flex; justify-content: center; align-items: center; margin-bottom: 14px; position: relative; z-index: 1;">
   625	            <img src="${p1Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 70px; height: 70px; object-fit: cover; border-radius: 50%; border: 3px solid #3b82f6; box-shadow: -4px 6px 12px rgba(0,0,0,0.3); z-index: 2;" />
   626	            <img src="${p2Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 70px; height: 70px; object-fit: cover; border-radius: 50%; border: 3px solid #ec4899; box-shadow: 4px 6px 12px rgba(0,0,0,0.3); z-index: 1; margin-right: -15px;" />
   627	          </div>
   628	          
   629	          <div style="font-size: 18px; font-weight: 800; color: #f8fafc; margin-bottom: 4px;">انتهى التحدي بالتعادل!</div>
   630	          <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">تكافؤ تام وأداء رائع ومميز من الطرفين</div>
   631	        </div>
   632	      `;
   633	    }
   634	
   635	    const reasonHtml = data.forfeitReason
   636	      ? `<div class="bt-final-reason" style="margin-bottom: 16px; font-weight: 500; font-size: 13px; color: #f43f5e; background: rgba(244, 63, 94, 0.08); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(244, 63, 94, 0.15);">${data.forfeitReason}</div>`
   637	      : "";
   638	
   639	    return `
   640	      <div class="bt-final-result-box" style="direction: rtl; text-align: center; padding: 5px; font-family: 'Tajawal', sans-serif;">
   641	        ${winnerHtml}
   642	        ${reasonHtml}
   643	
   644	        <div style="border: 2px solid rgba(255, 255, 255, 0.08); border-radius: 18px; background: #0f172a; padding: 18px; width: 100%; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3);">
   645	          <div style="font-size: 13px; font-weight: 700; color: #94a3b8; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em;">لوحة النتيجة التفصيلية والبلورات</div>
   646	          
   647	          <div class="test-vs-wrapper" style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
   648	            <!-- Player 1 Details -->
   649	            <div style="flex: 1; min-width: 0; background: rgba(59, 130, 246, 0.04); border: 1.5px solid rgba(59, 130, 246, 0.2); border-radius: 14px; padding: 16px 10px; text-align: center; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15); transition: all 0.2s;">
   650	              <div style="width: 58px; height: 58px; margin: 0 auto 10px; border-radius: 50%; border: 2.5px solid #3b82f6; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.25);">
   651	                <img src="${p1Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 100%; height: 100%; object-fit: cover;" />
   652	              </div>
   653	              <div style="font-size: 13px; font-weight: 700; color: #93c5fd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 6px;">${p1NameDetail}</div>
   654	              <div style="font-size: 30px; font-weight: 900; color: #3b82f6; line-height: 1; margin: 4px 0 8px;">${Number(data.player1TotalScore) || 0}</div>
   655	              <div style="display: inline-block; background: rgba(59, 130, 246, 0.15); color: #60a5fa; font-size: 11px; font-weight: bold; border-radius: 12px; padding: 4px 10px; margin-top: 2px;">
   656	                الجولات الفائزة: ${Number(data.player1RoundsWon) || 0}
   657	              </div>
   658	            </div>
   659	
   660	            <!-- VS Divider -->
   661	            <div style="width: 40px; text-align: center; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
   662	              <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.06); border: 1.5px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; color: #64748b; line-height: 1;">VS</div>
   663	            </div>
   664	
   665	            <!-- Player 2 Details -->
   666	            <div style="flex: 1; min-width: 0; background: rgba(236, 72, 153, 0.04); border: 1.5px solid rgba(236, 72, 153, 0.2); border-radius: 14px; padding: 16px 10px; text-align: center; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15); transition: all 0.2s;">
   667	              <div style="width: 58px; height: 58px; margin: 0 auto 10px; border-radius: 50%; border: 2.5px solid #ec4899; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.25);">
   668	                <img src="${p2Avatar}" referrerPolicy="origin-when-cross-origin" style="width: 100%; height: 100%; object-fit: cover;" />
   669	              </div>
   670	              <div style="font-size: 13px; font-weight: 700; color: #fbcfe8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 6px;">${p2NameDetail}</div>
   671	              <div style="font-size: 30px; font-weight: 900; color: #ec4899; line-height: 1; margin: 4px 0 8px;">${Number(data.player2TotalScore) || 0}</div>
   672	              <div style="display: inline-block; background: rgba(236, 72, 153, 0.15); color: #f472b6; font-size: 11px; font-weight: bold; border-radius: 12px; padding: 4px 10px; margin-top: 2px;">
   673	                الجولات الفائزة: ${Number(data.player2RoundsWon) || 0}
   674	              </div>
   675	            </div>
   676	          </div>
   677	        </div>
   678	      </div>
   679	    `;
   680	  }
   681	
   682	  function showBattleClassicAlert(message, icon = 'info') {
   683	    if (window.showChatAlert) {
   684	      return window.showChatAlert({
   685	        message,
   686	        icon,
   687	        isHtml: false
   688	      });
   689	    }
   690	
   691	    if (window.showToast) {
   692	      window.showToast(message, icon === 'error' ? 'error' : 'info');
   693	      return Promise.resolve();
   694	    }
   695	
   696	    return Swal.fire({
   697	      title: 'تنبيه',
   698	      text: message,
   699	      icon,
   700	      confirmButtonText: 'موافق'
   701	    });
   702	  }
   703	
   704	  function showBattleClassicHtmlAlert(message, icon = 'info') {
   705	    if (window.showChatAlert) {
   706	      return window.showChatAlert({
   707	        message,
   708	        icon,
   709	        isHtml: true
   710	      });
   711	    }
   712	
   713	    return Swal.fire({
   714	      title: 'تنبيه',
   715	      html: message,
   716	      icon,
   717	      confirmButtonText: 'موافق'
   718	    });
   719	  }
   720	
   721	  // Web Audio Synth audio cue generator
   722	  const playBattleCue = (type) => {
   723	    try {
   724	      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
   725	      const osc = audioCtx.createOscillator();
   726	      const gain = audioCtx.createGain();
   727	      osc.connect(gain);
   728	      gain.connect(audioCtx.destination);
   729	
   730	      if (type === 'start') {
   731	        osc.type = 'triangle';
   732	        osc.frequency.setValueAtTime(330, audioCtx.currentTime);
   733	        osc.frequency.exponentialRampToValueAtTime(660, audioCtx.currentTime + 0.3);
   734	        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
   735	        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
   736	        osc.start();
   737	        osc.stop(audioCtx.currentTime + 0.4);
   738	      } else if (type === 'tick') {
   739	        osc.type = 'sine';
   740	        osc.frequency.setValueAtTime(550, audioCtx.currentTime);
   741	        gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
   742	        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
   743	        osc.start();
   744	        osc.stop(audioCtx.currentTime + 0.1);
   745	      } else if (type === 'tap') {
   746	        osc.type = 'sine';
   747	        osc.frequency.setValueAtTime(750, audioCtx.currentTime);
   748	        gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
   749	        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
   750	        osc.start();
   751	        osc.stop(audioCtx.currentTime + 0.06);
   752	      } else if (type === 'win') {
   753	        osc.type = 'triangle';
   754	        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
   755	        osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.15); // E5
   756	        osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.3); // G5
   757	        osc.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.45); // C5 octave
   758	        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
   759	        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
   760	        osc.start();
   761	        osc.stop(audioCtx.currentTime + 0.8);
   762	      }
   763	    } catch (e) {
   764	      console.warn('[BattleAudio] Synth failed:', e);
   765	    }
   766	  };
   767	
   768	  // Flying supported gift particle generator
   769	  const createFlyingGiftParticle = (receiverId, icon, name, quantity) => {
   770	    try {
   771	      const cardId = Number(receiverId) === Number(activePlayer1Id) ? 'bt-player1-card' : 'bt-player2-card';
   772	      const anchorNode = document.getElementById(cardId);
   773	      if (!anchorNode) return;
   774	
   775	      const element = document.createElement('div');
   776	      element.className = 'battle-flying-gift';
   777	      
   778	      const iconNode = document.createElement('div');
   779	      iconNode.className = 'gift-fly-icon';
   780	      iconNode.textContent = icon || '🎁';
   781	      element.appendChild(iconNode);
   782	
   783	      const labelNode = document.createElement('div');
   784	      labelNode.className = 'gift-fly-label';
   785	      labelNode.textContent = `${name || 'دعم'} ×${quantity}`;
   786	      element.appendChild(labelNode);
   787	
   788	      // Random offset margins
   789	      const randomLeft = Math.floor(Math.random() * 40) - 20; 
   790	      element.style.left = `calc(50% + ${randomLeft}px)`;
   791	      element.style.bottom = '100px';
   792	
   793	      anchorNode.appendChild(element);
   794	
   795	      // Self cleanup
   796	      setTimeout(() => {
   797	        element.remove();
   798	      }, 1600);
   799	    } catch (err) {
   800	      console.error('[BattleUI] Fly gift anim failed:', err);
   801	    }
   802	  };
   803	
   804	  // Export openBattleModeSelectionModal globally on window for instant single-click access
   805	  window.openBattleModeSelectionModal = (targetUserOrId, room) => {
   806	    const target = (typeof targetUserOrId === 'object' && targetUserOrId)
   807	      ? targetUserOrId
   808	      : ((typeof window.getCurrentProfileUser === 'function' ? window.getCurrentProfileUser() : null) || window.profileUser);
   809	
   810	    if (!target) {
   811	      Swal.fire({
   812	        title: 'خطأ',
   813	        text: 'لم يتم العثور على معلومات العضو.',
   814	        icon: 'error',
   815	        confirmButtonText: 'حسناً'
   816	      });
   817	      return;
   818	    }
   819	
   820	    const targetUserId = target.userId || target.id || targetUserOrId;
   821	    if (!targetUserId) {
   822	      Swal.fire({
   823	        title: 'خطأ',
   824	        text: 'لم يتم تحديد معرف المستخدم المستهدف.',
   825	        icon: 'error',
   826	        confirmButtonText: 'حسناً'
   827	      });
   828	      return;
   829	    }
   830	
   831	    const targetRoomId = room || (window.state ? window.state.currentRoomId : 0);
   832	    if (!targetRoomId || Number(targetRoomId) <= 0) {
   833	      Swal.fire({
   834	        title: 'تنبيه',
   835	        text: 'يجب أن تكون متواجداً بنشاط داخل غرفة للتحدي.',
   836	        icon: 'warning',
   837	        confirmButtonText: 'حسناً'
   838	      });
   839	      return;
   840	    }
   841	
   842	    let overlay = document.getElementById('battle-mode-modal-overlay');
   843	    if (!overlay) {
   844	      overlay = document.createElement('div');
   845	      overlay.id = 'battle-mode-modal-overlay';
   846	      overlay.style.cssText = `
   847	        display: none;
   848	        position: fixed;
   849	        top: 0;
   850	        left: 0;
   851	        width: 100%;
   852	        height: 100%;
   853	        background: rgba(0, 0, 0, 0.7);
   854	        backdrop-filter: blur(5px);
   855	        -webkit-backdrop-filter: blur(5px);
   856	        z-index: 99999;
   857	        justify-content: center;
   858	        align-items: center;
   859	        direction: rtl;
   860	        font-family: 'Tajawal', sans-serif;
   861	      `;
   862	      document.body.appendChild(overlay);
   863	    }
   864	
   865	    const targetUsernameHtml = renderBattleIdentity(target);
   866	
   867	    overlay.innerHTML = `
   868	      <div style="background: #0f172a; border: 2px solid rgba(255, 255, 255, 0.1); border-radius: 12px; width: 95%; max-width: 450px; padding: 20px; box-shadow: 0 15px 30px rgba(0, 0, 0, 0.5); color: #f8fafc; position: relative; text-align: right;">
   869	        <!-- Modal Header -->
   870	        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 15px; margin-bottom: 15px; direction: rtl;">
   871	          <h5 style="margin: 0; font-size: 16px; font-weight: 700; color: #eab308; display: flex; align-items: center; gap: 8px;">
   872	            <span>🏆 إرسال تحدي الجولات</span>
   873	          </h5>
   874	          <button type="button" onclick="window.closeBattleModeModal()" style="background: none; border: none; color: #94a3b8; font-size: 24px; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
   875	        </div>
   876	
   877	        <!-- Modal Info -->
   878	        <div style="margin-bottom: 15px; font-size: 13px; color: #cbd5e1; direction: rtl;">
   879	          أنت على وشك إرسال تحدي إلى العضو: <strong style="color: #60a5fa;">${targetUsernameHtml}</strong>
   880	        </div>
   881	
   882	        <!-- Single Round Challenge Card -->
   883	        <div style="background: rgba(59, 130, 246, 0.08); border: 2px solid #3b82f6; border-radius: 12px; padding: 14px; margin-bottom: 20px; direction: rtl; text-align: right;">
   884	          <div style="display: flex; align-items: center; gap: 12px;">
   885	            <span style="font-size: 28px; flex-shrink: 0;">⏱️</span>
   886	            <div>
   887	              <strong style="display: block; font-size: 14px; color: #f8fafc; margin-bottom: 2px;">تحدي الجولات (جولة واحدة حاسمة)</strong>
   888	              <span style="font-size: 12px; color: #94a3b8;">تحدي حاسم ومباشر تمتد مدته لـ 3 دقائق (180 ثانية).</span>
   889	            </div>
   890	          </div>
   891	        </div>
   892	
   893	        <!-- Foot Action Buttons -->
   894	        <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 15px; direction: rtl;">
   895	          <button type="button" id="bt-mode-submit-btn" class="btn btn-warning btn-sm fw-bold" style="background: #eab308; color: #1e1b4b; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">تأكيد وإرسال التحدي ⚡</button>
   896	          <button type="button" onclick="window.closeBattleModeModal()" class="btn btn-secondary btn-sm" style="background: #475569; color: #f8fafc; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">إلغاء</button>
   897	        </div>
   898	      </div>
   899	    `;
   900	
   901	    // Wire up Confirm button
   902	    const submitBtn = overlay.querySelector('#bt-mode-submit-btn');
   903	    submitBtn.onclick = () => {
   904	      console.log('[BattleCtrl] Sending battle invite mode: single');
   905	
   906	      if (window.socket) {
   907	        window.socket.emit('battle:invite', {
   908	          targetUserId: Number(targetUserId),
   909	          roomId: Number(targetRoomId),
   910	          battleMode: 'single'
   911	        });
   912	      }
   913	
   914	      // Hide profile modal gracefully
   915	      const modalEl = document.getElementById('userProfileModal');
   916	      if (modalEl && window.bootstrap) {
   917	        const modal = bootstrap.Modal.getInstance(modalEl);
   918	        if (modal) modal.hide();
   919	      }
   920	
   921	      window.closeBattleModeModal();
   922	    };
   923	
   924	    window.closeBattleModeModal = () => {
   925	      overlay.style.display = 'none';
   926	    };
   927	
   928	    overlay.style.display = 'flex';
   929	  };
   930	
   931	  const initializeProfileTrigger = () => {
   932	    // No-op: openBattleModeSelectionModal is globally exposed on window and called directly from main.js delegated listener
   933	  };
   934	
   935	  // Connect click tap handlers
   936	  const wireUpInteractiveTaps = () => {
   937	    const trigger1 = document.getElementById('bt-support-player1');
   938	    const trigger2 = document.getElementById('bt-support-player2');
   939	
   940	    if (trigger1) {
   941	      trigger1.onclick = (e) => {
   942	        e.preventDefault();
   943	        const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);
   944	        if (meId && Number(meId) === Number(activePlayer1Id)) {
   945	          showBattleClassicAlert('لا يمكنك التكبيس لنفسك.', 'warning');
   946	          return;
   947	        }
   948	        if (activeBattleId && activePlayer1Id) {
   949	          const opId = generateOperationId('tap');
   950	          window.socket.emit('battle:tap', { battleId: activeBattleId, receiverId: activePlayer1Id, operationId: opId });
   951	          playBattleCue('tap');
   952	          renderClickRipple(e, trigger1);
   953	        }
   954	      };
   955	    }
   956	
   957	    if (trigger2) {
   958	      trigger2.onclick = (e) => {
   959	        e.preventDefault();
   960	        const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);
   961	        if (meId && Number(meId) === Number(activePlayer2Id)) {
   962	          showBattleClassicAlert('لا يمكنك التكبيس لنفسك.', 'warning');
   963	          return;
   964	        }
   965	        if (activeBattleId && activePlayer2Id) {
   966	          const opId = generateOperationId('tap');
   967	          window.socket.emit('battle:tap', { battleId: activeBattleId, receiverId: activePlayer2Id, operationId: opId });
   968	          playBattleCue('tap');
   969	          renderClickRipple(e, trigger2);
   970	        }
   971	      };
   972	    }
   973	
   974	    const cancelTrigger = document.getElementById('bt-cancel-challenge-btn');
   975	    if (cancelTrigger) {
   976	      cancelTrigger.onclick = () => {
   977	        const room = window.state ? window.state.currentRoomId : 0;
   978	        if (room) {
   979	          window.socket.emit('battle:cancel', { roomId: Number(room) });
   980	        }
   981	      };
   982	    }
   983	
   984	    const giftTrigger = document.getElementById('bt-gift-support-trigger');
   985	    if (giftTrigger) {
   986	      giftTrigger.onclick = () => {
   987	        window.openBattleGiftSelectionModal();
   988	      };
   989	    }
   990	  };
   991	
   992	  const renderClickRipple = (event, element) => {
   993	    try {
   994	      const rect = element.getBoundingClientRect();
   995	      const ripple = document.createElement('div');
   996	      ripple.className = 'battle-tap-ripple';
   997	      
   998	      const x = event.clientX - rect.left - 20;
   999	      const y = event.clientY - rect.top - 20;
  1000	      
  1001	      ripple.style.left = `${x}px`;
  1002	      ripple.style.top = `${y}px`;
  1003	      
  1004	      element.appendChild(ripple);
  1005	      setTimeout(() => ripple.remove(), 600);
  1006	    } catch (err) {}
  1007	  };
  1008	
  1009	  // Wire Socket Listeners
  1010	  const hookSocketInboundEvents = () => {
  1011	    if (window.__battleSocketEventsBound) return;
  1012	    if (!window.socket) {
  1013	      console.warn('[BattleSocket] Socket transport unavailable, retrying in 500ms...');
  1014	      setTimeout(hookSocketInboundEvents, 500);
  1015	      return;
  1016	    }
  1017	    
  1018	    window.__battleSocketEventsBound = true;
  1019	    const socket = window.socket;
  1020	
  1021	    // Expose handleBattleInvitation on window and do not register socket listener here to prevent duplication
  1022	    window.handleBattleInvitation = (data) => {
  1023	      console.log('[BattleSocket] Invited to live battle room:', data);
  1024	      playBattleCue('start');
  1025	
  1026	      Swal.fire({
  1027	        title: 'تحدي جولات',
  1028	        html: `${data.senderName} يطلب تحديك الآن<br>هل تقبل التحدي؟`,
  1029	        icon: 'question',
  1030	        showCancelButton: true,
  1031	        confirmButtonText: 'قبول',
  1032	        cancelButtonText: 'رفض'
  1033	      }).then((result) => {
  1034	        if (result.isConfirmed) {
  1035	          socket.emit('battle:accept', { senderId: data.senderId, roomId: data.roomId });
  1036	        } else {
  1037	          socket.emit('battle:reject', { senderId: data.senderId, roomId: data.roomId });
  1038	        }
  1039	      });
  1040	    };
  1041	
  1042	    socket.on('battle:inviteRejected', (data) => {
  1043	      showBattleClassicAlert(`تم رفض التحدي من قبل ${data.receiverName || 'المتحدي'}`, 'warning');
  1044	    });
  1045	
  1046	    // Handle generic error warnings
  1047	    socket.on('battle:error', (data) => {
  1048	      showBattleClassicAlert(data?.message || 'حدث خطأ', data?.type === 'success' ? 'success' : 'info');
  1049	    });
  1050	
  1051	    // Battle successfully created / start
  1052	    window.handleBattleCreated = (data) => {
  1053	      console.log('[BattleSocket] Match structure active:', data);
  1054	      currentBattle = data;
  1055	      currentBattle.status = 'countdown';
  1056	      activeBattleId = data.battleId;
  1057	      activePlayer1Id = Number(data.player1.userId || data.player1.id);
  1058	      activePlayer2Id = Number(data.player2.userId || data.player2.id);
  1059	
  1060	      console.log('[BattleUI] active players ids:', {
  1061	        activePlayer1Id,
  1062	        activePlayer2Id,
  1063	        player1: data.player1,
  1064	        player2: data.player2
  1065	      });
  1066	
  1067	      // Populate layout structures
  1068	      // Players details
  1069	      const p1n = document.getElementById('bt-player1-name'); if(p1n) p1n.innerHTML = renderBattleIdentity(data.player1);
  1070	      const p2n = document.getElementById('bt-player2-name'); if(p2n) p2n.innerHTML = renderBattleIdentity(data.player2);
  1071	      
  1072	      setBattleAvatar('bt-player1-pic', data.player1);
  1073	      setBattleAvatar('bt-player2-pic', data.player2);
  1074	
  1075	      // Reset score panels
  1076	      const p1s = document.getElementById('bt-player1-score'); if(p1s) p1s.textContent = '0';
  1077	      const p2s = document.getElementById('bt-player2-score'); if(p2s) p2s.textContent = '0';
  1078	      const pb = document.getElementById('bt-progress-bar'); if(pb) pb.style.width = '50%';
  1079	      const sb = document.getElementById('bt-status-bar'); if(sb) sb.textContent = 'بدء التحدي... جاري التجهيز!';
  1080	
  1081	      // Reset gift feeds and top supporters on initiation
  1082	      const feedContainer = document.getElementById('bt-gift-feed');
  1083	      if (feedContainer) feedContainer.innerHTML = '';
  1084	      const topSupportersContainer = document.getElementById('bt-top-supporters');
  1085	      if (topSupportersContainer) topSupportersContainer.innerHTML = '';
  1086	
  1087	      // Render won-round placeholders
  1088	      const buildDots = (targetElId) => {
  1089	        const wrap = document.getElementById(targetElId);
  1090	        if (!wrap) return;
  1091	        wrap.innerHTML = '';
  1092	        for (let i = 0; i < data.totalRounds; i++) {
  1093	          const dot = document.createElement('div');
  1094	          dot.className = 'round-won-dot';
  1095	          wrap.appendChild(dot);
  1096	        }
  1097	      };
  1098	      buildDots('bt-player1-won-badges');
  1099	      buildDots('bt-player2-won-badges');
  1100	
  1101	      // Participant cancel controls only
  1102	      const activeMe = window.state?.currentUser?.id || 0;
  1103	      const isParticipant = Number(activeMe) === Number(activePlayer1Id) || Number(activeMe) === Number(activePlayer2Id);
  1104	      
  1105	      const cancelTrigger = document.getElementById('bt-cancel-challenge-btn');
  1106	      if (cancelTrigger) {
  1107	        cancelTrigger.classList.toggle('d-none', !isParticipant);
  1108	      }
  1109	
  1110	      // Display main container panel smoothly
  1111	      const panel = document.getElementById(PANEL_ID);
  1112	      if (panel) {
  1113	        panel.classList.remove('d-none');
  1114	        panel.style.display = 'block';
  1115	      }
  1116	
  1117	      // Ensure we reset any previous local minimization state on challenge startup
  1118	      toggleBattleMinimization(false);
  1119	
  1120	      updateInteractiveTapButtons();
  1121	
  1122	      playBattleCue('start');
  1123	    };
  1124	
  1125	    socket.on('battle:countdown', (data) => {
  1126	      if (currentBattle) currentBattle.status = 'countdown';
  1127	      const elVal = document.getElementById('bt-timer-value') || document.getElementById('bt-timer');
  1128	      if (elVal) elVal.textContent = String(data.timer);
  1129	      const elLbl = document.getElementById('bt-timer-label');
  1130	      if (elLbl) elLbl.textContent = 'الاستعداد';
  1131	      const rs_sb = document.getElementById('bt-status-bar'); if(rs_sb) rs_sb.innerHTML = `الاستعداد للجولة ${data.currentRound}... <span class="text-warning fw-bold fs-5">${data.timer}</span>`;
  1132	      playBattleCue('tick');
  1133	    });
  1134	
  1135	    socket.on('battle:roundStarted', (data) => {
  1136	      if (currentBattle) currentBattle.status = 'active';
  1137	
  1138	      const p1 = Number(data.player1Score) || 0;
  1139	      const p2 = Number(data.player2Score) || 0;
  1140	
  1141	      const rs_p1s = document.getElementById('bt-player1-score'); if(rs_p1s) rs_p1s.textContent = String(p1);
  1142	      const rs_p2s = document.getElementById('bt-player2-score'); if(rs_p2s) rs_p2s.textContent = String(p2);
  1143	      const pb = document.getElementById('bt-progress-bar'); if(pb) pb.style.width = '50%';
  1144	
  1145	      const elVal = document.getElementById('bt-timer-value') || document.getElementById('bt-timer');
  1146	      if (elVal) elVal.textContent = String(data.timer);
  1147	
  1148	      const elLbl = document.getElementById('bt-timer-label');
  1149	      if (elLbl) elLbl.textContent = 'الجولة';
  1150	
  1151	      const rs_sb = document.getElementById('bt-status-bar'); if(rs_sb) rs_sb.innerHTML =
  1152	        `<span class="text-success fw-bold">ابدأ!</span> الجولة ${data.currentRound} انطلقت! ادعم بـ التكبيس والهدايا!`;
  1153	      playBattleCue('start');
  1154	    });
  1155	
  1156	    socket.on('battle:giftError', (data) => {
  1157	      showBattleClassicAlert(data?.message || 'تعذر إرسال الدعم.', 'warning');
  1158	    });
  1159	
  1160	    socket.on('coins:updated', (data) => {
  1161	      console.log('[Coins] Updated balance:', data);
  1162	      const currentUserId = window.state?.currentUser?.id;
  1163	      if (data && data.userId && currentUserId && Number(data.userId) !== Number(currentUserId)) {
  1164	        return;
  1165	      }
  1166	
  1167	      const coinsEls = document.querySelectorAll('[data-user-coins], .js-user-coins, #current-user-coins');
  1168	      coinsEls.forEach(el => {
  1169	        el.textContent = data.balance;
  1170	      });
  1171	
  1172	      if (window.state && window.state.currentUser) {
  1173	        // Only the coin balance changes here — never touch `rep` (rep is rating points).
  1174	        window.state.currentUser.coins = data.balance;
  1175	      }
  1176	    });
  1177	
  1178	    socket.on('battle:tapError', (data) => {
  1179	      showBattleClassicAlert(data?.message || 'لا يمكنك التكبيس الآن.', 'warning');
  1180	    });
  1181	
  1182	    socket.on('battle:timer', (data) => {
  1183	      const elVal = document.getElementById('bt-timer-value') || document.getElementById('bt-timer');
  1184	      if (elVal) elVal.textContent = String(data.timer);
  1185	      if (data.timer <= 10) {
  1186	        playBattleCue('tick');
  1187	      }
  1188	    });
  1189	
  1190	    socket.on('battle:scoreUpdate', (data) => {
  1191	      const p1 = Number(data.player1Score) || 0;
  1192	      const p2 = Number(data.player2Score) || 0;
  1193	      
  1194	      const rs_p1s = document.getElementById('bt-player1-score'); if(rs_p1s) rs_p1s.textContent = String(p1);
  1195	      const rs_p2s = document.getElementById('bt-player2-score'); if(rs_p2s) rs_p2s.textContent = String(p2);
  1196	
  1197	      // Percentage recalculation
  1198	      let pct = 50;
  1199	      if (p1 + p2 > 0) {
  1200	        pct = (p1 / (p1 + p2)) * 100;
  1201	        // Clamp bounds securely
  1202	        pct = Math.max(5, Math.min(95, pct));
  1203	      }
  1204	      document.getElementById('bt-progress-bar').style.width = `${pct}%`;
  1205	    });
  1206	
  1207	    socket.on('battle:tapBurst', (data) => {
  1208	       const p1Burst = Number(data.player1TapCount) || 0;
  1209	       const p2Burst = Number(data.player2TapCount) || 0;
  1210	       
  1211	       const showBurst = (side, val) => {
  1212	          if (val <= 0) return;
  1213	          const container = document.getElementById(`bt-${side}-side`);
  1214	          if (!container) return;
  1215	          const el = document.createElement('div');
  1216	          el.className = 'tap-burst-effect';
  1217	          el.textContent = `+${val}`;
  1218	          container.appendChild(el);
  1219	          setTimeout(() => el.remove(), 800);
  1220	       };
  1221	
  1222	       if (p1Burst > 0) showBurst('player1', p1Burst);
  1223	       if (p2Burst > 0) showBurst('player2', p2Burst);
  1224	    });
  1225	
  1226	    socket.on('battle:giftAnimation', (data) => {
  1227	      const senderHtml = data.sender ? renderBattleIdentity(data.sender) : (data.senderName || 'عضو');
  1228	      const receiverHtml = data.receiver ? renderBattleIdentity(data.receiver) : (data.receiverName || 'عضو');
  1229	
  1230	      const statusBar = document.getElementById('bt-status-bar');
  1231	      if (statusBar) {
  1232	        statusBar.innerHTML =
  1233	          `${senderHtml} دعم ${receiverHtml} بـ ${data.giftIcon || '🎁'} ${data.giftName} ×${data.quantity}`;
  1234	      }
  1235	
  1236	      createFlyingGiftParticle(data.receiverId, data.giftIcon, data.giftName, data.quantity);
  1237	
  1238	      // Render TikTok-style side gift feed item
  1239	      const feedContainer = document.getElementById('bt-gift-feed');
  1240	      if (feedContainer) {
  1241	        const item = document.createElement('div');
  1242	        item.className = 'bt-gift-feed-item';
  1243	
  1244	        const avatarUrl = getBattleAvatarUrl(data.sender);
  1245	        const plainSenderName = getBattlePlainName(data.sender) || data.senderName || 'عضو';
  1246	        const plainReceiverName = getBattlePlainName(data.receiver) || data.receiverName || 'عضو';
  1247	
  1248	        item.innerHTML = `
  1249	          <img class="bt-gift-feed-avatar" src="${avatarUrl}" referrerPolicy="origin-when-cross-origin" />
  1250	          <div class="bt-gift-feed-body">
  1251	            <div class="bt-gift-feed-name">${plainSenderName}</div>
  1252	            <div class="bt-gift-feed-text">أرسل <span class="bt-gift-feed-gift">${data.giftIcon || '🎁'} ${data.giftName}</span> إلى ${plainReceiverName}</div>
  1253	          </div>
  1254	          <div class="bt-gift-feed-qty">×${data.quantity}</div>
  1255	        `;
  1256	
  1257	        feedContainer.prepend(item);
  1258	
  1259	        // Keep at most 5 items in the feed
  1260	        const items = feedContainer.querySelectorAll('.bt-gift-feed-item');
  1261	        items.forEach((el, index) => {
  1262	          if (index >= 5) el.remove();
  1263	        });
  1264	
  1265	        // Auto remove animation
  1266	        setTimeout(() => {
  1267	          item.classList.add('fade-out');
  1268	          setTimeout(() => {
  1269	            item.remove();
  1270	          }, 600);
  1271	        }, 4000);
  1272	      }
  1273	    });
  1274	
  1275	    socket.on('battle:topSupporters', (data) => {
  1276	      const topContainer = document.getElementById('bt-top-supporters');
  1277	      if (!topContainer) return;
  1278	
  1279	      const p1List = data.player1Supporters || [];
  1280	      const p2List = data.player2Supporters || [];
  1281	
  1282	      // Combine both teams' supporters to discover top overall active sponsors
  1283	      const allSponsors = [];
  1284	      p1List.forEach(s => allSponsors.push({ ...s, target: 'p1' }));
  1285	      p2List.forEach(s => allSponsors.push({ ...s, target: 'p2' }));
  1286	      allSponsors.sort((a, b) => b.score - a.score);
  1287	
  1288	      const top3 = allSponsors.slice(0, 3);
  1289	
  1290	      if (top3.length === 0) {
  1291	        topContainer.innerHTML = '';
  1292	        return;
  1293	      }
  1294	
  1295	      let itemsHtml = '';
  1296	      top3.forEach((supp, idx) => {
  1297	        const rank = idx + 1;
  1298	        const avatarUrl = getBattleAvatarUrl(supp.user);
  1299	        const nameText = getBattlePlainName(supp.user) || 'داعم';
  1300	        const isP1 = supp.target === 'p1';
  1301	        const targetColor = isP1 ? '#38bdf8' : '#ec4899';
  1302	        const teamIndicator = isP1 ? '💙' : '💖';
  1303	
  1304	        itemsHtml += `
  1305	          <div class="bt-top-item">
  1306	            <span class="bt-top-rank" style="color: ${targetColor};">#${rank}</span>
  1307	            <img class="bt-top-avatar" src="${avatarUrl}" referrerPolicy="origin-when-cross-origin" />
  1308	            <span class="bt-top-name">${nameText} ${teamIndicator}</span>
  1309	            <span class="bt-top-score" style="color: ${targetColor}; font-weight: 900;">${supp.score}</span>
  1310	          </div>
  1311	        `;
  1312	      });
  1313	
  1314	      topContainer.innerHTML = `
  1315	        <div class="bt-top-title">🔥 كبار الداعمين</div>
  1316	        <div class="bt-top-list">
  1317	          ${itemsHtml}
  1318	        </div>
  1319	      `;
  1320	    });
  1321	
  1322	    socket.on('battle:tapEffect', (data) => {
  1323	      // Add micro visual ripples to tap
  1324	      try {
  1325	        const cardId = Number(data.receiverId) === Number(activePlayer1Id) ? 'bt-player1-card' : 'bt-player2-card';
  1326	        const cardNode = document.getElementById(cardId);
  1327	        if (cardNode) {
  1328	          cardNode.classList.add('animate-pulse');
  1329	          setTimeout(() => cardNode.classList.remove('animate-pulse'), 500);
  1330	        }
  1331	      } catch (err) {}
  1332	
  1333	      createTapAvatarBubble(data);
  1334	    });
  1335	
  1336	    socket.on('battle:support-animation', (data) => {
  1337	      handleSupportAnimationBubble(data);
  1338	    });
  1339	
  1340	    socket.on('battle:roundEnded', (data) => {
  1341	      if (currentBattle) currentBattle.status = 'break';
  1342	      const winnerId = data.roundWinnerId;
  1343	      console.log('[BattleSocket] Round ended. Winner user id:', winnerId);
  1344	
  1345	      // Mark dot index as verified
  1346	      const markWonDots = (dotContainerId, wonRoundsCount) => {
  1347	        const dots = document.querySelectorAll(`#${dotContainerId} .round-won-dot`);
  1348	        for (let i = 0; i < dots.length; i++) {
  1349	          if (i < wonRoundsCount) {
  1350	            dots[i].classList.add('won');
  1351	          }
  1352	        }
  1353	      };
  1354	
  1355	      markWonDots('bt-player1-won-badges', data.player1RoundsWon);
  1356	      markWonDots('bt-player2-won-badges', data.player2RoundsWon);
  1357	
  1358	      if (Number(winnerId) === Number(activePlayer1Id)) {
  1359	        const name1 = currentBattle ? renderBattleIdentity(currentBattle.player1) : 'اللاعب الأول';
  1360	        const rs_sb = document.getElementById('bt-status-bar'); if(rs_sb) rs_sb.innerHTML = `انتهت الجولة! فوز ${name1} بالنقاط.`;
  1361	      } else if (Number(winnerId) === Number(activePlayer2Id)) {
  1362	        const name2 = currentBattle ? renderBattleIdentity(currentBattle.player2) : 'اللاعب الثاني';
  1363	        const rs_sb = document.getElementById('bt-status-bar'); if(rs_sb) rs_sb.innerHTML = `انتهت الجولة! فوز ${name2} بالنقاط.`;
  1364	      } else {
  1365	        document.getElementById('bt-status-bar').textContent = 'انتهت الجولة بالتعادل!';
  1366	      }
  1367	
  1368	      showRoundEndedAnnouncement(data);
  1369	
  1370	      playBattleCue('win');
  1371	    });
  1372	
  1373	    socket.on('battle:cancelled', (data) => {
  1374	      if (currentBattle) currentBattle.status = 'finished';
  1375	      showBattleClassicAlert(data.reason || 'تم إلغاء التحدي الحالي.', 'warning');
  1376	      collapseBattleWidget();
  1377	    });
  1378	
  1379	    socket.on('battle:finished', (data) => {
  1380	      if (currentBattle) currentBattle.status = 'finished';
  1381	      console.log('[BattleSocket] Challenge concluded:', data);
  1382	      
  1383	      playBattleCue('win');
  1384	      
  1385	      showBattleFinalResultOverlay(data);
  1386	    });
  1387	
  1388	    window.handleBattleSync = (data) => {
  1389	      console.log('[BattleSocket] Received state sync:', data);
  1390	      if (!data || !data.hasActiveBattle) {
  1391	        if (currentBattle) {
  1392	          collapseBattleWidget();
  1393	        }
  1394	        return;
  1395	      }
  1396	      currentBattle = data;
  1397	      activeBattleId = data.battleId;
  1398	      activePlayer1Id = Number(data.player1?.userId || data.player1?.id);
  1399	      activePlayer2Id = Number(data.player2?.userId || data.player2?.id);
  1400	
  1401	      const activeMe = window.state?.currentUser?.id || 0;
  1402	      const isParticipant = Number(activeMe) === Number(activePlayer1Id) || Number(activeMe) === Number(activePlayer2Id);
  1403	      const cancelTrigger = document.getElementById('bt-cancel-challenge-btn');
  1404	      if (cancelTrigger) {
  1405	        cancelTrigger.classList.toggle('d-none', !isParticipant);
  1406	      }
  1407	
  1408	      const panel = document.getElementById(PANEL_ID);
  1409	      if (panel) {
  1410	        panel.classList.remove('d-none');
  1411	        panel.style.display = 'block';
  1412	      }
  1413	
  1414	      if (data.player1 && document.getElementById('bt-player1-name')) {
  1415	        const p1n = document.getElementById('bt-player1-name'); if(p1n) p1n.innerHTML = renderBattleIdentity(data.player1);
  1416	        setBattleAvatar('bt-player1-pic', data.player1);
  1417	      }
  1418	      if (data.player2 && document.getElementById('bt-player2-name')) {
  1419	        const p2n = document.getElementById('bt-player2-name'); if(p2n) p2n.innerHTML = renderBattleIdentity(data.player2);
  1420	        setBattleAvatar('bt-player2-pic', data.player2);
  1421	      }
  1422	
  1423	      if (document.getElementById('bt-player1-score')) {
  1424	        document.getElementById('bt-player1-score').textContent = String(data.player1Score || 0);
  1425	      }
  1426	      if (document.getElementById('bt-player2-score')) {
  1427	        document.getElementById('bt-player2-score').textContent = String(data.player2Score || 0);
  1428	      }
  1429	
  1430	      const p1 = Number(data.player1Score) || 0;
  1431	      const p2 = Number(data.player2Score) || 0;
  1432	      let pct = 50;
  1433	      if (p1 + p2 > 0) {
  1434	        pct = Math.max(5, Math.min(95, (p1 / (p1 + p2)) * 100));
  1435	      }
  1436	      if (document.getElementById('bt-progress-bar')) {
  1437	        document.getElementById('bt-progress-bar').style.width = `${pct}%`;
  1438	      }
  1439	
  1440	      const elVal = document.getElementById('bt-timer-value') || document.getElementById('bt-timer');
  1441	      if (elVal) elVal.textContent = String(data.timer || 0);
  1442	
  1443	      updateInteractiveTapButtons();
  1444	    };
  1445	
  1446	    // Auto-request sync if room is active
  1447	    const activeRoomId = window.state?.currentRoomId;
  1448	    if (activeRoomId) {
  1449	      socket.emit('battle:syncState', { roomId: Number(activeRoomId) });
  1450	    }
  1451	  };
  1452	
  1453	  const collapseBattleWidget = () => {
  1454	    activeBattleId = null;
  1455	    activePlayer1Id = null;
  1456	    activePlayer2Id = null;
  1457	    currentBattle = null;
  1458	    isBattleMinimized = false;
  1459	    clearAllSupportBubbles();
  1460	    
  1461	    const panel = document.getElementById(PANEL_ID);
  1462	    if (panel) {
  1463	      panel.classList.add('d-none');
  1464	      panel.style.display = 'none';
  1465	    }
  1466	
  1467	    const indicator = document.getElementById('battle-minimized-indicator');
  1468	    if (indicator) {
  1469	      indicator.classList.add('d-none');
  1470	    }
  1471	  };
  1472	
  1473	  const ensureGiftModalInDOM = () => {
  1474	    let overlay = document.getElementById('battle-gift-modal-overlay');
  1475	    if (overlay) return overlay;
  1476	
  1477	    overlay = document.createElement('div');
  1478	    overlay.id = 'battle-gift-modal-overlay';
  1479	    overlay.style.cssText = `
  1480	      display: none;
  1481	      position: fixed;
  1482	      top: 0;
  1483	      left: 0;
  1484	      width: 100%;
  1485	      height: 100%;
  1486	      background: rgba(0, 0, 0, 0.7);
  1487	      backdrop-filter: blur(5px);
  1488	      -webkit-backdrop-filter: blur(5px);
  1489	      z-index: 99999;
  1490	      justify-content: center;
  1491	      align-items: center;
  1492	      direction: rtl;
  1493	      font-family: 'Tajawal', sans-serif;
  1494	    `;
  1495	
  1496	    overlay.innerHTML = `
  1497	      <div style="background: #0f172a; border: 2px solid rgba(255, 255, 255, 0.1); border-radius: 12px; width: 95%; max-width: 450px; padding: 20px; box-shadow: 0 15px 30px rgba(0, 0, 0, 0.5); color: #f8fafc; position: relative;">
  1498	        <!-- Modal Header -->
  1499	        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 15px; margin-bottom: 15px;">
  1500	          <h5 style="margin: 0; font-size: 16px; font-weight: 700; color: #eab308; display: flex; align-items: center; gap: 8px;">
  1501	            <span>🎁 اختر هدية دعم المتحدين</span>
  1502	          </h5>
  1503	          <button type="button" onclick="window.closeBattleGiftModal()" style="background: none; border: none; color: #94a3b8; font-size: 24px; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
  1504	        </div>
  1505	
  1506	        <!-- Modal Content with Interactive Cards -->
  1507	        <div style="text-align: right; margin-bottom: 15px;">
  1508	          <label style="font-size: 11px; color: #94a3b8; display: block; margin-bottom: 8px; font-weight: 600;">اختر المتحدي الذي تسجّل النقاط باسمه:</label>
  1509	          <div style="display: flex; gap: 12px; margin-bottom: 15px;">
  1510	            <!-- Player 1 Card -->
  1511	            <div id="bt-modal-card-p1" class="bt-modal-player-card" onclick="window.selectBattleSupportPlayer('player1')" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px; border-radius: 10px; background: rgba(30, 41, 59, 0.5); border: 2px solid transparent; cursor: pointer; position: relative; transition: all 0.2s ease;">
  1512	              <img id="bt-modal-img-p1" src="" class="rounded-circle" style="width: 44px; height: 44px; border: 2px solid #3b82f6; margin-bottom: 6px; object-fit: cover;" referrerpolicy="no-referrer">
  1513	              <div id="bt-modal-name-p1" class="text-truncate w-full text-center" style="font-size: 12px; font-weight: 700; color: #f8fafc;"></div>
  1514	              <div id="bt-modal-desc-p1" style="font-size: 9px; color: #94a3b8; margin-top: 4px; text-align: center;">ادعم المتحدي بالنقاط!</div>
  1515	            </div>
  1516	            <!-- Player 2 Card -->
  1517	            <div id="bt-modal-card-p2" class="bt-modal-player-card" onclick="window.selectBattleSupportPlayer('player2')" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px; border-radius: 10px; background: rgba(30, 41, 59, 0.5); border: 2px solid transparent; cursor: pointer; position: relative; transition: all 0.2s ease;">
  1518	              <img id="bt-modal-img-p2" src="" class="rounded-circle" style="width: 44px; height: 44px; border: 2px solid #ec4899; margin-bottom: 6px; object-fit: cover;" referrerpolicy="no-referrer">
  1519	              <div id="bt-modal-name-p2" class="text-truncate w-full text-center" style="font-size: 12px; font-weight: 700; color: #f8fafc;"></div>
  1520	              <div id="bt-modal-desc-p2" style="font-size: 9px; color: #94a3b8; margin-top: 4px; text-align: center;">ادعم الثاني بالنقاط!</div>
  1521	            </div>
  1522	          </div>
  1523	          <!-- Hidden slot input -->
  1524	          <input type="hidden" id="bt-selected-support-slot" value="">
  1525	        </div>
  1526	
  1527	        <!-- Gift Catalog Grid -->
  1528	        <div id="bt-modal-gifts-container" class="battle-gift-selection-grid select-gifts-scroller" style="max-height: 200px; overflow-y: auto; margin-bottom: 15px; padding-right: 5px;">
  1529	          <!-- Items populated dynamically -->
  1530	        </div>
  1531	
  1532	        <!-- Custom Pricing Table / Quantity Options -->
  1533	        <div class="row align-items-center" style="margin-top: 15px;">
  1534	          <div class="col-7">
  1535	            <div class="input-group input-group-sm">
  1536	              <span class="input-group-text bg-dark text-white-50 border-secondary" style="font-size: 12px;">الكمية</span>
  1537	              <input type="number" id="bt-gift-qty-input" class="form-control bg-dark text-white border-secondary" value="1" min="1" max="100" style="font-size: 13px;">
  1538	            </div>
  1539	          </div>
  1540	          <div class="col-5 text-end text-warning fw-bold" id="bt-gift-total-cost-preview" style="font-size: 13px;">
  1541	            كوينز: 0
  1542	          </div>
  1543	        </div>
  1544	
  1545	        <!-- Gift Summary Preview -->
  1546	        <div id="bt-gift-summary-block" style="background: rgba(15, 23, 42, 0.8); border: 1px dashed rgba(255,255,255,0.15); border-radius: 8px; padding: 10px; margin-top: 15px; display: none; font-size: 11px; line-height: 1.5; color: #cbd5e1; text-align: right;">
  1547	          <!-- Dynamically populated -->
  1548	        </div>
  1549	
  1550	        <!-- Foot Action Buttons -->
  1551	        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 15px;">
  1552	          <button type="button" onclick="window.submitBattleGift()" class="btn btn-warning btn-sm fw-bold" style="background: #eab308; color: #1e1b4b; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;" id="bt-submit-gift-btn">🚀 تقديم الدعم السخي</button>
  1553	          <button type="button" onclick="window.closeBattleGiftModal()" class="btn btn-secondary btn-sm" style="background: #475569; color: #f8fafc; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;">إلغاء</button>
  1554	        </div>
  1555	      </div>
  1556	    `;
  1557	
  1558	    document.body.appendChild(overlay);
  1559	    return overlay;
  1560	  };
  1561	
  1562	  window.closeBattleGiftModal = () => {
  1563	    const overlay = document.getElementById('battle-gift-modal-overlay');
  1564	    if (overlay) {
  1565	      overlay.style.display = 'none';
  1566	    }
  1567	  };
  1568	
  1569	  window.submitBattleGift = () => {
  1570	    const slotInput = document.getElementById('bt-selected-support-slot');
  1571	    const receiverSlot = slotInput ? slotInput.value : '';
  1572	    const qtyInput = document.getElementById('bt-gift-qty-input');
  1573	    const quantity = Math.max(1, Number(qtyInput ? qtyInput.value : 1));
  1574	    const giftKey = window.selectedGiftKey;
  1575	
  1576	    const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);
  1577	    const p1Disabled = meId && Number(meId) === Number(activePlayer1Id);
  1578	    const p2Disabled = meId && Number(meId) === Number(activePlayer2Id);
  1579	
  1580	    if (p1Disabled && p2Disabled) {
  1581	      showBattleClassicAlert('لا يمكنك دعم لاعبين أنت أحدهم.', 'warning');
  1582	      return;
  1583	    }
  1584	
  1585	    if (!receiverSlot) {
  1586	      showBattleClassicAlert('الرجاء اختيار مستلم الهدية بالنقر على بطاقته أولاً.', 'warning');
  1587	      return;
  1588	    }
  1589	
  1590	    let receiverId = null;
  1591	    if (receiverSlot === 'player1') {
  1592	      receiverId = Number(activePlayer1Id);
  1593	    } else if (receiverSlot === 'player2') {
  1594	      receiverId = Number(activePlayer2Id);
  1595	    }
  1596	
  1597	    if (meId && Number(meId) === Number(receiverId)) {
  1598	      showBattleClassicAlert('لا يمكنك دعم نفسك.', 'warning');
  1599	      return;
  1600	    }
  1601	
  1602	    if (!giftKey) {
  1603	      showBattleClassicAlert('الرجاء اختيار هدية من الشبكة أولاً!', 'warning');
  1604	      return;
  1605	    }
  1606	
  1607	    const opId = generateOperationId('gift');
  1608	
  1609	    console.log('[BattleUI] Final gift payload:', {
  1610	      battleId: activeBattleId,
  1611	      receiverSlot,
  1612	      giftKey,
  1613	      quantity,
  1614	      operationId: opId
  1615	    });
  1616	
  1617	    window.socket.emit('battle:sendGift', {
  1618	      battleId: activeBattleId,
  1619	      receiverSlot,
  1620	      giftKey,
  1621	      quantity,
  1622	      operationId: opId
  1623	    });
  1624	
  1625	    window.closeBattleGiftModal();
  1626	  };
  1627	
  1628	  // Selection toggle callbacks
  1629	  window.selectBattleSupportPlayer = (slot) => {
  1630	    const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);
  1631	    const isP1 = slot === 'player1';
  1632	    
  1633	    // Check if they are trying to support themselves
  1634	    if (isP1 && meId && Number(meId) === Number(activePlayer1Id)) {
  1635	      showBattleClassicAlert('لا يمكنك دعم نفسك.', 'warning');
  1636	      return;
  1637	    }
  1638	    if (!isP1 && meId && Number(meId) === Number(activePlayer2Id)) {
  1639	      showBattleClassicAlert('لا يمكنك دعم نفسك.', 'warning');
  1640	      return;
  1641	    }
  1642	
  1643	    const input = document.getElementById('bt-selected-support-slot');
  1644	    if (input) input.value = slot;
  1645	
  1646	    // Apply Highlight borders
  1647	    const card1 = document.getElementById('bt-modal-card-p1');
  1648	    const card2 = document.getElementById('bt-modal-card-p2');
  1649	
  1650	    if (card1 && card2) {
  1651	      if (isP1) {
  1652	        card1.style.border = '2px solid #3b82f6';
  1653	        card1.style.background = 'rgba(59, 130, 246, 0.15)';
  1654	        card2.style.border = '2px solid transparent';
  1655	        card2.style.background = 'rgba(30, 41, 59, 0.5)';
  1656	      } else {
  1657	        card2.style.border = '2px solid #ec4899';
  1658	        card2.style.background = 'rgba(236, 72, 153, 0.15)';
  1659	        card1.style.border = '2px solid transparent';
  1660	        card1.style.background = 'rgba(30, 41, 59, 0.5)';
  1661	      }
  1662	    }
  1663	
  1664	    window.updateGiftModalReaction();
  1665	  };
  1666	
  1667	  window.updateGiftModalReaction = () => {
  1668	    const slotInput = document.getElementById('bt-selected-support-slot');
  1669	    const slot = slotInput ? slotInput.value : '';
  1670	    const qtyInput = document.getElementById('bt-gift-qty-input');
  1671	    const quantity = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;
  1672	    
  1673	    const sendBtn = document.getElementById('bt-submit-gift-btn');
  1674	    const summaryBlock = document.getElementById('bt-gift-summary-block');
  1675	
  1676	    if (!slot || !currentBattle) {
  1677	      if (sendBtn) {
  1678	        sendBtn.innerText = '🚀 تقديم الدعم السخي';
  1679	        sendBtn.style.background = '#eab308';
  1680	        sendBtn.style.color = '#1e1b4b';
  1681	      }
  1682	      if (summaryBlock) summaryBlock.style.display = 'none';
  1683	      return;
  1684	    }
  1685	
  1686	    const isP1 = slot === 'player1';
  1687	    const selectedPlayerName = isP1 ? getBattlePlainName(currentBattle.player1) : getBattlePlainName(currentBattle.player2);
  1688	    
  1689	    // Update Button
  1690	    if (sendBtn) {
  1691	      sendBtn.innerText = `👍 دعم ${selectedPlayerName}`;
  1692	      if (isP1) {
  1693	        sendBtn.style.background = '#3b82f6';
  1694	        sendBtn.style.color = '#ffffff';
  1695	      } else {
  1696	        sendBtn.style.background = '#ec4899';
  1697	        sendBtn.style.color = '#ffffff';
  1698	      }
  1699	    }
  1700	
  1701	    // Find selected gift in catalog
  1702	    const catalogGift = window.selectedGiftKey;
  1703	    const price = window.selectedGiftPrice || 0;
  1704	    const totalCost = price * quantity;
  1705	
  1706	    if (catalogGift && summaryBlock) {
  1707	      let giftName = catalogGift;
  1708	      const selectedCard = document.querySelector('.battle-gift-card.selected');
  1709	      if (selectedCard) {
  1710	        const nameEl = selectedCard.querySelector('.battle-gift-name-view');
  1711	        if (nameEl) giftName = nameEl.textContent;
  1712	      }
  1713	
  1714	      summaryBlock.innerHTML = `سوف ترسل هدية: <strong style="color: #ffffff;">${giftName}</strong>، الكمية: <strong style="color: #ffffff;">${quantity}</strong>، التكلفة الإجمالية: <strong style="color: #fbbf24;">${totalCost}</strong> كوينز لصالح المتحدي <strong style="color: #ffffff;">${selectedPlayerName}</strong>.`;
  1715	      summaryBlock.style.display = 'block';
  1716	    } else {
  1717	      if (summaryBlock) summaryBlock.style.display = 'none';
  1718	    }
  1719	  };
  1720	
  1721	  // Open beautifully formatted gift catalog modal inside workspace
  1722	  window.openBattleGiftSelectionModal = () => {
  1723	    if (!activeBattleId) {
  1724	      showBattleClassicAlert('لا يوجد تحدي قائم حالياً.', 'warning');
  1725	      return;
  1726	    }
  1727	
  1728	    if (!currentBattle) {
  1729	      showBattleClassicAlert('لا توجد بيانات تحدي نشطة حاليًا.', 'warning');
  1730	      return;
  1731	    }
  1732	
  1733	    if (currentBattle.status !== 'active') {
  1734	      showBattleClassicAlert('لا يمكن إرسال الدعم إلا أثناء الجولة النشطة.', 'warning');
  1735	      return;
  1736	    }
  1737	
  1738	    // Emit event requesting gift catalog
  1739	    window.socket.emit('battle:getGiftCatalog', (res) => {
  1740	      if (!res || !res.success) {
  1741	        showBattleClassicAlert(res.message || 'تعذر تحميل كتالوج الهدايا.', 'warning');
  1742	        return;
  1743	      }
  1744	
  1745	      const catalog = res.catalog || [];
  1746	      if (catalog.length === 0) {
  1747	        showBattleClassicAlert('كتالوج الهدايا فارغ.', 'warning');
  1748	        return;
  1749	      }
  1750	
  1751	      // Ensure modal container in DOM
  1752	      const overlay = ensureGiftModalInDOM();
  1753	
  1754	      // Render catalog UI to grid
  1755	      let cardsHtml = '';
  1756	      catalog.forEach((gift) => {
  1757	        cardsHtml += `
  1758	          <div class="battle-gift-card" onclick="window.selectBattleGiftingCard(event, '${gift.key}', ${gift.price})">
  1759	            <span class="battle-gift-icon-view">${gift.icon || '🎁'}</span>
  1760	            <span class="battle-gift-name-view">${gift.name}</span>
  1761	            <span class="battle-gift-price-view"><i class="fas fa-star"></i> ${gift.price} كوينز</span>
  1762	          </div>
  1763	        `;
  1764	      });
  1765	      document.getElementById('bt-modal-gifts-container').innerHTML = cardsHtml;
  1766	
  1767	      // Render Active Player details inside Cards
  1768	      const p1Plain = getBattlePlainName(currentBattle.player1);
  1769	      const p2Plain = getBattlePlainName(currentBattle.player2);
  1770	      
  1771	      document.getElementById('bt-modal-name-p1').innerHTML = renderBattleIdentity(currentBattle.player1);
  1772	      document.getElementById('bt-modal-name-p2').innerHTML = renderBattleIdentity(currentBattle.player2);
  1773	
  1774	      const imgP1 = document.getElementById('bt-modal-img-p1');
  1775	      const imgP2 = document.getElementById('bt-modal-img-p2');
  1776	      if (imgP1) imgP1.src = getBattleAvatarUrl(currentBattle.player1);
  1777	      if (imgP2) imgP2.src = getBattleAvatarUrl(currentBattle.player2);
  1778	
  1779	      // Disable self-support
  1780	      const meId = Number(window.state?.currentUser?.id || window.currentUser?.id || 0);
  1781	      const p1Self = meId && Number(meId) === Number(activePlayer1Id);
  1782	      const p2Self = meId && Number(meId) === Number(activePlayer2Id);
  1783	
  1784	      const card1 = document.getElementById('bt-modal-card-p1');
  1785	      const card2 = document.getElementById('bt-modal-card-p2');
  1786	      
  1787	      let preSelectedSlot = '';
  1788	
  1789	      if (card1 && card2) {
  1790	        // Reset styles first
  1791	        card1.style.opacity = '1';
  1792	        card1.style.cursor = 'pointer';
  1793	        document.getElementById('bt-modal-desc-p1').textContent = `ادعم ${p1Plain} بالنقاط!`;
  1794	        document.getElementById('bt-modal-desc-p1').style.color = '#94a3b8';
  1795	
  1796	        card2.style.opacity = '1';
  1797	        card2.style.cursor = 'pointer';
  1798	        document.getElementById('bt-modal-desc-p2').textContent = `ادعم ${p2Plain} بالنقاط!`;
  1799	        document.getElementById('bt-modal-desc-p2').style.color = '#94a3b8';
  1800	
  1801	        if (p1Self) {
  1802	          card1.style.opacity = '0.4';
  1803	          card1.style.cursor = 'not-allowed';
  1804	          document.getElementById('bt-modal-desc-p1').textContent = '🔒 لا يمكنك دعم نفسك';
  1805	          document.getElementById('bt-modal-desc-p1').style.color = '#ef4444';
  1806	          preSelectedSlot = 'player2';
  1807	        }
  1808	        if (p2Self) {
  1809	          card2.style.opacity = '0.4';
  1810	          card2.style.cursor = 'not-allowed';
  1811	          document.getElementById('bt-modal-desc-p2').textContent = '🔒 لا يمكنك دعم نفسك';
  1812	          document.getElementById('bt-modal-desc-p2').style.color = '#ef4444';
  1813	          preSelectedSlot = 'player1';
  1814	        }
  1815	
  1816	        if (!p1Self && !p2Self) {
  1817	          preSelectedSlot = 'player1'; // Default
  1818	        }
  1819	      }
  1820	
  1821	      // Reset state variables inside dialog
  1822	      window.selectedGiftKey = null;
  1823	      window.selectedGiftPrice = 0;
  1824	      const preview = document.getElementById('bt-gift-total-cost-preview');
  1825	      if (preview) {
  1826	        preview.textContent = 'كوينز: 0';
  1827	      }
  1828	      
  1829	      const qtyInput = document.getElementById('bt-gift-qty-input');
  1830	      if (qtyInput) {
  1831	        qtyInput.value = '1';
  1832	        qtyInput.oninput = () => {
  1833	          const q = Math.max(1, parseInt(qtyInput.value) || 1);
  1834	          const previewPr = document.getElementById('bt-gift-total-cost-preview');
  1835	          if (previewPr) {
  1836	            previewPr.textContent = `كوينز: ${window.selectedGiftPrice * q}`;
  1837	          }
  1838	          window.updateGiftModalReaction();
  1839	        };
  1840	      }
  1841	
  1842	      // Pre-select allowed slot
  1843	      if (preSelectedSlot) {
  1844	        window.selectBattleSupportPlayer(preSelectedSlot);
  1845	      } else {
  1846	        const slotInput = document.getElementById('bt-selected-support-slot');
  1847	        if (slotInput) slotInput.value = '';
  1848	        window.updateGiftModalReaction();
  1849	      }
  1850	
  1851	      // Show modal overlay
  1852	      overlay.style.display = 'flex';
  1853	    });
  1854	  };
  1855	
  1856	  window.selectBattleGiftingCard = (event, key, price) => {
  1857	    window.selectedGiftKey = key;
  1858	    window.selectedGiftPrice = Number(price);
  1859	
  1860	    // Update active highlight classes
  1861	    document.querySelectorAll('.battle-gift-card').forEach((card) => {
  1862	      card.classList.remove('selected');
  1863	    });
  1864	
  1865	    const targetCard = event.currentTarget;
  1866	    if (targetCard) {
  1867	      targetCard.classList.add('selected');
  1868	    }
  1869	
  1870	    // Update pricing text preview
  1871	    const qtyInput = document.getElementById('bt-gift-qty-input');
  1872	    const q = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;
  1873	    const preview = document.getElementById('bt-gift-total-cost-preview');
  1874	    if (preview) {
  1875	      preview.textContent = `كوينز: ${Number(price) * q}`;
  1876	    }
  1877	
  1878	    window.updateGiftModalReaction();
  1879	  };
  1880	
  1881	  window.cancelActiveBattle = () => {
  1882	    const room = window.state ? window.state.currentRoomId : 0;
  1883	    if (room) {
  1884	      window.socket.emit('battle:cancel', { roomId: Number(room) });
  1885	    }
  1886	  };
  1887	
  1888	  // Mount listeners on script load
  1889	  const setupOnReady = () => {
  1890	    wireUpInteractiveTaps();
  1891	    hookSocketInboundEvents();
  1892	    initializeProfileTrigger();
  1893	
  1894	    // Hook minimize button
  1895	    const minBtn = document.getElementById('bt-minimize-btn');
  1896	    if (minBtn) {
  1897	      minBtn.addEventListener('click', (e) => {
  1898	        e.stopPropagation();
  1899	        toggleBattleMinimization(true);
  1900	      });
  1901	    }
  1902	
  1903	    // Hook floating live badge restore
  1904	    const miniInd = document.getElementById('battle-minimized-indicator');
  1905	    if (miniInd) {
  1906	      miniInd.addEventListener('click', () => {
  1907	        toggleBattleMinimization(false);
  1908	      });
  1909	    }
  1910	
  1911	
  1912	    // Hook user profile inspection changes
  1913	    const profileModalEl = document.getElementById('userProfileModal');
  1914	    if (profileModalEl) {
  1915	      profileModalEl.addEventListener('shown.bs.modal', function () {
  1916	        initializeProfileTrigger();
  1917	      });
  1918	    }
  1919	  };
  1920	
  1921	  if (document.readyState === 'loading') {
  1922	    document.addEventListener('DOMContentLoaded', setupOnReady);
  1923	  } else {
  1924	    setupOnReady();
  1925	  }
  1926	})();
  1927	