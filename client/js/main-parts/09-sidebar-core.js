/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 09/28 · sidebar-core
   lines 2902–3181 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function applyUserFontSize() {
  const rawValue = Number(sessionStorage.getItem('userFontSize') || '100');
  const percent = Number.isFinite(rawValue)
    ? Math.min(150, Math.max(50, rawValue))
    : 100;

  const scale = percent / 100;
  const shell = ui.chatShell;
  if (!shell) return;

  const viewportHeight = Math.round(getVisibleViewportHeight());

  const layoutHeight = Math.ceil(viewportHeight / scale);

  shell.style.height = `${layoutHeight}px`;
  shell.style.flex = `0 0 ${layoutHeight}px`;

  if (CSS.supports && CSS.supports('zoom', '1')) {
    shell.style.zoom = String(scale);
    shell.style.transform = '';
    shell.style.transformOrigin = '';
    shell.style.width = '100%';
  } else {
    shell.style.zoom = '';
    shell.style.transform = `scale(${scale})`;
    shell.style.transformOrigin = 'top center';
    shell.style.width = `${100 / scale}%`;
  }
}

// Sidebar Logic
function handleBrowseRoomsClick(e) {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const btn = e.target.closest('#browse-rooms-btn');
  if (btn) {
    e.preventDefault();
    e.stopPropagation();
    toggleSidebar('rooms', getRoomsSidebarTitle(), loadRooms);
  }
}

window.toggleSidebar = toggleSidebar;
window.openSidebarTab = openSidebarTab;
window.joinRoom = (roomId) => {
    pendingInitialRoomSelection = false;
    window.changeRoom(roomId);
};

window.renderRoomsGrid = () => {
    const gridContainer = document.getElementById('rooms-grid-container');
    if (!gridContainer) return;
    
    // Get all rooms (already in window.roomsData or state.rooms)
    const rooms = window.roomsData ? Object.values(window.roomsData).filter(r => r.isActive) : [];
    
    gridContainer.innerHTML = rooms.map(room => `
      <div class="col">
        ${renderRoomCardHTML(room)}
      </div>
    `).join('');
    
    document.getElementById('room-grid-overlay').classList.remove('d-none');
};

function getVisibleRoomsForSidebar(rooms = state.rooms || []) {
  const canSeeWaitingRoomInList =
    state.isInWaitingRoom ||
    hasPermission('canManageRooms') ||
    hasPermission('canManageUsers');

  return rooms.filter(r => {
    if (!r.isActive) return false;

    if (state.waitingRoomId && Number(r.id) === Number(state.waitingRoomId)) {
      return canSeeWaitingRoomInList;
    }

    return true;
  });
}

function getRoomsSidebarTitle(rooms = state.rooms || []) {
  const count = getVisibleRoomsForSidebar(rooms).length;
  return count > 0 ? `الغرف (${count})` : 'الغرف';
}

