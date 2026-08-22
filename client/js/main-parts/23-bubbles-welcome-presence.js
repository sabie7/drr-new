/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 23/28 · bubbles-welcome-presence
   lines 8466–9103 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function createStarBubble(element) {
  const star = document.createElement('i');
  star.className = 'fas fa-star star-bubble';
  
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top;
  
  star.style.left = `${x}px`;
  star.style.top = `${y}px`;
  star.style.color = '#ffc107';
  
  document.body.appendChild(star);
  
  setTimeout(() => {
    star.remove();
  }, 1000);
}

function createHeartBubble(element) {
  const heart = document.createElement('i');
  heart.className = 'fas fa-heart heart-bubble';
  
  // Position the heart relative to the button
  const rect = element.getBoundingClientRect();
  heart.style.left = `${rect.left + rect.width / 2}px`;
  heart.style.top = `${rect.top}px`;
  
  document.body.appendChild(heart);
  
  // Remove heart after animation
  setTimeout(() => {
    heart.remove();
  }, 1000);
}

socket.on('message', (data) => {
  appendMessage(data);
});

socket.on('presence:room-history', (data) => {
  if (!data || data.recovered !== true) return;
  if (!Array.isArray(data.messages)) return;
  
  if (Number(data.roomId) !== Number(state.currentRoomId)) return;

  // 1. استخدم آخر 50 رسالة فقط عبر slice(-50)
  const messagesToMerge = data.messages.slice(-50);

  // 2. رتب النسخة زمنيًا حسب createdAt أو timestamp
  // لا تعدّل المصفوفة الأصلية القادمة من السيرفر
  const sortedMessages = [...messagesToMerge].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : Number(a.timestamp || 0);
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : Number(b.timestamp || 0);
    return timeA - timeB;
  });

  // 3. حافظ على موضع التمرير قدر الإمكان
  const chatScroller = ui.messagesContainer || document.getElementById('messages-container');
  const previousScrollHeight = chatScroller ? chatScroller.scrollHeight : 0;
  const previousScrollTop = chatScroller ? chatScroller.scrollTop : 0;
  const isAtBottom = chatScroller ? (chatScroller.scrollHeight - chatScroller.scrollTop - chatScroller.clientHeight < 300) : false;

  let anyAdded = false;

  sortedMessages.forEach(msg => {
    if (!msg || !msg.id) return;

    // طبّع جميع المعرّفات باستخدام String(msg.id)
    const msgIdStr = String(msg.id);

    // استخدم String() عند فحص DOM وعند فحص publicMessageQueue
    // امنع تكرار الرسالة سواء كانت في DOM أو صف الانتظار
    const existsInDom = document.querySelector(`.message-row[data-id="${msgIdStr}"]`);
    if (existsInDom) return;

    const existsInQueue = publicMessageQueue.some(item => item.data && String(item.data.id) === msgIdStr);
    if (existsInQueue) return;

    // لا تضف رسالة قديمة بعد رسالة أحدث
    const msgTime = msg.createdAt ? new Date(msg.createdAt).getTime() : Number(msg.timestamp || 0);
    let isOlderThanNewest = false;
    
    // Check DOM for newer
    const domRows = document.querySelectorAll('.message-row[data-id]');
    for (const row of domRows) {
      const rowTimeAttr = row.querySelector('.message-time')?.getAttribute('data-created-at');
      if (rowTimeAttr) {
        const rowTime = new Date(rowTimeAttr).getTime();
        if (rowTime > msgTime) {
          isOlderThanNewest = true;
          break;
        }
      }
    }
    
    // Check publicMessageQueue for newer
    if (!isOlderThanNewest) {
      for (const item of publicMessageQueue) {
        if (item.data) {
          const itemTime = item.data.createdAt ? new Date(item.data.createdAt).getTime() : Number(item.data.timestamp || 0);
          if (itemTime > msgTime) {
            isOlderThanNewest = true;
            break;
          }
        }
      }
    }

    if (isOlderThanNewest) {
      return;
    }

    // أضف الرسائل المفقودة بالترتيب الزمني
    appendMessage(msg);
    anyAdded = true;
  });

  if (anyAdded && chatScroller) {
    requestAnimationFrame(() => {
      if (isAtBottom) {
        chatScroller.scrollTop = chatScroller.scrollHeight;
      } else {
        const heightDifference = chatScroller.scrollHeight - previousScrollHeight;
        chatScroller.scrollTop = previousScrollTop + heightDifference;
      }
    });
  }
});

