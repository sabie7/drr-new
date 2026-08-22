/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 05/28 · rooms-render
   lines 907–1019 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function renderRoomCardHTML(room) {
    const stats = window.roomsStats && window.roomsStats[room.id] ? window.roomsStats[room.id] : { currentUsersCount: room.usersCount || 0 };
    const userCount = stats.currentUsersCount;
    const thumbUrl = typeof window.getRoomThumbnailUrl === 'function' ? window.getRoomThumbnailUrl(room) : '/uploads/site/room-default.png';
    const lockIcon = room.isLocked ? '<i class="fas fa-lock text-warning ms-1"></i>' : '';

    return `
      <div class="room-card" onclick="window.joinRoom(${room.id})">
        <img src="${thumbUrl}" class="room-card-img" alt="${room.name}" referrerPolicy="origin-when-cross-origin">
        <div class="p-2 text-center">
          <h6 class="fw-bold mb-1">${room.name} ${lockIcon}</h6>
          <span class="badge bg-secondary"><i class="fas fa-users"></i> ${userCount}</span>
        </div>
      </div>
    `;
}

function renderInlineRoomSelection() {
    const rooms = window.roomsData ? Object.values(window.roomsData).filter(r => r.isActive) : [];
    rooms.sort((a, b) => {
        const levelA = Number(a.roomLevel) || 0;
        const levelB = Number(b.roomLevel) || 0;
        const normA = levelA === 0 ? Number.MAX_SAFE_INTEGER : levelA;
        const normB = levelB === 0 ? Number.MAX_SAFE_INTEGER : levelB;
        if (normA !== normB) return normA - normB;
        return Number(a.id) - Number(b.id);
    });
    return `
      <div class="no-room-container no-room-with-list">
        <div class="no-room-title">أهلاً بك، اختر غرفتك لبدء الدردشة</div>
        <div class="no-room-rooms-list" id="rooms-grid">
          ${rooms.map(room => renderRoomCardHTML(room)).join('')}
        </div>
      </div>
    `;
}

// Room Music UI Handlers
document.addEventListener('click', (e) => {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const musicBtn = e.target.closest('#btn-room-music');
  if (musicBtn) {
    const modalElement = document.getElementById('roomMusicModal');
    if (!modalElement) return;
    
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    
    // Check permissions
    const user = state.currentUser;
    const room = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const isAdmin = false;
    const hasMusicPerm = state.hasPermission(user, 'canUseRoomMusic');
    const hasRequestPerm = state.hasPermission(user, 'canRequestMusic');
    
    // Check if user is moderator
    const isModerator = room && (room.ownerId === user.id || (room.moderators || []).some(m => (typeof m === 'number' ? m === user.id : Number(m.userId) === Number(user.id))));

    // Check if room allows music
    if (room && room.allowRoomMusic === false && !isAdmin) {
        showToast('الموسيقى معطلة في هذه الغرفة');
        return;
    }

    // Allow everyone to open the modal to see what's playing, but restrict actions inside
    
    const adminControls = document.getElementById('music-admin-controls');
    if (adminControls) {
      if (isAdmin || hasMusicPerm || (room && room.moderatorsCanManageMusic && isModerator)) {
        adminControls.classList.remove('d-none');
      } else {
        adminControls.classList.add('d-none');
      }
    }
    
    // Update current info
    const music = window.musicManager ? window.musicManager.currentMusic : null;
    const infoSection = document.getElementById('current-music-info');
    const playedBy = document.getElementById('music-played-by');
    const playbackControls = document.getElementById('music-playback-controls');

    if (music && infoSection) {
      infoSection.classList.remove('d-none');
      if (playedBy) playedBy.textContent = music.playedBy.username;
      if (playbackControls && (isAdmin || hasMusicPerm)) {
        playbackControls.classList.remove('d-none');
      }
    } else if (infoSection) {
      infoSection.classList.add('d-none');
      if (playbackControls) playbackControls.classList.add('d-none');
    }

    // Local volume/mute state
    if (window.musicManager) {
      const volInput = document.getElementById('music-local-volume');
      if (volInput) volInput.value = window.musicManager.localVolume;
      
      const muteBtn = document.getElementById('btn-music-local-mute');
      if (muteBtn) {
        if (window.musicManager.isLocalMuted) {
          muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
          muteBtn.classList.add('btn-danger');
        } else {
          muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
          muteBtn.classList.remove('btn-danger');
        }
      }
    }

    modal.show();
  }
});

// Music Search
