(function () {
  let DEBUG = false;

  try {
    DEBUG = localStorage.getItem('CHAT_DEBUG') === '1';
  } catch (_) {}

  const methods = ['log', 'debug', 'info', 'warn', 'error', 'trace'];
  const empty = function () {};
  const original = {};

  methods.forEach(method => {
    original[method] =
      typeof console[method] === 'function'
        ? console[method].bind(console)
        : empty;
  });

  window.AppLogger = {};

  methods.forEach(method => {
    window.AppLogger[method] = DEBUG ? original[method] : empty;

    if (!DEBUG) {
      console[method] = empty;
    }
  });
})();