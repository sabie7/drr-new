/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 20/28 · chat-send-room-ui
   lines 7265–7538 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function handleRealActivity() {
  lastRealActivityAt = Date.now();
  const wasIdle = presenceIdleSent;
  presenceIdleSent = false;
  if (wasIdle || (lastRealActivityAt - lastActivityEmit > 5000)) {
    if (socket && socket.connected) {
      socket.emit('activity');
    }
    lastActivityEmit = lastRealActivityAt;
  }
}

if (ui.chatInput) {
  ui.chatInput.addEventListener('input', () => {
    if (ui.chatInput.value.trim().length > 0) {
      handleRealActivity();
    }
  });
}

document.addEventListener('input', (e) => {
  const target = e.target;
  if (!target) return;

  if (target === ui.chatInput || target.id === 'chat-input') {
    handleRealActivity();
    return;
  }

  if (target.id === 'private-chat-input' || (target.classList && target.classList.contains('private-chat-input'))) {
    handleRealActivity();
    return;
  }

  if (target.closest && target.closest('#sidebar-wall-container')) {
    handleRealActivity();
    return;
  }
});

document.addEventListener('keydown', (e) => {
  const target = e.target;
  if (!target) return;
  if (target.id === 'chat-input' || target.id === 'private-chat-input' || (target.classList && target.classList.contains('private-chat-input'))) {
    handleRealActivity();
  }
});

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!target) return;
  if (target.closest && (
    target.closest('#chat-form') ||
    target.closest('.private-chat-window') ||
    target.closest('.private-chat-box') ||
    target.closest('#emoji-picker') ||
    target.closest('.smiley-item') ||
    target.closest('#send-btn')
  )) {
    handleRealActivity();
  }
});

setInterval(() => {
  if (!state.currentUser || !socket.connected) return;
  const now = Date.now();
  // If inactive for 3 minutes (we check every 30 seconds)
  if (now - lastRealActivityAt >= 3 * 60 * 1000) {
    if (!presenceIdleSent) {
      socket.emit('presence:idle', { reason: 'real_inactivity' });
      presenceIdleSent = true;
    }
  }
}, 30000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (socket && socket.connected) {
      if (!presenceIdleSent) {
        socket.emit('presence:idle', { reason: 'page_hidden' });
        presenceIdleSent = true;
      }
    }
  } else if (document.visibilityState === 'visible') {
    if (socket && !socket.connected && window.state && window.state.currentUser) {
      console.log('Page visible, requesting socket connection...');
      socket.connect();
    }
    // Staying yellow (idle) on tab reveal as requested, green only on chat interaction
  }
});

window.addEventListener('beforeunload', (e) => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  if (token && !isLoggingOut && !window.isLoggingOut) {
    const confirmationMessage = 'هل أنت متأكد من رغبتك في الخروج؟';
    e.preventDefault();
    e.returnValue = confirmationMessage;
    return confirmationMessage;
  }
});

window.addEventListener('pagehide', () => {
  // Mobile browsers fire pagehide when switching apps or locking the screen.
  // Emitting terminal-exit here causes the user to be kicked out on temporary backgrounding.
  // Instead, we let the socket disconnect handle it as a temporary disconnect.
  console.log('pagehide triggered - treating as temporary backgrounding');
});

if (ui.chatForm) {
  ui.chatForm.addEventListener('submit', () => handleRealActivity());
}

if (ui.extraActionsToggle) {
  ui.extraActionsToggle.onclick = (e) => {
    e.stopPropagation();
    ui.extraActionsMenu.classList.toggle('d-none');
    ui.extraActionsToggle.classList.toggle('active');
  };
}

// Filter monitor menu button click handler
const filterMenuBtn = document.getElementById('filter-monitor-menu-btn');
if (filterMenuBtn) {
    filterMenuBtn.onclick = (e) => {
        e.stopPropagation();
        if (ui.extraActionsMenu) ui.extraActionsMenu.classList.add('d-none');
        if (ui.extraActionsToggle) ui.extraActionsToggle.classList.remove('active');
        window.toggleFilterMonitorPanel();
    };
}

