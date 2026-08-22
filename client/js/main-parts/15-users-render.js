/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 15/28 · users-render
   lines 5395–6114 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function memberStateBadgeHtml(u) {
  if (!u || u.isAdmin === true || u.isBotOrVirtual === true || u.isVirtualUser === true) return '';
  const isGuest = u.type === 'guest' || u.guestId;
  const text = isGuest ? 'زائر جديد' : 'عضو جديد';
  const color = isGuest ? '#0d6efd' : '#28a745';
  return '<span class="member-state-badge" style="display:inline-block;font-size:11px;font-weight:700;padding:1px 6px;border-radius:8px;background:#f1f3f5;color:' + color + ';margin:2px 0 0;line-height:1.4;">' + text + '</span>';
}
window.memberStateBadgeHtml = memberStateBadgeHtml;

function renderUserObj(u) {
  const selectedCountry = (u.profileCountry || u.country || '')
    .toString()
    .trim()
    .toLowerCase();

  const countryCode = selectedCountry && selectedCountry !== 'unknown'
    ? selectedCountry
    : null;
  let statusColor = '#6c757d'; // Offline (gray)
  if (u.isOnline) {
    if (u.isVirtualUser && u.onlineStatusStr) {
      if (u.onlineStatusStr === 'أخضر') statusColor = '#28a745';
      else if (u.onlineStatusStr === 'أحمر') statusColor = '#dc3545';
      else if (u.onlineStatusStr === 'أصفر') statusColor = '#ffc107';
      else if (u.onlineStatusStr === 'أزرق') statusColor = '#007bff';
      else statusColor = '#6c757d';
    } else if (u.isGhost) {
      statusColor = '#6c757d'; // Ghost (gray)
    } else if (u.isHidden) {
      statusColor = '#007bff'; // Hidden (blue)
    } else if (u.isReconnecting) {
      statusColor = '#ffc107'; // Reconnecting (yellow)
    } else {
      statusColor = (u.isIdle || u.presenceState === 'idle') ? '#ffc107' : '#28a745'; // Idle (yellow) or Active (green)
    }
  }
  const ghostStyle = '';
  const cameraMutedImg = (window.domainConfig && window.domainConfig.cameraMutedImageUrl) ? 
    `<img src="${window.domainConfig.cameraMutedImageUrl}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 0;">` : 
    `<i class="fas fa-camera" style="font-size: 16px;"></i>`;

  const currentRoom = window.currentRoom || window.currentRoomData || (window.roomsData && state.currentRoomId ? window.roomsData[state.currentRoomId] : null);
  const roomAllowsCamera = currentRoom?.allowCamera === true;

  const cameraHtml = (roomAllowsCamera && u.allowCamera && (u.userId || u.id) !== (state.currentUser?.userId || state.currentUser?.id)) ? `
    <div class="camera-sidebar-icon js-camera-request-btn ${u.isBroadcasting ? 'active' : ''}" data-user-id="${u.userId || u.id}" title="طلب مشاهدة الكاميرا" style="margin: 0 !important; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;">
      ${cameraMutedImg}
    </div>
  ` : '';

  let liveBroadcastHtml = '';
  if (u.isLiveBroadcasting === true && (u.userId || u.id) !== (state.currentUser?.userId || state.currentUser?.id)) {
    let shouldShowIcon = true;
    if (u.liveBroadcastScope === 'room') {
      const uRoomId = String(u.liveBroadcastRoomId || u.roomId);
      const myRoomId = String(state.currentRoomId || (state.currentUser && state.currentUser.roomId));
      if (uRoomId !== myRoomId) {
        shouldShowIcon = false;
      }
    }

    if (shouldShowIcon) {
      const isScreen = u.liveBroadcastSource === 'screen';
      const iconClass = isScreen ? 'fas fa-desktop' : 'fas fa-video';
      const isRoom = u.liveBroadcastScope === 'room';
      const titleText = isRoom ? 'بث مباشر للغرفة' : 'بث مباشر للجميع';
      const uId = u.userId || u.id;
      liveBroadcastHtml = `
        <div class="live-broadcast-sidebar-icon js-live-broadcast-btn active" data-user-id="${uId}" title="${titleText}" style="margin: 0 !important; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #6f42c1; color: #fff; cursor: pointer; font-size: 11px; animation: livePulse 1.4s infinite;">
          <i class="${iconClass}"></i>
        </div>
      `;
    }
  }
  
  const storyInfo = (typeof window.getSidebarStoryInfo === 'function') ? window.getSidebarStoryInfo(u.userId ?? u.id) : { hasUnviewed: false, count: 0 };
  
  const hasDesign = !!(u.membershipFrame || u.membershipBg);
  
  const showAvatar = u.showMembershipAvatar !== false;
  const showName = u.showMembershipName !== false;
  const showStatus = u.showMembershipStatus !== false;
  
  const storyColor = /^#[0-9A-Fa-f]{6}$/.test(u.ucol || '')
    ? u.ucol
    : '#ff2f7d';
  
  let html = '';
  
  if (hasDesign) {
    const normalAvatarHtml = window.renderAvatar(
      u,
      '',
      'width: 72px; height: 72px;',
      ''
    );
    const avatarHtml = storyInfo.hasUnviewed ? `
      <div class="sidebar-story-membership-wrap has-unviewed js-sidebar-story-avatar"
           data-user-id="${u.userId ?? u.id}"
           title="عرض الستوري"
           style="--story-ring-color: ${storyColor};">
        <div class="sidebar-story-membership-inner">
          ${normalAvatarHtml}
        </div>
        <span class="sidebar-story-count-badge">${storyInfo.count}</span>
      </div>
    ` : normalAvatarHtml;

    const bgStyle = u.membershipBg ? `background: url('${u.membershipBg}'); background-size: cover; background-position: center;` : 'background: #fff;';
    const textColor = u.membershipBg ? '#fff' : (u.ucol || '#000');
    const textShadow = '';
    const isActuallyOnline = u.isOnline && !u.isGhost;
    const isYellow = statusColor === '#ffc107';
    const borderColor = (isActuallyOnline && u.allowPrivate === false && !isYellow) ? '#dc3545' : statusColor;
    const ghostStyle = u.isGhost ? 'border-left: 4px solid #808080 !important;' : '';
    
    const isClickable = !!state.currentUser;
    const userKey = u.key || getPresenceKey(u);
    const domId = getPresenceDomId(userKey);
    html = `
    <div id="${domId}" class="list-group-item d-flex align-items-center border-0 border-bottom p-0 user-pro-item ${isClickable ? 'js-user-profile-btn' : ''} ${u.isGhost ? 'ghost-user' : ''}" ${isClickable ? `data-username="${escapeHTML(u.username)}"` : ''} data-user-id="${u.userId ?? u.id}" style="border-left: 5px solid ${borderColor} !important; min-height: 80px; ${bgStyle} ${textShadow} ${ghostStyle} overflow: hidden; position: relative;">
      ${showAvatar ? `
      <div style="margin: 5px 10px; flex-shrink: 0; z-index: 1;">
        ${avatarHtml}
      </div>
      ` : ''}
      <div class="flex-grow-1 ps-1 py-1 d-flex flex-column" style="min-width: 0; z-index: 1; padding-right: 4px !important; flex: 1;">
        ${showName ? `
        <div class="fw-bold d-flex align-items-center flex-wrap" style="font-size: 17px; font-family: var(--font-family); line-height: 1.2; padding-right: 45px; width: 100%;">
          ${window.renderUserIdentity(u, {
              containerClasses: 'user-addon-container font-weight-bold',
              nameStyle: `color: ${u.ucol || textColor};`
          })}
          ${(cameraHtml || liveBroadcastHtml) ? `
          <div class="sidebar-name-actions d-inline-flex align-items-center gap-1" style="margin-right: 5px; margin-left: 5px; vertical-align: middle;">
            ${cameraHtml}
            ${liveBroadcastHtml}
          </div>
          ` : ''}
${(window.roomsData && window.roomsData[state.currentRoomId] && window.roomsData[state.currentRoomId].moderators && window.roomsData[state.currentRoomId].moderators.some(m => (typeof m === 'number' ? m === u.userId : Number(m.userId) === Number(u.userId)))) ? '<i class="fas fa-user-shield text-warning" title="مراقب الغرفة" style="margin-left: 4px;"></i>' : ''}
        </div>
        ${memberStateBadgeHtml(u)}
        ` : ''}
        ${showStatus ? `
        <div class="user-sidebar-status fw-bold" style="color: ${(window.featuresSettings.statusColorEnabled === true && u.mcol) ? u.mcol : '#888'}; width: 100%; display: block;">
          ${u.msg || (u.type === 'guest' ? 'زائر' : 'عضو')}
        </div>
        ` : ''}
      </div>
      <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">
        ${(u.showMembershipFlag !== false && countryCode) ? `<img src="/flags/${countryCode}.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); object-fit: cover;">` : ''}
        ${(u.userId && u.showMembershipId !== false && !isNaN(Number(u.userId))) ? `<span style="font-size: 11px; font-weight: 900; color: ${u.membershipBg ? '#fff' : '#6c757d'}; letter-spacing: 0.5px;">#${Math.abs(Number(u.userId))}</span>` : ''}
      </div>
    </div>
  `;
  } else {
    // Default design for users without design
    const userId = u.userId ?? u.id;
    const normalAvatarHtml = `<img src="${window.getAvatarUrl(u)}" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;" referrerPolicy="origin-when-cross-origin" class="user-avatar js-user-profile-btn" data-user-id="${userId}" data-username="${escapeHTML(u.username || '')}">`;
    const avatarHtml = storyInfo.hasUnviewed ? `
      <div class="sidebar-story-avatar-wrap has-unviewed js-sidebar-story-avatar"
           data-user-id="${userId}"
           title="عرض الستوري"
           style="--story-ring-color: ${storyColor};">
        <img src="${window.getAvatarUrl(u)}"
             class="sidebar-story-avatar-img"
             referrerPolicy="origin-when-cross-origin">
        <span class="sidebar-story-count-badge">${storyInfo.count}</span>
      </div>
    ` : normalAvatarHtml;

    const isActuallyOnline = u.isOnline && !u.isGhost;
    const isYellow = statusColor === '#ffc107';
    const borderColor = (isActuallyOnline && u.allowPrivate === false && !isYellow) ? '#dc3545' : statusColor;
    const ghostStyle = u.isGhost ? 'border-left: 4px solid #808080 !important;' : '';
    const isClickable = !!state.currentUser;
    const userKey = u.key || getPresenceKey(u);
    const domId = getPresenceDomId(userKey);
    html = `
    <div id="${domId}" class="list-group-item d-flex align-items-start border-0 border-bottom p-0 ${isClickable ? 'js-user-profile-btn' : ''}" ${isClickable ? `data-username="${escapeHTML(u.username)}"` : ''} data-user-id="${u.userId ?? u.id}" style="border-left: 4px solid ${borderColor} !important; min-height: 52px; background-color: #fff; ${ghostStyle}; cursor: default; position: relative;">
      <div style="position: relative; width: 50px; height: 50px; margin: 1px; flex-shrink: 0;">
        ${avatarHtml}
      </div>
      <div class="flex-grow-1 ps-1 d-flex flex-column" style="min-width: 0; padding-right: 4px !important; flex: 1;">
        <div class="user-sidebar-name fw-bold d-flex align-items-center flex-wrap" style="padding-right: 35px; width: 100%;">
          ${window.renderUserIdentity(u, {
              containerClasses: 'user-addon-container font-weight-bold',
              nameStyle: `color: ${u.ucol || '#000000'};`
          })}
          ${(cameraHtml || liveBroadcastHtml) ? `
          <div class="sidebar-name-actions d-inline-flex align-items-center gap-1" style="margin-right: 5px; margin-left: 5px; vertical-align: middle;">
            ${cameraHtml}
            ${liveBroadcastHtml}
          </div>
          ` : ''}
        </div>
        ${memberStateBadgeHtml(u)}
        <div class="user-sidebar-status fw-bold" style="color: ${(window.featuresSettings.statusColorEnabled === true && u.mcol) ? u.mcol : '#888'}; width: 100%; display: block; margin: 0; padding: 0; line-height: 1.3;">
          ${u.msg || (u.type === 'guest' ? 'زائر' : 'عضو')}
        </div>
      </div>
      <div class="d-flex flex-column align-items-center pt-1 pe-1 flex-shrink-0" style="position: absolute; top: 2px; right: 4px; z-index: 2;">
        ${(u.showMembershipFlag !== false && countryCode) ? `<img src="/flags/${countryCode}.png" style="width: 20px; height: 20px; margin-bottom: 2px; object-fit: cover; border-radius: 1px;">` : ''}
        ${(u.userId && u.showMembershipId !== false && !isNaN(Number(u.userId))) ? `<span class="text-muted" style="font-size: 10px; font-weight: bold;">#${Math.abs(Number(u.userId))}</span>` : ''}
      </div>
    </div>
  `;
  }
  
  const finalUserKey = u.key || getPresenceKey(u);
  const finalDomId = getPresenceDomId(finalUserKey);
  return { id: finalDomId, html: html };
}

window.renderUsersInSidebar = renderUsersInSidebar;
function renderUsersInSidebar(users) {
  // If the search input has a value but currentSidebarSearchQuery is empty,
  // it means the browser autofilled it without user input. Clear it.
  if (ui.sidebarSearchInput && ui.sidebarSearchInput.value !== '' && !currentSidebarSearchQuery) {
    ui.sidebarSearchInput.value = '';
  }
  let filtered = users;
  if (currentSidebarSearchQuery) {
    filtered = users.filter(u => 
      (u.username && u.username.toLowerCase().includes(currentSidebarSearchQuery)) || 
      (u.topic && u.topic.toLowerCase().includes(currentSidebarSearchQuery)) ||
      (u.userId && u.userId.toString().includes(currentSidebarSearchQuery)) ||
      (u.id && u.id.toString().includes(currentSidebarSearchQuery))
    );
  }

  const onlineUsers = filtered.filter(u => u.isOnline || u.isGhost);
  const currentRoomUsers = onlineUsers.filter(u => Number(u.roomId) === Number(state.currentRoomId));
  const otherRoomUsers = onlineUsers.filter(u => Number(u.roomId) !== Number(state.currentRoomId));
  
  const sidebarItems = [];

  if (currentRoomUsers.length > 0) {
    sidebarItems.push(...currentRoomUsers.map(renderUserObj));
  }
  
  if (otherRoomUsers.length > 0) {
    sidebarItems.push({
      id: 'other-rooms-header',
      html: `
      <div id="other-rooms-header" class="other-rooms-header">
        المتواجدين في الدردشة
      </div>
      `
    });
    sidebarItems.push(...otherRoomUsers.map(renderUserObj));
  }

  if (ui.sidebarUsersContainer) {
    syncDOMList(ui.sidebarUsersContainer, sidebarItems);
    if (typeof window.applyMicStateBadges === 'function') window.applyMicStateBadges();
  }
}

// Reflect the live voice state next to usernames in the sidebar: a green mic for
// anyone currently raised on a mic, and a red mute icon for speaker-muted users.
window.applyMicStateBadges = function () {
  var onMic = {};
  var mics = null;
  var vm = window.voiceManager || (window.p && window.p.voiceManager);
  if (vm && vm.state && vm.state.micsState) mics = vm.state.micsState;
  else if (window.voiceState && window.voiceState.micsState) mics = window.voiceState.micsState;
  if (mics) {
    Object.keys(mics).forEach(function (idx) {
      var u = mics[idx];
      if (!u) return;
      if (u.userId !== undefined && u.userId !== null) onMic['id:' + u.userId] = true;
      if (u.socketId) onMic['sock:' + u.socketId] = true;
      if (u.username) onMic['name:' + u.username] = true;
    });
  }

  var items = document.querySelectorAll('#sidebar-users-container .user-pro-item');
  items.forEach(function (el) {
    var uid = el.getAttribute('data-user-id');
    var uname = el.getAttribute('data-username');
    var isOn = false;
    if (uid) isOn = onMic['id:' + uid] === true;
    if (!isOn && uname) isOn = onMic['name:' + uname] === true;

    var user = null;
    if (Array.isArray(state.currentUsers)) {
      user = state.currentUsers.find(function (cu) {
        return String(cu.userId || cu.id || '') === String(uid || '') || (uname && cu.username === uname);
      }) || null;
    }
    var isMuted = !!(user && (user.isSpeakerMuted === true || user.isSpeakerMuted === 'true'));

    el.querySelectorAll('.mic-raised-badge, .speaker-muted-badge').forEach(function (b) { b.remove(); });
    var nameRow = el.querySelector('.fw-bold.d-flex');
    if (!nameRow) return;
    if (isOn) {
      var b = document.createElement('span');
      b.className = 'mic-raised-badge';
      b.title = 'صاعد على الجلسة (مايك)';
      b.style.cssText = 'color:#28a745;font-size:12px;margin-left:4px;vertical-align:middle;';
      b.innerHTML = '<i class="fas fa-microphone-alt"></i>';
      nameRow.appendChild(b);
    }
    if (isMuted) {
      var m = document.createElement('span');
      m.className = 'speaker-muted-badge';
      m.title = 'كاتم صوت المايكات';
      m.style.cssText = 'color:#e74c3c;font-size:12px;margin-left:4px;vertical-align:middle;';
      m.innerHTML = '<i class="fas fa-volume-mute"></i>';
      nameRow.appendChild(m);
    }
  });
};

window.openGamesView = function() {
  toggleSidebar('games', 'الألعاب', async () => {
    const GamesManager = await window.ensureGamesManagerLoaded();
    GamesManager.loadGamesLobby();
  });
};

window.openActiveGamesView = function() {
  toggleSidebar('spectate', 'الألعاب الجارية', async () => {
    const GamesManager = await window.ensureGamesManagerLoaded();
    GamesManager.activeSpectateGames = GamesManager.activeSpectateGames || [];
    GamesManager.renderSpectateGamesList();
    if (window.socket) {
      window.socket.emit('game:spectate:list');
    }
  });
};

window.renderAddons = async function() {
  const canSeeAddons = window.featuresSettings?.sidebarAddonsEnabled === true || 
                       hasPermission('canUseAddons') || 
                       hasPermission('canManageAddons') ||
                       hasPermission('canviewsvisitprofile');
                       
  if (!canSeeAddons) {
    showToast('غير مسموح لك بالوصول إلى الإضافات');
    return;
  }

  currentAddonMode = 'self';
  currentSettingsView = 'addons';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'الإضافات';
  ui.sidebarSettingsContainer.innerHTML = `
    <div class="classic-settings-container">
      <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderSettings()">
        <i class="fas fa-chevron-right btn-icon-left"></i>
        <span>العودة للضبط</span>
      </button>
      <button class="classic-btn classic-btn-white sidebar-action position-relative" onclick="window.renderNotifications()">
        <i class="fas fa-bell btn-icon-left"></i>
        <span>الإشعارات</span>
        ${(window.pendingZajelModeration && window.pendingZajelModeration.size > 0) ? `
          <span class="badge bg-danger rounded-pill position-absolute" style="left: 10px; top: 50%; transform: translateY(-50%); font-size: 11px;">
            ${window.pendingZajelModeration.size}
          </span>
        ` : ''}
      </button>
      ${hasPermission('canDesignMembership') ? `
      <button class="classic-btn classic-btn-white sidebar-action" onclick="window.renderMembershipDesign()">
        <i class="fas fa-id-badge btn-icon-left"></i>
        <span>تصميم العضوية</span>
      </button>
      ` : ''}
      <button class="classic-btn classic-btn-white sidebar-action" onclick="window.openGamesView()">
        <i class="fas fa-gamepad btn-icon-left"></i>
        <span>الألعاب</span>
      </button>
      
      ${hasPermission('canviewsvisitprofile') ? `
      <button class="classic-btn classic-btn-white sidebar-action" onclick="window.renderProfileVisitors()">
        <i class="fas fa-eye btn-icon-left"></i>
        <span>زائرين البروفايل</span>
      </button>
      ` : ''}

      <button class="classic-btn classic-btn-white sidebar-action" onclick="window.renderIgnoredUsers()">
        <i class="fas fa-user-slash btn-icon-left"></i>
        <span>المستخدمون المتجاهلون (${state.ignoredUsers.size})</span>
      </button>

      <button class="classic-btn classic-btn-white sidebar-action" onclick="window.renderWallCreators()">
        <i class="fas fa-award btn-icon-left"></i>
        <span>لوحة الشرف</span>
      </button>

      <button id="toggle-dark-mode-btn" class="settings-action-btn classic-btn classic-btn-white sidebar-action mb-2">
        <i class="fas fa-moon btn-icon-left"></i>
        <span>الوضع الليلي</span>
      </button>

    </div>
  `;
};

window.renderIgnoredUsers = function() {
  currentSettingsView = 'ignoredUsers';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'المستخدمون المتجاهلون';

  let html = `
    <div class="classic-settings-container p-3">
      <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
        <i class="fas fa-chevron-right btn-icon-left"></i>
        <span>العودة للإضافات</span>
      </button>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div class="m-0 text-dark font-weight-bold" style="font-size: 16px;"><i class="fas fa-user-slash text-danger me-2"></i>المستخدمون المتجاهلون</div>
        ${state.ignoredUsers.size > 0 ? `
          <button class="btn btn-sm btn-outline-danger" onclick="window.unignoreAllUsers()">
            <i class="fas fa-trash-alt"></i> إزالة كل التجاهل
          </button>
        ` : ''}
      </div>
  `;

  if (state.ignoredUsers.size === 0) {
    html += `
      <div class="text-center py-5 text-muted bg-light rounded border">
        <i class="fas fa-user-slash fa-3x mb-3" style="color: #ccc;"></i>
        <div class="font-weight-bold" style="font-size: 15px;">لا يوجد مستخدمون متجاهلون حالياً</div>
      </div>
    `;
  } else {
    html += '<div class="ignored-users-list px-2">';
    state.ignoredUsers.forEach(username => {
      // Try to find user info to get pic and full identity
      let user = null;
      if (state.currentUsers) {
         user = state.currentUsers.find(u => u.username === username);
      }
      if (!user && window.allUsers) {
         user = Object.values(window.allUsers).find(u => u.username === username);
      }
      
      const safeUsername = window.escapeHTML ? window.escapeHTML(username) : username;
      const avatarUrl = user ? window.getAvatarUrl(user) : '/default-avatar.png';
      
      let identityHtml = '';
      if (user && window.renderUserIdentity) {
        identityHtml = window.renderUserIdentity(user, { containerClasses: 'font-weight-bold flex-nowrap user-addon-container', nameStyle: `color: ${user.fontColor || '#000'}; font-size: 14px;` });
      } else {
        identityHtml = `<span class="font-weight-bold">${safeUsername}</span>`;
      }

      html += `
        <div class="creator-list-item d-flex align-items-center justify-content-between mb-2 px-3 py-2 bg-light shadow-sm" style="border-radius: 30px; border: 1px solid #dee2e6;">
          <div class="d-flex align-items-center overflow-hidden flex-grow-1 pe-2">
            <div class="creator-avatar me-3 flex-shrink-0">
              <img src="${avatarUrl}" style="border: 2px solid ${user ? (user.ucol || '#ccc') : '#ccc'}; width: 45px; height: 45px; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="creator-name flex-grow-1 text-truncate pe-2">
              ${identityHtml}
            </div>
          </div>
          <button class="btn btn-sm btn-danger flex-shrink-0" style="border-radius: 20px;" onclick="window.unignoreUserFromList('${encodeURIComponent(username)}')">
            إزالة التجاهل
          </button>
        </div>
      `;
    });
    html += '</div>';
  }

  html += `</div>`;
  ui.sidebarSettingsContainer.innerHTML = html;
};

window.unignoreUserFromList = function(encodedUsername) {
  const username = decodeURIComponent(encodedUsername);
  if (state.ignoredUsers.has(username)) {
    state.ignoredUsers.delete(username);
    if (typeof saveIgnoredUsers === 'function') {
      saveIgnoredUsers();
    }
    window.renderIgnoredUsers();
    if (typeof showToast === 'function') {
      showToast('تم إلغاء تجاهل العضو', 'success');
    }
  }
};

window.unignoreAllUsers = function() {
  if (state.ignoredUsers.size > 0) {
    state.ignoredUsers.clear();
    if (typeof saveIgnoredUsers === 'function') {
      saveIgnoredUsers();
    }
    window.renderIgnoredUsers();
    if (typeof showToast === 'function') {
      showToast('تم إزالة جميع المستخدمين من قائمة التجاهل', 'success');
    }
  }
};

window.renderProfileVisitors = async function() {
  currentSettingsView = 'profileVisitors';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'زائرين البروفايل';

  ui.sidebarSettingsContainer.innerHTML = `
    <div class="classic-settings-container p-3">
      <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
        <i class="fas fa-chevron-right btn-icon-left"></i>
        <span>العودة للإضافات</span>
      </button>
      <div class="text-center py-4">
        <i class="fas fa-spinner fa-spin fa-2x text-muted"></i>
        <div class="mt-2 text-muted">جاري تحميل الزوار...</div>
      </div>
    </div>
  `;

  try {
    const token = getToken();
    const [res, topRes] = await Promise.all([
      fetch('/api/profile-visits/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Chat-Token': token
        }
      }),
      fetch('/api/profile-visits/top', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Chat-Token': token
        }
      })
    ]);

    let data = { success: false, visitors: [] };
    let topData = { success: false, topVisitors: [] };

    try {
      if (res.ok) {
        data = await res.json();
      } else {
        console.error('Failed to load profile visits:', res.status, res.statusText);
      }
    } catch (e) {
      console.error('Error parsing profile visits json:', e);
    }

    try {
      if (topRes.ok) {
        topData = await topRes.json();
      } else {
        console.error('Failed to load top profile visits:', topRes.status, topRes.statusText);
      }
    } catch (e) {
      console.error('Error parsing top profile visits json:', e);
    }
    
    let html = `
      <div class="classic-settings-container p-3">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
    `;

    // Global Top 3 visitors section
    if (topData.success && topData.topVisitors && topData.topVisitors.length > 0) {
      const topVisitors = topData.topVisitors;
      
      const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return num;
      };

      html += '<div class="top-visitors-container mb-3 p-3 rounded" style="background-color: #efefef; position: relative;">';
      html += '<div class="text-center mb-4 font-weight-bold" style="font-size: 16px; color: #333;"><span style="font-family: Arial, sans-serif;">أعلى البروفايلات زيارة</span><i class="fas fa-award text-warning ms-1"></i></div>';
      html += '<div class="d-flex justify-content-center align-items-end gap-2" style="min-height: 180px;">';
      
      // Reorder for podium (2, 1, 3) - in RTL this places Rank 2 on the right, Rank 1 in the center, Rank 3 on the left.
      const podiumOrder = [
        topVisitors[1] ? { ...topVisitors[1], place: 2 } : null,
        topVisitors[0] ? { ...topVisitors[0], place: 1 } : null,
        topVisitors[2] ? { ...topVisitors[2], place: 3 } : null
      ].filter(Boolean);

      podiumOrder.forEach(item => {
        const liveUsers = (window.state && window.state.currentUsers) || window.onlineUsers || [];
        const activeUser = liveUsers.find(u => (u.id || u.userId) && (String(u.id || u.userId) === String(item.id || item.profileOwnerId)) || u.username === item.username);
        const renderUserData = activeUser ? { ...item, ...activeUser } : item;

        const safeUsernameAttr = window.escapeHTML ? window.escapeHTML(renderUserData.username) : renderUserData.username;
        let identityHtml = '';
        if (window.renderUserIdentity) {
            identityHtml = window.renderUserIdentity(renderUserData, { containerClasses: 'font-weight-bold flex-nowrap user-addon-container', nameStyle: `color: ${renderUserData.ucol || renderUserData.fontColor || '#000'}; font-size: 12px;` });
        } else {
            const safeUsernameDisp = window.escapeHTML ? window.escapeHTML(renderUserData.topic || renderUserData.username) : (renderUserData.topic || renderUserData.username);
            identityHtml = `<span style="color: ${renderUserData.ucol || renderUserData.fontColor || '#000'}; font-size: 12px; font-weight: bold;">${safeUsernameDisp}</span>`;
        }

        const avatarUrl = window.getAvatarUrl(renderUserData);
        const formattedVisits = formatNumber(renderUserData.visitCount || item.visitCount);
        
        let colorTheme = '';
        let height = '';
        let avatarSize = '';
        let crownHtml = '';
        let glowHtml = '';
        
        if (item.place === 1) {
            colorTheme = '#ffc107'; // Yellow/Gold
            height = '120px';
            avatarSize = '70px';
            crownHtml = '<i class="fas fa-crown" style="color: #ffc107; font-size: 26px; position: absolute; top: -25px; left: 50%; transform: translateX(-50%); text-shadow: 0 0 10px rgba(255, 193, 7, 0.8);"></i>';
            glowHtml = 'box-shadow: 0 0 15px rgba(255, 193, 7, 0.5);';
        } else if (item.place === 2) {
            colorTheme = '#9e9e9e'; // Silver
            height = '100px';
            avatarSize = '60px';
        } else {
            colorTheme = '#d3832c'; // Bronze
            height = '85px';
            avatarSize = '60px';
        }

        html += `
          <div class="text-center d-flex flex-column align-items-center" style="cursor: pointer; width: 32%; position: relative;" onclick="window.showUserProfile('${safeUsernameAttr}')">
            <div style="position: relative; margin-bottom: -${parseInt(avatarSize)/2}px; z-index: 2;">
              ${crownHtml}
              <img src="${avatarUrl}" style="border: 3px solid ${colorTheme}; width: ${avatarSize}; height: ${avatarSize}; border-radius: 50%; object-fit: cover; background: white; ${glowHtml}" onerror="window.handleAvatarError(this)">
            </div>
            <div class="w-100 rounded bg-white shadow-sm d-flex flex-column align-items-center pb-2" style="height: ${height}; position: relative; border-radius: 12px !important; border-top: 4px solid ${colorTheme}; padding-top: ${parseInt(avatarSize)/2 + 10}px;">
              <div class="mt-auto w-100 px-1 d-flex flex-column align-items-center">
                <div style="width: 100%; margin-bottom: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                  ${identityHtml}
                </div>
                <div style="background-color: #f2f7fb; color: #003b73; font-weight: bold; font-size: 13px; padding: 2px 10px; border-radius: 8px; display: inline-block;">
                  ${formattedVisits}
                </div>
              </div>
            </div>
          </div>
        `;
      });
      
      html += '</div></div>';
    }

    html += `
        <div class="d-flex justify-content-between align-items-center mb-3 mt-4">
          <div class="m-0 text-dark font-weight-bold" style="font-size: 16px;"><i class="fas fa-eye text-primary me-2"></i>زوار بروفايلي</div>
        </div>
    `;

    if (!data.success || !data.visitors || data.visitors.length === 0) {
      html += `
        <div class="text-center py-5 text-muted bg-light rounded border">
          <i class="fas fa-eye-slash fa-3x mb-3" style="color: #ccc;"></i>
          <div class="font-weight-bold" style="font-size: 15px;">لا يوجد زائرين لبروفايلك حتى الآن</div>
        </div>
      `;
    } else {
      const visitors = (data.visitors || []).slice(0, 10);
      html += '<div class="profile-visitors-list px-2">';
      visitors.forEach(user => {
        const liveUsers = (window.state && window.state.currentUsers) || window.onlineUsers || [];
        const activeUser = liveUsers.find(u => (u.id || u.userId) && (String(u.id || u.userId) === String(user.id)) || u.username === user.username);
        const renderUserData = activeUser ? { ...user, ...activeUser } : user;
        
        let identityHtml = '';
        if (window.renderUserIdentity) {
          identityHtml = window.renderUserIdentity(renderUserData, { containerClasses: 'font-weight-bold flex-nowrap user-addon-container', nameStyle: `color: ${renderUserData.ucol || renderUserData.fontColor || '#000'}; font-size: 14px;` });
        } else {
          const safeUsername = window.escapeHTML ? window.escapeHTML(renderUserData.topic || renderUserData.username) : (renderUserData.topic || renderUserData.username);
          identityHtml = `<span class="font-weight-bold" style="color: ${renderUserData.ucol || renderUserData.fontColor || '#000'}">${safeUsername}</span>`;
        }

        const safeUsernameAttr = window.escapeHTML ? window.escapeHTML(renderUserData.username) : renderUserData.username;
        const lastVisitDate = new Date(user.lastVisitedAt);
        const now = new Date();
        const isToday = lastVisitDate.getDate() === now.getDate() && lastVisitDate.getMonth() === now.getMonth() && lastVisitDate.getFullYear() === now.getFullYear();
        let lastVisitText = isToday ? 'اليوم ' + lastVisitDate.toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'}) : lastVisitDate.toLocaleDateString('ar-EG');
        const avatarUrl = window.getAvatarUrl(renderUserData);

        html += `
          <div class="creator-list-item d-flex align-items-center mb-2 p-2 bg-light shadow-sm" style="border-radius: 12px; border: 1px solid #dee2e6; cursor: pointer;" onclick="window.showUserProfile('${safeUsernameAttr}')">
            <div class="creator-avatar ms-3 flex-shrink-0" style="position: relative;">
              <img src="${avatarUrl}" style="border: 2px solid ${renderUserData.ucol || '#ccc'}; width: 40px; height: 40px; border-radius: 50%; object-fit: cover;" onerror="window.handleAvatarError(this)">
            </div>
            <div class="creator-name" style="flex: 1; min-width: 0; overflow: hidden;">
              <div style="font-size: 13px; margin-bottom: 3px; display: flex; align-items: center; max-width: 100%; overflow: hidden;">${identityHtml}</div>
              <div class="text-muted d-flex align-items-center gap-2" style="font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <span><i class="fas fa-clock ms-1"></i>${lastVisitText}</span>
                <span><i class="fas fa-redo ms-1"></i>زارك ${user.visitCount} مرات</span>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    html += `</div>`;
    ui.sidebarSettingsContainer.innerHTML = html;

  } catch (err) {
    console.error('General error in renderProfileVisitors:', err);
    ui.sidebarSettingsContainer.innerHTML = `
      <div class="classic-settings-container p-3">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
        <div class="text-center py-5 text-danger bg-light rounded border">
          <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
          <div class="font-weight-bold" style="font-size: 15px;">حدث خطأ أثناء جلب زائرين البروفايل</div>
        </div>
      </div>
    `;
  }
};

