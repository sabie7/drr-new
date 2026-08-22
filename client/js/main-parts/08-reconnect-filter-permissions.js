/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 08/28 · reconnect-filter-permissions
   lines 1851–2901 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function hideReconnectBar() {
  const bar = document.getElementById('reconnect-status-bar');
  if (!bar) return;
  bar.classList.add('d-none');
  bar.classList.remove('reconnecting', 'logging-in', 'connected');
}

/**
 * Check if the reconnection bar can be shown based on logic
 */
function canShowReconnectBar() {
  return Boolean(
    state.currentUser &&
    hasJoinedChatOnce &&
    !isLoginSocketSwitch
  );
}

/**
 * Handle close button on reconnection bar
 */
window.handleReconnectClose = function() {
  const bar = document.getElementById('reconnect-status-bar');
  if (!bar) return;

  // If user closes while trying to reconnect or log in, log them out
  if (bar.classList.contains('reconnecting') || bar.classList.contains('logging-in')) {
    logout();
  }
  
  bar.classList.add('d-none');
  bar.classList.remove('reconnecting', 'logging-in', 'connected');
};

/**
 * Update the reconnection status bar
 * @param {string} status - 'reconnecting', 'logging-in', 'connected'
 * @param {string} message - Text to display
 */
window.updateReconnectBar = function(status, message) {
  const bar = document.getElementById('reconnect-status-bar');
  const text = document.getElementById('reconnect-text');
  if (!bar || !text) return;

  // IMPORTANT: Don't show anything besides 'connected' if logic says no
  if (!canShowReconnectBar() && status !== 'connected') {
    hideReconnectBar();
    return;
  }

  bar.classList.remove('d-none', 'reconnecting', 'logging-in', 'connected');
  bar.classList.add(status);
  text.innerText = message;

  if (status === 'connected') {
    isReconnectingFlag = false;
    // Keep visible for a few seconds before fading
    setTimeout(() => {
      bar.classList.add('d-none');
    }, 2500);
  } else {
    isReconnectingFlag = true;
  }
};

// Activity Tracking
const emitActivity = debounce(() => {
  if (socket && socket.connected) {
    socket.emit('activity');
  }
}, 2000);

// Add to main chat input fields
document.addEventListener('input', (e) => {
    if (e.target && (e.target.id === 'chat-input' || e.target.id === 'private-chat-input')) {
        emitActivity();
    }
});

socket.on('connect', () => {
  socket.emit('zajel:get-approved');
  if (typeof hasPermission === 'function' && hasPermission('manageZajelMessages')) {
    socket.emit('zajel:moderation:get-pending');
  }
  socket.emit('game:spectate:list');
  const statusBar = document.getElementById('connection-status-bar');
  const statusBoxes = statusBar ? statusBar.querySelectorAll('.bg-danger, .bg-success') : [];
  const text = document.getElementById('connection-text');
  
  if (statusBar) statusBar.style.backgroundColor = '#586572'; // Default center color
  statusBoxes.forEach(box => {
    box.classList.remove('bg-danger');
    box.classList.add('bg-success');
  });
  if (text) text.innerText = 'متصل';

  if (state.currentUser) {
    const isRealReconnect = hasJoinedChatOnce && !isLoginSocketSwitch;
    
    // Silent reconnect - no updateReconnectBar
    
    console.log('Socket reconnected, re-joining (real reconnect:', isRealReconnect, ')');
    socket.emit('join', { 
      roomId: state.currentRoomId, 
      isRejoin: isRealReconnect 
    });

    // On a real reconnect (network loss / reconnect), the server starts a brand-new
    // session for this client: room chat and private messages must start fresh on-screen too.
    if (isRealReconnect) {
      if (ui.messagesContainer) ui.messagesContainer.innerHTML = '';
      publicMessageQueue = [];
      if (window.PrivateChatManager) {
        window.PrivateChatManager.resetForFreshSession && window.PrivateChatManager.resetForFreshSession();
      }
    }
  }
  
  // Set this AFTER the first connection is established
  hasEverConnected = true;
});

