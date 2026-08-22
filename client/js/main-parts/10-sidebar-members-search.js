/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 10/28 · sidebar-members-search
   lines 3182–3609 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function resetSidebarMemberSearch() {
  currentSidebarSearchQuery = '';
  if (ui.sidebarSearchInput) {
    ui.sidebarSearchInput.value = '';
  }
}
window.resetSidebarMemberSearch = resetSidebarMemberSearch;

if (ui.sidebarSearchInput) {
  ui.sidebarSearchInput.addEventListener('input', (e) => {
    currentSidebarSearchQuery = e.target.value.trim().toLowerCase();
    clearTimeout(sidebarSearchTimeout);
    sidebarSearchTimeout = setTimeout(() => {
      if (state.activeSidebarTab === 'users') {
        renderUsersInSidebar(state.currentUsers);
      }
    }, 100); // More instant
  });
}

window.openCreateRoomModal = () => {
  const modalEl = document.getElementById('createRoomModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  const form = document.getElementById('create-room-form');
  const modalTitle = document.querySelector('#createRoomModal .modal-title');
  const submitBtn = form.querySelector('button[type="submit"]');

  modalTitle.innerHTML = '<i class="fas fa-comments"></i><span>إنشاء غرفة جديدة</span>';
  submitBtn.innerHTML = '<i class="fas fa-plus"></i> إنشاء الغرفة';
  
  form.reset();
  form.dataset.mode = 'create';
  
  // Hide moderator section on create
  const modSection = document.getElementById('moderator-section');
  if (modSection) modSection.classList.add('d-none');
  
  // Hide mic management section on create
  const micSection = document.getElementById('mic-management-section');
  if (micSection) micSection.classList.add('d-none');
  
  // Reset previews
  document.getElementById('thumbnail-preview').src = 'https://picsum.photos/seed/room/100/100';
  document.getElementById('banner-preview').src = 'https://picsum.photos/seed/banner/100/100';
  
  // Hide remove password container on create
  const removePasswordContainer = document.getElementById('remove-password-container');
  if (removePasswordContainer) removePasswordContainer.classList.add('d-none');
  const removePasswordCheckbox = form.querySelector('[name="removePassword"]');
  if (removePasswordCheckbox) removePasswordCheckbox.checked = false;

  // Set default colors: White bg, Black text
  if (form.querySelector('[name="roomNameColorHex"]')) {
    form.querySelector('[name="roomNameColorHex"]').value = '#000000';
  }
  if (form.querySelector('[name="roomMessageColorHex"]')) {
    form.querySelector('[name="roomMessageColorHex"]').value = '#000000';
  }
  if (form.querySelector('[name="roomBackgroundColorHex"]')) {
    form.querySelector('[name="roomBackgroundColorHex"]').value = '#ffffff';
  }

  modal.show();
};

window.populateModeratorSection = (room) => {
  const modSection = document.getElementById('moderator-section');
  if (!modSection) return;
  
  const isRoomOwner = room.ownerId === state.currentUser.id;
  const isGlobalAdmin = hasPermission('canManageRooms');
  
  if (isRoomOwner || isGlobalAdmin) {
    modSection.classList.remove('d-none');
    
    const modSelect = document.getElementById('moderator-select');
    modSelect.innerHTML = '<option value="">اختر عضواً لإضافته كمراقب</option>';
    
    const modList = document.getElementById('moderators-list');
    modList.innerHTML = '';
    
    // Populate moderators
    if (room.moderators && Array.isArray(room.moderators)) {
      room.moderators.forEach(mod => {
        const modId = typeof mod === 'number' ? mod : mod.userId;
        const modUser = state.currentUsers.find(u => u.userId === modId);
        const modName = modUser ? modUser.username : (mod.username || `عضو (${modId})`);
        
        const badge = document.createElement('span');
        badge.className = 'badge bg-warning text-dark d-flex align-items-center gap-2 p-2 px-3 rounded-pill';
        badge.style.fontSize = 'var(--font-size)';
        badge.style.fontWeight = 'var(--font-weight)';
        badge.innerHTML = `
          ${modName} 
          <i class="fas fa-cog cursor-pointer ms-1" title="تعديل الصلاحيات" onclick="window.openModeratorPermissionsModal(${modId}, '${modName}', ${room.id})"></i>
          <i class="fas fa-times cursor-pointer" title="حذف المراقب" onclick="removeModerator(${modId}, ${room.id})"></i>
        `;
        modList.appendChild(badge);
      });
    }
    
    // Optimized moderator IDs set lookup
    const modIdsSet = new Set((room.moderators || []).map(m => typeof m === 'number' ? m : Number(m.userId)));
    
    // Populate select with non-moderator registered users in the room
    state.currentUsers.forEach(u => {
      const isMod = modIdsSet.has(Number(u.userId));
      if (u.roomId === room.id && u.type === 'member' && !isMod) {
        const option = document.createElement('option');
        option.value = u.userId;
        option.textContent = u.username;
        modSelect.appendChild(option);
      }
    });

    const addModBtn = document.getElementById('add-moderator-btn');
    addModBtn.onclick = () => {
      const userId = modSelect.value;
      if (!userId) return;
      socket.emit('toggle-room-moderator', { targetUserId: userId, roomId: room.id });
      // UI will update via room-updated event
    };
  } else {
    modSection.classList.add('d-none');
  }
};

window.populateMicManagementSection = (room) => {
  const micSection = document.getElementById('mic-management-section');
  const micList = document.getElementById('mic-management-list');
  if (!micSection || !micList) return;

  const isRoomOwner = room.ownerId === state.currentUser.id;
  const isGlobalAdmin = hasPermission('canManageRooms');
  const modObj = (room.moderators || []).find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
  const permissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
  const canManageMics = isRoomOwner || isGlobalAdmin || permissions.includes('canToggleMicLock');

  if (canManageMics) {
    micSection.classList.remove('d-none');
    micList.innerHTML = '';

    const maxMics = room.roomMaxMicSlots || 4;
    const lockedMics = room.lockedMics || [];

    for (let i = 0; i < maxMics; i++) {
      const isLocked = lockedMics.includes(i);
      const micBtn = document.createElement('div');
      micBtn.className = `mic-manage-btn p-2 border rounded cursor-pointer d-flex flex-column align-items-center justify-content-center ${isLocked ? 'bg-danger text-white' : 'bg-success text-white'}`;
      micBtn.style.width = '40px';
      micBtn.style.height = '40px';
      micBtn.innerHTML = `
        <i class="fas ${isLocked ? 'fa-lock' : 'fa-microphone'}"></i>
        <span style="font-size: 9px;">${i + 1}</span>
      `;
      micBtn.onclick = () => {
        socket.emit('toggle-mic-lock', { roomId: room.id, micIndex: i });
      };
      micList.appendChild(micBtn);
    }
  } else {
    micSection.classList.add('d-none');
  }
};

window.openModeratorPermissionsModal = async (userId, username, roomId) => {
  const modalEl = document.getElementById('modPermissionsModal');
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  
  document.getElementById('mod-perm-username').textContent = username;
  const form = document.getElementById('mod-permissions-form');
  form.targetUserId.value = userId;
  
  // Reset checkboxes
  form.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  
  // Fetch current permissions
  try {
    const response = await fetch(`/api/rooms/${roomId}?t=${Date.now()}`);
    const room = await response.json();
    const mod = (room.moderators || []).find(m => (typeof m === 'number' ? m === Number(userId) : Number(m.userId) === Number(userId)));
    
    if (mod && typeof mod === 'object' && mod.permissions) {
      mod.permissions.forEach(p => {
        const cb = form.querySelector(`input[value="${p}"]`);
        if (cb) cb.checked = true;
      });
    }
  } catch (error) {
    console.error('Failed to fetch room data for permissions:', error);
  }
  
  form.onsubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const permissions = formData.getAll('permissions');
    socket.emit('update-room-moderator-permissions', { targetUserId: userId, targetUsername: username, roomId, permissions });
    modal.hide();
  };
  
  modal.show();
};

