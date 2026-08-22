/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 06/28 · music-admin-ads
   lines 1020–1510 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
const handleMusicSearch = async () => {
  const query = document.getElementById('music-search-input').value.trim();
  if (!query) return;

  // Improved YouTube ID detection
  const getYouTubeId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const videoId = getYouTubeId(query);
  if (videoId) {
    try {
      const res = await _fetch(`/api/youtube/info?videoId=${videoId}`, {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      const data = await res.json();
      window.musicManager.play(videoId, data.title || 'أغنية يوتيوب');
    } catch (e) {
      window.musicManager.play(videoId, 'أغنية يوتيوب');
    }
    document.getElementById('music-search-input').value = '';
    return;
  }

  // If it's just an 11-char ID
  if (query.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(query)) {
    try {
      const res = await _fetch(`/api/youtube/info?videoId=${query}`, {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      const data = await res.json();
      window.musicManager.play(query, data.title || 'أغنية يوتيوب');
    } catch (e) {
      window.musicManager.play(query, 'أغنية يوتيوب');
    }
    document.getElementById('music-search-input').value = '';
    return;
  }

  // Perform search
  const resultsContainer = document.getElementById('music-search-results');
  resultsContainer.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> جاري البحث...</div>';
  
  const results = await window.musicManager.search(query);
  resultsContainer.innerHTML = '';
  
  if (results.length === 0) {
    resultsContainer.innerHTML = '<div class="text-center p-2 small text-muted">لا توجد نتائج</div>';
    return;
  }

  results.forEach(video => {
    const item = document.createElement('div');
    item.className = 'yt-result-item';
    item.innerHTML = `
      <img src="${video.thumbnail}" class="yt-result-thumb">
      <div class="yt-result-info">
        <div class="yt-result-title">${video.title}</div>
        <div class="yt-result-channel">${video.channelTitle}</div>
      </div>
    `;
    item.onclick = () => {
      window.musicManager.play(video.id, video.title);
      resultsContainer.innerHTML = '';
      document.getElementById('music-search-input').value = '';
    };
    resultsContainer.appendChild(item);
  });
};

document.getElementById('btn-music-search')?.addEventListener('click', handleMusicSearch);
document.getElementById('music-search-input')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleMusicSearch();
});

// Playback Controls
document.getElementById('btn-music-play')?.addEventListener('click', () => {
  window.musicManager.resume();
});
document.getElementById('btn-music-pause')?.addEventListener('click', () => {
  if (window.musicManager.player) {
    window.musicManager.pause(window.musicManager.player.getCurrentTime());
  }
});
document.getElementById('music-global-volume-slider')?.addEventListener('input', (e) => {
  window.musicManager.setGlobalVolume(e.target.value);
});
document.getElementById('btn-music-stop')?.addEventListener('click', () => {
  window.musicManager.stop();
});

// Local Controls
document.getElementById('music-local-volume')?.addEventListener('input', (e) => {
  window.musicManager.setLocalVolume(parseFloat(e.target.value));
});
document.getElementById('btn-music-local-mute')?.addEventListener('click', (e) => {
  const isMuted = !window.musicManager.isLocalMuted;
  window.musicManager.setLocalMute(isMuted);
  const btn = e.currentTarget;
  if (isMuted) {
    btn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    btn.classList.add('btn-danger');
  } else {
    btn.innerHTML = '<i class="fas fa-volume-up"></i>';
    btn.classList.remove('btn-danger');
  }
});

document.getElementById('btn-music-fix-sound')?.addEventListener('click', () => {
  if (window.musicManager.player && window.musicManager.player.playVideo) {
    window.musicManager.player.playVideo();
    showToast('تمت محاولة إصلاح الصوت', 'success');
  } else {
    showToast('المشغل غير جاهز بعد', 'warning');
  }
});

// Initialize state-based UI
// handled inside MusicManager.updateUI()

// Expose to window for modular game access
window.state = state;
window.socket = socket;

let gamesManagerPromise = null;

window.ensureGamesManagerLoaded = async function () {
  if (window.GamesManager) return window.GamesManager;

  if (!gamesManagerPromise) {
    gamesManagerPromise = import('/js/modules/GamesManager.js?v=39').then((module) => {
      module.GamesManager.init();
      window.GamesManager = module.GamesManager;
      return module.GamesManager;
    });
  }

  return gamesManagerPromise;
};

PrivateChatManager.init();


window.getThumbUrl = function(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (trimmed.includes('/uploads/site/default.png') || trimmed.includes('default-avatar')) return trimmed;
  if (trimmed.includes('_thumb.')) return trimmed;
  if (!trimmed.includes('/uploads/')) return trimmed;
  
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx > -1) {
    return trimmed.substring(0, dotIdx) + '_thumb.webp';
  }
  return trimmed;
};

window.getAvatarUrl = function(user, useThumb = false) {
  let pic = user;
  if (user && typeof user === 'object') {
    pic = user.pic !== undefined ? user.pic : (user.avatar !== undefined ? user.avatar : user.senderAvatar);
  }

  if (pic !== null && pic !== undefined) {
    if (typeof pic === 'string') {
      const trimmed = pic.trim();
      const lower = trimmed.toLowerCase();
      const isInvalid = !trimmed ||
        lower === 'null' ||
        lower === 'undefined' ||
        lower === 'none' ||
        lower.includes('placehold.co') ||
        lower.includes('flaticon.com') ||
        lower === '/default-avatar.png' ||
        lower === '/img/default-avatar.png' ||
        lower === '/images/default-avatar.png' ||
        lower === '/uploads/site/default.png';

      if (!isInvalid) {
        if (useThumb && typeof window.getThumbUrl === 'function') {
          return window.getThumbUrl(trimmed);
        }
        return trimmed;
      }
    }
  }

  var showDefault = window.showDefaultAvatar;
  if (showDefault === undefined && window.domainConfig) {
    showDefault = window.domainConfig.showDefaultAvatar;
  }

  if (showDefault !== false && showDefault !== 'false') {
    var customDefault = window.defaultAvatarUrl;
    if (!customDefault && window.domainConfig && window.domainConfig.defaultAvatarUrl) {
      customDefault = window.domainConfig.defaultAvatarUrl;
    }
    if (customDefault && typeof customDefault === 'string' && customDefault.trim() !== '') {
      var trimmedDefault = customDefault.trim();
      var lowerDefault = trimmedDefault.toLowerCase();
      if (lowerDefault !== 'null' && lowerDefault !== 'undefined' && lowerDefault !== 'none') {
        return trimmedDefault;
      }
    }
  }

  return '/uploads/site/default.png';
};

window.handleAvatarError = function(imgEl) {
  if (!imgEl) return;

  if (imgEl.src && imgEl.src.includes('_thumb.')) {
    var origSrc = imgEl.dataset.originalSrc || imgEl.src.replace('_thumb.webp', '.webp').replace('_thumb.', '.');
    delete imgEl.dataset.originalSrc;
    if (origSrc && origSrc !== imgEl.src) {
      imgEl.src = origSrc;
      return;
    }
  }

  var currentStage = imgEl.dataset.avatarFallbackStage || 'none';
  var localFallback = '/uploads/site/default.png';

  if (currentStage === 'none') {
    imgEl.dataset.avatarFallbackStage = 'customDefault';

    var showDefault = window.showDefaultAvatar;
    if (showDefault === undefined && window.domainConfig) {
      showDefault = window.domainConfig.showDefaultAvatar;
    }

    var customDefault = window.defaultAvatarUrl;
    if (!customDefault && window.domainConfig && window.domainConfig.defaultAvatarUrl) {
      customDefault = window.domainConfig.defaultAvatarUrl;
    }

    if (showDefault !== false && showDefault !== 'false' && customDefault && typeof customDefault === 'string' && customDefault.trim() !== '') {
      var targetUrl = customDefault.trim();
      if (!imgEl.src.endsWith(targetUrl) && imgEl.src !== targetUrl) {
        imgEl.src = targetUrl;
        return;
      }
    }
  }

  if (currentStage !== 'localFallback') {
    imgEl.dataset.avatarFallbackStage = 'localFallback';
    if (!imgEl.src.endsWith(localFallback) && imgEl.src !== localFallback) {
      imgEl.src = localFallback;
      return;
    }
  }

  imgEl.onerror = null;
};

window.getSystemMessageImageUrl = function(customImage) {
  if (customImage && typeof customImage === 'string' && customImage.trim() !== '') {
    const trimmed = customImage.trim();
    const lower = trimmed.toLowerCase();
    if (lower !== 'null' && lower !== 'undefined' && !lower.includes('flaticon.com') && !lower.includes('placehold.co')) {
      return trimmed;
    }
  }
  if (window.defaultSystemMessageImageUrl && typeof window.defaultSystemMessageImageUrl === 'string' && window.defaultSystemMessageImageUrl.trim() !== '') {
    return window.defaultSystemMessageImageUrl.trim();
  }
  return '/uploads/site/default.png';
};

window.getRoomThumbnailUrl = function(room) {
  if (room && room.useThumbnail && room.roomThumbnail) return room.roomThumbnail;
  if (window.defaultRoomUrl) return window.defaultRoomUrl;
  return '';
};


async function fetchAndApplySiteAppearance() {
  try {
    const res = await window.fetchWithRetry('/api/settings/appearance');
    console.log('Appearance response:', res);
    if (res.ok) {
      const appearance = await res.json();
      applySiteAppearance(appearance);
    } else {
      console.error('Appearance response not ok:', res.status, res.statusText);
    }
  } catch (err) {
    console.error('Failed to fetch site appearance', err);
  }
}

async function loadFeaturesSettings() {
  try {
    const res = await _fetch('/api/settings/features', {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
    });
    if (res.ok) {
      window.featuresSettings = await res.json();
      if (typeof window.updateLiveBroadcastButtonVisibility === 'function') {
        window.updateLiveBroadcastButtonVisibility();
      }
      if (typeof renderZajelTicker === 'function') {
        renderZajelTicker();
      }
    }
  } catch (err) {
    console.error('Failed to load features settings:', err);
  }
}

async function fetchAdminAdsTicker() {
  try {
    const res = await _fetch('/api/settings/admin-ads-ticker', {
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
    });
    if (res.ok) {
      const data = await res.json();
      renderAdminAdsTicker(data);
    }
  } catch (err) {
    console.error('Failed to fetch admin ads ticker:', err);
  }
}

let adminAdsTickerPayload = null;
let adminAdsResizeObserver = null;

function updateAdminAdsMarqueeMotion() {
  const container = document.getElementById('admin-ads-container');
  const textFlow = document.getElementById('admin-ads-text-flow');

  if (!container || !textFlow || !adminAdsTickerPayload?.settings?.enabled) {
    return;
  }

  requestAnimationFrame(() => {
    const containerWidth = container.clientWidth || 300;
    const flowWidth = textFlow.scrollWidth || 300;

    const configuredDuration = Number(adminAdsTickerPayload?.settings?.speed) || 30;

    /*
      البداية تكون خارج يسار مساحة النص بالكامل.
      النهاية تكون خارج يمين مساحة النص بالكامل.
      بهذه الطريقة النص يعبر كامل المساحة المتاحة
      ولا يختفي قبل الوصول لنهاية الشريط.
    */
    textFlow.style.setProperty('--admin-ads-start-x', `-${flowWidth}px`);
    textFlow.style.setProperty('--admin-ads-end-x', `${containerWidth}px`);

    textFlow.style.animation = 'none';
    void textFlow.offsetWidth;

    textFlow.style.animation =
      `marquee-admin-ads ${configuredDuration}s linear infinite`;
  });
}

function setupAdminAdsResizeObserver() {
  const container = document.getElementById('admin-ads-container');

  if (!container || container.dataset.adminAdsResizeObserverAttached === '1') {
    return;
  }

  container.dataset.adminAdsResizeObserverAttached = '1';

  adminAdsResizeObserver = new ResizeObserver(() => {
    updateAdminAdsMarqueeMotion();
  });

  adminAdsResizeObserver.observe(container);
}

if (!window.__adminAdsTickerEventsRegistered) {
  window.__adminAdsTickerEventsRegistered = true;

  window.addEventListener('resize', updateAdminAdsMarqueeMotion);
  window.addEventListener('orientationchange', updateAdminAdsMarqueeMotion);
}

function renderAdminAdsTicker(payload) {
  const bar = document.getElementById('admin-ads-ticker-bar');
  const flow = document.getElementById('admin-ads-text-flow');

  if (!bar || !flow) return;

  adminAdsTickerPayload = payload || null;

  const settings = payload?.settings;
  const ads = Array.isArray(payload?.ads) ? payload.ads : [];

  if (!settings?.enabled || ads.length === 0) {
    bar.classList.add('d-none');
    flow.replaceChildren();
    return;
  }

  bar.classList.remove('d-none');

  bar.style.setProperty(
    '--admin-ads-bg-color',
    settings.bgColor || '#fff8e1'
  );

  bar.style.setProperty(
    '--admin-ads-text-color',
    settings.textColor || '#4b3600'
  );

  flow.replaceChildren();

  ads.forEach((ad, index) => {
    const item = document.createElement('span');

    item.className = 'admin-ads-item';
    item.dir = 'rtl';

    const content = String(ad?.content || '');

    if (ad?.linkUrl && isSafeAdminAdUrl(ad.linkUrl)) {
      const link = document.createElement('a');

      link.href = ad.linkUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = content;

      item.appendChild(link);
    } else {
      item.textContent = content;
    }

    flow.appendChild(item);

    if (index < ads.length - 1) {
      const separator = document.createElement('span');

      separator.className = 'admin-ads-separator';
      separator.textContent = '•';

      flow.appendChild(separator);
    }
  });

  setupAdminAdsResizeObserver();
  updateAdminAdsMarqueeMotion();
}

window.featuresSettings = { 
  publicMessageDeletionEnabled: false,
  publicMessageReplyEnabled: false,
  disableCopy: false,
  disableRightClick: false,
  profileLightboxEnabled: true,
  cameraEnabled: true,
  storiesEnabled: true,
  sidebarAddonsEnabled: true,
  sidebarMemberSearchEnabled: true,
  wallYoutubeBarEnabled: true,
  wallPostLikesEnabled: true,
  wallPostCommentsEnabled: true,
  mentionsEnabled: true,
  battleChallengesEnabled: true,
  zajelEnabled: false
};

async function loadLoginBehavior() {
  try {
    const res = await window.fetchWithRetry('/api/settings/login-behavior');
    if (res.ok) {
      const data = await res.json();
      state.setLoginBehavior(data);
      if (data.behavior === 'default_room') {
        state.setCurrentRoomId(1);
      } else {
        state.setCurrentRoomId(0);
      }
      updateChatUI();
    } else {
      console.error('Login behavior response not ok:', res.status, res.statusText);
    }
  } catch (err) {
    console.error('Failed to load login behavior:', err);
  }
}

