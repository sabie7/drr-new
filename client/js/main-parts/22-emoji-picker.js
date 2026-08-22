/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 22/28 · emoji-picker
   lines 7958–8465 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function toggleEmojiPicker(targetInput) {
  activeEmojiInput = targetInput || ui.chatInput;
  ui.emojiPicker.classList.toggle('d-none');
  if (!ui.emojiPicker.classList.contains('d-none')) {
    loadEmojiPickerContent();
    
    // Position it above the input
    const rect = activeEmojiInput.getBoundingClientRect();
    ui.emojiPicker.style.position = 'fixed';
    ui.emojiPicker.style.bottom = (window.innerHeight - rect.top) + 'px';
    ui.emojiPicker.style.left = '0';
    ui.emojiPicker.style.right = '0';
    ui.emojiPicker.style.top = 'auto';
    ui.emojiPicker.style.zIndex = '2000'; // Default high z-index
    
    // Adjust width and position if opened from Wall or Comments
    if (activeEmojiInput.id === 'wall-post-input') {
      ui.emojiPicker.style.width = '330px';
      ui.emojiPicker.style.left = 'auto';
      ui.emojiPicker.style.right = '5px';
      ui.emojiPicker.style.bottom = '80px';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'none';
      ui.emojiPicker.style.inset = 'auto 5px 80px auto';
      ui.emojiPicker.style.zIndex = '2000';
    } else if (activeEmojiInput.id === 'quick-chat-input') {
      ui.emojiPicker.style.width = '330px';
      ui.emojiPicker.style.left = 'auto';
      ui.emojiPicker.style.right = '5px';
      ui.emojiPicker.style.bottom = '50px';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'none';
      ui.emojiPicker.style.inset = 'auto 5px 50px auto';
      ui.emojiPicker.style.zIndex = '2000';
    } else if (activeEmojiInput.id === 'comment-modal-input') {
      ui.emojiPicker.style.width = '330px';
      ui.emojiPicker.style.left = '50%';
      ui.emojiPicker.style.right = 'auto';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'translateX(-50%)';
      ui.emojiPicker.style.zIndex = '2000';
    } else if (activeEmojiInput.id === 'private-chat-input') {
      const chatWindow = document.getElementById('private-chat-window');
      const chatRect = chatWindow.getBoundingClientRect();
      const inputRect = activeEmojiInput.getBoundingClientRect();
      
      ui.emojiPicker.style.width = '300px';
      ui.emojiPicker.style.maxWidth = (chatRect.width - 2) + 'px';
      ui.emojiPicker.style.height = '200px';
      ui.emojiPicker.style.right = 'auto';
      ui.emojiPicker.style.left = (chatRect.left + 1) + 'px';
      ui.emojiPicker.style.bottom = (window.innerHeight - inputRect.top + 5) + 'px';
      ui.emojiPicker.style.top = 'auto';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'none';
      ui.emojiPicker.style.zIndex = '2500'; // Higher than private-chat-window (1150)
    } else if (activeEmojiInput.id === 'private-alert-textarea-input') {
      const inputRect = activeEmojiInput.getBoundingClientRect();
      const swalPopup = Swal.getPopup();
      const swalRect = swalPopup ? swalPopup.getBoundingClientRect() : null;
      
      const pickerWidth = 320;
      const pickerHeight = 240;
      
      let left = 0;
      if (swalRect) {
        left = swalRect.left + (swalRect.width - pickerWidth) / 2;
      } else {
        left = (window.innerWidth - pickerWidth) / 2;
      }
      
      if (left < 8) left = 8;
      if (left + pickerWidth > window.innerWidth - 8) {
        left = window.innerWidth - pickerWidth - 8;
      }
      
      let top = inputRect.top - pickerHeight - 8;
      if (top < 8) {
        top = 8;
      }
      
      ui.emojiPicker.style.position = 'fixed';
      ui.emojiPicker.style.width = pickerWidth + 'px';
      ui.emojiPicker.style.height = pickerHeight + 'px';
      ui.emojiPicker.style.left = left + 'px';
      ui.emojiPicker.style.right = 'auto';
      ui.emojiPicker.style.bottom = 'auto';
      ui.emojiPicker.style.top = top + 'px';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'none';
      ui.emojiPicker.style.zIndex = '10001';
    } else {
      ui.emojiPicker.style.width = '340px';
      // Use responsive height: 300px on mobile, 600px on desktop
      ui.emojiPicker.style.height = window.innerWidth < 768 ? '300px' : '600px';
      ui.emojiPicker.style.left = '0';
      ui.emojiPicker.style.right = 'auto';
      ui.emojiPicker.style.margin = '0';
      ui.emojiPicker.style.transform = 'none';
      ui.emojiPicker.style.zIndex = '2000';
    }
  }
}
window.toggleEmojiPicker = toggleEmojiPicker;

