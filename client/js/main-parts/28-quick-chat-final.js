/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 28/28 · quick-chat-final
   lines 15724–16452 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function updateExtraActionsVisibility() {
    const extraActionsContainer = document.getElementById('extra-actions-container');
    if (!ui.extraActionsToggle || !extraActionsContainer) return;
    
    const canViewFilter = hasPermission('canViewFilterMonitorMessages');
    const canSendFiles = hasPermission('canSendFiles');
    const canWriteBot = hasPermission('canWriteAsBot');
    const canDelete = hasPermission('canDeletePublicMessages');

    const isVisible = canViewFilter || canSendFiles || canWriteBot || canDelete;
    
    extraActionsContainer.classList.toggle('d-none', !isVisible);

    if (isVisible) {
        ui.extraActionsToggle.classList.remove('d-none');
    } else {
        ui.extraActionsToggle.classList.add('d-none');
        if (ui.extraActionsMenu) ui.extraActionsMenu.classList.add('d-none');
        if (ui.extraActionsToggle) ui.extraActionsToggle.classList.remove('active');
    }

    if (ui.clearChatBtn) canDelete ? ui.clearChatBtn.classList.remove('d-none') : ui.clearChatBtn.classList.add('d-none');
    if (ui.uploadBtn) canSendFiles ? ui.uploadBtn.classList.remove('d-none') : ui.uploadBtn.classList.add('d-none');
    if (ui.botMsgBtn) canWriteBot ? ui.botMsgBtn.classList.remove('d-none') : ui.botMsgBtn.classList.add('d-none');
    
    const filterBtn = document.getElementById('filter-monitor-menu-btn');
    if (filterBtn) {
        canViewFilter ? filterBtn.classList.remove('d-none') : filterBtn.classList.add('d-none');
    }
    
    if (canViewFilter) {
        window.updateFilterNotificationBadge(typeof monitorUnreadCount !== 'undefined' ? monitorUnreadCount : 0);
    } else {
        window.updateFilterNotificationBadge(0);
    }
}


// --- QUICK CHAT MODULE ---
let quickChatMessagesList = [];
let quickChatUnreadCount = 0;
let isQuickChatSubmitting = false;