// Close extra actions menu when clicking outside
document.addEventListener('click', (e) => {
  if (ui.extraActionsMenu && !ui.extraActionsMenu.classList.contains('d-none')) {
    if (!ui.extraActionsMenu.contains(e.target) && e.target !== ui.extraActionsToggle && !ui.extraActionsToggle.contains(e.target)) {
      ui.extraActionsMenu.classList.add('d-none');
      ui.extraActionsToggle.classList.remove('active');
    }
  }
});

if (ui.chatForm) {
  ui.chatForm.setAttribute('autocomplete', 'off');
  
  if (ui.chatInput) {
    ui.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
        ui.chatForm.dispatchEvent(submitEvent);
      }
    });
  }

  ui.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!ui.chatInput) return;
    let text = ui.chatInput.value.trim();
    if (text && state.currentUser) {
      const messageData = { 
        user: state.currentUser,
        text, 
        roomId: state.currentRoomId,
        mediaUrl: pendingMediaData ? pendingMediaData.url : null,
        mediaType: pendingMediaData ? pendingMediaData.type : null,
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

      // Check if bot form is active via Toggle Mode
      if (ui.botModeBar && !ui.botModeBar.classList.contains('d-none') && ui.botModeToggle && !ui.botModeToggle.classList.contains('d-none')) {
        if (ui.toggleBot && ui.toggleBot.checked && ui.toggleBot.dataset.botId) {
          const selectedBotId = ui.toggleBot.dataset.botId;
          socket.emit('message-as-bot', {
            botId: selectedBotId,
            text: text,
            roomId: state.currentRoomId
          });
          ui.chatInput.value = '';
          return;
        }
      }

      socket.emit('message', messageData);
      ui.chatInput.value = '';
    }
  });
}

function cancelReply() {
  state.setReplyingTo(null);
  if (ui.replyPreview) ui.replyPreview.classList.add('d-none');
  if (ui.replyToMedia) ui.replyToMedia.innerHTML = '';
}

if (ui.cancelReply) ui.cancelReply.onclick = cancelReply;

function checkUserCanWriteInRoomChat(user, room) {
  try {
    if (!room) return true;
    
    // Ensure boolean
    const isChatDisabled = room.disableChat === true || room.disableChat === 'true';
    if (!isChatDisabled) return true;

    if (hasPermission('canManageRooms') || hasPermission('canManageAllRoomsInChat') || (user && (user.isAdmin || user.role === 'admin' || user.level >= 90))) {
      return true;
    }

    if (user && room.ownerId && (Number(room.ownerId) === Number(user.id) || Number(room.ownerId) === Number(user.userId))) {
      return true;
    }

    if (user && room.roomOwner && room.roomOwner === user.username) {
      return true;
    }

    const userId = user?.id || user?.userId;
    const username = user?.username;
    
    let moderators = room.moderators;
    if (typeof moderators === 'string') {
      try {
        moderators = JSON.parse(moderators);
      } catch (e) {
        moderators = [];
      }
    }
    if (!Array.isArray(moderators)) moderators = [];
    
    const validModerators = moderators.filter(m => m !== null && typeof m !== 'undefined');
    
    const modObj = validModerators.find(m => {
      if (typeof m === 'number' || typeof m === 'string') return Number(m) === Number(userId);
      return m && (Number(m.userId) === Number(userId) || m.username === username);
    });

    if (modObj) {
      const isModsAllowed = room.allowModsWriteInClosedChat !== false && room.allowModsWriteInClosedChat !== 'false';
      if (isModsAllowed) return true;
      const perms = (typeof modObj === 'object' && modObj && Array.isArray(modObj.permissions)) ? modObj.permissions : [];
      if (perms.includes('canWriteInClosedChat')) return true;
    }

    return false;
  } catch (error) {
    console.error('Error in checkUserCanWriteInRoomChat:', error);
    return true; // Default to true so we don't break login
  }
}