window.cleanupUIForLogin = function() {
  // 1. Close all bootstrap modals
  if (typeof bootstrap !== 'undefined') {
    document.querySelectorAll('.modal.show').forEach(modalEl => {
      try {
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) {
          modalInstance.hide();
        }
      } catch (e) {}
    });
  }
  
  // 2. Remove any modal backdrops or standalone menus that might be stuck
  document.querySelectorAll('.modal-backdrop, .offcanvas-backdrop, .sidebar-backdrop, .profile-backdrop, .mic-menu, .custom-context-menu').forEach(el => el.remove());

  // 3. Close custom popup profiles/lightboxes if they exist
  if (typeof closeProfileImageLightbox === 'function') {
    try { closeProfileImageLightbox(); } catch (e) {}
  }
  document.querySelectorAll('.profile-image-lightbox.active').forEach(el => el.classList.remove('active'));

  // 4. Close sidebars
  if (typeof closeSidebar === 'function') {
    try { closeSidebar(); } catch (e) {}
  }
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (sidebarOverlay) sidebarOverlay.classList.remove('active', 'd-block');
  const rightSidebar = document.getElementById('right-sidebar');
  if (rightSidebar) rightSidebar.classList.remove('active', 'show');

  // 5. Hide chat UI & show login overlay
  if (ui.loginOverlay) ui.loginOverlay.classList.remove('d-none');
  if (ui.chatShell) ui.chatShell.classList.add('d-none');
  
  if (ui.messagesContainer) {
    ui.messagesContainer.innerHTML = '';
  }
  const quickChatContainer = document.getElementById('quick-chat-messages');
  if (quickChatContainer) {
    quickChatContainer.innerHTML = '';
  }

  const landingList = document.getElementById('landing-users-list');
  if (landingList) landingList.innerHTML = '';

  // 6. Clean body classes and styles applied by bootstrap or modals
  document.body.classList.remove('modal-open');
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  
  // 7. Hide admin sidebars/overlays if present
  document.querySelectorAll('.app-sidebar-overlay, .app-sidebar').forEach(el => el.classList.remove('show', 'active'));

  // 8. Clean private chats container UI & close active chats if using PrivateChatManager
  if (window.PrivateChatManager && typeof window.PrivateChatManager.closeChat === 'function') {
    try {
      window.PrivateChatManager.closeChat();
    } catch(e) {}
  }
  
  if (window.PrivateCallManager && typeof window.PrivateCallManager.cleanup === 'function') {
    try {
      window.PrivateCallManager.cleanup();
    } catch(e) {}
  }

  // 9. Clean room voice manager & silent audio session locally
  if (window.voiceManager) {
    try {
      if (typeof window.voiceManager.stopSilentAudioSession === 'function') {
        window.voiceManager.stopSilentAudioSession();
      }
      if (typeof window.voiceManager.cleanup === 'function') {
        window.voiceManager.cleanup();
      }
    } catch(e) {}
  }

  // 10. Restore connection status indicator to normal (green / متصل) for login interface
  const statusBar = document.getElementById('connection-status-bar');
  const statusBoxes = statusBar ? statusBar.querySelectorAll('.bg-danger, .bg-success') : [];
  const text = document.getElementById('connection-text');
  
  if (statusBar) statusBar.style.backgroundColor = '#586572';
  statusBoxes.forEach(box => {
    box.classList.remove('bg-danger');
    box.classList.add('bg-success');
  });
  if (text) text.innerText = 'متصل';
};

// Admin notifications
socket.on('admin:new-report', ({ reporter, reported, reason, proofImage }) => {
    const canSee = hasPermission('canViewReports');
  if (state.currentUser && (canSee)) {
    const html = `
      <div class="admin-report-alert" dir="rtl">
        <p class="mb-1 text-center" style="color: #666; font-size: 13px;">وصل تبليغ جديد</p>
        
        <div class="report-alert-summary">
          <div><strong>من:</strong> <span class="text-primary">${escapeHTML(reporter)}</span></div>
          <div><strong>ضد:</strong> <span class="text-danger">${escapeHTML(reported)}</span></div>
        </div>

        <div class="report-alert-section">
          <strong>سبب التبليغ:</strong>
          <div class="report-alert-reason">${escapeHTML(reason)}</div>
        </div>

        ${proofImage ? `
          <div class="report-alert-section text-center">
            <strong>صورة الإثبات:</strong>
            <div class="mt-1" style="cursor: pointer;" onclick="window.openLightbox('${proofImage}')">
              <img src="${proofImage}" class="report-alert-image">
            </div>
            <div class="small text-muted mt-1" style="font-size: 11px;">(اضغط لتكبير الصورة)</div>
          </div>
        ` : ''}
      </div>
    `;

    Swal.fire({
      title: 'تبليغ جديد',
      html: html,
      icon: 'warning',
      confirmButtonText: 'موافق'
    });

    if (typeof playAdminSound === 'function') playAdminSound();
  }
});

