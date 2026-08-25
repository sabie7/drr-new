// CP Theme Controller — injects CSS vars from server settings
// Loaded on every page; reads /api/settings/theme and applies live
(function () {
  'use strict';

  var DEFAULTS = {
    mainUiColor: '#4f46e5',
    landingBgColor: '#f1f5f9',
    chatInputBg: '#ffffff',
    unifiedBtnBg: '#4f46e5',
    unifiedBtnHoverBg: '#4338ca',
    micIconColor: '#4f46e5',
    micBtnBgColor: '#e2e8f0',
    lineIconColor: '#f59e0b',
    fontFamily: "'Tajawal', sans-serif",
    fontSize: '15',
    fontWeight: '700',
    siteName: 'دردشة كاز | Kaz Alwadi Chat'
  };

  function applyTheme(cfg) {
    var s = Object.assign({}, DEFAULTS, cfg || {});
    var root = document.documentElement;
    root.style.setProperty('--main-ui-color', s.mainUiColor);
    root.style.setProperty('--landing-bg-color', s.landingBgColor);
    root.style.setProperty('--chat-input-bg', s.chatInputBg);
    root.style.setProperty('--unified-btn-bg', s.unifiedBtnBg);
    root.style.setProperty('--unified-btn-hover-bg', s.unifiedBtnHoverBg);
    root.style.setProperty('--mic-icon-color', s.micIconColor);
    root.style.setProperty('--mic-btn-bg-color', s.micBtnBgColor);
    root.style.setProperty('--line-icon-color', s.lineIconColor);
    root.style.setProperty('--font-family', s.fontFamily);
    root.style.setProperty('--font-size', (parseInt(s.fontSize, 10) || 15) + 'px');
    root.style.setProperty('--font-weight', s.fontWeight || '700');
    var el = document.getElementById('header-site-name');
    if (el && s.siteName) el.textContent = s.siteName;
  }

  function loadTheme() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/settings/theme', true);
      xhr.onload = function () {
        if (xhr.status === 200) {
          try { applyTheme(JSON.parse(xhr.responseText)); } catch (e) { applyTheme(null); }
        }
      };
      xhr.send();
    } catch (e) {}
  }

  // Socket.IO live updates
  if (typeof io !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      try {
        var sock = io({ transports: ['websocket', 'polling'] });
        sock.on('theme-updated', function (cfg) { applyTheme(cfg); });
      } catch (e) {}
    });
  }

  window.KazTheme = { apply: applyTheme, load: loadTheme };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTheme);
  } else {
    loadTheme();
  }
})();
