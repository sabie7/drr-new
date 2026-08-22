/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 21/28 · chat-ui-bots
   lines 7539–7957 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function updateChatUI() {
  try {
    const isInRoom = state.currentRoomId !== 0;
    const chatForm = ui.chatForm;
    
    const room = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    if (ui.messagesContainer) {
    }
  
    if (ui.leaveRoomBtn) {
      ui.leaveRoomBtn.classList.toggle('d-none', state.isInWaitingRoom && !hasPermission('canManageRooms') && !hasPermission('canManageUsers'));
    }
  
    if (typeof window.updateVoiceBarVisibility === 'function') {
      window.updateVoiceBarVisibility(state.currentRoomId);
    }
  
    if (typeof window.syncVoiceMicSlots === 'function') {
      window.syncVoiceMicSlots(state.currentRoomId);
    }
    
    if (!isInRoom) {
      if (ui.messagesContainer && !preserveMessagesAfterLeave) {
        if (pendingInitialRoomSelection) {
          ui.messagesContainer.innerHTML = renderInlineRoomSelection();
        } else {
          ui.messagesContainer.innerHTML = `
            <div class="no-room-container">
              <div class="no-room-icon">
                <i class="fas fa-door-open"></i>
              </div>
              <div class="no-room-title">أنت الآن خارج الغرف</div>
              <div class="no-room-text">
                للمشاركة في الدردشة والتفاعل مع الأعضاء، يرجى اختيار غرفة من قائمة الغرف المتاحة.
              </div>
              <button class="no-room-btn" id="browse-rooms-btn" onclick="toggleSidebar('rooms', getRoomsSidebarTitle(), loadRooms)">
                <i class="fas fa-th-large"></i>
                <span>تصفح قائمة الغرف</span>
              </button>
            </div>
          `;
        }
        
        // Add event listener to the container instead of the button directly
        ui.messagesContainer.removeEventListener('click', handleBrowseRoomsClick);
        ui.messagesContainer.addEventListener('click', handleBrowseRoomsClick);
      }
      
      // Change chat input area
      if (ui.chatInput) {
        const inputWrapper = ui.chatInput.parentElement;
        if (inputWrapper) {
          ui.chatInput.style.display = 'none';
          let noRoomMsg = document.getElementById('no-room-input-msg');
          if (!noRoomMsg) {
            noRoomMsg = document.createElement('div');
            noRoomMsg.id = 'no-room-input-msg';
            noRoomMsg.className = 'flex-grow-1 text-center py-1 text-muted small italic';
            noRoomMsg.style.border = '1px dashed #ccc';
            noRoomMsg.style.borderRadius = '4px';
            noRoomMsg.style.backgroundColor = '#f1f3f5';
            noRoomMsg.innerHTML = '<i class="fas fa-info-circle me-1"></i> يجب الانضمام لغرفة لإرسال الرسائل';
            inputWrapper.insertBefore(noRoomMsg, ui.chatInput);
          }
        }
      }
      
      // Disable buttons
      if (ui.chatForm) {
        const sendBtn = ui.chatForm.querySelector('button[type="submit"]');
        if (sendBtn) sendBtn.disabled = true;
      }
      
      if (ui.uploadBtn) ui.uploadBtn.disabled = true;
      if (ui.emojiBtn) ui.emojiBtn.disabled = true;
      if (ui.leaveRoomBtn) ui.leaveRoomBtn.disabled = true;
      if (ui.clearChatBtn) ui.clearChatBtn.disabled = true;
    } else {
      const canWriteInClosedChat = checkUserCanWriteInRoomChat(state.currentUser, room);
      const noRoomMsg = document.getElementById('no-room-input-msg');
      if (noRoomMsg) noRoomMsg.remove();
      
      // If we were in "No Room" state, clear the container for new messages
      if (ui.messagesContainer && ui.messagesContainer.querySelector('.no-room-container')) {
        ui.messagesContainer.innerHTML = '';
      }
  
      if (room && room.disableChat && !canWriteInClosedChat) {
        if (ui.chatInput) {
          ui.chatInput.style.display = 'block';
          ui.chatInput.disabled = true;
          ui.chatInput.placeholder = "الكتابة موقوفة حالياً في هذه الغرفة من قبل الإدارة...";
          ui.chatInput.classList.add('chat-input-disabled');
        }
        if (ui.chatForm) {
          const sendBtn = ui.chatForm.querySelector('button[type="submit"]');
          if (sendBtn) sendBtn.disabled = true;
        }
        if (ui.uploadBtn) ui.uploadBtn.disabled = true;
        if (ui.emojiBtn) ui.emojiBtn.disabled = true;
        if (ui.leaveRoomBtn) ui.leaveRoomBtn.disabled = false;
        if (ui.clearChatBtn) ui.clearChatBtn.disabled = false;
      } else {
        // Restore normal chat input
        if (ui.chatInput) {
          ui.chatInput.style.display = 'block';
          ui.chatInput.disabled = false;
          ui.chatInput.placeholder = "اكتب رسالتك هنا...";
          ui.chatInput.classList.remove('chat-input-disabled');
          
          ui.chatInput.setAttribute('autocomplete', 'new-password');
          ui.chatInput.setAttribute('autocorrect', 'off');
          ui.chatInput.setAttribute('autocapitalize', 'off');
          ui.chatInput.setAttribute('spellcheck', 'false');
          ui.chatInput.setAttribute('name', `chat_message_${Date.now()}`);
        }
        
        if (ui.chatForm) {
          const sendBtn = ui.chatForm.querySelector('button[type="submit"]');
          if (sendBtn) sendBtn.disabled = false;
        }
        
        if (ui.uploadBtn) ui.uploadBtn.disabled = false;
        if (ui.botMsgBtn) ui.botMsgBtn.disabled = false;
        if (ui.emojiBtn) ui.emojiBtn.disabled = false;
        if (ui.leaveRoomBtn) ui.leaveRoomBtn.disabled = false;
        if (ui.clearChatBtn) ui.clearChatBtn.disabled = false;
      }
    }
  
  
    updateExtraActionsVisibility();
  
  
    // Refresh settings sidebar if it's currently open to update moderator buttons
    if (state.activeSidebarTab === 'settings' && currentSettingsView === 'settings') {
      renderSettings(true);
    } else if (state.activeSidebarTab !== 'settings') {
      // Force reset currentSettingsView if we are not in settings tab
      currentSettingsView = null;
    }
  
    if (window.voiceManager) {
      window.voiceManager.updateUI();
    }
  } catch (error) {
    console.error('Error in updateChatUI:', error);
  }
}