socket.on('duplicate-session', (data) => {
  console.warn('Duplicate session detected:', data.message);
  
  // 1. Immediately perform safe, local-only audio & voice cleanup BEFORE clearing state or disconnecting
  try {
    if (window.voiceManager) {
      if (typeof window.voiceManager.stopSilentAudioSession === 'function') {
        window.voiceManager.stopSilentAudioSession();
      }
      if (typeof window.voiceManager.cleanup === 'function') {
        window.voiceManager.cleanup();
      }
    }
  } catch (err) {
    console.error('[DuplicateSession] Local voice cleanup error:', err);
  }

  try {
    if (window.gamesManager && window.gamesManager.voiceManager) {
      if (typeof window.gamesManager.voiceManager.destroy === 'function') {
        window.gamesManager.voiceManager.destroy({ localOnly: true });
      }
    }
  } catch (err) {
    console.error('[DuplicateSession] Local game voice cleanup error:', err);
  }

  try {
    if (window.PrivateCallManager && typeof window.PrivateCallManager.cleanup === 'function') {
      window.PrivateCallManager.cleanup();
    }
  } catch (err) {}

  // 2. Custom styled Swal using classic-alert
  Swal.fire({
    title: 'تنبيه',
    icon: 'error',
    html: `
      <div style="font-size: 15px; font-weight: bold; margin-top: 10px; margin-bottom: 20px; color: #333; text-align: center;">
        ${data.message || 'لقد تم تسجيل الدخول من جهاز آخر، سيتم إغلاق هذه الجلسة.'}
      </div>
    `,
    showConfirmButton: true,
    confirmButtonText: 'موافق',
    background: '#ffffff',
    allowOutsideClick: false
  });
  
  // 3. Disable reconnection
  if (socket.io) {
    socket.io.opts.reconnection = false;
  }

  // 4. Clear socket auth
  socket.auth = {
    token: null,
    clientSessionId: null
  };

  // 5. Clear session & state
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem('chat_client_session_id');
  
  if (typeof state.setCurrentUser === 'function') state.setCurrentUser(null);
  if (typeof state.setCurrentRoomId === 'function') state.setCurrentRoomId(0);
  
  // 6. UI cleanup
  window.cleanupUIForLogin();
  
  // 7. Disconnect socket
  socket.disconnect();
});

socket.on('connect_error', (err) => {
  console.error('Socket connect_error:', err.message);
  
  if (isLoggingOut || window.isLoggingOut) {
    return;
  }
  
  const authErrorKeywords = ['token', 'user not found', 'session expired', 'authentication failed', 'token version mismatch', 'unauthorized', 'banned', 'invalid token'];
  const isAuthError = authErrorKeywords.some(keyword => err.message.toLowerCase().includes(keyword));
  
  if (isAuthError) {
    console.warn('Authentication failed on socket connect, clearing token...');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('chat_client_session_id');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    state.setCurrentUser(null);
    socket.auth = { token: null, clientSessionId: window.getClientSessionId() }; // Clear socket auth
    
    if (typeof window.cleanupUIForLogin === 'function') {
      window.cleanupUIForLogin();
    }
    if (typeof window.showAuthMessage === 'function') {
      window.showAuthMessage('انتهت الجلسة أو خطأ في المصادقة، يرجى إعادة تسجيل الدخول');
    }
    return;
  }

  const statusBar = document.getElementById('connection-status-bar');
  const statusBoxes = statusBar ? statusBar.querySelectorAll('.bg-success') : [];
  const text = document.getElementById('connection-text');
  
  statusBoxes.forEach(box => {
    box.classList.remove('bg-success');
    box.classList.add('bg-danger');
  });
  if (text) text.innerText = 'جاري الاتصال';
});

socket.on('disconnect', (reason) => {
  if (reason === 'io client disconnect' || isLoggingOut || window.isLoggingOut) {
    return;
  }
  
  const statusBar = document.getElementById('connection-status-bar');
  const statusBoxes = statusBar ? statusBar.querySelectorAll('.bg-success') : [];
  const text = document.getElementById('connection-text');
  
  statusBoxes.forEach(box => {
    box.classList.remove('bg-success');
    box.classList.add('bg-danger');
  });
  if (text) text.innerText = 'جاري الاتصال';
  
  // Silent reconnect - no updateReconnectBar
});

// Reconnection succeeded from user perspective (re-join confirmed)
socket.on('rejoin-success', () => {
  // Silent reconnect - no updateReconnectBar
});

