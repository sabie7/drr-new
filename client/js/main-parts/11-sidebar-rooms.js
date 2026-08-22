/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 11/28 · sidebar-rooms
   lines 3610–3852 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function renderRoomsInSidebar(rooms) {
  let sidebarHTML = '';
  
  // Add Waiting Room to rendering list if admin permissions (always for admins)
  const canSeeWaitingRoomInList = state.isInWaitingRoom || hasPermission('canManageRooms') || hasPermission('canManageUsers');
  
  let roomsToRender = rooms.filter(r => {
    if (state.waitingRoomId && r.id === state.waitingRoomId) {
      return canSeeWaitingRoomInList;
    }
    return true;
  });
  
  // Add Create Room button if permitted
  if (hasPermission('canCreateRooms')) {
    sidebarHTML += `
      <button class="btn btn-success w-100 rounded-0 p-2" onclick="window.openCreateRoomModal()">
        <i class="fas fa-plus"></i> إنشاء غرفة جديدة
      </button>
    `;
  }

  roomsToRender.sort((a, b) => {
    const levelA = Number(a.roomLevel) || 0;
    const levelB = Number(b.roomLevel) || 0;
    const normA = levelA === 0 ? Number.MAX_SAFE_INTEGER : levelA;
    const normB = levelB === 0 ? Number.MAX_SAFE_INTEGER : levelB;
    if (normA !== normB) return normA - normB;
    return Number(a.id) - Number(b.id);
  });

  sidebarHTML += roomsToRender.filter(r => r.isActive).map(r => {
    const isBg = r.useBanner && r.roomBackgroundImage && r.roomBackgroundImage.length > 0;
    const isActive = r.id === state.currentRoomId;
    const lockIcon = r.isLocked ? '<i class="fas fa-lock text-warning ms-1"></i>' : '';
    const icons = lockIcon;

    const nameColor = r.roomNameColor || '';
    const descColor = r.roomMessageColor || '';
    const bgColor = r.roomBackgroundColor || '';
    const bgStyle = bgColor ? `background-color: ${bgColor};` : '';

    const stats = window.roomsStats && window.roomsStats[r.id] ? window.roomsStats[r.id] : { currentUsersCount: 0, micsEnabled: false };
    const userCount = stats.currentUsersCount;
    const micsEnabled = stats.micsEnabled;
    
    const countIcon = micsEnabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-user"></i>';
    const countClass = micsEnabled ? 'room-user-count active-mics' : 'room-user-count';

    if (isBg) {
      return `
        <div class="room-card room-card-bg ${isActive ? 'active' : ''}" style="background-image: url('${r.roomBackgroundImage}'); ${bgStyle}" onclick="window.changeRoom('${r.id}', '${r.name}')">
          <div class="d-flex justify-content-between align-items-center">
            <div class="fw-bold" style="color: ${nameColor}">${r.name} ${icons}</div>
            <div class="${countClass}">${countIcon} ${userCount}/${r.capacity}</div>
          </div>
          <div class="small room-description-text-big mt-1" style="font-size: 0.8rem; color: ${descColor}">${r.roomDescription || ''}</div>
        </div>
      `;
    } else {
      return `
        <div class="room-card ${isActive ? 'active' : ''} d-flex align-items-center gap-2" onclick="window.changeRoom('${r.id}', '${r.name}')" style="padding: 0 !important; ${bgStyle}">
          <img src="${window.getRoomThumbnailUrl(r)}" class="room-card-thumbnail" referrerPolicy="origin-when-cross-origin">
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between align-items-center">
              <div class="fw-bold small" style="color: ${nameColor}">${r.name} ${icons}</div>
              <div class="${countClass} px-2">${countIcon} ${userCount}/${r.capacity}</div>
            </div>
            <div class="text-muted small room-description-text-small" style="font-size: 0.7rem; color: ${descColor} !important;">${r.roomDescription || ''}</div>
          </div>
        </div>
      `;
    }
  }).join('');

  ui.sidebarRoomsContainer.innerHTML = sidebarHTML;
  
  if (state.activeSidebarTab === 'rooms') {
    if (ui.sidebarTitle) ui.sidebarTitle.innerText = getRoomsSidebarTitle(rooms);
  }
}

