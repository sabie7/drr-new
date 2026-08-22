/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 01/28 · boot-imports
   lines 1–270 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
import { ui, showToast, shakeElement } from './modules/ui.js?v=3';
import * as state from './modules/state.js?v=3';
import { prettifySystemMessage } from './modules/site-enhancements.js?v=4';
import { PrivateChatManager } from './modules/PrivateChatManager.js?v=20260820-pmfix-v2';
import { PrivateCallManager } from './modules/PrivateCallManager.js';
import { VoiceManager } from './modules/voice/VoiceManager.js?v=20260820-micmenu-fix-v1';
import { MusicManager } from './modules/MusicManager.js?v=20260718-ios-music-1';

window.togglePasswordVisibility = function(button) {
  if (!button || !button.parentElement) return;
  const input = button.parentElement.querySelector('input[type="password"], input[type="text"]');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    button.innerHTML = '<i class="fas fa-eye-slash"></i>';
  } else {
    input.type = 'password';
    button.innerHTML = '<i class="fas fa-eye"></i>';
  }
};

window.toggleHiddenMode = function(button) {
  if (!button) return;
  button.classList.add('pulse');
  setTimeout(() => button.classList.remove('pulse'), 400);

  const hiddenInput = document.getElementById('login-hidden-input');
  if (hiddenInput) {
    const isHidden = hiddenInput.value === 'true';
    const nextHidden = !isHidden;
    hiddenInput.value = nextHidden ? 'true' : 'false';
    if (nextHidden) {
      button.classList.add('hidden-active');
    } else {
      button.classList.remove('hidden-active');
    }
  }
};



var updateUsersListRAF = null;
var pendingUsersPayload = null;
var lastUsersPayloadString = null;
var isLoggingOut = false;
window.isLoggingOut = false;

var profileUser = null;
window.profileUser = null;
var presenceUsersMap = new Map();
var presenceUsersVersion = 0;
var lastActivityEmit = 0;
var lastRealActivityAt = Date.now();
var presenceIdleSent = false;
var publicMessageQueue = [];
var publicMessageRAF = null;
var currentAddonMode = 'gift';

function isSafeAdminAdUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function getVisibleViewportHeight() {
  const isAndroid = /android/i.test(navigator.userAgent);
  if (isAndroid && window.visualViewport && window.visualViewport.height) {
    return window.visualViewport.height;
  }
  return window.innerHeight;
}

let lastMeasuredViewportHeight = -1;
let syncAnimationFrameId = null;

function triggerViewportSync() {
  if (syncAnimationFrameId) {
    cancelAnimationFrame(syncAnimationFrameId);
  }
  syncAnimationFrameId = requestAnimationFrame(() => {
    syncAnimationFrameId = null;
    const currentHeight = getVisibleViewportHeight();
    if (Math.abs(currentHeight - lastMeasuredViewportHeight) > 0.5) {
      syncChatViewportHeight();
    }
  });
}

function scheduleDelayedViewportSync() {
  triggerViewportSync();
  [100, 300, 700].forEach((delay) => {
    setTimeout(triggerViewportSync, delay);
  });
}

window.scheduleDelayedViewportSync = scheduleDelayedViewportSync;

function syncChatViewportHeight() {
  const visibleHeight = getVisibleViewportHeight();
  lastMeasuredViewportHeight = visibleHeight;
  document.documentElement.style.setProperty(
    '--chat-viewport-height',
    `${Math.round(visibleHeight)}px`
  );
  
  if (typeof applyUserFontSize === 'function') {
    requestAnimationFrame(() => applyUserFontSize());
  }
}

const isAndroid = /android/i.test(navigator.userAgent);

if (!window.__viewportHeightSyncInstalled) {
  window.__viewportHeightSyncInstalled = true;
  syncChatViewportHeight();
  window.addEventListener('resize', triggerViewportSync, { passive: true });
  window.addEventListener('orientationchange', triggerViewportSync, { passive: true });

  if (isAndroid) {
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', triggerViewportSync, { passive: true });
    }
    window.addEventListener('focusin', scheduleDelayedViewportSync, { passive: true });
    window.addEventListener('focusout', scheduleDelayedViewportSync, { passive: true });
  }
}

