     1	/* KILL-SWITCH SERVICE WORKER
     2	   This worker replaces the old 'drr-static-v3' worker. It does not
     3	   cache anything. On activation it wipes every cache and unregisters
     4	   itself so the site always loads fresh files from the server. */
     5	self.addEventListener('install', function () {
     6	  self.skipWaiting();
     7	});
     8	
     9	self.addEventListener('activate', function (e) {
    10	  e.waitUntil(
    11	    caches.keys().then(function (keys) {
    12	      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    13	    }).then(function () {
    14	      self.clients.claim();
    15	      self.registration.unregister();
    16	    })
    17	  );
    18	});
    19	