/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 17/28 · ui-for-user-login
   lines 6676–6927 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function updateUIForUser() {
  if (typeof window.applyRoomMessagesNightMode === 'function') {
    window.applyRoomMessagesNightMode();
  }
  // Update admin panel button visibility
  const topAdminBtn = document.getElementById('top-admin-btn');
  if (topAdminBtn) {
    if (hasPermission('canAccessAdminPanel')) {
      topAdminBtn.classList.remove('d-none');
    } else {
      topAdminBtn.classList.add('d-none');
    }
  }

  // Update live broadcast button visibility
  if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
    window.updateLiveBroadcastButtonVisibility();
  }



  updateExtraActionsVisibility();


  // If the user profile modal is currently open for the current user, update it
  const profileModal = document.getElementById('user-profile-modal');
  if (profileModal && profileModal.style.display === 'flex') {
    const usernameElem = profileModal.querySelector('.profile-username');
    if (usernameElem && usernameElem.textContent === state.currentUser.username) {
      // Re-render the profile modal to reflect new permissions/roles
      showUserProfile(state.currentUser.username);
    }
  }

  // If the addons modal is currently open for the current user, update it
  const addonsModal = document.getElementById('manageAddonsModal');
  if (addonsModal && addonsModal.classList.contains('show')) {
    if (profileUser && profileUser.username === state.currentUser.username) {
      // The user will need to close and reopen the modal to see new tabs
      // We could re-render it here, but it's complex because it's an inline function
    }
  }

  // If the wall is open, re-render it to show/hide delete buttons
  if (state.activeSidebarTab === 'wall') {
    loadWall();
  }

  // Re-render the users list to update the current user's name color/icon if changed
  if (state.activeSidebarTab === 'users') {
    renderUsersInSidebar(state.currentUsers);
  }

  // Re-render the rooms list if open to show/hide "Create Room" button
  if (state.activeSidebarTab === 'rooms') {
    renderRoomsInSidebar(state.rooms);
  }

  // Re-render the settings sidebar if open
  if (state.activeSidebarTab === 'settings') {
    const currentTitle = ui.sidebarTitle ? ui.sidebarTitle.innerText : '';
    if (currentTitle === 'تصميم العضوية المميزة') {
      renderMembershipDesign(true);
    } else if (currentTitle === 'الإشعارات') {
      renderNotifications(true);
    } else {
      renderSettings();
    }
  }

  // Update Chat UI (Bot buttons, mic slots, etc.)
  updateChatUI();
}

window.completeChatLogin = async (user, token, clientSessionId) => {
  return loginSuccess(user, token, clientSessionId);
};