function initBotMessaging() {
  if (!ui.botMsgBtn || !ui.botModeBar) return;

  ui.botMsgBtn.addEventListener('click', () => {
    // Hide extra actions menu
    if (ui.extraActionsMenu) ui.extraActionsMenu.classList.add('d-none');
    if (ui.extraActionsToggle) ui.extraActionsToggle.classList.remove('active');

    // Show bot mode bar
    ui.botModeBar.classList.remove('d-none');
    ui.botModeBar.classList.add('d-flex');
    
    // Default: Reset to selection view
    if(ui.botModeSelection) {
      ui.botModeSelection.classList.remove('d-none');
      ui.botModeSelection.classList.add('d-flex');
    }
    if(ui.botModeToggle) {
      ui.botModeToggle.classList.add('d-none');
      ui.botModeToggle.classList.remove('d-flex');
    }
    
    renderOnlineBotsForSelection();
  });

  const hideBotMode = () => {
    ui.botModeBar.classList.add('d-none');
    ui.botModeBar.classList.remove('d-flex');
    if (ui.botModeSelect) ui.botModeSelect.value = "";
    if (ui.chatInput) ui.chatInput.placeholder = "اكتب رسالتك هنا...";
    if (ui.toggleSelf) ui.toggleSelf.checked = true; // reset toggle to self
  };

  if (ui.exitBotModeBtn) ui.exitBotModeBtn.addEventListener('click', hideBotMode);
  if (ui.exitBotModeBtn2) ui.exitBotModeBtn2.addEventListener('click', hideBotMode);

  if (ui.botModeSelect) {
    ui.botModeSelect.addEventListener('change', (e) => {
      const selectedBotId = e.target.value;
      if (!selectedBotId) return;

      const selectedBotName = e.target.options[e.target.selectedIndex].text;
      
      // Switch from Selection to Toggle UI
      if (ui.botModeSelection && ui.botModeToggle) {
        ui.botModeSelection.classList.add('d-none');
        ui.botModeSelection.classList.remove('d-flex');

        ui.botModeToggle.classList.remove('d-none');
        ui.botModeToggle.classList.add('d-flex');
        
        ui.labelToggleSelf.textContent = `👤 أنا`;
        ui.labelToggleBot.textContent = `${selectedBotName}`;
        
        // Save the bot ID to the toggle button
        ui.toggleBot.dataset.botId = selectedBotId;
        
        // Auto-activate the bot toggle
        ui.toggleBot.checked = true;
        ui.chatInput.placeholder = `التحدث كـ ${selectedBotName.replace('🤖 ', '')}...`;
      }
    });
  }

  if(ui.changeBotBtn) {
    ui.changeBotBtn.addEventListener('click', () => {
      ui.botModeToggle.classList.add('d-none');
      ui.botModeToggle.classList.remove('d-flex');
      
      ui.botModeSelection.classList.remove('d-none');
      ui.botModeSelection.classList.add('d-flex');
      
      ui.botModeSelect.value = '';
      ui.chatInput.placeholder = "اكتب رسالتك هنا...";
    });
  }

  if(ui.toggleSelf && ui.toggleBot) {
    ui.toggleSelf.addEventListener('change', () => {
      if(ui.toggleSelf.checked && ui.chatInput) {
        ui.chatInput.placeholder = "اكتب رسالتك هنا...";
      }
    });
    ui.toggleBot.addEventListener('change', () => {
      if(ui.toggleBot.checked && ui.chatInput) {
        const botName = ui.labelToggleBot.textContent.replace('🤖 ', '');
        ui.chatInput.placeholder = `التحدث كـ ${botName}...`;
      }
    });
  }
}