// The same account was used to log in from another session: this session must close.
socket.on('session-expired', (data) => {
  console.warn('Session expired - logged in elsewhere:', data);
  isLoggingOut = true;
  window.isLoggingOut = true;
  if (socket && socket.io) {
    socket.io.opts.reconnection = false;
  }
  try {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('chat_client_session_id');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch (e) {}
  window.cleanupUIForLogin && window.cleanupUIForLogin();
  const msg = (data && data.message) || 'تم تسجيل دخولك من مكان آخر، هذه الجلسة مغلقة';
  if (window.Swal) {
    Swal.fire({
      icon: 'info',
      title: 'جلسة منتهية',
      text: msg,
      confirmButtonText: 'حسناً',
      allowOutsideClick: false
    }).then(() => window.location.reload());
  } else {
    window.location.reload();
  }
});

socket.on('global-limits', (limits) => {
  state.setLimits(limits);
  if (ui.chatInput) {
    ui.chatInput.setAttribute('maxlength', limits.public);
  }
  // Also update private if open
  const privInput = document.getElementById('private-chat-input');
  if (privInput) {
    privInput.setAttribute('maxlength', limits.private);
  }
});

socket.on('features-updated', async () => {
    console.log('[Socket] Features settings updated, reloading...');
    await loadFeaturesSettings();
    if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
        window.updateLiveBroadcastButtonVisibility();
    }
    if (window.renderStoriesBar) window.renderStoriesBar('wall-stories-container');
    if (typeof renderZajelTicker === 'function') renderZajelTicker();
    if (state.activeSidebarTab) {
        if (state.activeSidebarTab === 'settings' && typeof renderSettings === 'function') {
            renderSettings(true); // Re-render settings UI if open
        }
        // Force refresh tab to update search visibility
        switchSidebarTab(state.activeSidebarTab, () => {}, ui.sidebarTitle ? ui.sidebarTitle.innerText : '');
    }
});

socket.on('reveal-nickname-result', (data) => {
  const tableBody = document.getElementById('reveal-nickname-table-body');
  if (!tableBody) return;
  tableBody.innerHTML = '';
  
  const allResults = [...data.associatedUsers, ...data.historicalLogins];
  if (allResults.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">لا توجد حسابات أو جلسات أخرى مرتبطة بهذه البيانات حالياً.</td></tr>';
  } else {
      allResults.forEach(item => {
        const row = document.createElement('tr');
        
        const isGuest = item.type === 'guest';
        const isLog = item.isHistorical === undefined && item.createdAt; // Check if it's a log

        // Status badge
        let statusBadge = '';
        if (isLog) statusBadge = '<span class="badge bg-secondary">سجل دخول سابق</span>';
        else if (item.isOnline) statusBadge = '<span class="badge bg-success">متصل الآن</span>';
        else statusBadge = '<span class="badge bg-warning">غير متصل</span>';

        // Identity
        const name = item.username || item.nickname || 'غير معروف';
        const safeName = window.escapeHTML ? window.escapeHTML(name) : name;
        
        // Source (المصدر)
        let sourceHtml = '';
        if (item.referrerSource && item.referrerSource.url) {
            const safeUrl = window.escapeHTML ? window.escapeHTML(item.referrerSource.url) : item.referrerSource.url;
            const safeLabel = window.escapeHTML ? window.escapeHTML(item.referrerSource.label) : item.referrerSource.label;
            sourceHtml = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none fw-bold text-primary" title="${safeUrl}">${safeLabel}</a>`;
        } else if (item.referrerSource && item.referrerSource.label) {
            const safeLabel = window.escapeHTML ? window.escapeHTML(item.referrerSource.label) : item.referrerSource.label;
            sourceHtml = `<span class="text-muted">${safeLabel}</span>`;
        } else {
            sourceHtml = '<span class="text-muted">دخول مباشر</span>';
        }

        // Match Reasons
        let reasonsHtml = '';
        if (item.matchReasons) {
            reasonsHtml = item.matchReasons.map(r => `<span class="badge bg-light text-dark border me-1">${r === 'fingerprint' ? 'بصمة جهاز' : 'IP'}</span>`).join('');
        }

        const safeGroup = item.group && item.group.name ? (window.escapeHTML ? window.escapeHTML(item.group.name) : item.group.name) : '-';
        const safeIp = window.escapeHTML ? window.escapeHTML(item.ip || '-') : (item.ip || '-');
        const safeFp = window.escapeHTML ? window.escapeHTML(item.fp || '-') : (item.fp || '-');
        const safeUserAgent = window.escapeHTML ? window.escapeHTML(item.userAgent || '-') : (item.userAgent || '-');

        row.innerHTML = `
          <td class="align-middle fw-bold">${safeName}</td>
          <td class="align-middle">${isGuest ? 'زائر' : 'عضو'}</td>
          <td class="align-middle">${statusBadge}</td>
          <td class="align-middle">${safeGroup}</td>
          <td class="align-middle">${reasonsHtml}</td>
          <td class="align-middle">${sourceHtml}</td>
          <td class="align-middle" dir="ltr" style="font-family: monospace;">${safeIp}</td>
          <td class="align-middle" style="font-size: 11px;">${safeFp}</td>
          <td class="align-middle" style="font-size: 11px;">${safeUserAgent}</td>
        `;
        tableBody.appendChild(row);
      });
  }
  
  const revealModal = new bootstrap.Modal(document.getElementById('revealNicknameModal'));
  revealModal.show();
});