window.loadWallSidebar = function() {
  wallNotificationCount = 0;
  updateWallBadge();
  
  if (!ui.sidebarWallContainer) ui.sidebarWallContainer = document.getElementById('sidebar-wall-container');

  const isQuickChatEnabled = window.featuresSettings?.quickChatEnabled === true;
  
  if (!isQuickChatEnabled) {
    ui.sidebarWallContainer.style.display = 'flex';
    ui.sidebarWallContainer.style.flexDirection = 'column';
    ui.sidebarWallContainer.style.overflow = 'hidden';

    ui.sidebarWallContainer.innerHTML = `
      <div id="wall-stories-container"
           class="stories-container p-2 d-flex overflow-auto"
           style="white-space: nowrap; border-bottom: 10px solid var(--sidebar-header-bg, #555555); flex-shrink: 0;">
      </div>

      <div id="wall-posts-inner-container"
           style="flex-grow: 1; min-height: 0; overflow-y: auto;">
      </div>
    `;

    loadWall();

    requestAnimationFrame(() => {
      if (typeof window.ensureStoriesLoaded === 'function') {
        window.ensureStoriesLoaded();
      } else if (typeof window.renderStoriesBar === 'function') {
        window.renderStoriesBar('wall-stories-container');
      }
    });

    return;
  }

  if (!document.getElementById('quick-chat-tabs-header')) {
    ui.sidebarWallContainer.innerHTML = `
      <!-- Stories Container directly inside sidebar and above tabs -->
      <div id="wall-stories-container" class="stories-container p-2 d-flex overflow-auto" style="white-space: nowrap; border-bottom: 10px solid var(--sidebar-header-bg, #555555); flex-shrink: 0;">
        <!-- Stories will be rendered here -->
      </div>

      <!-- Tabs Header -->
      <div id="quick-chat-tabs-header" class="wall-subtabs" role="tablist">
        <button id="btn-tab-quickchat" class="wall-subtab" type="button" role="tab" aria-selected="false">
          <i class="fas fa-comments"></i>
          <span>الدردشة السريعة</span>
          <span id="quick-chat-unread-badge" class="wall-subtab-badge d-none">0</span>
        </button>
        <button id="btn-tab-posts" class="wall-subtab active" type="button" role="tab" aria-selected="true">
          <i class="fas fa-newspaper"></i>
          <span>المنشورات</span>
        </button>
      </div>

      <!-- Tab 1: Quick Chat Content -->
      <div id="quick-chat-content" class="d-flex flex-column flex-grow-1" style="min-height: 0; overflow: hidden;">
        <div id="quick-chat-messages" class="wall-posts-list" style="flex-grow: 1; min-height: 0; padding-bottom: 10px;">
          <div class="text-center text-muted p-4">جاري تحميل الرسائل...</div>
        </div>
        
        <!-- Quick Chat Form Container -->
        <div id="quick-chat-form-container" class="quick-chat-form-container">
          <div id="quick-chat-upload-progress-container" class="quick-chat-upload-progress-container" hidden>
            <div id="quick-chat-upload-progress-bar" class="quick-chat-upload-progress-bar"></div>
            <div id="quick-chat-upload-progress-text" class="quick-chat-upload-progress-text">0%</div>
            <button id="cancel-quick-chat-upload" type="button" class="quick-chat-upload-cancel-btn">
              <i class="fas fa-times"></i> إلغاء
            </button>
          </div>

          <form id="quick-chat-form" class="quick-chat-form">
            <div class="quick-chat-input-group">
              <button type="button" class="quick-chat-btn-icon quick-chat-btn-emoji" id="quick-chat-btn-emoji" title="إيموجي" aria-label="فتح الابتسامات">
                <img src="/emoii.gif" alt="">
              </button>
              <button type="button" class="quick-chat-btn-icon quick-chat-btn-upload" id="quick-chat-btn-upload" title="رفع صورة أو فيديو" aria-label="رفع صورة أو فيديو">
                <i class="fas fa-upload"></i>
              </button>
              <input type="file" id="quick-chat-file-input" class="quick-chat-file-input" accept="image/*,video/*,.mov,.MOV" hidden>
              <textarea id="quick-chat-input" name="quickChatMessage" class="quick-chat-textarea" placeholder="اكتب رسالتك هنا" rows="1" maxlength="300"></textarea>
              <button type="submit" id="quick-chat-btn-send" class="quick-chat-btn-send">
                <span>إرسال</span>
                <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Tab 2: Wall Posts Content -->
      <div id="wall-posts-tab-content" class="d-none flex-grow-1" style="min-height: 0; display: flex; flex-direction: column;">
        <!-- Standard Wall Posts inner wrapper -->
        <div id="wall-posts-inner-container" style="flex-grow: 1; overflow-y: auto;">
           <!-- This will receive the wall posts list, form, etc. -->
        </div>
      </div>
    `;
    
    requestAnimationFrame(() => {
      if (typeof window.ensureStoriesLoaded === 'function') {
        window.ensureStoriesLoaded();
      } else if (typeof window.renderStoriesBar === 'function') {
        window.renderStoriesBar('wall-stories-container');
      }
    });

    document.getElementById('btn-tab-quickchat').addEventListener('click', () => switchWallSubTab('quickchat'));
    document.getElementById('btn-tab-posts').addEventListener('click', () => switchWallSubTab('posts'));
    
    document.getElementById('quick-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (!e.shiftKey) {
          e.preventDefault();
          submitQuickChatMessage();
        }
      }
    });

    // Form submit listener (as requested in Section 6: submit listener)
    const quickChatForm = document.getElementById('quick-chat-form');
    quickChatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitQuickChatMessage();
    });

    // Emoji button handler
    const emojiBtn = document.getElementById('quick-chat-btn-emoji');
    if (emojiBtn) {
      emojiBtn.addEventListener('click', (event) => {
        openQuickChatEmojiPicker(event);
      });
    }

    // Upload button click handler
    const uploadBtn = document.getElementById('quick-chat-btn-upload');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        const fileInput = document.getElementById('quick-chat-file-input');
        if (fileInput) fileInput.click();
      });
    }

    // Media placeholders delegation (as requested in Section 3)
    const quickChatMessages = document.getElementById('quick-chat-messages');
    if (quickChatMessages) {
      const handleMediaPlaceholderTrigger = (placeholder, event) => {
        revealMedia(
          placeholder,
          placeholder.dataset.mediaType,
          placeholder.dataset.mediaUrl,
          event
        );
      };

      quickChatMessages.addEventListener('click', (event) => {
        const placeholder = event.target.closest('.quick-chat-media-placeholder');
        if (!placeholder) return;
        handleMediaPlaceholderTrigger(placeholder, event);
      });

      quickChatMessages.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          const placeholder = event.target.closest('.quick-chat-media-placeholder');
          if (!placeholder) return;
          event.preventDefault();
          handleMediaPlaceholderTrigger(placeholder, event);
        }
      });
    }

    document.getElementById('quick-chat-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleQuickChatUpload(file);
      e.target.value = '';
    });

    document.getElementById('cancel-quick-chat-upload').addEventListener('click', () => {
      if (window.currentQuickChatUploadXhr) {
        window.currentQuickChatUploadXhr.abort();
        window.currentQuickChatUploadXhr = null;
        showToast('تم إلغاء الرفع.');
        resetQuickChatUploadUI();
      }
    });

    resetQuickChatUnread();
  }

  ui.sidebarWallContainer.style.display = 'flex';
  ui.sidebarWallContainer.style.flexDirection = 'column';
  ui.sidebarWallContainer.style.overflow = 'hidden';

  if (!window.currentWallTab) {
    window.currentWallTab = 'posts';
  }
  switchWallSubTab(window.currentWallTab);
};

