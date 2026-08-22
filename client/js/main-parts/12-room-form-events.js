/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 12/28 · room-form-events
   lines 3853–4118 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function initializeRoomFormEvents() {
  const form = document.getElementById('create-room-form');
  if (!form) return;

  // Handle Create/Edit Room Form Submission
  form.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const isEdit = e.target.dataset.mode === 'edit';
    const roomId = formData.get('roomId');

    // Ensure checkboxes are included even if unchecked
    ['allowCamera', 'allowVoiceMics', 'allowBroadcast', 'preventHiddenUsers', 'useBanner', 'useThumbnail', 'allowRoomMusic', 'moderatorsCanManageMusic', 'membersCanRequestMusic', 'disableChat', 'allowModsWriteInClosedChat', 'removePassword'].forEach(name => {
      const el = e.target.querySelector(`[name="${name}"]`);
      if (el) formData.set(name, el.checked ? 'true' : 'false');
    });
    
    try {
      const url = isEdit ? `/api/rooms/${roomId}` : '/api/rooms';
      const method = isEdit ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method: method,
        headers: {
          'Authorization': `Bearer ${getToken()}`
        },
        body: formData // FormData handles file uploads
      });
      if (res.ok) {
        const modalEl = document.getElementById('createRoomModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        loadRooms();
        e.target.reset();
        e.target.dataset.mode = 'create';
        const roomIdInput = e.target.querySelector('[name="roomId"]');
        if (roomIdInput) roomIdInput.remove();
        document.getElementById('thumbnail-preview').src = 'https://picsum.photos/seed/room/100/100';
      } else {
        const errorData = await res.json();
        showToast(errorData.message || (isEdit ? 'فشل تعديل الغرفة' : 'فشل إنشاء الغرفة'));
      }
    } catch (err) {
      showToast('حدث خطأ أثناء الاتصال بالخادم');
    }
  };

  // Thumbnail Preview
  const thumbnailInput = document.getElementById('thumbnail-input');
  if (thumbnailInput) {
    thumbnailInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          document.getElementById('thumbnail-preview').src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    };
  }
  
  // Banner Preview
  const bannerInput = document.getElementById('banner-input');
  if (bannerInput) {
    bannerInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          document.getElementById('banner-preview').src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    };
  }

  // Sync Color Inputs
  const syncColors = (textName, hexName) => {
    const textInput = document.querySelector(`[name="${textName}"]`);
    const hexInput = document.querySelector(`[name="${hexName}"]`);
    if (textInput && hexInput) {
      textInput.addEventListener('input', (e) => {
        if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
          hexInput.value = e.target.value;
        }
      });
      hexInput.addEventListener('input', (e) => {
        textInput.value = e.target.value;
      });
    }
  };
  syncColors('roomNameColor', 'roomNameColorHex');
  syncColors('roomMessageColor', 'roomMessageColorHex');
  syncColors('roomBackgroundColor', 'roomBackgroundColorHex');
  
  // Reset form on modal hide
  const roomModalEl = document.getElementById('createRoomModal');
  if (roomModalEl) {
    roomModalEl.addEventListener('hidden.bs.modal', () => {
      const form = document.getElementById('create-room-form');
      const modalTitle = document.querySelector('#createRoomModal .modal-title');
      const submitBtn = form.querySelector('button[type="submit"]');

      modalTitle.innerHTML = '<i class="fas fa-comments"></i><span>إنشاء غرفة جديدة</span>';
      submitBtn.innerHTML = '<i class="fas fa-plus"></i> إنشاء الغرفة';
      
      form.reset();
      form.dataset.mode = 'create';
      
      // Remove roomId input if it exists
      const roomIdInput = form.querySelector('[name="roomId"]');
      if (roomIdInput) roomIdInput.remove();
      
      // Reset file input and preview
      const thumbnailInput = document.getElementById('thumbnail-input');
      if (thumbnailInput) thumbnailInput.value = '';
      document.getElementById('thumbnail-preview').src = 'https://picsum.photos/seed/room/100/100';
    });
  }
}

// Initialize once
initializeRoomFormEvents();

