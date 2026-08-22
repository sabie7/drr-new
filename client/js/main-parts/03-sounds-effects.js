/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 03/28 · sounds-effects
   lines 411–714 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function stopCurrentEffectAudio() {
    if (currentEffectAudio) {
        try {
            currentEffectAudio.pause();
            currentEffectAudio.currentTime = 0;
        } catch (e) {
            console.warn('[ProfileEffect] Error stopping previous effect audio:', e);
        }
        currentEffectAudio = null;
    }
}

function playEffectSound(soundUrl) {
    if (!window.isChatAudioAllowed()) return null;
    if (!soundUrl) return null;

    stopCurrentEffectAudio();

    try {
        if (window.profileSoundManager && !window.profileSoundManager.initialized) {
            window.profileSoundManager.init();
        }

        let audio = null;
        if (window.profileSoundManager && window.profileSoundManager.effectAudios && window.profileSoundManager.effectAudios[soundUrl]) {
            audio = window.profileSoundManager.effectAudios[soundUrl];
            audio.currentTime = 0;
            audio.loop = false;
        } else {
            audio = new Audio(soundUrl);
            audio.loop = false;
        }

        currentEffectAudio = audio;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                // Silently swallow browser autoplay prevention
            });
        }
        return audio;
    } catch (e) {
        return null;
    }
}

