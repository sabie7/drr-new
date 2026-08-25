// main.js — entry point loaded after successful login
// Loads the chat bundle as an ES module
(function () {
  'use strict';
  var script = document.createElement('script');
  script.type = 'module';
  script.src = '/dist/chat-main.bmt7hcopd.js';
  script.setAttribute('data-main-script', 'true');
  script.onerror = function () {
    console.error('[main.js] Failed to load chat bundle');
    if (typeof window.showClassicAlert === 'function') {
      window.showClassicAlert('خطأ في تحميل الدردشة. أعد المحاولة.', 'danger');
    }
  };
  document.head.appendChild(script);
})();