socket.on('user_updated', (updatedUser) => {
  setTimeout(updateFilterMonitorVisibility, 500);
  if (state.currentUser && state.currentUser.id === updatedUser.id) {
    // Merge updated user data with current user state
    const newUser = { ...state.currentUser, ...updatedUser };
    
    // Ensure roleRank is directly on the user object for easier access
    if (newUser.group && newUser.group.roleRank !== undefined) {
      newUser.roleRank = newUser.group.roleRank;
    }
    
    // Ensure userId is present for compatibility
    if (newUser.id && !newUser.userId) {
      newUser.userId = newUser.id;
    }
    
    state.setCurrentUser(newUser);
    updateExtraActionsVisibility();
    
    // Update local storage if it's stored there
    const storedUser = sessionStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        // Keep the token if it exists in local storage
        const token = parsed.token;
        const newStoredUser = { ...newUser, token };
        sessionStorage.setItem('user', JSON.stringify(newStoredUser));
      } catch (e) {}
    }
    
    // Re-render UI elements that depend on user permissions
    updateUIForUser();

    if (typeof renderZajelTicker === 'function') {
      renderZajelTicker();
    }
    
    // Show a notification to the user about their update
    // showToast('تم تحديث بياناتك وصلاحياتك من قبل الإدارة', 'info');
  }
  window.voiceManager && window.voiceManager.updateUser(updatedUser);
});



socket.on('force-ban-cookie', () => {
  getFingerprint().then(fp => {
    fetch('/api/ban-cookie/set', {
      method: 'POST',
      body: JSON.stringify({ fp }),
      headers: { 'Content-Type': 'application/json' }
    }).catch(e => console.warn(e));
  });
});

socket.on('banned', ({ reason, expiresAt }) => {
  let errorHtml = reason || 'تم حظرك من الموقع';
  
  const now = Date.now();
  const expiryTime = expiresAt ? new Date(expiresAt).getTime() : null;

  if (expiryTime && expiryTime > now) {
    const expiryDate = new Date(expiresAt);
    errorHtml += `<br><br><b>ينتهي الحظر في:</b> ${expiryDate.toLocaleString('ar-EG')}`;
  } else {
    errorHtml += `<br><br><b>نوع الحظر:</b> دائم`;
  }

  Swal.fire({
    title: 'تم حظرك',
    html: errorHtml,
    icon: 'error',
    confirmButtonText: 'إغلاق',
    allowOutsideClick: false,
    allowEscapeKey: false
  }).then(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    window.location.href = '/';
  });
});

socket.on('kicked', ({ reason }) => {
  window.showChatAlert({ message: reason, icon: 'warning' }).then(() => {
    window.location.reload();
  });
});

socket.on('needpass', (data) => {
  const roomName = data && data.roomName ? data.roomName : 'الغرفة';
  window.showChatAlert({ message: 'هذه الغرفة محمية بكلمة مرور (' + roomName + ')', icon: 'warning' });
});

socket.on('room-join-error', ({ msg }) => {
  if (msg) window.showChatAlert({ message: msg, icon: 'error' });
});

socket.on('room-ban-error', ({ msg }) => {
  if (msg) window.showChatAlert({ message: msg, icon: 'error' });
});

socket.on('muted', ({ reason, expiresAt, seconds }) => {
  let text = reason || 'تم كتم صوتك';
  if (expiresAt) {
    try { text += ' حتى ' + new Date(expiresAt).toLocaleString('ar'); } catch (e) {}
  } else if (seconds && seconds > 0) {
    text += ' لمدة ' + seconds + ' ثانية';
  }
  window.showChatAlert({ message: text, icon: 'warning' });
});

socket.on('unmuted', () => {
  window.showChatAlert({ message: 'تم فك الكتم عنك', icon: 'success' });
});

