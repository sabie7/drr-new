/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 07/28 · site-appearance
   lines 1511–1850 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function applySiteAppearance(appearance) {
  if (!appearance) return;
  window.siteAppearance = appearance;
  state.setSettings(appearance);
  
  const root = document.documentElement;
  
  // Consolidated Main UI Color
  if (appearance.mainUiColor) {
    root.style.setProperty('--main-ui-color', appearance.mainUiColor);
  } else if (appearance.roomBoxBg) {
    // Fallback for old settings
    root.style.setProperty('--main-ui-color', appearance.roomBoxBg);
  }

  if (appearance.landingBgColor) root.style.setProperty('--landing-bg-color', appearance.landingBgColor);
  if (appearance.chatInputBg) root.style.setProperty('--chat-input-bg', appearance.chatInputBg);
  if (appearance.unifiedBtnBg) root.style.setProperty('--unified-btn-bg', appearance.unifiedBtnBg);
  if (appearance.unifiedBtnHoverBg) root.style.setProperty('--unified-btn-hover-bg', appearance.unifiedBtnHoverBg);
  if (appearance.micIconColor) root.style.setProperty('--mic-icon-color', appearance.micIconColor);
  if (appearance.micBtnBgColor) root.style.setProperty('--mic-btn-bg-color', appearance.micBtnBgColor);
  if (appearance.lineIconColor) root.style.setProperty('--line-icon-color', appearance.lineIconColor);

  // Overlay Image
  if (appearance.showOverlayImage === 'true' || appearance.showOverlayImage === true) {
    if (appearance.overlayImageUrl) {
      const currentOverlay = root.style.getPropertyValue('--overlay-image');
      const newOverlay = `url(${appearance.overlayImageUrl})`;
      if (currentOverlay !== newOverlay && currentOverlay !== `url("${appearance.overlayImageUrl}")`) {
        root.style.setProperty('--overlay-image', newOverlay);
      }
    } else {
      if (root.style.getPropertyValue('--overlay-image') !== 'none') root.style.setProperty('--overlay-image', 'none');
    }
  } else {
    if (root.style.getPropertyValue('--overlay-image') !== 'none') root.style.setProperty('--overlay-image', 'none');
  }

  // Font Settings
  if (appearance.fontFamily) {
    root.style.setProperty('--font-family', appearance.fontFamily);
    // Dynamically load Google Font if it's one of our presets
    const fontName = appearance.fontFamily.split(',')[0].replace(/'/g, '').trim();
    if (fontName && fontName !== 'Arial') {
      const linkId = 'dynamic-google-font';
      let link = document.getElementById(linkId);
      if (!link) {
        link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      const fontUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`;
      if (link.href !== fontUrl) link.href = fontUrl;
    }
  }
  if (appearance.fontSize) root.style.setProperty('--font-size', appearance.fontSize + 'px');
  if (appearance.fontWeight) root.style.setProperty('--font-weight', appearance.fontWeight);

  // Apply user font size preference on top of site base
  applyUserFontSize();

  // Banner
  const banner = document.querySelector('.site-banner');
  if (banner) {
    if (appearance.showBanner === 'false' || appearance.showBanner === false) {
      if (banner.style.display !== 'none') banner.style.display = 'none';
    } else {
      if (banner.style.display !== 'block') banner.style.display = 'block';
      if (appearance.bannerUrl) {
        const currentSrc = typeof window.normalizeAssetUrl === 'function' ? window.normalizeAssetUrl(banner.getAttribute('src')) : banner.src;
        const newSrc = typeof window.normalizeAssetUrl === 'function' ? window.normalizeAssetUrl(appearance.bannerUrl) : appearance.bannerUrl;
        if (currentSrc !== newSrc) banner.src = appearance.bannerUrl;
      }
      if (appearance.bannerWidth) {
        const width = appearance.bannerWidth + 'px';
        if (banner.style.width !== width) banner.style.width = width;
      }
      if (appearance.bannerHeight) {
        const height = appearance.bannerHeight + 'px';
        if (banner.style.height !== height) banner.style.height = height;
      }
    }
  }

  // Favicon / Logo
  const logo = document.getElementById('site-logo');
  if (logo) {
    if (appearance.showFavicon === 'false' || appearance.showFavicon === false) {
      if (logo.style.display !== 'none') logo.style.display = 'none';
    } else {
      if (logo.style.display !== 'block') logo.style.display = 'block';
      if (appearance.faviconUrl) {
        if (logo.tagName === 'IMG') {
          const currentSrc = typeof window.normalizeAssetUrl === 'function' ? window.normalizeAssetUrl(logo.getAttribute('src')) : logo.src;
          const newSrc = typeof window.normalizeAssetUrl === 'function' ? window.normalizeAssetUrl(appearance.faviconUrl) : appearance.faviconUrl;
          if (currentSrc !== newSrc) logo.src = appearance.faviconUrl;
        } else {
          const img = document.createElement('img');
          img.id = 'site-logo';
          img.src = appearance.faviconUrl;
          img.className = logo.className;
          img.style.cssText = logo.style.cssText;
          img.setAttribute('referrerPolicy', 'origin-when-cross-origin');
          img.setAttribute('loading', 'lazy');
          logo.replaceWith(img);
        }
      }
    }
  }

  // Private Tab Background
  const privateTabContainer = document.getElementById('sidebar-private-container');
  if (privateTabContainer) {
    if (appearance.showPrivateTabBg === 'false' || appearance.showPrivateTabBg === false) {
      privateTabContainer.style.backgroundImage = 'none';
    } else {
      if (appearance.privateTabBgUrl) {
        privateTabContainer.style.backgroundImage = `url('${appearance.privateTabBgUrl}')`;
        privateTabContainer.style.backgroundSize = 'cover';
        privateTabContainer.style.backgroundPosition = 'center';
      }
    }
  }

  if (appearance.faviconUrl) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = appearance.faviconUrl;
  }

  // Default Avatar
  if (appearance.showDefaultAvatar === 'false' || appearance.showDefaultAvatar === false) {
    window.showDefaultAvatar = false;
    window.defaultAvatarUrl = null;
  } else {
    window.showDefaultAvatar = true;
    if (appearance.defaultAvatarUrl) {
      window.defaultAvatarUrl = appearance.defaultAvatarUrl;
    } else {
      window.defaultAvatarUrl = '/uploads/site/default.png';
    }
  }

  // Default System Message Image
  window.defaultSystemMessageImageUrl = appearance.defaultSystemMessageImageUrl || null;

  // Default Room
  if (appearance.showDefaultRoom === 'false' || appearance.showDefaultRoom === false) {
    window.defaultRoomUrl = null;
  } else if (appearance.defaultRoomUrl) {
    window.defaultRoomUrl = appearance.defaultRoomUrl;
  }

  // Default Cover
  if (appearance.enableCustomCover === 'false' || appearance.enableCustomCover === false) {
    window.enableCustomCover = false;
  } else {
    window.enableCustomCover = true;
  }
  
  if (appearance.defaultCoverUrl) {
    window.defaultCoverUrl = appearance.defaultCoverUrl;
  } else {
    window.defaultCoverUrl = null;
  }

  
  // Refresh UI to apply new default avatar and system message images
  if (state && state.currentUser && Array.isArray(state.currentUsers)) {
    updateUsersList(state.currentUsers);
  }
  if (window.fetchStories) {
    window.fetchStories();
  }
  if (window.PrivateChatManager && typeof window.PrivateChatManager.renderConversationsList === 'function') {
    window.PrivateChatManager.renderConversationsList();
    if (window.PrivateChatManager.activeConversationUsername) {
      window.PrivateChatManager.renderMessages();
    }
  }
}

socket.on('site_appearance_updated', applySiteAppearance);

socket.on('admin_ads:updated', (data) => {
  renderAdminAdsTicker(data);
});

socket.on('server_restarting', (data) => {
  Swal.fire({
    title: 'تنبيه من النظام',
    text: data.message || 'يتم الآن إعادة تشغيل السيرفر لتحديث الإعدادات، يرجى الانتظار...',
    icon: 'info',
    timer: (data.countdown || 5) * 1000,
    timerProgressBar: true,
    showConfirmButton: false,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  }).then(() => {
    window.location.reload();
  });
});

// Fix for Bootstrap 5 focus trap with SweetAlert2
document.addEventListener('focusin', (e) => {
  if (e.target && typeof e.target.closest === 'function' && e.target.closest('.swal2-container')) {
    e.stopImmediatePropagation();
  }
}, { capture: true });

async function initApp() {
  console.log('Initializing app...');

  // Page reload session termination is handled in landing.js

  // Fill saved username if exists
  const savedUsername = localStorage.getItem('chat_member_username');
  const rememberName = localStorage.getItem('chat_remember_member_name');
  if (savedUsername && rememberName === 'true') {
     const memberUsernameInput = document.getElementById('member-username');
     if (memberUsernameInput) memberUsernameInput.value = savedUsername;
  }
  
  // Apply initial appearance immediately from server-injected config to prevent FOUC
  if (window.domainConfig && Object.keys(window.domainConfig).length > 0) {
    applySiteAppearance(window.domainConfig);
  }
  
  // Start fetches in parallel
  // We still fetch appearance to sync any live changes, but it's no longer the primary source for initial render
  const appearancePromise = fetchAndApplySiteAppearance();
  const featuresSettingsPromise = loadFeaturesSettings();
  const adminAdsTickerPromise = fetchAdminAdsTicker();
  const loginBehaviorPromise = loadLoginBehavior();
  const shortcutsPromise = loadShortcuts();
  const smileysPromise = loadSmileys();
  applyUserFontSize();
  
  // Check if user is already logged in
  const token = getToken();
  let sessionPromise = Promise.resolve();
  
  // Automatic login disabled as requested
  const enableAutoLogin = false;
  
  // منع الدخول التلقائي للغرف إذا كان المستخدم مفعل خيار "خارج الغرفة"
  const loginBehavior = localStorage.getItem('loginBehavior'); // سنفترض وجود خيار مخزن، أو نتحقق من حالته هنا
  
  if (token && enableAutoLogin) {
    sessionPromise = (async () => {
      try {
        const res = await _fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const result = await res.json();
          if (result.success && result.user) {
            console.log('User session restored:', result.user.username);
            state.setCurrentUser(result.user);
            
            // التحقق من "خارج الغرفة" هنا
            if (result.user.mustChooseRoom) {
               window.renderRoomsGrid();
            } else {
               if (ui.loginOverlay) ui.loginOverlay.classList.add('d-none');
               if (ui.chatShell) {
                 ui.chatShell.classList.remove('d-none');
                 scheduleDelayedViewportSync();
               }
            }
            
            updateUIForUser();
            loadShortcuts();
            updateChatUI();
          } else {
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
          }
        } else {
          // Token invalid or server error
          sessionStorage.removeItem('token');
          sessionStorage.removeItem('user');
        }
      } catch (err) {
        console.error('Failed to verify session:', err);
      }
    })();
  }

  // Wait for essential data before connecting socket
  await Promise.all([appearancePromise, featuresSettingsPromise, adminAdsTickerPromise, loginBehaviorPromise, shortcutsPromise, smileysPromise, sessionPromise]);

  // Setup mentions after features settings are loaded
  setupMentions();

  getFingerprint().then(fp => {
    socket.io.opts.query = { fp };
    
    // Only connect socket if user is already authenticated
    if (state.currentUser && getToken()) {
      if (!socket.connected) {
        socket.connect();
      }
      if (window.profileSoundManager) {
        window.profileSoundManager.init();
      }
    }
  });
  
  // Pre-load rooms for everyone
  loadRooms();

  // Lazy-load stories after a delay of 2.5 seconds
  setTimeout(() => {
    if (window.featuresSettings?.storiesEnabled !== false) {
      window.ensureStoriesLoaded();
    }
  }, 2500);
}

window.__chatAppInitPromise = initApp().catch(err => {
  console.error('[Main] initApp failed:', err);
  throw err;
});

let hasEverConnected = false;
let hasJoinedChatOnce = false;
let isLoginSocketSwitch = false;
let isReconnectingFlag = false;

/**
 * Hide the reconnection status bar
 */