function openSidebarTab(tab, title, contentLoader, options = {}) {
  console.log('openSidebarTab called for:', tab);

  if (typeof resetSidebarMemberSearch === 'function') {
    resetSidebarMemberSearch();
  }
  
  // Close spectator game if switching away from games tab
  if (tab !== 'games' && window.GamesManager && window.GamesManager.activeGame && window.GamesManager.activeGame.state && window.GamesManager.activeGame.state.isSpectator) {
    window.GamesManager.closeActiveGame();
  }

  // Re-query if null
  if (!ui.sidebar) ui.sidebar = document.getElementById('right-sidebar');
  if (!ui.sidebarOverlay) ui.sidebarOverlay = document.getElementById('sidebar-overlay');
  if (!ui.sidebarTitle) ui.sidebarTitle = document.getElementById('sidebar-title');
  
  if (!ui.sidebar) return;

  const updateContent = () => {
    if (ui.sidebarTitle) {
      ui.sidebarTitle.innerText = tab === 'rooms' ? getRoomsSidebarTitle() : title;
    }
    
    const sidebarHeader = document.querySelector('.sidebar-header');
    if (sidebarHeader) {
      sidebarHeader.style.display = 'flex';
    }
    
    ui.sidebar.classList.add('open');
    if (ui.sidebarOverlay) ui.sidebarOverlay.classList.add('show');
    
    state.setActiveSidebarTab(tab);
    
    if (tab !== 'settings') {
      currentSettingsView = null;
    } else if (!loadedTabs['settings'] || options.forceRefresh) {
      currentSettingsView = 'settings';
    }
    
    // Re-query containers
    if (!ui.sidebarUsersWrapper) ui.sidebarUsersWrapper = document.getElementById('sidebar-users-wrapper');
    if (!ui.sidebarUsersContainer) ui.sidebarUsersContainer = document.getElementById('sidebar-users-container');
    if (!ui.sidebarRoomsContainer) ui.sidebarRoomsContainer = document.getElementById('sidebar-rooms-container');
    if (!ui.sidebarGamesContainer) ui.sidebarGamesContainer = document.getElementById('sidebar-games-container');
    if (!ui.sidebarSpectateContainer) ui.sidebarSpectateContainer = document.getElementById('sidebar-spectate-container');
    if (!ui.sidebarWallContainer) ui.sidebarWallContainer = document.getElementById('sidebar-wall-container');
    if (!ui.sidebarSettingsContainer) ui.sidebarSettingsContainer = document.getElementById('sidebar-settings-container');
    if (!ui.sidebarPrivateContainer) ui.sidebarPrivateContainer = document.getElementById('sidebar-private-container');

    const containers = [
      ui.sidebarUsersWrapper, ui.sidebarRoomsContainer, ui.sidebarGamesContainer,
      ui.sidebarSpectateContainer,
      ui.sidebarWallContainer, ui.sidebarSettingsContainer, ui.sidebarPrivateContainer
    ];
    
    const activeContainerMap = {
      'users': ui.sidebarUsersWrapper,
      'rooms': ui.sidebarRoomsContainer,
      'games': ui.sidebarGamesContainer,
      'spectate': ui.sidebarSpectateContainer,
      'wall': ui.sidebarWallContainer,
      'settings': ui.sidebarSettingsContainer,
      'private': ui.sidebarPrivateContainer
    };
    
    containers.forEach(c => { if (c) c.classList.add('d-none'); });
    const activeContainer = activeContainerMap[tab];
    if (activeContainer) activeContainer.classList.remove('d-none');
    
    // Manage sidebar search container visibility
    if (ui.sidebarSearchContainer) {
      const isSearchEnabled = window.featuresSettings?.sidebarMemberSearchEnabled !== false;
      if (tab === 'users' && isSearchEnabled) {
        ui.sidebarSearchContainer.classList.remove('sidebar-search-hidden');
        ui.sidebarSearchContainer.classList.add('sidebar-search-visible');
        ui.sidebarSearchContainer.style.display = 'block';
      } else {
        ui.sidebarSearchContainer.classList.remove('sidebar-search-visible');
        ui.sidebarSearchContainer.classList.add('sidebar-search-hidden');
        ui.sidebarSearchContainer.style.display = 'none';
      }
    }

    const forceRefresh = options.forceRefresh === true;
    if (!loadedTabs[tab] || forceRefresh) {
      if (contentLoader) contentLoader();
      loadedTabs[tab] = true;
    }
    
    // Update active state on buttons
    [ui.usersTabBtn, ui.privateTabBtn, ui.roomsTabBtn, ui.wallTabBtn, ui.settingsBtn].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`${tab}-tab-btn`) || (tab === 'settings' ? ui.settingsBtn : null);
    if (activeBtn) activeBtn.classList.add('active');
  };

  updateContent();
}

let wallNotificationCount = 0;