function findRoomData(roomOrRoomId) {
  if (roomOrRoomId && typeof roomOrRoomId === 'object' && roomOrRoomId.id !== undefined) {
    return roomOrRoomId;
  }
  
  const targetId = (roomOrRoomId !== undefined && roomOrRoomId !== null && roomOrRoomId !== '')
    ? roomOrRoomId 
    : (state.currentRoomId || (state.currentUser && state.currentUser.roomId));

  if (targetId === undefined || targetId === null || String(targetId) === '0') {
    return null;
  }

  const normId = String(targetId);

  if (window.roomsData) {
    if (Array.isArray(window.roomsData)) {
      const found = window.roomsData.find(r => r && String(r.id) === normId);
      if (found) return found;
    } else if (typeof window.roomsData === 'object') {
      if (window.roomsData[targetId]) return window.roomsData[targetId];
      if (window.roomsData[normId]) return window.roomsData[normId];
      for (const key in window.roomsData) {
        const r = window.roomsData[key];
        if (r && String(r.id) === normId) return r;
      }
    }
  }

  if (state.rooms && Array.isArray(state.rooms)) {
    const found = state.rooms.find(r => r && String(r.id) === normId);
    if (found) return found;
  }

  return null;
}

window.updateVoiceBarVisibility = function(roomOrRoomId) {
  const voiceTopBar = document.querySelector('.voice-top-bar');
  if (!voiceTopBar) return;

  const room = findRoomData(roomOrRoomId);
  const targetId = room ? room.id : (roomOrRoomId !== undefined && roomOrRoomId !== null && typeof roomOrRoomId !== 'object' ? roomOrRoomId : state.currentRoomId);

  const isInRoom = targetId !== undefined && targetId !== null && String(targetId) !== '0';
  
  let allowVoice = false;
  if (isInRoom && room) {
    const val = room.allowVoiceMics;
    allowVoice = (val === true || val === 1 || val === '1' || val === 'true');
  }

  if (allowVoice) {
    voiceTopBar.classList.remove('d-none');
    voiceTopBar.classList.add('d-flex');
  } else {
    voiceTopBar.classList.add('d-none');
    voiceTopBar.classList.remove('d-flex');
  }
};

window.syncVoiceMicSlots = function(roomOrRoomId) {
  const room = findRoomData(roomOrRoomId);
  const voiceTopBar = document.querySelector('.voice-top-bar');
  if (!voiceTopBar) return;

  const maxMics = room ? (room.roomMaxMicSlots || 4) : 4;
  const lockedMics = (room && room.lockedMics) ? room.lockedMics : [];

  for (let i = 1; i <= 7; i++) {
    const btn = document.getElementById(`mic-${i}`);
    if (!btn) continue;

    if (room && i <= maxMics) {
      btn.classList.remove('d-none');
      const isLocked = lockedMics.includes(i - 1);
      btn.classList.toggle('locked', isLocked);
      btn.disabled = isLocked;
      btn.title = isLocked ? 'المايك مقفل' : `مايك ${i}`;

      const content = btn.querySelector('.mic-content');
      if (content) {
        let icon = content.querySelector('i');
        if (isLocked) {
          if (!icon) {
            const newIcon = document.createElement('i');
            newIcon.className = 'fas fa-lock';
            content.appendChild(newIcon);
          } else {
            icon.className = 'fas fa-lock';
          }
        } else {
          if (icon && icon.classList.contains('fa-lock')) {
            icon.className = 'fas fa-microphone';
          }
        }
      }
    } else {
      btn.classList.add('d-none');
    }
  }

  if (window.voiceManager && typeof window.voiceManager.updateUI === 'function') {
    window.voiceManager.updateUI();
  }
};

let activeLoadRoomsPromise = null;

async function loadRooms() {
  if (activeLoadRoomsPromise) {
    return activeLoadRoomsPromise;
  }

  activeLoadRoomsPromise = (async () => {
    try {
      const res = await fetch('/api/rooms', {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      const rooms = await res.json();
      window.roomsData = window.roomsData || {};
      state.setRooms(rooms);

      if (Array.isArray(rooms)) {
        rooms.forEach(r => {
          if (r && r.id) {
            window.roomsData[r.id] = r;
          }
        });
      }

      renderRoomsInSidebar(rooms);

      if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
        window.updateLiveBroadcastButtonVisibility();
      }

      if (typeof window.updateVoiceBarVisibility === 'function') {
        window.updateVoiceBarVisibility(state.currentRoomId);
      }
      if (typeof window.syncVoiceMicSlots === 'function') {
        window.syncVoiceMicSlots(state.currentRoomId);
      }

      if (pendingInitialRoomSelection && state.currentRoomId === 0) {
        updateChatUI();
      }
      return rooms;
    } catch (err) {
      if (ui.sidebarRoomsContainer) {
        ui.sidebarRoomsContainer.innerHTML = '<div class="p-3 text-danger">فشل تحميل الغرف</div>';
      }
    } finally {
      activeLoadRoomsPromise = null;
    }
  })();

  return activeLoadRoomsPromise;
}

// Register Room creation/edit form handlers exactly once (to prevent duplicate event listeners and memory leaks)