function loginSuccess(user, token, clientSessionId) {
  isLoggingOut = false;
  window.isLoggingOut = false;
  lastRealActivityAt = Date.now();
  lastActivityEmit = 0;
  presenceIdleSent = false;

  hasJoinedChatOnce = false;
  window.hasJoinedChatOnce = false;

  // Flag that we are switching sockets for login
  isLoginSocketSwitch = true;
  hideReconnectBar();

  // Save member username if applicable
  if (user && user.type === 'member' && user.username) {
    localStorage.setItem('chat_member_username', user.username);
    localStorage.setItem('chat_remember_member_name', 'true');
  }

  // Ensure roleRank is directly on the user object for easier access
  if (user.group && user.group.roleRank !== undefined) {
    user.roleRank = user.group.roleRank;
  }
  // Ensure userId is present for compatibility
  if (user.id && !user.userId) {
    user.userId = user.id;
  }
  state.setCurrentUser(user);

  const lb0 = state.loginBehavior || {};
  if (lb0.behavior === 'lobby' || lb0.behavior === 'no_room') {
    pendingInitialRoomSelection = true;
    state.setCurrentRoomId(0);
  } else {
    // Low-likes routing: new members without enough likes go to a room chosen
    // in the control panel (loginBehavior.lowLikesRoomId/lowLikesMaxLikes).
    let targetRoom = 1;
    const maxL = parseInt(lb0.lowLikesMaxLikes, 10) || 0;
    const ridLb = parseInt(lb0.lowLikesRoomId, 10) || 0;
    if (maxL > 0 && ridLb > 0 && (parseInt(user.likes, 10) || 0) < maxL) targetRoom = ridLb;
    pendingInitialRoomSelection = false;
    state.setCurrentRoomId(targetRoom);
  }

  if (token) {
    try {
      sessionStorage.setItem('token', token);
      sessionStorage.removeItem('user'); // We don't need to store user object anymore, we fetch it on load
    } catch (e) {
      console.warn('Could not save token:', e);
    }
  }

  // Initialize notification and effect sound manager after successful login
  if (window.profileSoundManager) {
    window.profileSoundManager.init();
  }
  
  // Use passed clientSessionId or generate a new one
  const sessionToUse = clientSessionId || window.createNewClientSessionId();

  // Ensure reconnection is allowed for this fresh socket connection
  if (socket.io) {
    socket.io.opts.reconnection = true;
  }

  // Update socket auth token and reconnect to apply new authentication
  socket.auth = { token, clientSessionId: sessionToUse };
  if (socket.connected) {
    socket.disconnect();
  }
  socket.connect();
  
  // Update all UI elements based on permissions
  updateUIForUser();
  updateChatUI();

  if (typeof renderZajelTicker === 'function') {
    renderZajelTicker();
  }
  
  if (typeof window.fetchStories === 'function') {
    window.fetchStories();
  }
  
  loadShortcuts();
  updateChatUI();
  
  // Pre-load sidebar content for instant switching
  loadRooms();
  renderSettings();

  // Open users tab if setting is enabled
  if (state.loginBehavior && state.loginBehavior.openUsersTabOnLogin) {
    // Small delay to ensure everything is rendered
    setTimeout(() => {
      if (typeof toggleSidebar === 'function') {
        toggleSidebar('users', 'المتواجدين', () => renderUsersInSidebar(state.currentUsers));
      }
    }, 500);
  }
}

async function loadShortcuts() {
  try {
    const res = await window.fetchWithRetry('/api/shortcuts');
    if (res.ok) {
      state.setShortcuts(await res.json());
    } else {
      console.error('Shortcuts response not ok:', res.status, res.statusText);
    }
  } catch (err) {
    console.error('Failed to load shortcuts:', err);
  }
}

async function loadSmileys() {
  try {
    const res = await window.fetchWithRetry('/api/smileys');
    if (res.ok) {
      state.setSmileys(await res.json());
      // Refresh emoji picker if it's open
      if (ui.emojiPicker && !ui.emojiPicker.classList.contains('d-none')) {
        loadEmojiPickerContent();
      }
    } else {
      console.error('Smileys response not ok:', res.status, res.statusText);
    }
  } catch (err) {
    console.error('Failed to load smileys:', err);
  }
}

let cachedShortcutsRegex = null;
let cachedSortedSmileys = [];
let cachedSmileysMap = new Map();
let lastSmileysCount = 0;
let cachedShrtRegex = null;
let cachedShrtMap = new Map();
let lastShrtSig = '';

window.normalizeNumerals = function(str) {
  if (!str) return '';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const farsiDigits = '۰۱۲۳۴۵۶۷۸۹';
  const englishDigits = '0123456789';
  return str.toString()
    .replace(/[٠-٩]/g, d => englishDigits[arabicDigits.indexOf(d)])
    .replace(/[۰-۹]/g, d => englishDigits[farsiDigits.indexOf(d)]);
}

window.normalizeNumeralsPattern = function(str) {
  if (!str) return '';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  const farsiDigits = '۰۱۲۳۴۵۶۷۸۹';
  const englishDigits = '0123456789';
  let result = '';
  str = str.toString();
  for (const char of str) {
    const arabicIdx = arabicDigits.indexOf(char);
    const farsiIdx = farsiDigits.indexOf(char);
    const engIdx = englishDigits.indexOf(char);
    
    if (arabicIdx !== -1 || farsiIdx !== -1 || engIdx !== -1) {
      const idx = arabicIdx !== -1 ? arabicIdx : (farsiIdx !== -1 ? farsiIdx : engIdx);
      result += `[${arabicDigits[idx]}${farsiDigits[idx]}${englishDigits[idx]}]`;
    } else {
      result += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return result;
}