window.switchWallSubTab = function(tab) {
  window.currentWallTab = tab;
  const qcTabHeader = document.getElementById('btn-tab-quickchat');
  const postsTabHeader = document.getElementById('btn-tab-posts');
  const qcContent = document.getElementById('quick-chat-content');
  const postsContent = document.getElementById('wall-posts-tab-content');

  if (!qcTabHeader || !postsTabHeader || !qcContent || !postsContent) return;

  const isQuickChat = tab === 'quickchat';

  qcTabHeader.classList.toggle('active', isQuickChat);
  qcTabHeader.setAttribute('aria-selected', isQuickChat ? 'true' : 'false');

  postsTabHeader.classList.toggle('active', !isQuickChat);
  postsTabHeader.setAttribute('aria-selected', !isQuickChat ? 'true' : 'false');

  qcContent.classList.toggle('d-none', !isQuickChat);
  postsContent.classList.toggle('d-none', isQuickChat);

  if (isQuickChat) {
    requestQuickChatHistory();
    resetQuickChatUnread();
  } else {
    loadWall();
    requestAnimationFrame(() => {
      if (typeof window.ensureStoriesLoaded === 'function') {
        window.ensureStoriesLoaded();
      } else if (typeof window.renderStoriesBar === 'function') {
        window.renderStoriesBar('wall-stories-container');
      }
    });
  }
};

function requestQuickChatHistory() {
  if (typeof socket !== 'undefined' && socket.connected) {
    socket.emit('quick-chat:request-history');
  }
}

function handleQuickChatHistory(messages) {
  const container = document.getElementById('quick-chat-messages');
  if (!container) return;

  container.innerHTML = '';

  const sortedMessages = [...(messages || [])].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  quickChatMessagesList = sortedMessages;

  if (quickChatMessagesList.length === 0) {
    container.innerHTML = '<div class="text-center text-muted p-4" style="font-size: 13px;">لا توجد رسائل في الدردشة السريعة حالياً.</div>';
    return;
  }

  quickChatMessagesList.forEach((message) => {
    const messageElement = createQuickChatMessageElement(message);
    if (messageElement) {
      container.appendChild(messageElement);
    }
  });

  container.scrollTop = 0;
}

function renderAllQuickChatMessages() {
  const container = document.getElementById('quick-chat-messages');
  if (!container) return;

  container.innerHTML = '';

  if (quickChatMessagesList.length === 0) {
    container.innerHTML = '<div class="text-center text-muted p-4" style="font-size: 13px;">لا توجد رسائل في الدردشة السريعة حالياً.</div>';
    return;
  }

  quickChatMessagesList.forEach(msg => {
    const messageElement = createQuickChatMessageElement(msg);
    if (messageElement) {
      container.appendChild(messageElement);
    }
  });
}

function createQuickChatMessageElement(msg) {
  const temp = document.createElement('div');
  temp.innerHTML = renderQuickChatMessage(msg);
  return temp.firstElementChild;
}

