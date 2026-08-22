     1	/* ══════════════════════════════════════════════════════════════
     2	   SITE-MEDIA-PROTECT — global screenshot/media-save protection.
     3	   Applies to everything EXCEPT the wall file-sharing posts:
     4	     1) Blur all media whenever the window/tab loses focus
     5	        (stops phone/screenshot apps capturing readable content).
     6	     2) Block context-menu save / "open image in new tab".
     7	     3) Block drag-to-save and HTML5 drag.
     8	     4) Disable iOS/Android long-press & drag chrome (CSS).
     9	   The wall posts area — where members share files with each other —
    10	   stays fully open (right-click save, drag, long-press, no blur).
    11	   Purely additive + lightweight. No per-image markup changes.
    12	   ══════════════════════════════════════════════════════════════ */
    13	
    14	(function () {
    15	  var STYLE_ID = 'site-media-protect-style';
    16	
    17	  // Wall posts area (file sharing between members) is NOT protected.
    18	  var EXEMPT_SELECTOR =
    19	    '#wall-posts-container, #wall-posts-inner-container, ' +
    20	    '.wall-post-media, .wall-post-media-clear, .wall-container, ' +
    21	    '#wall-media-preview-container';
    22	
    23	  function isExempt(t) {
    24	    if (t && t.closest) return !!t.closest(EXEMPT_SELECTOR);
    25	    return false;
    26	  }
    27	
    28	function injectStyle() {
    29	    if (document.getElementById(STYLE_ID)) return;
    30	
    31	    var exemptParts = EXEMPT_SELECTOR.split(',');
    32	    function exemptDesc(desc) {
    33	      return exemptParts.map(function (p) { return p.trim() + ' ' + desc; }).join(', ');
    34	    }
    35	
    36	    var st = document.createElement('style');
    37	    st.id = STYLE_ID;
    38	    st.textContent =
    39	      /* Default: block save / long-press / drag chrome on all media */
    40	      'img, video { -webkit-touch-callout: none !important; -webkit-user-drag: none !important; user-drag: none !important; touch-callout: none !important; }' +
    41	      /* …but re-enable it inside the exempt wall (file sharing stays free) */
    42	      exemptDesc('img, video') + '{ -webkit-touch-callout: auto !important; -webkit-user-drag: auto !important; user-drag: auto !important; touch-callout: auto !important; }' +
    43	      /* Blur everything on focus loss, except the exempt wall */
    44	      'html.site-media-protected img, html.site-media-protected video {' +
    45	      '  filter: blur(16px) opacity(0.32) !important;' +
    46	      '  transition: filter .12s ease, opacity .12s ease;' +
    47	      '}' +
    48	      'html.site-media-protected ' + exemptDesc('img') + ',' +
    49	      'html.site-media-protected ' + exemptDesc('video') +
    50	      '{ filter: none !important; }' +
    51	      'html.site-media-protected .message-avatar,' +
    52	      'html.site-media-protected .user-avatar,' +
    53	      'html.site-media-protected .wall-post-avatar,' +
    54	      'html.site-media-protected .story-avatar,' +
    55	      'html.site-media-protected .mention-avatar,' +
    56	      'html.site-media-protected .sidebar-notification-avatar,' +
    57	      'html.site-media-protected .quoted-avatar,' +
    58	      'html.site-media-protected .private-alert-avatar,' +
    59	      'html.site-media-protected .filter-toast-avatar,' +
    60	      'html.site-media-protected .preview-avatar,' +
    61	      'html.site-media-protected .preview-frame,' +
    62	      'html.site-media-protected .classic-avatar-small,' +
    63	      'html.site-media-protected .room-card-img,' +
    64	      'html.site-media-protected .room-card-thumbnail,' +
    65	      'html.site-media-protected .yt-result-thumb,' +
    66	      'html.site-media-protected .placeholder-thumb,' +
    67	      'html.site-media-protected .report-alert-image,' +
    68	      'html.site-media-protected .chat-cleared-avatar,' +
    69	      'html.site-media-protected .chat-cleared-banner,' +
    70	      'html.site-media-protected .emoji,' +
    71	      'html.site-media-protected img[src*="/flags/"],' +
    72	      'html.site-media-protected img[src*="emoii"],' +
    73	      'html.site-media-protected img[src*="/emojis/"]' +
    74	      '{ filter: none !important; }';
    75	    document.head.appendChild(st);
    76	  }
    77	
    78	  function isMedia(t) {
    79	    return !!t && t.nodeType === 1 && (t.tagName === 'IMG' || t.tagName === 'VIDEO');
    80	  }
    81	
    82	  // Right-click / long-press "Save image" & "open in new tab"
    83	  document.addEventListener('contextmenu', function (e) {
    84	    if (isMedia(e.target) && !isExempt(e.target)) e.preventDefault();
    85	  }, true);
    86	
    87	  // Drag out / drag-to-save
    88	  document.addEventListener('dragstart', function (e) {
    89	    if (isMedia(e.target) && !isExempt(e.target)) e.preventDefault();
    90	  }, true);
    91	
    92	  function lock() {
    93	    document.documentElement.classList.add('site-media-protected');
    94	    var vids = document.querySelectorAll('video');
    95	    for (var i = 0; i < vids.length; i++) {
    96	      var v = vids[i];
    97	      if (isExempt(v)) continue;
    98	      if (!v.paused && !v.ended) {
    99	        v.setAttribute('data-site-media-resume', '1');
   100	        try { v.pause(); } catch (e) {}
   101	      }
   102	    }
   103	  }
   104	
   105	  function unlock() {
   106	    document.documentElement.classList.remove('site-media-protected');
   107	    var vids = document.querySelectorAll('video');
   108	    for (var i = 0; i < vids.length; i++) {
   109	      var v = vids[i];
   110	      if (v.getAttribute && v.getAttribute('data-site-media-resume') === '1') {
   111	        v.removeAttribute('data-site-media-resume');
   112	        try { v.play().catch(function () {}); } catch (e) {}
   113	      }
   114	    }
   115	  }
   116	
   117	  window.addEventListener('blur', lock);
   118	  window.addEventListener('focus', unlock);
   119	  document.addEventListener('visibilitychange', function () {
   120	    if (document.hidden) lock(); else unlock();
   121	  });
   122	
   123	  injectStyle();
   124	})();