function renderAnimation(fromUser, imgSrc, showConfetti, actionName, soundUrl) {
    if (showConfetti) {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            shapes: ['circle'],
            colors: ['#e11d48', '#f43f5e', '#be123c']
        });
    }

    const audioInstance = playEffectSound(soundUrl);

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '50%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.zIndex = '9999';
    container.style.textAlign = 'center';
    container.style.pointerEvents = 'none';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';

    const img = document.createElement('img');
    img.src = imgSrc;
    img.style.width = '200px';

    const name = document.createElement('div');
    const fromUsername = fromUser.username || fromUser;
    const identityHtml = window.renderUserIdentity ? window.renderUserIdentity(fromUser, { tag: 'span' }) : `<span>${fromUsername}</span>`;
    name.innerHTML = `${identityHtml} قام بإرسال ${actionName} لك`;
    name.style.color = '#1e293b';
    name.style.fontWeight = '600';
    name.style.fontSize = '14px';
    name.style.marginTop = '16px';
    name.style.background = 'rgba(255, 255, 255, 0.75)';
    name.style.backdropFilter = 'blur(12px)';
    name.style.webkitBackdropFilter = 'blur(12px)';
    name.style.border = '1px solid rgba(255, 255, 255, 0.5)';
    name.style.boxShadow = '0 8px 32px 0 rgba(31, 38, 135, 0.08)';
    name.style.borderRadius = '50px';
    name.style.padding = '10px 24px';
    name.style.display = 'inline-block';
    name.style.direction = 'rtl';
    name.style.maxWidth = '90vw';
    name.style.wordBreak = 'break-word';

    container.appendChild(img);
    container.appendChild(name);
    document.body.appendChild(container);

    setTimeout(() => {
        container.remove();
        if (currentEffectAudio && currentEffectAudio === audioInstance) {
            stopCurrentEffectAudio();
        }
    }, 7000);
}

  socket.on('game:spectate:list:update', (games) => {
  window.activeSpectateGames = games || [];
  const badge = document.getElementById('active-games-count-badge');
  const btn = document.getElementById('active-games-floating-btn');
  const count = window.activeSpectateGames.length;
  if (badge) {
    badge.innerText = count;
    if (count > 0) {
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }
  if (btn) {
    if (count > 0) {
      btn.classList.remove('d-none');
    } else {
      btn.classList.add('d-none');
    }
  }
  if (window.GamesManager) {
    window.GamesManager.activeSpectateGames = window.activeSpectateGames;
    window.GamesManager.renderSpectateGamesList();
  }
});
window.state = state;
window.terminalExitStarted = false;

window.PrivateCallManager.init(socket);
window.voiceManager = new VoiceManager(socket);
console.debug('[VoiceAudio] VoiceManager initialized:', {
  constructor: window.voiceManager?.constructor?.name,
  hasUnlockAudioSession:
    typeof window.voiceManager?.unlockAudioSession === 'function',
  hasStartSilentAudioSession:
    typeof window.voiceManager?.startSilentAudioSession === 'function',
  hasRetryPendingRemoteAudio:
    typeof window.voiceManager?.retryPendingRemoteAudio === 'function'
});
window.musicManager = new MusicManager(socket);

// --- Dynamic Lazy Loading Functions ---
const loadedScripts = {};

window.loadScriptOnce = (src, key) => {
  if (loadedScripts[key]) {
    return loadedScripts[key];
  }

  loadedScripts[key] = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-lazy-key="${key}"]`);

    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.setAttribute('data-lazy-key', key);

    script.onload = () => resolve();
    script.onerror = (err) => {
      delete loadedScripts[key];
      reject(err);
    };

    document.body.appendChild(script);
  });

  return loadedScripts[key];
};

window.ensureStoriesLoaded = async () => {
  await window.loadScriptOnce('/js/stories.js?v=11', 'stories');

  if (typeof window.fetchStories === 'function') {
    window.fetchStories();
  }
};

window.ensureBattleLoaded = async () => {
  await window.loadScriptOnce('/js/battle.js?v=20260730-tap-v2', 'battle');
};

window.ensureCameraLoaded = async () => {
  await window.loadScriptOnce('/js/cameraManager.js?v=3', 'camera');

  if (!window.cameraManager && window.CameraManager) {
    window.cameraManager = new window.CameraManager(socket, state);
  }

  return window.cameraManager;
};

window.ensureLiveBroadcastLoaded = async () => {
  await window.loadScriptOnce('/js/liveBroadcastManager.js?v=5', 'liveBroadcast');
  return window.liveBroadcastManager;
};

// On-demand loading of cameraManager when a camera request is received
socket.on('camera:request', async (data) => {
  const cameraManager = await window.ensureCameraLoaded();

  if (cameraManager && typeof cameraManager.handleIncomingRequest === 'function') {
    cameraManager.handleIncomingRequest(data);
  }
});

// On-demand loading of liveBroadcastManager when a notify event is received
socket.on('liveBroadcast:notify', async (data) => {
  const manager = await window.ensureLiveBroadcastLoaded();

  if (manager && typeof manager.showBroadcastNotification === 'function') {
    manager.showBroadcastNotification(data);
  }
});

// On-demand loading of battle when a battle invitation is received
socket.on('battle:created', async (data) => {
  await window.ensureBattleLoaded();
  // Wait a tick for battle.js listeners to attach, but battle.js itself attaches listeners globally
  // Wait, battle.js attaches to socket on load. But if battle:created triggered this load, the event might be missed by battle.js.
  // We should pass it to window.currentBattle?
  // battle.js has: socket.on('battle:created', ...). If we load it here, we might miss the event.
  // Instead, we can emit a custom event or call a function if it exists.
  setTimeout(() => {
    if (typeof window.handleBattleCreated === 'function') {
      window.handleBattleCreated(data);
    }
  }, 100);
});

socket.on('battle:sync', async (data) => {
  if (data && data.hasActiveBattle) {
    await window.ensureBattleLoaded();
    setTimeout(() => {
      if (typeof window.handleBattleSync === 'function') {
        window.handleBattleSync(data);
      }
    }, 100);
  } else if (data && !data.hasActiveBattle) {
     if (typeof window.handleBattleSync === 'function') {
        window.handleBattleSync(data);
     }
  }
});

socket.on('battle:invited', async (data) => {
  await window.ensureBattleLoaded();

  if (typeof window.handleBattleInvitation === 'function') {
    window.handleBattleInvitation(data);
  } else if (typeof window.showBattleInvitation === 'function') {
    window.showBattleInvitation(data);
  } else if (typeof window.onBattleInvited === 'function') {
    window.onBattleInvited(data);
  }
});

// --- YouTube Room Music AutoPlay Handle on Mobile ---
window.pendingAutoPlayMusic = false;
let autoPlayUnboxDone = false;

window.tryAutoPlayRoomMusicAfterFirstGesture = () => {
    if (autoPlayUnboxDone) return;

    if (!window.musicManager) return;

    // Check if user manually paused or muted
    if (window.musicManager.isLocalMuted) {
        autoPlayUnboxDone = true;
        return;
    }

    if (window.musicManager.player && typeof window.musicManager.player.playVideo === 'function' && window.musicManager.isApiReady) {
        const music = window.musicManager.currentMusic;
        if (music && music.isPlaying) {
            try {
                window.musicManager.player.playVideo();
                window.pendingAutoPlayMusic = false;
                autoPlayUnboxDone = true;
            } catch(e) {
                console.warn('Failed auto-play gesture for YouTube room music:', e);
            }
        } else {
            // Music is not playing right now, maybe later
            window.pendingAutoPlayMusic = true;
        }
    } else {
        window.pendingAutoPlayMusic = true;
    }
};