socket.on('system-message', (data) => {
  appendSystemMessage(data);
});

socket.on('voice:state', () => {
  setTimeout(() => {
    if (typeof window.applyMicStateBadges === 'function') window.applyMicStateBadges();
  }, 30);
});

socket.on('voice:mic-status', () => {
  setTimeout(() => {
    if (typeof window.applyMicStateBadges === 'function') window.applyMicStateBadges();
  }, 30);
});

// Use a flag to avoid handling multiple welcome events for the same user rapidly
const handledWelcomes = new Set();

socket.on('user-auto-welcome', (data) => {
  if (!data || !data.user) return;
  
  // Prevent duplicate welcome messages for the same user within a short timeframe
  const welcomeKey = data.user.id + '-' + data.user.username;
  if (handledWelcomes.has(welcomeKey)) return;
  
  handledWelcomes.add(welcomeKey);
  setTimeout(() => handledWelcomes.delete(welcomeKey), 10000); // 10 seconds cooldown

  // Add a small delay to ensure it appears after the system join message
  setTimeout(() => {
    createAutomaticWelcomeElement(data);
  }, 250);
});

function createAutomaticWelcomeElement(data) {
  const container = ui.messagesContainer || document.getElementById('messages-container');
  if (!container || !data?.user) return;

  const targetIdStr = String(data.user.id || data.user.userId || '');
  const liveUser = (typeof state !== 'undefined' && Array.isArray(state.currentUsers)) ?
      state.currentUsers.find(u => String(u.userId ?? u.id ?? '') === targetIdStr || u.username === data.user.username) : null;

  const userData = liveUser ? { ...data.user, ...liveUser } : {
      ...data.user,
      topic: data.user.topic || data.user.displayName || data.user.username,
      pic: data.user.pic || data.user.profileImage
  };

  const identityHtml = typeof window.renderUserIdentity === 'function' ? 
      window.renderUserIdentity(userData, {
          tag: 'span',
          nameClasses: 'message-username'
      }) : 
      `<span style="color: ${data.textColor || '#1b5e20'}; font-weight: bold;">${escapeHTML(userData.topic || userData.username || 'مستخدم')}</span>`;

  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'message-row system-message-row';
  welcomeDiv.style.minHeight = '50px';
  welcomeDiv.style.backgroundColor = data.bgColor || '#ffffff';
  welcomeDiv.style.direction = 'ltr';
  welcomeDiv.style.paddingLeft = '0';
  
  const systemAvatar = window.getSystemMessageImageUrl(data.image);
  const titleColor = data.titleColor || '#2e7d32';
  const textColor = data.textColor || '#1b5e20';
  const title = data.title || 'الترحيب الآلي';
  const prefixText = data.prefixText || 'أهلاً وسهلاً، نورت يا';

  welcomeDiv.innerHTML = `
    <img src="${systemAvatar}" class="message-avatar" referrerPolicy="origin-when-cross-origin" style="width: 50px; height: 50px; object-fit: cover; border-radius: 0; flex-shrink: 0; margin-right: 1px; align-self: flex-start !important;">
    <div class="message-body" style="padding: 4px 6px; border: none; flex-grow: 1; background-color: transparent;">
      <div class="message-header" style="margin-bottom: 2px; display: flex; align-items: center;">
         <span class="message-username" style="color: ${titleColor} !important; font-weight: bold;">${escapeHTML(title)}</span>
      </div>
      <div class="message-text" style="color: ${textColor}; display: flex; align-items: center; gap: 4px; flex-direction: row-reverse; justify-content: flex-end; flex-wrap: wrap;">
        <span>${escapeHTML(prefixText)}</span>
        ${identityHtml}
      </div>
    </div>
  `;

  const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 50;

  container.appendChild(welcomeDiv);

  if (isScrolledToBottom) {
      container.scrollTop = container.scrollHeight;
  }
}

