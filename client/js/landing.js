// landing.js — our own clean login handler (replaces obfuscated version)
// Handles: member login, guest login, register, news ticker, landing users list
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function showAlert(msg, type) {
    if (typeof window.showClassicAlert === 'function') {
      window.showClassicAlert(msg, type || 'warning');
    } else { alert(msg); }
  }

  function api(path, body, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', path, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      try { cb(JSON.parse(xhr.responseText), xhr.status); }
      catch (e) { cb(null, xhr.status); }
    };
    xhr.onerror = function () { cb(null, 0); };
    xhr.send(JSON.stringify(body || {}));
  }

  function storeSession(data) {
    try {
      sessionStorage.setItem('chat_token', data.token || '');
      sessionStorage.setItem('chat_user', JSON.stringify(data.user || {}));
      localStorage.setItem('chat_username', (data.user || {}).username || '');
    } catch (e) {}
  }

  function enterChat(data) {
    storeSession(data);
    var overlay = $('login-overlay');
    var shell = $('chat-shell');
    if (overlay) overlay.classList.add('d-none');
    if (shell) shell.classList.remove('d-none');
    // Load main chat script
    if (!document.querySelector('script[data-main-script]')) {
      var s = document.createElement('script');
      s.src = '/js/main.js?v=' + Date.now();
      s.setAttribute('data-main-script', 'true');
      s.onload = function () {
        // Ensure socket connects (bundle uses autoConnect:false)
        setTimeout(function () {
          try {
            if (typeof socket !== 'undefined' && socket && !socket.connected) {
              socket.connect();
            }
          } catch (e) { console.warn('[landing] socket connect:', e.message); }
        }, 1500);
      };
      s.onerror = function () { showAlert('خطأ في تحميل الدردشة', 'danger'); };
      document.head.appendChild(s);
    }
  }

  // --- Tab switching ---
  function switchTab(showId) {
    var forms = ['member-login-form', 'guest-login-form', 'register-form'];
    var tabs = ['show-member-login', 'show-guest-login', 'show-register'];
    forms.forEach(function (f) {
      var el = $(f);
      if (el) el.classList.toggle('hidden-form', f !== showId);
      if (el) el.classList.toggle('visible-form', f === showId);
    });
    tabs.forEach(function (t) {
      var el = $(t);
      if (el) el.classList.toggle('active', t === showId.replace('show-', 'show-').replace('login-form', 'login'));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Tab links
    var map = { 'show-member-login': 'member-login-form', 'show-guest-login': 'guest-login-form', 'show-register': 'register-form' };
    Object.keys(map).forEach(function (tabId) {
      var tab = $(tabId);
      if (tab) tab.addEventListener('click', function (e) { e.preventDefault(); switchTab(map[tabId]); });
    });

    // Member login
    var memberForm = $('member-login-form');
    var memberBtn = $('member-login-btn');
    if (memberBtn) {
      memberBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var u = ($('member-username') || {}).value || '';
        var p = ($('member-password') || {}).value || '';
        if (!u || !p) { showAlert('أدخل اسم المستخدم وكلمة المرور', 'warning'); return; }
        memberBtn.disabled = true;
        api('/api/auth/login', { username: u, password: p }, function (res, status) {
          memberBtn.disabled = false;
          if (res && res.success && res.token) {
            enterChat(res);
          } else {
            showAlert((res && res.message) || 'تعذر الدخول إلى الشات. يرجى المحاولة لاحقاً', 'danger');
          }
        });
      });
    }
    if (memberForm) {
      memberForm.addEventListener('submit', function (e) { e.preventDefault(); if (memberBtn) memberBtn.click(); });
    }

    // Guest login
    var guestBtn = $('guest-login-btn');
    if (guestBtn) {
      guestBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var nick = ($('guest-nickname') || {}).value || '';
        if (!nick || nick.trim().length < 3) { showAlert('اكتب اسماً مستعاراً (3 أحرف على الأقل)', 'warning'); return; }
        guestBtn.disabled = true;
        api('/api/auth/guest', { nickname: nick.trim() }, function (res, status) {
          guestBtn.disabled = false;
          if (res && res.success && res.token) {
            enterChat(res);
          } else {
            showAlert((res && res.message) || 'تعذر الدخول كزائر', 'danger');
          }
        });
      });
    }

    // Register
    var regBtn = $('register-btn');
    if (regBtn) {
      regBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var u = ($('register-username') || {}).value || '';
        var p = ($('register-password') || {}).value || '';
        if (!u || !p) { showAlert('أدخل اسم المستخدم وكلمة المرور', 'warning'); return; }
        regBtn.disabled = true;
        api('/api/auth/register', { username: u.trim(), password: p }, function (res, status) {
          regBtn.disabled = false;
          if (res && res.success) {
            showAlert('تم إنشاء الحساب بنجاح! سجل دخولك الآن', 'success');
            switchTab('member-login-form');
          } else {
            showAlert((res && res.message) || 'تعذر إنشاء الحساب', 'danger');
          }
        });
      });
    }

    // Password visibility toggle
    window.togglePasswordVisibility = function (btn) {
      var input = btn.closest('.input-group').querySelector('input[type="password"], input[type="text"]');
      if (input) {
        var isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        var icon = btn.querySelector('i');
        if (icon) icon.className = isPass ? 'fas fa-eye-slash' : 'fas fa-eye';
      }
    };
    window.toggleHiddenMode = function (btn) {
      var hidden = $('login-hidden-input');
      if (hidden) {
        var isHidden = hidden.value === 'true';
        hidden.value = isHidden ? 'false' : 'true';
        btn.classList.toggle('btn-success', !isHidden);
      }
    };

    // News ticker
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/settings/news-ticker', true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var d = JSON.parse(xhr.responseText);
          var bar = $('news-ticker-bar');
          var text = $('news-ticker-text');
          if (d && d.text && bar && text) {
            text.textContent = d.text;
            bar.classList.remove('d-none');
          }
        } catch (e) {}
      }
    };
    xhr.send();

    // Landing users count
    function updateCount() {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/public/online-users', true);
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            var d = JSON.parse(xhr.responseText);
            var count = Array.isArray(d) ? d.length : (d.count || d.users || 0);
            var el = $('landing-users-count');
            if (el) el.innerHTML = '<i class="fas fa-user-friends"></i> ' + count;
          } catch (e) {}
        }
      };
      xhr.send();
    }
    updateCount();
    setInterval(updateCount, 15000);
  });
})();