function loadEmojiPickerContent() {
  ui.emojiPickerContent.innerHTML = '';
  ui.emojiPickerContent.className = `emoji-picker-content ${currentPickerTab}-tab`;
  const items = state.smileys.filter(s => (s.type || 'smiley') === currentPickerTab);
  
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = `picker-item ${item.type}`;
    div.innerHTML = `<img src="${item.url}" title="${item.shortcut}">`;
    div.onclick = () => {
      if (item.type === 'sticker' && activeEmojiInput && activeEmojiInput.id !== 'private-alert-textarea-input') {
        sendDirectSticker(item);
      } else {
        insertEmojiShortcut(item.shortcut);
      }
    };
    ui.emojiPickerContent.appendChild(div);
  });
}

async function sendDirectSticker(sticker) {
  if (!state.currentUser) return;
  
  // Close picker
  ui.emojiPicker.classList.add('d-none');

  // If in wall input or comment modal input or private-alert-textarea-input or quick-chat-input, just append it
  if (
    activeEmojiInput &&
    (
      activeEmojiInput.id === 'wall-post-input' ||
      activeEmojiInput.id === 'quick-chat-input' ||
      activeEmojiInput.id === 'comment-modal-input' ||
      activeEmojiInput.id === 'private-alert-textarea-input' ||
      activeEmojiInput.classList.contains('wall-post-textarea') ||
      activeEmojiInput.classList.contains('quick-chat-textarea')
    )
  ) {
    if (activeEmojiInput.value) {
      activeEmojiInput.value += ' ' + sticker.shortcut + ' ';
    } else {
      activeEmojiInput.value = sticker.shortcut + ' ';
    }

    activeEmojiInput.focus();

    activeEmojiInput.dispatchEvent(
      new Event('input', { bubbles: true })
    );

    return;
  }

  const messageData = { 
    user: state.currentUser,
    text: sticker.shortcut, // Still send shortcut for conversion/rendering
    roomId: state.currentRoomId,
    createdAt: new Date().toISOString(),
    isSoloSticker: true // Flag to indicate it's a standalone sticker
  };

  // Check if we are in private chat by checking activeEmojiInput
  if (activeEmojiInput && activeEmojiInput.id === 'private-chat-input') {
    // Send via private message logic
    if (window.PrivateChatManager && window.PrivateChatManager.activeChatUser) {
      window.PrivateChatManager.sendPrivateSticker(window.PrivateChatManager.activeChatUser.id, sticker.shortcut);
    }
  } else {
    // Send to public room
    socket.emit('message', messageData);
  }
}

function insertEmojiShortcut(shortcut) {
  const target = activeEmojiInput || ui.chatInput;
  const start = target.selectionStart;
  const end = target.selectionEnd;
  const currentText = target.value;
  
  let text = shortcut;
  // Add space before if not at start and preceding char is not a space
  if (start > 0 && currentText.charAt(start - 1) !== ' ') {
    text = ' ' + text;
  }
  // Always add space after
  text = text + ' ';
  
  if (typeof target.setRangeText === 'function') {
    target.setRangeText(text, start, end, 'end');
  } else {
    target.value = currentText.substring(0, start) + text + currentText.substring(end);
    target.setSelectionRange(start + text.length, start + text.length);
  }
  
  target.focus();
  target.dispatchEvent(new Event('input', { bubbles: true }));
  
  ui.emojiPicker.classList.add('d-none');
}

ui.emojiBtn.addEventListener('click', () => toggleEmojiPicker(ui.chatInput));
ui.closeEmojiPicker.onclick = () => ui.emojiPicker.classList.add('d-none');

ui.pickerTabs.forEach(tab => {
  tab.onclick = () => {
    ui.pickerTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentPickerTab = tab.dataset.tab;
    loadEmojiPickerContent();
  };
});

// Close picker when clicking outside
document.addEventListener('mousedown', (e) => {
  if (ui.emojiPicker && !ui.emojiPicker.classList.contains('d-none')) {
    // Check if click is inside the picker
    if (ui.emojiPicker.contains(e.target)) return;
    
    // Check if click is on any emoji toggle button
    const isEmojiBtn = (e.target && typeof e.target.closest === 'function') && (
                       e.target.closest('#emoji-btn') || 
                       e.target.closest('#wall-btn-emoji') || 
                       e.target.closest('#quick-chat-btn-emoji') || 
                       e.target.closest('#comment-btn-emoji') ||
                       e.target.closest('#private-alert-btn-emoji') ||
                       e.target.closest('.emoji-toggle-btn') ||
                       e.target.closest('[onclick*="toggleEmojiPicker"]')
    );
                       
    if (!isEmojiBtn) {
      ui.emojiPicker.classList.add('d-none');
    }
  }
});

