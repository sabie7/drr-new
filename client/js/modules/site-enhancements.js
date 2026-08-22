     1	/* ══════════════════════════════════════════════════════════════
     2	   SITE ENHANCEMENTS
     3	   Clean ES-module port of the owner's legacy patches (sor/) that
     4	   were written against the original scraped DOM. These are the
     5	   generic, DOM-independent parts: session keep-alive, clear-chat
     6	   confirmation, and system-message prettifying.
     7	   ══════════════════════════════════════════════════════════════ */
     8	
     9	export function prettifySystemMessage(raw) {
    10	  if (!raw) return raw;
    11	  var t = String(raw);
    12	  if (t.indexOf('هذا المستخدم قد دخل') !== -1) {
    13	    return t.replace(/هذا المستخدم قد دخل.*/g, '✨ هذا المستخدم نوّر المكـان');
    14	  }
    15	  if (t.indexOf('إنتقل إلى غرفة') !== -1 || t.indexOf('انتقل إلى غرفة') !== -1) {
    16	    return t.replace(/هذا المستخدم (إنتقل|انتقل) إلى غرفة\s*$/, 'هذا المستخدم إنتقل إلى غرفة أخرى');
    17	  }
    18	  return t;
    19	}
    20	
    21	/* ─── Session keep-alive: silent background pulses to /keepalive ─── */
    22	export function initKeepAlive() {
    23	  var keepAlive = true;
    24	  var reconnecting = false;
    25	  var base = window.location.origin + '/keepalive';
    26	
    27	  function pulse() {
    28	    if (!keepAlive || reconnecting) return;
    29	    try {
    30	      if (navigator.sendBeacon) {
    31	        navigator.sendBeacon(base + '?_=' + Date.now());
    32	      } else {
    33	        fetch(base + '?_=' + Date.now(), { cache: 'no-store', mode: 'no-cors' });
    34	      }
    35	    } catch (e) {
    36	      try { fetch(base + '?_=' + Date.now(), { cache: 'no-store', mode: 'no-cors' }); } catch (e2) {}
    37	    }
    38	  }
    39	
    40	  setInterval(pulse, 30000);
    41	
    42	  document.addEventListener('visibilitychange', function () {
    43	    if (document.hidden) {
    44	      keepAlive = true;
    45	      try { navigator.sendBeacon(base + '?hidden=' + Date.now()); } catch (e) {}
    46	    } else {
    47	      reconnecting = true;
    48	      var steps = 0;
    49	      var timer = setInterval(function () {
    50	        steps++;
    51	        pulse();
    52	        if (steps >= 5) { clearInterval(timer); reconnecting = false; }
    53	      }, 2500);
    54	    }
    55	  });
    56	
    57	  window.addEventListener('beforeunload', function () {
    58	    keepAlive = false;
    59	    try { navigator.sendBeacon(base + '?logout=' + Date.now()); } catch (e) {}
    60	  });
    61	}
    62	
    63	/* ─── Clear-chat confirmation guard ─── */
    64	export function initClearConfirm() {
    65	  document.addEventListener('click', function (event) {
    66	    var target = event.target && event.target.closest ? event.target.closest('[data-action="clear-chat"]') : null;
    67	    if (!target) return;
    68	    if (!window.confirm('هل أنت متأكد أنك تريد مسح المحادثة؟')) {
    69	      event.preventDefault();
    70	      event.stopImmediatePropagation();
    71	    }
    72	  }, true);
    73	}
    74	