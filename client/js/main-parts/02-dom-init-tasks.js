/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 02/28 · dom-init-tasks
   lines 271–410 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
const initDomContentLoadedTasks = () => {
  // Sound initialization deferred until user logs in

  // Handle session expired parameter (error=401)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('error') === '401') {
    setTimeout(() => {
      Swal.fire({
        title: 'انتهت الجلسة',
        text: 'انتهت صلاحية جلستك أو لم تقم بتسجيل الدخول بعد. يرجى تسجيل الدخول من جديد.',
        icon: 'warning',
        confirmButtonText: 'حسناً',
        customClass: {
          confirmButton: 'btn btn-primary px-4'
        },
        buttonsStyling: false
      });
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }, 500);
  }

  // Cache badges on page load to eliminate loading delay in user profile
  fetch('/api/settings/badges')
    .then(res => res.json())
    .then(badgeSettings => {
      window.badgeSettings = badgeSettings;
    })
    .catch(err => console.error('Failed to pre-fetch badge settings:', err));
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDomContentLoadedTasks, { once: true });
} else {
  initDomContentLoadedTasks();
}

console.debug('main.js loaded');

// Admin panel drawer toggler
window.toggleAdminPanel = (show) => {
  const panel = document.getElementById('profile-admin-sliding-panel');
  if (!panel) return;
  let isShowing = false;
  if (show === undefined) {
    panel.classList.toggle('show');
    isShowing = panel.classList.contains('show');
  } else if (show) {
    panel.classList.add('show');
    isShowing = true;
  } else {
    panel.classList.remove('show');
    isShowing = false;
  }
  
  if (isShowing) {
    setTimeout(() => {
      const modal = document.getElementById('userProfileModal');
      if (modal) {
        modal.scrollTo({
          top: modal.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 150);
  }
};

// Outside click to close sliding admin panel
document.addEventListener('click', (e) => {
  const panel = document.getElementById('profile-admin-sliding-panel');
  const adminBtn = document.getElementById('btn-profile-admin');
  if (panel && panel.classList.contains('show')) {
    if (!panel.contains(e.target) && adminBtn && !adminBtn.contains(e.target) && !e.target.closest('#btn-profile-admin')) {
      window.toggleAdminPanel(false);
    }
  }
});
// Removed DOM element logging to prevent circular structure issues in some environments

// Auto Resize Textarea Utility - DISABLED as per user request
window.autoResizeTextarea = function(el, maxHeight = 150) {
  // Do nothing
  return;
};

// Update message times every minute
setInterval(() => {
  document.querySelectorAll('.message-time').forEach(el => {
    const createdAt = el.getAttribute('data-created-at');
    if (createdAt) el.innerHTML = formatTimeAgo(createdAt);
  });
}, 60000);

window.getClientSessionId = function() {
  let id = sessionStorage.getItem('chat_client_session_id');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('chat_client_session_id', id);
  }
  return id;
}

window.createNewClientSessionId = function() {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomUUID)
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem('chat_client_session_id', id);
  return id;
}

const socket = io({ 
  autoConnect: false,
  auth: async (cb) => {
    console.debug('Socket auth callback called');
    const fingerprint = await getFingerprint();
    cb({ token: getToken(), clientSessionId: window.getClientSessionId(), fp: fingerprint });
  }
});
window.socket = socket;
socket.on('kiss-received', (data) => {
    renderAnimation(data.sender || { username: data.from }, '/uploads/system/kiss.webp', true, 'بوسة', '/sounds/kiss.mp3');
});

socket.on('slap-received', (data) => {
    renderAnimation(data.sender || { username: data.from }, '/uploads/system/slap.webp', false, 'كف', '/sounds/slap.mp3');
});

socket.on('hug-received', (data) => {
    renderAnimation(data.sender || { username: data.from }, '/uploads/system/hug.webp', false, 'حضن', '/sounds/hug.mp3');
});

socket.on('clap-received', (data) => {
    renderAnimation(data.sender || { username: data.from }, '/uploads/system/clap.webp', false, 'تصفيق', '/sounds/clap.mp3');
});

let currentEffectAudio = null;