ui.uploadBtn.addEventListener('click', () => {
  // Hide extra actions menu
  if (ui.extraActionsMenu) ui.extraActionsMenu.classList.add('d-none');
  if (ui.extraActionsToggle) ui.extraActionsToggle.classList.remove('active');

  if (!hasPermission('canSendFiles')) {
    Swal.fire({
      text: 'لا تملك صلاحية إرسال الصور والفيديوهات في الغرف.',
      icon: 'error',
      confirmButtonText: 'حسناً'
    });
    return;
  }
  state.setIsSettingsUpload(false);
  ui.fileInput.click();
});

async function handleFileUpload(file, isSettings = false) {
  if (!file) return;
  
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('file', file);
  
  let token = null;
  try { token = getToken(); } catch (e) {}
  
  let loadingDiv = null;

  if (!isSettings) {
    loadingDiv = document.createElement('div');
    loadingDiv.className = 'p-2 text-center small text-muted border-bottom';
    loadingDiv.innerHTML = `
      <div class="d-flex align-items-center justify-content-center gap-2">
        <span><i class="fas fa-spinner fa-spin"></i> جاري رفع الملف: <span class="upload-progress">0%</span></span>
        <button class="btn btn-sm btn-outline-danger cancel-chat-upload-btn" style="height: 20px; padding: 0 5px; font-size: 10px; line-height: 18px;">إلغاء</button>
      </div>
    `;
    ui.messagesContainer.appendChild(loadingDiv);
    ui.messagesContainer.scrollTo({ top: ui.messagesContainer.scrollHeight, behavior: 'auto' });

    const cancelBtn = loadingDiv.querySelector('.cancel-chat-upload-btn');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        xhr.abort();
        if (loadingDiv && loadingDiv.parentNode) {
          loadingDiv.parentNode.removeChild(loadingDiv);
        }
        if (window.showToast) window.showToast('تم إلغاء الرفع', 'info');
      };
    }
  } else if (ui.settingsUploadBtn) {
    ui.settingsUploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الرفع...';
  }

  let uploadUrl = '/api/upload/publicfiles';
  if (isSettings) {
    uploadUrl = '/api/upload/avatar';
  } else if (state.activeSidebarTab === 'rooms') {
    uploadUrl = '/api/upload/mics';
  }
  
  xhr.open('POST', uploadUrl, true);
  if (token) {
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  }

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const percentComplete = Math.round((event.loaded / event.total) * 100);
      if (loadingDiv) {
        const progressSpan = loadingDiv.querySelector('.upload-progress');
        if (progressSpan) progressSpan.textContent = `${percentComplete}%`;
      }
    }
  };

  xhr.onload = async () => {
    if (loadingDiv && loadingDiv.parentNode) {
      loadingDiv.parentNode.removeChild(loadingDiv);
    }
    if (isSettings && ui.settingsUploadBtn) {
      ui.settingsUploadBtn.innerHTML = `
        <img src="${window.getAvatarUrl(state.currentUser)}" class="classic-avatar-small btn-avatar-right">
        <span>تغيير الصورة</span>
        <i class="fas fa-image btn-icon-left"></i>
      `;
    }
    
    if (xhr.status === 200) {
      const result = JSON.parse(xhr.responseText);
      
      if (isSettings) {
        await updateUserSettings({ pic: result.url }, true);
        return;
      }
      
      let mediaType = null;
      let mediaUrl = result.url;

      const isVideo = result.mimetype.startsWith('video/') || result.mimetype === 'video/quicktime' || (result.url && result.url.toLowerCase().endsWith('.mov')) || (typeof file !== 'undefined' && file && file.name && file.name.toLowerCase().endsWith('.mov'));
      if (result.mimetype.startsWith('image/')) {
        mediaType = 'image';
      } else if (isVideo) {
        mediaType = 'video';
      } else if (result.mimetype.startsWith('audio/')) {
        mediaType = 'audio';
      } else {
        mediaType = 'file';
      }

      let textContent = '';
      if (!isSettings && ui.chatInput && ui.chatInput.value) {
        textContent = ui.chatInput.value.trim();
        ui.chatInput.value = '';
      }

      const messageData = { 
        user: state.currentUser,
        text: textContent, 
        roomId: state.currentRoomId,
        mediaUrl: mediaUrl,
        mediaType: mediaType,
        createdAt: new Date().toISOString()
      };

      if (state.replyingTo) {
        const replyUser = state.replyingTo.user || {};
        const replyUserId = replyUser.userId || replyUser.id;
        messageData.replyTo = {
          id: replyUserId,
          userId: replyUserId,
          username: replyUser.username,
          topic: replyUser.topic,
          text: state.replyingTo.text,
          pic: window.getAvatarUrl(replyUser),
          mediaUrl: state.replyingTo.mediaUrl,
          mediaType: state.replyingTo.mediaType,
          superIcon: replyUser.superIcon || '',
          gifts: replyUser.gifts || [],
          ucol: replyUser.ucol,
          bg: replyUser.bg,
          fontColor: replyUser.fontColor,
          type: replyUser.type,
          roleRank: replyUser.roleRank
        };
        cancelReply();
      }

      socket.emit('message', messageData);
    } else {
      let msg = 'فشل رفع الملف';
      try {
        const res = JSON.parse(xhr.responseText);
        if (res.message) msg = res.message;
      } catch (e) {}
      Swal.fire('عذراً', msg, 'error');
    }
    ui.fileInput.value = '';
  };

  xhr.onerror = () => {
    if (loadingDiv && loadingDiv.parentNode) {
      loadingDiv.parentNode.removeChild(loadingDiv);
    }
    if (isSettings && ui.settingsUploadBtn) {
      ui.settingsUploadBtn.innerHTML = `
        <img src="${window.getAvatarUrl(state.currentUser)}" class="classic-avatar-small btn-avatar-right">
        <span>تغيير الصورة</span>
        <i class="fas fa-image btn-icon-left"></i>
      `;
    }
    Swal.fire('عذراً', 'حدث خطأ أثناء رفع الملف', 'error');
    ui.fileInput.value = '';
  };

  xhr.send(formData);
}