socket.on('room-bans-list', (bans) => {
  const list = document.getElementById('room-bans-list');
  if (!list) return;

  if (!bans || bans.length === 0) {
    list.innerHTML = '<div class="p-2 text-center text-muted small">لا يوجد محظورون حالياً</div>';
    return;
  }

  list.innerHTML = bans.map(ban => `
    <div class="list-group-item d-flex justify-content-between align-items-center p-2 rounded-0">
      <div class="d-flex flex-column">
        <span class="fw-bold small">${ban.username}</span>
        <span class="text-muted" style="font-size: 10px;">بواسطة: ${ban.bannedBy}</span>
      </div>
      <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="window.unbanFromRoom(${ban.id}, ${ban.roomId})">
        <i class="fas fa-trash-alt"></i> فك الحظر
      </button>
    </div>
  `).join('');
});

window.unbanFromRoom = (banId, roomId) => {
  Swal.fire({
    title: 'فك الحظر',
    text: 'هل أنت متأكد من فك الحظر عن هذا العضو؟',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم',
    cancelButtonText: 'إلغاء'
  }).then((result) => {
    if (result.isConfirmed) {
      socket.emit('room-unban-user', { banId, roomId });
    }
  });
};

socket.on('force-change-room', ({ roomId }) => {
  if (window.musicManager) window.musicManager.reset();
  state.setCurrentRoomId(roomId);
  state.setIsRoomFrozen(false);
  ui.chatInput.disabled = false;
  ui.chatInput.placeholder = "اكتب رسالتك هنا...";

  if (window.musicManager) window.musicManager.refreshState();
  socket.emit('change-room', { roomId });
  updateChatUI();
});

// --- Filter Monitor Frontend Implementation ---
let localMonitoredMessages = [];
let monitorUnreadCount = 0;
let isMonitorPanelOpen = false;

function updateFilterMonitorVisibility() {
  const container = document.getElementById('filter-monitor-wrapper');
  const menuBtn = document.getElementById('filter-monitor-menu-btn');
  if (!container) return;

  const isSuperAdmin = false;
  const possessesPermission = hasPermission('canViewFilterMonitorMessages') || isSuperAdmin;

  if (possessesPermission) {
    if (menuBtn) menuBtn.classList.remove('d-none');
  } else {
    if (menuBtn) menuBtn.classList.add('d-none');
    if (isMonitorPanelOpen) {
      window.toggleFilterMonitorPanel();
    }
  }
}

function renderMonitoredMessages() {
  const messagesDiv = document.getElementById('filter-monitor-messages');
  if (!messagesDiv) return;

  if (localMonitoredMessages.length === 0) {
    messagesDiv.innerHTML = `<p class="text-muted text-center py-4 my-2" style="font-size: 0.9rem;">لا يوجد رسائل مراقبة حالياً</p>`;
    return;
  }

  const escapeHTML = window.escapeHTML || ((str) => {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  });

  messagesDiv.innerHTML = localMonitoredMessages.map(msg => {
    const displayTime = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    
    let typeClass = 'monitor-badge-public';
    let typeLabel = 'عامة';
    if (msg.messageType === 'private') {
      typeClass = 'monitor-badge-private';
      typeLabel = 'خاصة';
    } else if (msg.messageType === 'notification') {
      typeClass = 'monitor-badge-notification';
      typeLabel = 'تنبيه';
    } else if (msg.messageType === 'edit') {
      typeClass = 'monitor-badge-edit';
      typeLabel = 'تعديل';
    }

    let targetInfo = '';
    if (msg.messageType === 'private' || msg.messageType === 'edit' || msg.messageType === 'notification') {
      if (msg.receiverUsername) {
        const rxUserObj = state.currentUsers.find(u => u.username === msg.receiverUsername) || { username: msg.receiverUsername };
        const rxIdentity = window.renderUserIdentity ? window.renderUserIdentity(rxUserObj, { tag: 'span' }) : `<span class="text-info">${escapeHTML(msg.receiverUsername)}</span>`;
        targetInfo = ` <i class="fas fa-arrow-left text-muted mx-1" style="font-size:0.75rem;"></i> ${rxIdentity}`;
      }
    } else {
      if (msg.roomName) {
        targetInfo = ` <span class="text-muted text-xs ms-1">(${escapeHTML(msg.roomName)})</span>`;
      }
    }

    const wordsBadges = (msg.matchedWords || []).map(w => `<span class="monitor-word-pill">${escapeHTML(w)}</span>`).join(' ');

    const txUserObj = state.currentUsers.find(u => u.username === msg.senderUsername) || { username: msg.senderUsername };
    const txIdentity = window.renderUserIdentity ? window.renderUserIdentity(txUserObj, { tag: 'span' }) : `<span class="text-warning fw-bold">${escapeHTML(msg.senderUsername)}</span>`;

    return `
      <div class="monitor-item-card" dir="rtl">
        <div class="monitor-item-meta">
          <div class="d-flex align-items-center flex-wrap gap-1">
            <span class="monitor-item-badge ${typeClass}">${typeLabel}</span>
            <span style="font-size: 0.85rem; margin-right: 4px;">${txIdentity}</span>
            ${targetInfo}
          </div>
          <span class="text-muted text-xs" style="font-size: 0.72rem;">${displayTime}</span>
        </div>
        <div class="mb-2 d-flex flex-wrap gap-1 align-items-center">
          <span class="text-muted text-xs me-1" style="font-size:0.72rem; margin-left: 4px;">الكلمات المطابقة:</span>
          ${wordsBadges}
        </div>
        <div class="monitor-item-text">
          ${escapeHTML(msg.originalText)}
        </div>
      </div>
    `;
  }).join('');
}