function renderQuickChatMessage(msg) {
  const sender = msg.sender || {};
  const usersList = (window.state && window.state.currentUsers) || window.onlineUsers || [];
  const senderId = sender.id || sender.userId;
  const activeUser = usersList.find(u =>
    (senderId && (String(u.id || u.userId) === String(senderId))) ||
    (sender.username && u.username === sender.username)
  );
  const renderSenderData = activeUser ? { ...sender, ...activeUser } : sender;

  const currentUserId = state.currentUser?.id;
  const isMsgAuthor = (state.currentUser && sender.id && String(sender.id) === String(state.currentUser.id)) ||
                      (state.guestSessionId && msg.guestSessionId && String(msg.guestSessionId) === String(state.guestSessionId));
  const canDeleteOthers = hasPermission('canDeleteWallPosts');
  const showDeleteBtn = isMsgAuthor || canDeleteOthers;

  const avatarUrl = window.getAvatarUrl(renderSenderData);
  const userIdentityHtml = typeof window.renderUserIdentity === 'function' ? window.renderUserIdentity(renderSenderData, {
     nameClasses: 'quick-chat-username',
     nameStyle: `color: ${renderSenderData.ucol || '#e67e22'};`,
     tag: 'a',
     onClick: `event.preventDefault(); if (typeof showUserProfile === 'function') showUserProfile('${escapeHTML(renderSenderData.username || '')}');`
  }) : `<a href="#" onclick="event.preventDefault(); if (typeof showUserProfile === 'function') showUserProfile('${escapeHTML(renderSenderData.username || '')}');" class="quick-chat-username" style="color: ${escapeHTML(renderSenderData.ucol || '#e67e22')}">${escapeHTML(renderSenderData.topic || renderSenderData.username || '')}</a>`;

  const timeStr = formatTimeAgo(msg.createdAt);

  let renderedQuickText = msg.text
    ? replacePlaceholders(
        replaceShortcuts(
          escapeHTML(
            decodeWallEntities(msg.text)
          )
        )
      )
    : '';
  if (renderedQuickText && window.safeLinkify) {
    renderedQuickText = window.safeLinkify(renderedQuickText);
  }

  let mediaHtml = '';
  if (msg.mediaUrl) {
    const safeMediaUrl = escapeHTML(msg.mediaUrl);
    if (msg.mediaType === 'video') {
      mediaHtml = `
        <div class="quick-chat-media mt-2">
          <div class="quick-chat-media-placeholder quick-chat-video-placeholder"
               role="button"
               tabindex="0"
               data-media-type="video"
               data-media-url="${safeMediaUrl}">
            <span class="quick-chat-media-label">تشغيل الفيديو</span>
            <div class="quick-chat-media-icon">
              <i class="fas fa-play-circle"></i>
            </div>
          </div>
        </div>
      `;
    } else {
      mediaHtml = `
        <div class="quick-chat-media mt-2">
          <div class="quick-chat-media-placeholder quick-chat-image-placeholder"
               role="button"
               tabindex="0"
               data-media-type="image"
               data-media-url="${safeMediaUrl}">
            <span class="quick-chat-media-label">عرض الصورة</span>
            <div class="quick-chat-media-icon">
              <i class="fas fa-image"></i>
            </div>
          </div>
        </div>
      `;
    }
  }

  return `
    <div class="quick-chat-card" id="qc-msg-${msg.id}">
      <img src="${avatarUrl}" class="quick-chat-avatar js-user-profile-btn" referrerPolicy="origin-when-cross-origin" data-username="${escapeHTML(sender.username || '')}" style="cursor: pointer;">
      
      <div class="quick-chat-main">
        <div class="quick-chat-header">
          <div class="d-flex align-items-center">
            ${userIdentityHtml}
          </div>
          <div class="quick-chat-time">${timeStr}</div>
        </div>

        <div class="quick-chat-content ${mediaHtml ? 'has-media' : ''}">
          <div class="quick-chat-body">
            ${renderedQuickText ? `
              <div class="quick-chat-text" style="color: ${sender.fontColor || '#000000'}">
                ${renderedQuickText}
              </div>
            ` : ''}
            ${mediaHtml ? `<div class="quick-chat-media-clear">${mediaHtml}</div>` : ''}
          </div>
          ${showDeleteBtn ? `
            <div class="quick-chat-actions-row">
              <button class="quick-chat-action-btn quick-chat-btn-delete" onclick="deleteQuickChatMessage('${msg.id}')" title="حذف">
                <i class="fas fa-times"></i>
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function handleNewQuickChatMessage(msg) {
  if (quickChatMessagesList.some(m => String(m.id) === String(msg.id))) {
    return;
  }

  quickChatMessagesList.unshift(msg);
  if (quickChatMessagesList.length > 50) {
    quickChatMessagesList.pop();
  }

  const container = document.getElementById('quick-chat-messages');
  if (container) {
    const noMsgPlaceholder = container.querySelector('.text-muted');
    if (noMsgPlaceholder) {
      container.innerHTML = '';
    }

    const oldScrollHeight = container.scrollHeight;
    const oldScrollTop = container.scrollTop;

    const msgEl = createQuickChatMessageElement(msg);
    if (msgEl) {
      container.prepend(msgEl);
    }

    while (container.children.length > 50) {
      container.lastElementChild.remove();
    }

    const isSelf = (state.currentUser && msg.sender?.id && String(msg.sender.id) === String(state.currentUser.id)) ||
                   (state.guestSessionId && msg.guestSessionId && String(msg.guestSessionId) === String(state.guestSessionId));

    if (isSelf || oldScrollTop <= 10) {
      container.scrollTop = 0;
    } else {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
    }
  }

  const isQuickChatActive = state.activeSidebarTab === 'wall' && window.currentWallTab === 'quickchat';
  if (!isQuickChatActive) {
    incrementQuickChatUnread();
    
    const isSelf = (state.currentUser && msg.sender?.id && String(msg.sender.id) === String(state.currentUser.id)) ||
                   (state.guestSessionId && msg.guestSessionId && String(msg.guestSessionId) === String(state.guestSessionId));
    if (!isSelf && !window.isNotificationSoundsMuted()) {
      if (window.profileSoundManager) {
        window.profileSoundManager.playAlert();
      } else if (window.soundManager && typeof window.soundManager.playSound === 'function') {
        window.soundManager.playSound('notification');
      }
    }
  }
}

function handleQuickChatMessageDeleted(data) {
  quickChatMessagesList = quickChatMessagesList.filter(m => String(m.id) !== String(data.id));
  
  const el = document.getElementById(`qc-msg-${data.id}`);
  if (el) {
    el.remove();
  }

  const container = document.getElementById('quick-chat-messages');
  if (container && quickChatMessagesList.length === 0) {
    container.innerHTML = '<div class="text-center text-muted p-4" style="font-size: 13px;">لا توجد رسائل في الدردشة السريعة حالياً.</div>';
  }
}

function incrementQuickChatUnread() {
  quickChatUnreadCount++;
  updateQuickChatUnreadBadge();
  
  if (state.activeSidebarTab !== 'wall') {
    wallNotificationCount++;
    updateWallBadge();
  }
}

function resetQuickChatUnread() {
  quickChatUnreadCount = 0;
  updateQuickChatUnreadBadge();
}

function updateQuickChatUnreadBadge() {
  const badge = document.getElementById('quick-chat-unread-badge');
  if (badge) {
    if (quickChatUnreadCount > 0) {
      badge.innerText = quickChatUnreadCount;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }
}

window.deleteQuickChatMessage = function(id) {
  if (!id) return;
  Swal.fire({
    title: 'هل أنت متأكد؟',
    text: "لن تتمكن من استعادة هذه الرسالة!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'نعم، احذفها',
    cancelButtonText: 'إلغاء'
  }).then((result) => {
    if (result.isConfirmed) {
      if (typeof socket !== 'undefined' && socket.connected) {
        socket.emit('quick-chat:delete', { id });
      }
    }
  });
};

window.openQuickChatEmojiPicker = function(event) {
  event.preventDefault();
  event.stopPropagation();
  const input = document.getElementById('quick-chat-input');
  if (input && typeof window.toggleEmojiPicker === 'function') {
    window.toggleEmojiPicker(input);
  }
};

window.submitQuickChatMessage = function() {
  const input = document.getElementById('quick-chat-input');
  if (!input || isQuickChatSubmitting) return;

  const text = input.value.trim();
  if (!text) return;

  let mediaUrl = null;
  let mediaType = null;
  const ytId = typeof getYoutubeId === 'function' ? getYoutubeId(text) : null;
  if (ytId) {
    mediaUrl = ytId;
    mediaType = 'youtube';
  }

  isQuickChatSubmitting = true;
  const sendBtn = document.getElementById('quick-chat-btn-send');
  if (sendBtn) sendBtn.disabled = true;

  socket.emit('quick-chat:send', { text, mediaUrl, mediaType }, (response) => {
    isQuickChatSubmitting = false;
    if (sendBtn) sendBtn.disabled = false;

    if (response && response.success) {
      input.value = '';
    } else {
      const errorMsg = response?.error || 'فشل إرسال الرسالة السريعة.';
      showToast(errorMsg);
    }
  });
};

function setupQuickChatSocketListeners() {
  if (typeof socket === 'undefined' || !socket) return;

  socket.on('quick-chat:history', (messages) => {
    handleQuickChatHistory(messages);
  });

  socket.on('quick-chat:new', (msg) => {
    handleNewQuickChatMessage(msg);
  });

  const qcFileInput = document.getElementById('quick-chat-file-input');
  if (qcFileInput) {
    qcFileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        handleQuickChatUpload(file);
      }
      e.target.value = '';
    };
  }

  socket.on('quick-chat:deleted', (data) => {
    handleQuickChatMessageDeleted(data);
  });

  socket.on('quick-chat:clear', () => {
    quickChatMessagesList = [];
    renderAllQuickChatMessages();
    showToast('تم مسح رسائل الدردشة السريعة من قبل الإدارة.');
  });
}