function renderOnlineBotsForSelection() {
  if (!ui.botModeSelect) return;

  const onlineBots = state.currentUsers.filter(u => u.isVirtualUser && Number(u.roomId) === Number(state.currentRoomId));
  
  // Clear existing options
  ui.botModeSelect.innerHTML = '<option value="" disabled selected>اختر البوت المتصل...</option>';

  if (onlineBots.length === 0) {
    const opt = document.createElement('option');
    opt.value = "";
    opt.disabled = true;
    opt.style.color = "#000";
    opt.textContent = 'لا يوجد بوتات متصلة حالياً...';
    ui.botModeSelect.appendChild(opt);
  } else {
    onlineBots.forEach(bot => {
      const opt = document.createElement('option');
      opt.value = bot.socketId; // Use socketId or some unique key
      opt.style.color = "#000";
      opt.textContent = `🤖 ${bot.topic || bot.username}`;
      ui.botModeSelect.appendChild(opt);
    });
  }
}

ui.leaveRoomBtn.addEventListener('click', () => {
  if (!state.currentRoomId || state.isRoomFrozen) return;
  
  if (window.voiceManager) {
    window.voiceManager.cleanup();
  }

  if (window.musicManager) {
    console.log('[LeaveRoom] Resetting music manager');
    window.musicManager.reset();
  }
  
  socket.emit('leave-room');
  pendingInitialRoomSelection = false;
  state.setIsRoomFrozen(true);
  state.setCurrentRoomId(0);
  preserveMessagesAfterLeave = true;

  updateChatUI();

  if (ui.chatInput) {
    ui.chatInput.disabled = true;
    ui.chatInput.placeholder = "أنت خارج الغرفة";
  }

  requestAnimationFrame(() => {
    openSidebarTab('rooms', getRoomsSidebarTitle(), loadRooms, { forceRefresh: true });
  });
});

async function logout() {
  console.log('Logout initiated');
  isLoggingOut = true;
  window.isLoggingOut = true;
  hasJoinedChatOnce = false;
  window.hasJoinedChatOnce = false;
  isLoginSocketSwitch = false;
  hideReconnectBar();
  
  if (
    window.voiceManager &&
    typeof window.voiceManager.stopSilentAudioSession === 'function'
  ) {
    window.voiceManager.stopSilentAudioSession();
  }
  if (window.voiceManager) {
    window.voiceManager.cleanup();
  }

  if (window.musicManager) {
    console.log('[Logout] Resetting music manager');
    window.musicManager.reset({ destroyPlayer: true });
  }
  
  try {
    // Wait for the server to process the logout and mark user as Ghost, so they don't remain stuck
    await new Promise(resolve => {
      if (!socket || !socket.connected) {
        resolve();
        return;
      }

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };

      socket.emit('logout', () => finish());
      setTimeout(finish, 500); // 500ms fallback
    });

    let token = null;
    try { token = getToken(); } catch (e) {}
    if (token) {
      // Use window.fetch directly to avoid infinite loop if logout itself returns 401
      await window.fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).catch(e => console.warn('Logout API call failed:', e));
    }
  } catch (e) {
    console.warn('Logout process error:', e);
  } finally {
    try {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('chat_client_session_id');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('chat_client_session_id');
      state.setCurrentUser(null);
      state.setCurrentRoomId(0);
      pendingInitialRoomSelection = false;
      
      // Disable reconnection on old session
      if (socket && socket.io) {
        socket.io.opts.reconnection = false;
      }

      // Reset socket auth
      socket.auth = { token: null, clientSessionId: null };
    } catch (e) {
      console.warn('Could not clear session data:', e);
    }
    
    // UI Updates
    window.cleanupUIForLogin();
    
    if (typeof window.startPublicOnlineUsersPolling === 'function') {
      window.startPublicOnlineUsersPolling();
    }
    
    // Disconnect socket (do not reconnect as guest to prevent unwanted module loading)
    if (socket) {
      socket.disconnect();
    }
    
    console.log('Logout complete - reloading page');
    window.location.reload();
  }
}

// Terminal exit handling is now managed safely server-side via socket disconnect grace period (120s) and explicit page reload detection in initApp.


ui.clearChatBtn.addEventListener('click', () => {
  // Hide extra actions menu
  if (ui.extraActionsMenu) ui.extraActionsMenu.classList.add('d-none');
  if (ui.extraActionsToggle) ui.extraActionsToggle.classList.remove('active');

  if (!hasPermission('canDeletePublicMessages')) {
    Swal.fire({
      text: 'لا تملك صلاحية حذف الرسائل العامة.',
      icon: 'error',
      confirmButtonText: 'حسناً'
    });
    return;
  }

  socket.emit('clear-room-chat', { roomId: state.currentRoomId });
});

// Emoji Picker Logic
let currentPickerTab = 'smiley';

let activeEmojiInput = null;