// Sidebar Logic
var loadedTabs = window.loadedTabs || {
  users: false,
  private: false,
  rooms: false,
  wall: false,
  settings: false,
  games: false
};
window.loadedTabs = loadedTabs;

window.showToast = showToast;

window.toggleSettingsGroup = (header) => {
  const accordion = header.closest('.settings-group-accordion');
  if (!accordion) return;
  const isExpanded = accordion.classList.toggle('expanded');
  header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
};

window.isNotificationSoundsMuted = () => {
  if (localStorage.getItem('muteNotificationSounds') === 'true') return true;
  if (typeof state !== 'undefined' && state?.currentUser && state.currentUser.muteNotificationSounds === true) return true;
  return false;
};

window.isChatAudioAllowed = () => {
  if (typeof state === 'undefined' || !state.currentUser) return false;
  if (typeof ui !== 'undefined' && ui.loginOverlay && !ui.loginOverlay.classList.contains('d-none')) return false;
  if (window.isNotificationSoundsMuted && window.isNotificationSoundsMuted()) return false;
  return true;
};

window.profileSoundManager = {
  initialized: false,
  unlocked: false,
  likeAudio: null,
  alertAudio: null,
  effectAudios: {},
  unlockListenersAttached: false,
  
  init() {
    // Strictly prevent initializing sounds if user is not logged in or still on login interface
    if (typeof state === 'undefined' || !state || !state.currentUser) return;
    if (typeof ui !== 'undefined' && ui.loginOverlay && !ui.loginOverlay.classList.contains('d-none')) return;
    if (this.initialized) return;

    this.likeAudio = new Audio('/sounds/like.mp3');
    this.alertAudio = new Audio('/sounds/alert.mp3');
    this.effectAudios = {
      '/sounds/kiss.mp3': new Audio('/sounds/kiss.mp3'),
      '/sounds/hug.mp3': new Audio('/sounds/hug.mp3'),
      '/sounds/slap.mp3': new Audio('/sounds/slap.mp3'),
      '/sounds/clap.mp3': new Audio('/sounds/clap.mp3')
    };
    // Preload audio safely without playing
    this.likeAudio.preload = 'auto';
    this.likeAudio.load();
    this.alertAudio.preload = 'auto';
    this.alertAudio.load();
    Object.values(this.effectAudios).forEach(a => {
      a.preload = 'auto';
      a.load();
    });
    this.initialized = true;

    // Attach unlock events once
    if (!this.unlockListenersAttached) {
      this.unlockListenersAttached = true;
      const unlockFn = () => this.unlock();
      ['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evt => {
        document.addEventListener(evt, unlockFn, { once: true, passive: true });
      });
    }
  },

  unlock() {
    if (this.unlocked) return;
    try {
      // Resume Web Audio AudioContext safely without triggering real audio files
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!window.__soundUnlockAudioContext) {
          window.__soundUnlockAudioContext = new AudioCtx();
        }
        if (window.__soundUnlockAudioContext.state === 'suspended') {
          window.__soundUnlockAudioContext.resume().catch(() => {});
        }
      }
      this.unlocked = true;
    } catch (e) {
      // Ignore
    }
  },

  playLike() {
    if (!window.isChatAudioAllowed()) return;
    if (!this.initialized) this.init();
    try {
      if (this.likeAudio) {
        this.likeAudio.currentTime = 0;
        this.likeAudio.loop = false;
        this.likeAudio.play().catch(e => {
          // Silent swallow for browser autoplay policies
        });
      }
    } catch (e) {
      // Ignore
    }
  },

  playAlert() {
    if (!window.isChatAudioAllowed()) return;
    if (!this.initialized) this.init();
    try {
      if (this.alertAudio) {
        this.alertAudio.currentTime = 0;
        this.alertAudio.loop = false;
        this.alertAudio.play().catch(e => {
          // Silent swallow for browser autoplay policies
        });
      }
    } catch (e) {
      // Ignore
    }
  }
};