window.openEditRoomModal = async () => {
  const roomId = state.currentRoomId;
  if (!roomId) {
    showToast('لا توجد غرفة حالية');
    return;
  }
  
  // Fetch room data
  try {
    const res = await fetch(`/api/rooms/${roomId}?t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to fetch room data');
    const room = await res.json();
    
    // Ensure moderators and lockedMics are Arrays (safe parsing if received as string)
    if (room) {
      if (typeof room.moderators === 'string') {
        try {
          room.moderators = JSON.parse(room.moderators);
        } catch (e) {
          console.error('Failed to parse moderators string:', e);
          room.moderators = [];
        }
      }
      if (!room.moderators || !Array.isArray(room.moderators)) {
        room.moderators = [];
      }

      if (typeof room.lockedMics === 'string') {
        try {
          room.lockedMics = JSON.parse(room.lockedMics);
        } catch (e) {
          console.error('Failed to parse lockedMics string:', e);
          room.lockedMics = [];
        }
      }
      if (!room.lockedMics || !Array.isArray(room.lockedMics)) {
        room.lockedMics = [];
      }
    }
    
    // Populate modal
    const modalEl = document.getElementById('createRoomModal');
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    const form = document.getElementById('create-room-form');
    const modalTitle = document.querySelector('#createRoomModal .modal-title');
    const submitBtn = form.querySelector('button[type="submit"]');

    modalTitle.innerHTML = '<i class="fas fa-edit"></i><span>تعديل الغرفة</span>';
    submitBtn.innerHTML = '<i class="fas fa-save"></i> حفظ التعديلات';
    
    // Fill form fields
    form.querySelector('[name="name"]').value = room.name || '';
    form.querySelector('[name="roomDescription"]').value = room.roomDescription || '';
    form.querySelector('[name="roomWelcomeMessage"]').value = room.roomWelcomeMessage || '';
    form.querySelector('[name="requiredLikes"]').value = room.requiredLikes || '';
    form.querySelector('[name="roomPassword"]').value = ''; // Don't show real password
    form.querySelector('[name="capacity"]').value = room.capacity || 4;
    if (form.querySelector('[name="roomMaxMicSlots"]')) form.querySelector('[name="roomMaxMicSlots"]').value = room.roomMaxMicSlots || 4;
    
    // Populate colors
    if (form.querySelector('[name="roomNameColor"]')) form.querySelector('[name="roomNameColor"]').value = room.roomNameColor || '';
    if (form.querySelector('[name="roomNameColorHex"]')) form.querySelector('[name="roomNameColorHex"]').value = room.roomNameColor || '#000000';
    if (form.querySelector('[name="roomMessageColor"]')) form.querySelector('[name="roomMessageColor"]').value = room.roomMessageColor || '';
    if (form.querySelector('[name="roomMessageColorHex"]')) form.querySelector('[name="roomMessageColorHex"]').value = room.roomMessageColor || '#000000';
    if (form.querySelector('[name="roomBackgroundColor"]')) form.querySelector('[name="roomBackgroundColor"]').value = room.roomBackgroundColor || '';
    if (form.querySelector('[name="roomBackgroundColorHex"]')) form.querySelector('[name="roomBackgroundColorHex"]').value = room.roomBackgroundColor || '#ffffff';
    
    // Add hidden field for roomId
    let roomIdInput = form.querySelector('[name="roomId"]');
    if (!roomIdInput) {
      roomIdInput = document.createElement('input');
      roomIdInput.type = 'hidden';
      roomIdInput.name = 'roomId';
      form.appendChild(roomIdInput);
    }
    roomIdInput.value = roomId;
    
    // Update form action/method for edit
    form.dataset.mode = 'edit';
    
    // Populate checkboxes
    form.querySelector('[name="allowCamera"]').checked = !!room.allowCamera;
    if (form.querySelector('[name="allowVoiceMics"]')) form.querySelector('[name="allowVoiceMics"]').checked = !!room.allowVoiceMics;
    form.querySelector('[name="allowBroadcast"]').checked = !!room.allowBroadcast;
    form.querySelector('[name="preventHiddenUsers"]').checked = !!room.preventHiddenUsers;
    form.querySelector('[name="useBanner"]').checked = !!room.useBanner;
    form.querySelector('[name="useThumbnail"]').checked = !!room.useThumbnail;
    if (form.querySelector('[name="allowRoomMusic"]')) form.querySelector('[name="allowRoomMusic"]').checked = room.allowRoomMusic !== false;
    if (form.querySelector('[name="moderatorsCanManageMusic"]')) form.querySelector('[name="moderatorsCanManageMusic"]').checked = room.moderatorsCanManageMusic !== false;
    if (form.querySelector('[name="membersCanRequestMusic"]')) form.querySelector('[name="membersCanRequestMusic"]').checked = room.membersCanRequestMusic !== false;
    if (form.querySelector('[name="disableChat"]')) form.querySelector('[name="disableChat"]').checked = !!room.disableChat;
    if (form.querySelector('[name="allowModsWriteInClosedChat"]')) form.querySelector('[name="allowModsWriteInClosedChat"]').checked = room.allowModsWriteInClosedChat !== false;
    
    if (form.querySelector('[name="roomMaxMicSlots"]')) {
      form.querySelector('[name="roomMaxMicSlots"]').value = room.roomMaxMicSlots || 4;
    }
    
    // Update image previews
    document.getElementById('thumbnail-preview').src = room.roomThumbnail || 'https://picsum.photos/seed/room/100/100';
    document.getElementById('banner-preview').src = room.roomBackgroundImage || 'https://picsum.photos/seed/banner/100/100';
    
    // Show/Hide remove password container
    const removePasswordContainer = document.getElementById('remove-password-container');
    if (removePasswordContainer) {
      removePasswordContainer.classList.toggle('d-none', !room.isLocked);
    }
    const removePasswordCheckbox = form.querySelector('[name="removePassword"]');
    if (removePasswordCheckbox) removePasswordCheckbox.checked = false;

    // Moderator Section
    window.populateModeratorSection(room);

    // Mic Management Section
    window.populateMicManagementSection(room);

    // Room Bans Section
    const roomBansSection = document.getElementById('room-bans-section');
    if (roomBansSection) {
      const isRoomOwner = room.ownerId === state.currentUser.id;
      const isGlobalAdmin = hasPermission('canManageRooms') || (state.currentUser && state.currentUserfalse);
      const modObj = (room.moderators || []).find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
      const permissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
      const canBan = isRoomOwner || isGlobalAdmin || permissions.includes('canBanUsers');
      
      roomBansSection.classList.toggle('d-none', !canBan);
      if (canBan) {
        socket.emit('get-room-bans', { roomId: roomId });
      }
    }

    // Enforce permissions for moderators
    const isRoomOwner = room.ownerId === state.currentUser.id;
    const isGlobalAdmin = hasPermission('canManageRooms') || (state.currentUser && state.currentUserfalse);
    const modObj = (room.moderators || []).find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const permissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    
    const canEdit = (perm) => isRoomOwner || isGlobalAdmin || permissions.includes(perm);

    const toggleField = (selector, perm) => {
      const el = form.querySelector(selector);
      if (!el) return;
      const allowed = canEdit(perm);
      const parent = el.closest('.mb-2') || el.closest('.col-4') || el.closest('.form-check') || el.parentElement;
      if (!allowed) {
        if (parent) parent.classList.add('d-none');
        el.disabled = true;
      } else {
        if (parent) parent.classList.remove('d-none');
        el.disabled = false;
      }
    };

    toggleField('[name="name"]', 'canEditName');
    toggleField('[name="roomDescription"]', 'canEditDescription');
    toggleField('[name="roomWelcomeMessage"]', 'canEditWelcomeMessage');
    toggleField('[name="roomMaxUsers"]', 'canEditCapacity');
    toggleField('[name="capacity"]', 'canEditCapacity');
    toggleField('[name="roomMaxMicSlots"]', 'canEditMaxMics');
    toggleField('[name="roomPassword"]', 'canEditPassword');
    
    toggleField('[name="roomNameColor"]', 'canEditColors');
    toggleField('[name="roomNameColorHex"]', 'canEditColors');
    toggleField('[name="roomMessageColor"]', 'canEditColors');
    toggleField('[name="roomMessageColorHex"]', 'canEditColors');
    toggleField('[name="roomBackgroundColor"]', 'canEditColors');
    toggleField('[name="roomBackgroundColorHex"]', 'canEditColors');
    
    toggleField('[name="allowCamera"]', 'canToggleMic');
    toggleField('[name="allowBroadcast"]', 'canToggleBroadcast');
    toggleField('[name="preventHiddenUsers"]', 'canToggleHidden');
    toggleField('[name="useBanner"]', 'canEditImages');
    toggleField('[name="useThumbnail"]', 'canEditImages');
    
    // Images
    const thumbContainer = document.getElementById('thumbnail-preview').parentElement;
    const bannerContainer = document.getElementById('banner-preview').parentElement;
    if (thumbContainer) thumbContainer.classList.toggle('d-none', !canEdit('canEditImages'));
    if (bannerContainer) bannerContainer.classList.toggle('d-none', !canEdit('canEditImages'));

    modal.show();
  } catch (err) {
    console.error('Error in openEditRoomModal:', err);
    showToast('فشل تحميل بيانات الغرفة');
  }
};

window.removeModerator = (userId, roomId) => {
  socket.emit('toggle-room-moderator', { targetUserId: userId, roomId: roomId });
  // UI will update via room-updated event
};
if (ui.toggleSoundBtn) {
  ui.toggleSoundBtn.onclick = () => {
    isSoundMuted = !isSoundMuted;
    
    if (window.voiceManager) {
      window.voiceManager.setIncomingMuted(isSoundMuted);
    }
    
    if (state.currentUser) {
      state.currentUser.isSpeakerMuted = isSoundMuted;
    }
    
    socket.emit('voice:speaker-muted', { isMuted: isSoundMuted });
    
    const currentUserId = state.currentUser ? (state.currentUser.id || state.currentUser.userId) : '';
    const currentUsername = state.currentUser ? state.currentUser.username : '';
    if (currentUserId || currentUsername) {
      if (typeof window.updateSpeakerMutedIcon === 'function') {
        window.updateSpeakerMutedIcon(currentUserId, currentUsername, isSoundMuted);
      }
    }
    
    const icon = ui.toggleSoundBtn.querySelector('i');
    if (isSoundMuted) {
      icon.className = 'fas fa-volume-mute';
      ui.toggleSoundBtn.classList.add('btn-danger');
      ui.toggleSoundBtn.classList.remove('btn-success');
    } else {
      icon.className = 'fas fa-volume-up';
      ui.toggleSoundBtn.classList.remove('btn-danger');
      ui.toggleSoundBtn.classList.add('btn-success');
    }
  };
}

