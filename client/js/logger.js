     1	(function () {
     2	  let DEBUG = false;
     3	
     4	  try {
     5	    DEBUG = localStorage.getItem('CHAT_DEBUG') === '1';
     6	  } catch (e) {
     7	    DEBUG = false;
     8	  }
     9	
    10	  const empty = function () {};
    11	
    12	  window.AppLogger = {
    13	    log: DEBUG ? console.log.bind(console) : empty,
    14	    debug: DEBUG ? console.debug.bind(console) : empty,
    15	    info: DEBUG ? console.info.bind(console) : empty,
    16	    warn: DEBUG ? console.warn.bind(console) : empty,
    17	    error: DEBUG ? console.error.bind(console) : empty,
    18	  };
    19	})();
    20	