socket.on('new-story', () => {
  if (typeof window.fetchStories === 'function') {
    window.fetchStories();
  }
});

socket.on('error', (msg) => {
  if (msg && (msg.includes('لايك') || msg.includes('requiredLikes'))) {
    showLikesLimitAlert(msg);
  } else {
    Swal.fire('تنبيه', msg, 'error');
  }
});

socket.on('alert', ({ title, text, html, icon, timer }) => {
  const message = text || html || '';
  if (message && (message.includes('لايك') || message.includes('requiredLikes'))) {
    showLikesLimitAlert(message);
    return;
  }
  if (timer && timer > 0) {
    let timerInterval;
    
    const formatTime = (ms) => {
      if (ms === undefined || isNaN(ms)) return '...';
      const totalSeconds = Math.ceil(ms / 1000);
      if (totalSeconds >= 60) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes} دقيقة و ${seconds} ثانية`;
      }
      return `${totalSeconds} ثانية`;
    };

    Swal.fire({
      title: title,
      html: `${html || text}<br><br><div style="display: flex; flex-direction: column; align-items: center; gap: 5px;"><span id="timer-display" style="color: red; font-size: 2em; font-weight: bold;">${Math.ceil(timer / 1000)}</span><span style="font-size: 1em;">يرجى الانتظار</span></div>`,
      icon: icon || 'info',
      timer: timer,
      timerProgressBar: true,
      showConfirmButton: false,
      allowOutsideClick: false,
      didOpen: () => {
        const startTime = Date.now();
        const b = document.getElementById('timer-display');
        if (b) {
          timerInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const timeLeft = Math.max(0, timer - elapsed);
            b.textContent = Math.ceil(timeLeft / 1000);
            if (timeLeft === 0) {
              clearInterval(timerInterval);
            }
          }, 100);
        }
      },
      willClose: () => {
        clearInterval(timerInterval);
      }
    });
  } else {
    Swal.fire({
      title: title,
      html: html || text,
      icon: icon || 'info'
    });
  }
});

socket.on('alert:show', ({ text, msg }) => {
  Swal.fire({
    title: 'إعلان',
    text: text || msg || '',
    icon: 'info'
  });
});



// Handle signaling
socket.on('room-chat-cleared', ({ username, pic, topic, msg, superIcon, global, message }) => {
  if (ui.messagesContainer) {
    let displayContent = '';
    
    if (global) {
       displayContent = window.renderUserIdentity({ username, topic }, { containerClasses: 'chat-cleared-user' });
       ui.messagesContainer.innerHTML = `
        <div class="chat-cleared-container animated fadeIn">
          <div class="chat-cleared-avatar-wrapper">
            <img src="/img/icon.png" class="chat-cleared-avatar" onerror="this.src='/img/default-avatar.png'">
            <div class="chat-cleared-badge">
              <i class="fas fa-broom"></i>
            </div>
          </div>
          ${displayContent}
          <div class="chat-cleared-title">${message || 'تم مسح جميع الرسائل والمرفقات في كافة الغرف من قبل الإدارة'}</div>
        </div>
      `;
    } else {
      if (superIcon) {
        displayContent = `<img src="${superIcon}" class="chat-cleared-banner" alt="Banner">`;
      } else {
        const bannerText = (msg && msg !== 'Hello there!') ? msg : null;
        displayContent = window.renderUserIdentity({ username, topic }, { containerClasses: 'chat-cleared-user' });
      }
      
      ui.messagesContainer.innerHTML = `
        <div class="chat-cleared-container animated fadeIn">
          <div class="chat-cleared-avatar-wrapper">
            <img src="${pic || '/img/default-avatar.png'}" class="chat-cleared-avatar" alt="${username}" onerror="this.src='/img/default-avatar.png'">
            <div class="chat-cleared-badge">
              <i class="fas fa-broom"></i>
            </div>
          </div>
          ${displayContent}
          <div class="chat-cleared-title">قام بمسح جميع رسائل الدردشة في الغرفة</div>
        </div>
      `;
    }
    
    // Auto-scroll to show the design
    ui.messagesContainer.scrollTop = ui.messagesContainer.scrollHeight;
  }
});

socket.on('wall_cleared', () => {
    const container = document.getElementById('wall-posts-container');
    if (container) {
        container.innerHTML = '<div id="no-posts-msg" class="text-center p-4 text-muted">تم تفريغ الحائط وتنظيف الملفات من قبل الإدارة</div>';
    }
    // Force reload wall if function exists
    if (typeof loadWall === 'function') loadWall();
});

socket.on('stories_cleared', () => {
    // Both containers might be used depending on the view
    ['stories-list', 'wall-stories-container', 'users-stories-container'].forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = '';
        }
    });

    // Close viewer if open
    if (typeof closeStoryViewer === 'function') closeStoryViewer();

    // Directly clear state if stories manager is active
    if (typeof stories !== 'undefined') {
        stories = [];
        if (typeof renderStoriesBar === 'function') renderStoriesBar('wall-stories-container');
    }
    
    // Refresh to be safe
    if (typeof fetchStories === 'function') fetchStories();
});

socket.on('global_private_chat_cleared', () => {
    const messagesList = document.getElementById('private_chat_messages_list');
    if (messagesList) {
        messagesList.innerHTML = '<div class="text-center p-5 text-muted"><i class="fas fa-broom fa-3x mb-3"></i><br>تم مسح كافة المحادثات الخاصة من قبل الإدارة</div>';
    }
    // If a private chat is open, we might want to clear state
    if (state.activePrivateChat) {
        state.setActivePrivateChat(null);
        updatePrivateChatUI();
    }
});

socket.on('delete-message', ({ id }) => {
  const msgDiv = document.querySelector(`.message-row[data-id="${String(id)}"]`);
  if (msgDiv) {
    msgDiv.remove();
  }
});


let lastSnapshotReqTime = 0;
function safeRequestUsersSnapshot() {
  const now = Date.now();
  if (now - lastSnapshotReqTime < 2000) return;
  lastSnapshotReqTime = now;
  if (typeof socket !== 'undefined' && socket && socket.emit) {
    socket.emit('request-users-snapshot');
  }
}

socket.on('users-snapshot', (payload) => {
  const version = payload && payload.version ? payload.version : null;
  const users = payload && payload.users ? payload.users : (Array.isArray(payload) ? payload : []);
  updateUsersSnapshot(version, users);
  if (window.PrivateChatManager && typeof window.PrivateChatManager.applyPresenceSnapshot === 'function') {
    window.PrivateChatManager.applyPresenceSnapshot(users);
  }
});

socket.on('users-patch', ({ version, upserts, removes }) => {
  updateUsersPatch(version, upserts, removes);
  if (window.PrivateChatManager && typeof window.PrivateChatManager.applyPresencePatch === 'function') {
    window.PrivateChatManager.applyPresencePatch(upserts, removes);
  }
});

socket.on('connect', () => {
  safeRequestUsersSnapshot();
});

if (socket && socket.connected) {
  safeRequestUsersSnapshot();
}

socket.on('init-config', (data) => {
  setTimeout(updateFilterMonitorVisibility, 500);
  setTimeout(renderZajelTicker, 1000);
  state.setWaitingRoomId(data.waitingRoomId);
  state.setGeneralRoomId(data.GENERAL_ROOM_ID || 1);
  // Re-verify isInWaitingRoom since waitingRoomId just became available
  state.setCurrentRoomId(state.currentRoomId);
  console.log('Received init-config:', data);
});

socket.on('rooms-stats', (stats) => {
  window.roomsStats = stats;
  if (state.activeSidebarTab === 'rooms' && state.rooms) {
    renderRoomsInSidebar(state.rooms);
  }
});

socket.on('room-deleted', ({ id }) => {
  const normId = String(id);
  if (window.roomsData && window.roomsData[normId]) {
    delete window.roomsData[normId];
    if (typeof state.setRooms === 'function') {
      const remaining = Object.values(window.roomsData);
      state.setRooms(remaining);
      renderRoomsInSidebar(remaining);
    }
  }
});

  socket.on('likes-updated', (event) => {
    const { likes, sender, userId, id: eventUserId, username: targetUsername } = event || {};
    if (!state.currentUser) return;
    // This event targets a specific user. Only treat it as "mine" when the
    // event's userId matches the current user — otherwise other members' like
    // counts would corrupt our own counters and trigger popups for everyone.
    const myId = state.currentUser && (state.currentUser.id ?? state.currentUser.userId ?? state.currentUser.guestId);
    const isMine = (userId != null && myId != null && (String(userId) === String(myId) || String(eventUserId) === String(myId))) ||
      (targetUsername && state.currentUser.username === targetUsername);
    if (isMine) {
      state.currentUser.likes = likes;

      // Only update profile modal if it's showing the current user's profile
      if (profileUser && (profileUser.id === state.currentUser.id || profileUser.userId === state.currentUser.id || profileUser.username === state.currentUser.username)) {
        const profileLikesCount = document.getElementById('profile-likes-count');
        if (profileLikesCount) profileLikesCount.innerText = formatCompactNumber(likes);

        const likesBtnCount = document.getElementById('profile-likes-count-btn');
        if (likesBtnCount) likesBtnCount.innerText = formatCompactNumber(likes);
      }

      // Refresh settings if open
      if (document.querySelector('.classic-settings-container')) {
        renderSettings();
      }

      if (sender) {
        Swal.fire({
          title: 'إعجاب',
          html: `لقد تلقيت إعجاب من ${window.renderUserIdentity(sender, { tag: 'span' })}`,
          confirmButtonText: 'موافق'
        });

        if (typeof triggerHeartsAnimation === 'function') {
          triggerHeartsAnimation();
        }
      }
    } else if (sender && window.profileSoundManager && typeof window.profileSoundManager.playLike === 'function') {
      // A peer got liked — subtle sound cue only, never touch our counters.
      if (targetUsername && state.currentUser.username !== targetUsername) {
        window.profileSoundManager.playLike();
      }
    }
  });

  socket.on('receive-kiss', ({ sender, senderNickname }) => {
    playKissAnimation(senderNickname);
  });

  socket.on('kiss-sent', ({ targetUsername }) => {
    showToast(`تم إرسال بوسة إلى ${targetUsername}`);
  });

  socket.on('rep-updated', ({ rep, sender, targetUsername, userId, id: eventUserId }) => {
  if (!state.currentUser) return;
  const myId = state.currentUser && (state.currentUser.id ?? state.currentUser.userId ?? state.currentUser.guestId);
  const isMine = (userId != null && myId != null && (String(userId) === String(myId) || String(eventUserId) === String(myId))) ||
    (targetUsername && state.currentUser.username === targetUsername);

  if (isMine) {
    state.currentUser.rep = rep;

    // Only update profile modal if it's showing the current user's profile
    if (profileUser && (profileUser.id === state.currentUser.id || profileUser.userId === state.currentUser.id || profileUser.username === state.currentUser.username)) {
      const profileRepCount = document.getElementById('profile-rep-count');
      if (profileRepCount) profileRepCount.innerText = formatCompactNumber(rep);

      const repBtnCount = document.getElementById('profile-rep-count-btn');
      if (repBtnCount) repBtnCount.innerText = formatCompactNumber(rep);
    }

    // Refresh settings if open
    if (document.querySelector('.classic-settings-container')) {
      renderSettings();
    }

    if (sender) {
      Swal.fire({
        title: 'رصيد الكوينز',
        html: `لقد تلقيت كوينز من ${window.renderUserIdentity(sender, { tag: 'span' })}<br><br>مجموع رصيدك: <strong>${formatCompactNumber(rep)}</strong>`,
        confirmButtonText: 'موافق'
      });
    }
  }
});

socket.on('wall-update', (data) => {
  if (data && (data.type === 'new-post' || data.type === 'comment')) {
    if (state.activeSidebarTab !== 'wall' && data.post && data.post.userId !== state.currentUser?.id) {
        wallNotificationCount++;
        updateWallBadge();
    }
  }

  if (data && data.type === 'new-post') {
    // If the post was created by the current user, ignore it as it's already added locally
    const currentUserId = state.currentUser?.id;
    const postUserId = data.post?.userId;
    
    // Check for both member ID and guest session ID to prevent duplicates for both types of users
    if (state.currentUser && data.post) {
      const isSameUser = (postUserId != null && currentUserId != null && String(postUserId) === String(currentUserId));
      const isSameGuest = (data.post.guestInfo?.guestSessionId && state.currentUser.guestSessionId === data.post.guestInfo.guestSessionId);
      
      if (isSameUser || isSameGuest) {
        return;
      }
    }

    const container = document.getElementById('wall-posts-container');
    if (container) {
      if (!document.getElementById(`post-${data.post.id}`)) {
        const noPostsMsg = document.getElementById('no-posts-msg');
        if (noPostsMsg) noPostsMsg.remove();
        
        const isScrolledDown = container.scrollTop > 100;
        container.insertAdjacentHTML('afterbegin', renderPost(data.post));
        refreshWallLayout({ scrollTop: true });
        
        if (isScrolledDown) {
          const alertBtn = document.getElementById('new-posts-alert');
          if (alertBtn) alertBtn.style.display = 'block';
        }
      }
    } else {
      // If container is not present (e.g. wall tab not open), we might still want to refresh if we ever switch to it
      // But we don't call loadWall here because it might be heavy and unnecessary if the sidebar isn't focused on wall
      // We will rely on loadWall being called when the user actually clicks the wall tab
    }
  } else if (data && data.type === 'like') {
    const postElement = document.getElementById(`post-${data.postId}`);
    if (postElement) {
      const likeBtnSpan = postElement.querySelector('.wall-btn-like span');
      if (likeBtnSpan) {
        likeBtnSpan.innerText = data.likeCount;
      }
    }
  } else if (data && data.type === 'comment') {
    const postElement = document.getElementById(`post-${data.postId}`);
    if (postElement) {
      const commentBtnSpan = postElement.querySelector('.wall-btn-comment span');
      if (commentBtnSpan) {
        commentBtnSpan.innerText = data.commentCount;
      }
    }
    
    // If comment modal is open for this post, append the new comment
    const overlay = document.getElementById('comment-modal-overlay');
    if (overlay && String(window.activeCommentPostId) === String(data.postId) && data.comment) {
      const commentsList = document.getElementById('comments-list-container');
      if (commentsList) {
        const noCommentsMsg = document.getElementById('no-comments-msg');
        if (noCommentsMsg) noCommentsMsg.remove();
        
        commentsList.insertAdjacentHTML('beforeend', renderComment(data.comment));
        refreshWallLayout();
        
        // Scroll to bottom
        const body = document.getElementById('comment-modal-body');
        if (body) body.scrollTop = body.scrollHeight;
      }
    }
  } else if (data && data.type === 'delete') {
    const postElement = document.getElementById(`post-${data.postId}`);
    if (postElement) {
      const container = postElement.parentElement;
      postElement.remove();
      
      // If no posts left, show the message
      if (container && container.id === 'wall-posts-container' && container.children.length === 0) {
        container.innerHTML = '<div id="no-posts-msg" class="p-4 text-center text-muted">لا توجد منشورات حالياً.</div>';
      }
    }
  } else {
    loadWall();
  }
});