function resetQuickChatUploadUI() {
  const container = document.getElementById('quick-chat-upload-progress-container');
  const bar = document.getElementById('quick-chat-upload-progress-bar');
  const text = document.getElementById('quick-chat-upload-progress-text');
  const sendBtn = document.getElementById('quick-chat-btn-send');
  const uploadBtn = document.getElementById('quick-chat-btn-upload');
  
  if (container) container.setAttribute('hidden', 'true');
  if (bar) bar.style.width = '0%';
  if (text) text.textContent = '0%';
  if (sendBtn) sendBtn.disabled = false;
  if (uploadBtn) uploadBtn.disabled = false;
}

function handleQuickChatUpload(file) {
  if (window.currentQuickChatUploadXhr) {
    showToast('هناك عملية رفع جارية بالفعل.');
    return;
  }
  
  const textInput = document.getElementById('quick-chat-input');
  const sendBtn = document.getElementById('quick-chat-btn-send');
  const uploadBtn = document.getElementById('quick-chat-btn-upload');
  const container = document.getElementById('quick-chat-upload-progress-container');
  const bar = document.getElementById('quick-chat-upload-progress-bar');
  const text = document.getElementById('quick-chat-upload-progress-text');

  sendBtn.disabled = true;
  uploadBtn.disabled = true;
  container.removeAttribute('hidden');
  bar.style.width = '0%';
  text.textContent = '0%';

  const formData = new FormData();
  formData.append('file', file);
  
  const xhr = new XMLHttpRequest();
  window.currentQuickChatUploadXhr = xhr;
  
  xhr.open('POST', '/api/upload/quickchatfiles', true);
  xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
  xhr.setRequestHeader('X-Chat-Token', getToken());

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      bar.style.width = percent + '%';
      text.textContent = percent + '%';
    }
  };

  xhr.onload = async () => {
    window.currentQuickChatUploadXhr = null;
    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      
      socket.emit('quick-chat:send', { 
        text: textInput.value, 
        mediaUrl: response.url, 
        mediaType: response.mediaType 
      }, (ack) => {
        if (ack && ack.success) {
          textInput.value = '';
          resetQuickChatUploadUI();
        } else {
          showToast(ack?.error || 'فشل إرسال الرسالة.');
          resetQuickChatUploadUI();
          // Optional: handle file deletion if socket send failed
        }
      });
    } else {
      showToast(JSON.parse(xhr.responseText)?.message || 'فشل رفع الملف.');
      resetQuickChatUploadUI();
    }
  };
  
  xhr.onerror = () => {
    window.currentQuickChatUploadXhr = null;
    showToast('خطأ في الاتصال بالسيرفر.');
    resetQuickChatUploadUI();
  };
  
  xhr.send(formData);
}

setupQuickChatSocketListeners();