socket.on('filter:monitor:new', (payload) => {
  localMonitoredMessages.unshift(payload);
  
  if (localMonitoredMessages.length > 100) {
    localMonitoredMessages = localMonitoredMessages.slice(0, 100);
  }

  if (!isMonitorPanelOpen) {
    monitorUnreadCount++;
    updateFilterMonitorBadges();
    showFilterNotification(payload);
  }

  const isSuperAdmin = false;
  const possessesPermission = hasPermission('canViewFilterMonitorMessages') || isSuperAdmin;
  if (possessesPermission) {
    renderMonitoredMessages();
  }
});

function showFilterNotification(payload) {
    if (!hasPermission('canViewFilterMonitorMessages')) return;

    const layer = document.getElementById('filter-notification-layer');
    if (!layer) return;

    const toast = document.createElement('div');
    toast.className = 'filter-notification-toast';
    
    // Construct user object based on the new 'sender' object in payload
    const sender = payload.sender;
    
    // Fallback if sender data is missing
    const userDisplay = sender ? renderUserIdentity(sender) : 'زائر';
    const avatarUrl = sender ? window.getAvatarUrl(sender) : '/images/default-avatar.png';
    
    toast.innerHTML = `
        <img src="${avatarUrl}" class="filter-toast-avatar" alt="avatar" onerror="this.src='/images/default-avatar.png'">
        <div class="filter-toast-content">
            <div class="filter-toast-username">${userDisplay}</div>
            <div class="filter-toast-message">${escapeHTML(payload.originalText || 'رسالة مخالفة')}</div>
        </div>
    `;
    
    // Add to layer
    layer.appendChild(toast);
    
    // Animation trigger
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500); // Wait for transition
    }, 5000);
}

window.updateFilterNotificationBadge = function(count) {
    const badge = document.getElementById('filter-notification-badge');
    const menuDot = document.getElementById('filter-monitor-menu-dot');
    
    const safeCount = Math.max(0, Number(count) || 0);
    if (safeCount <= 0) {
        if (badge) {
            badge.textContent = '';
            badge.hidden = true;
            badge.classList.remove('is-visible', 'd-block');
            badge.classList.add('d-none');
            badge.setAttribute('aria-hidden', 'true');
            badge.style.display = 'none';
        }
        if (menuDot) {
            menuDot.classList.add('d-none');
            menuDot.textContent = '';
            menuDot.style.display = 'none';
        }
        return;
    }
    
    if (badge) {
        badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
        badge.hidden = false;
        badge.classList.add('is-visible', 'd-block');
        badge.classList.remove('d-none');
        badge.setAttribute('aria-hidden', 'false');
        badge.style.display = 'block';
    }
    if (menuDot) {
        menuDot.classList.remove('d-none');
        menuDot.style.display = 'block';
    }
};

window.updateFilterNotificationBadge(0);

window.updateFilterMonitorBadges = function() {
    window.updateFilterNotificationBadge(typeof monitorUnreadCount !== 'undefined' ? monitorUnreadCount : 0);
};
window.toggleFilterMonitorPanel = function() {
  const panel = document.getElementById('filter-monitor-panel');
  const backdrop = document.getElementById('filter-monitor-backdrop');
  if (!panel) return;

  isMonitorPanelOpen = !isMonitorPanelOpen;
  if (isMonitorPanelOpen) {
    panel.classList.add('open');
    if (backdrop) backdrop.classList.remove('d-none');
    
    monitorUnreadCount = 0;
    updateFilterMonitorBadges();
    renderMonitoredMessages();
  } else {
    panel.classList.remove('open');
    if (backdrop) backdrop.classList.add('d-none');
  }
};