socket.on('room-changed', ({ roomId, room }) => {
  try {
    if (typeof roomId !== 'undefined') {
      state.setCurrentRoomId(roomId);
      if (state.currentUser) {
        state.currentUser.roomId = roomId;
      }
    }
    if (roomId && roomId !== 0 && String(roomId) !== '0') {
      socket.emit('battle:syncState', { roomId });
    }
    hasJoinedChatOnce = true;
    window.hasJoinedChatOnce = true;
    isLoginSocketSwitch = false;
    hideReconnectBar();

    window.roomsData = window.roomsData || {};

    if (room && room.id) {
      window.roomsData[room.id] = room;
    }

    if (presenceUsersMap && presenceUsersMap.size > 0) {
      updateUsersList(Array.from(presenceUsersMap.values()), { force: true });
    }

    const roomData = findRoomData(room || roomId);
    const roomName = roomData?.name || (room ? room.name : `غرفة ${roomId}`);
    if (typeof window.performTransition === 'function') {
      window.performTransition(roomId, roomName);
    }
    if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
      window.updateLiveBroadcastButtonVisibility();
    }
    if (typeof window.updateVoiceBarVisibility === 'function') {
      window.updateVoiceBarVisibility(room || roomId);
    }
  } catch (err) {
    console.error('[Main] Error handling room-changed event:', err);
  }
});

socket.on('room-updated', (updatedRoom) => {
  if (window.roomsData) {
    window.roomsData[updatedRoom.id] = updatedRoom;
  }
  if (state.rooms) {
    const index = state.rooms.findIndex(r => r.id === updatedRoom.id);
    if (index !== -1) {
      state.rooms[index] = updatedRoom;
    }
  }
  
  if (state.activeSidebarTab === 'rooms') {
    renderRoomsInSidebar(state.rooms);
  } else {
    loadedTabs['rooms'] = false;
  }
  
  if (String(state.currentRoomId) === String(updatedRoom.id)) {
    updateChatUI();
    if (typeof window.updateVoiceBarVisibility === 'function') {
      window.updateVoiceBarVisibility(updatedRoom);
    }
    if (window.voiceManager) window.voiceManager.updateUI();
    if (window.musicManager) window.musicManager.updateUI();
    
    if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
      window.updateLiveBroadcastButtonVisibility();
    }

    // Refresh moderator section if modal is open
    const modalEl = document.getElementById('createRoomModal');
    if (modalEl && modalEl.classList.contains('show')) {
      window.populateModeratorSection(updatedRoom);
      window.populateMicManagementSection(updatedRoom);
    }
  }
});

window.performTransition = (id, name) => {
  preserveMessagesAfterLeave = false;
  if (window.musicManager) window.musicManager.reset();
  state.setCurrentRoomId(id);
  if (window.musicManager) window.musicManager.refreshState();
  updateChatUI();
  cancelReply();
  
  if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
    window.updateLiveBroadcastButtonVisibility();
  }

  if (state.activeSidebarTab === 'rooms' && state.rooms) {
    renderRoomsInSidebar(state.rooms);
  }
};

window.changeRoom = (id, name) => {
    // Handle numeric IDs passed as strings
    if (typeof id === 'string' && !isNaN(id) && id.trim() !== '') {
      id = Number(id);
    }
    
    pendingInitialRoomSelection = false;
  if (state.currentRoomId === id) {
    return; // Already in this room
  }

  state.setIsRoomFrozen(false);
  ui.chatInput.disabled = false;
  ui.chatInput.placeholder = "اكتب رسالتك هنا...";

  if (window.musicManager) window.musicManager.reset();

  if (window.voiceManager) {
    window.voiceManager.cleanup();
  }

  const room = window.roomsData[id];
  
  const canBypassRestrictions = state.hasPermission(state.currentUser, 'canAccessLockedAndFullRooms');

  if (room && room.isLocked && !canBypassRestrictions) {
    const pModalEl = document.getElementById('passwordModal');
    const modal = bootstrap.Modal.getInstance(pModalEl) || new bootstrap.Modal(pModalEl);
    modal.show();
    const submitPasswordBtn = document.getElementById('submit-password-btn');
    if (submitPasswordBtn) {
      submitPasswordBtn.onclick = () => {
        const password = document.getElementById('room-password-input').value;
        socket.emit('change-room', { roomId: id, password: password });
        modal.hide();
        document.getElementById('room-password-input').value = '';
      };
    }
  } else {
    socket.emit('change-room', { roomId: id });
  }
  if (window.musicManager) window.musicManager.refreshState();
};