function updateWallBadge() {
  const badge = document.getElementById('wall-notification-badge');
  if (!badge) return;
  if (wallNotificationCount > 0) {
    badge.innerText = wallNotificationCount;
    badge.classList.remove('d-none');
  } else {
    badge.classList.add('d-none');
  }
}

function closePrivateChatBeforeSidebarChange() {
  const manager = window.PrivateChatManager;
  if (manager && typeof manager.closeChat === 'function' && manager.isWindowOpen) {
    manager.closeChat();
  }
}

function toggleSidebar(tab, title, contentLoader, options = {}) {
  closePrivateChatBeforeSidebarChange();
  
  if (tab === 'wall') {
    wallNotificationCount = 0;
    updateWallBadge();
  }

  if (!ui.sidebar) ui.sidebar = document.getElementById('right-sidebar');
  const isAlreadyOpen = ui.sidebar && ui.sidebar.classList.contains('open');
  
  if (isAlreadyOpen && state.activeSidebarTab === tab && !options.forceRefresh) {
    closeSidebar();
  } else {
    openSidebarTab(tab, title, contentLoader, options);
  }
}

function closeSidebar() {
  // Close spectator game if sidebar is closed
  if (window.GamesManager && window.GamesManager.activeGame && window.GamesManager.activeGame.state && window.GamesManager.activeGame.state.isSpectator) {
    window.GamesManager.closeActiveGame();
  }

  if (typeof resetSidebarMemberSearch === 'function') {
    resetSidebarMemberSearch();
  }

  if (state.activeSidebarTab === 'settings') {
    currentSettingsView = null;
    loadedTabs['settings'] = false;
  }

  ui.sidebar.classList.remove('open');
  ui.sidebarOverlay.classList.remove('show');
  ui.sidebarSearchContainer.classList.remove('sidebar-search-visible');
  ui.sidebarSearchContainer.classList.add('sidebar-search-hidden');
  state.setActiveSidebarTab(null);
  [ui.usersTabBtn, ui.privateTabBtn, ui.roomsTabBtn, ui.wallTabBtn, ui.settingsBtn].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
}

if (!ui.closeSidebar) ui.closeSidebar = document.getElementById('close-sidebar');
if (ui.closeSidebar) ui.closeSidebar.onclick = closeSidebar;

if (!ui.sidebarOverlay) ui.sidebarOverlay = document.getElementById('sidebar-overlay');
if (ui.sidebarOverlay) ui.sidebarOverlay.onclick = closeSidebar;

if (!ui.usersTabBtn) ui.usersTabBtn = document.getElementById('users-tab-btn');
if (ui.usersTabBtn) ui.usersTabBtn.addEventListener('click', () => toggleSidebar('users', 'المتواجدون', () => renderUsersInSidebar(state.currentUsers)));

if (!ui.roomsTabBtn) ui.roomsTabBtn = document.getElementById('rooms-tab-btn');
if (ui.roomsTabBtn) ui.roomsTabBtn.addEventListener('click', () => toggleSidebar('rooms', getRoomsSidebarTitle(), loadRooms));


if (!ui.wallTabBtn) ui.wallTabBtn = document.getElementById('wall-tab-btn');
if (ui.wallTabBtn) ui.wallTabBtn.addEventListener('click', () => toggleSidebar('wall', 'الحائط', loadWallSidebar));

if (!ui.privateTabBtn) ui.privateTabBtn = document.getElementById('private-tab-btn');
if (ui.privateTabBtn) ui.privateTabBtn.addEventListener('click', () => toggleSidebar('private', 'المحادثات الخاصة', () => {
  if (window.PrivateChatManager) {
    window.PrivateChatManager.renderSidebar();
  }
}));

if (!ui.settingsBtn) ui.settingsBtn = document.getElementById('settings-btn');
if (ui.settingsBtn) ui.settingsBtn.onclick = () => toggleSidebar('settings', 'الضبط والإعدادات', renderSettings);

// Sidebar Search Logic
let currentSidebarSearchQuery = '';
let sidebarSearchTimeout;