window.clearFilterMonitorLocal = function() {
  localMonitoredMessages = [];
  renderMonitoredMessages();
};





setInterval(updateFilterMonitorVisibility, 3000);
// ----------------------------------------------------

socket.on('notification', (data) => {
  if (data.type === 'stats_updated') {
    let displayValue = data.value;
    if (data.statType === 'likes' || data.statType === 'rep') {
      displayValue = formatCompactNumber(data.value);
    }
    
    const statNames = {
      'likes': 'إعجاباتك',
      'rep': 'نقاطك',
      'topic': 'زخرفة اسمك',
      'rank': 'رتبتك'
    };
    
    const statName = statNames[data.statType] || 'بياناتك';
    const adminName = data.adminName || 'الإدارة';
    const adminPic = data.adminPic || '/img/default-avatar.png';
    const adminTopic = data.adminTopic || adminName;
    
    console.log('Notification received:', data);
    console.log('Admin Info to display:', { adminName, adminPic, adminTopic });
    
    let message = data.message;
    if (!message) {
      if (data.statType === 'topic') {
        message = `تم تغيير الزخرفة الخاصة بك إلى: ${displayValue}`;
      } else if (data.statType === 'rank') {
        message = `تم تغيير رتبتك إلى: ${displayValue}`;
      } else {
        message = `تم تغيير ${statName} إلى ${displayValue}`;
      }
    } else {
      // Keep HTML if present in message, do not strip it
    }

    window.showChatAlert({
      message: message,
      senderName: adminTopic || adminName,
      senderAvatar: adminPic,
      showSender: true,
      isHtml: true
    });

    // Update local user stats if it's the current user
    if (state.currentUser && state.currentUser.id === data.userId) {
      if (data.statType === 'likes') state.currentUser.likes = data.value;
      if (data.statType === 'rep') state.currentUser.rep = data.value;
      if (data.statType === 'topic') state.currentUser.topic = data.value;
      updateUIForUser();
    }
  }
});

function saveIgnoredUsers() {
  try {
    sessionStorage.setItem('ignoredUsers', JSON.stringify([...state.ignoredUsers]));
  } catch (e) {
    console.warn('Could not save ignored users to sessionStorage:', e);
  }
}

state.loadIgnoredUsers();

function hasPermission(permission) {
  return state.hasPermission(state.currentUser, permission);
}

function formatCompactNumber(number) {
  if (number === null || number === undefined) return '0';
  const num = Number(number);
  if (isNaN(num)) return '0';
  if (num <= 1000) return num.toString();
  
  const units = [
    { value: 1e24, symbol: "Y" }, // Yotta
    { value: 1e21, symbol: "Z" }, // Zetta
    { value: 1e18, symbol: "E" }, // Exa
    { value: 1e15, symbol: "P" }, // Peta
    { value: 1e12, symbol: "T" }, // Tera
    { value: 1e9, symbol: "b" },
    { value: 1e6, symbol: "m" },
    { value: 1e3, symbol: "k" }
  ];
  
  for (let i = 0; i < units.length; i++) {
    if (num >= units[i].value) {
      const formatted = (num / units[i].value).toFixed(1).replace(/\.0$/, '');
      return formatted + units[i].symbol;
    }
  }
  return num.toString();
}

async function getFingerprint() {
  let fpValue = localStorage.getItem('chat_fingerprint');
  if (fpValue) return fpValue;

  try {
    // Attempt to use FingerprintJS
    const fpPromise = import('https://openfpcdn.io/fingerprintjs/v4').then(FingerprintJS => FingerprintJS.load());
    const fp = await fpPromise;
    const result = await fp.get();
    fpValue = result.visitorId;
    localStorage.setItem('chat_fingerprint', fpValue);
    return fpValue;
  } catch (err) {
    console.error('Error loading FingerprintJS, using fallback.');
    // Fallback manual fingerprint
    let hasSessionStorage = false;
    let hasLocalStorage = false;
    let hasIndexedDB = false;
    
    try { hasSessionStorage = !!window.sessionStorage; } catch (e) {}
    try { hasLocalStorage = !!window.localStorage; } catch (e) {}
    try { hasIndexedDB = !!window.indexedDB; } catch (e) {}

    const components = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      hasSessionStorage,
      hasLocalStorage,
      hasIndexedDB,
    ];
    const str = components.join('###');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    const fallbackFp = 'fb_' + Math.abs(hash).toString(16);
    try {
      localStorage.setItem('chat_fingerprint', fallbackFp);
    } catch(e) {}
    return fallbackFp;
  }
}