ui.fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const isSettings = !!state.isSettingsUpload;
  state.setIsSettingsUpload(false); // Reset flag
  
  handleFileUpload(file, isSettings);
});

// Drag & Drop for Public Chat
const chatUI = document.getElementById('chat-ui');
if (chatUI) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    chatUI.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  chatUI.addEventListener('dragenter', () => chatUI.classList.add('drag-over'), false);
  chatUI.addEventListener('dragover', () => chatUI.classList.add('drag-over'), false);
  chatUI.addEventListener('dragleave', () => chatUI.classList.remove('drag-over'), false);
  chatUI.addEventListener('drop', (e) => {
    chatUI.classList.remove('drag-over');
    if (!hasPermission('canSendFiles')) {
      Swal.fire({ text: 'لا تملك صلاحية إرسال الملفات.', icon: 'error', confirmButtonText: 'حسناً' });
      return;
    }
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, false);
}

// Paste from Clipboard
if (ui.chatInput) {
  ui.chatInput.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        if (!hasPermission('canSendFiles')) return;
        const file = items[i].getAsFile();
        handleFileUpload(file);
        // e.preventDefault(); // Don't prevent default to allow text paste if any
      }
    }
  });
}

socket.on('error-msg', ({ message }) => {
  if (message && (message.includes('لايك') || message.includes('requiredLikes'))) {
    showLikesLimitAlert(message);
  } else {
    Swal.fire('تنبيه', message, 'error');
  }
});

socket.on('like-success', ({ targetUsername, likes }) => {
  const btn = document.getElementById('btn-profile-likes');
  if (btn) {
    createHeartBubble(btn);
  }
  
  if (profileUser && profileUser.username === targetUsername) {
    profileUser.likes = likes;
    const profileLikesCount = document.getElementById('profile-likes-count');
    if (profileLikesCount) profileLikesCount.innerText = formatCompactNumber(likes);
    const likesBtnCount = document.getElementById('profile-likes-count-btn');
    if (likesBtnCount) likesBtnCount.innerText = formatCompactNumber(likes);
  }
});

socket.on('rep-success', ({ targetUsername, rep }) => {
  const btn = document.getElementById('btn-profile-rep');
  if (btn) {
    createStarBubble(btn);
  }
  
  if (profileUser && profileUser.username === targetUsername) {
    profileUser.rep = rep;
    const profileRepCount = document.getElementById('profile-rep-count');
    if (profileRepCount) profileRepCount.innerText = formatCompactNumber(rep);
    const repBtnCount = document.getElementById('profile-rep-count-btn');
    if (repBtnCount) repBtnCount.innerText = formatCompactNumber(rep);
  }
});

