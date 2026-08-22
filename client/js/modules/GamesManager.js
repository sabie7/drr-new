     1	export const GamesManager = {
     2	  activeSpectateGames: [],
     3	  activeGame: null,
     4	
     5	  init() {
     6	    if (GamesManager._inited) return GamesManager;
     7	    GamesManager._inited = true;
     8	    const socket = window.socket;
     9	    if (!socket) return GamesManager;
    10	
    11	    socket.on('game:spectate:list:update', (games) => {
    12	      GamesManager.activeSpectateGames = Array.isArray(games) ? games : [];
    13	      GamesManager.renderSpectateGamesList();
    14	    });
    15	
    16	    socket.on('battle:sync', (data) => {
    17	      if (data && data.hasActiveBattle && data.battleId) {
    18	        if (!GamesManager.activeGame || GamesManager.activeGame.battleId !== data.battleId) {
    19	          GamesManager.activeGame = {
    20	            gameId: data.battleId,
    21	            battleId: data.battleId,
    22	            roomId: data.roomId,
    23	            status: data.status,
    24	            player1: data.player1 || { username: data.player1Name || 'لاعب 1' },
    25	            player2: data.player2 || { username: data.player2Name || 'لاعب 2' },
    26	            state: { isSpectator: true },
    27	          };
    28	        }
    29	      } else if (data && !data.hasActiveBattle) {
    30	        GamesManager.activeGame = null;
    31	      }
    32	    });
    33	
    34	    socket.on('battle:finished', (data) => {
    35	      if (data && data.battleId && GamesManager.activeGame && GamesManager.activeGame.battleId === data.battleId) {
    36	        GamesManager.activeGame = null;
    37	      }
    38	    });
    39	
    40	    socket.on('battle:cancelled', (data) => {
    41	      if (data && GamesManager.activeGame) GamesManager.activeGame = null;
    42	    });
    43	
    44	    return GamesManager;
    45	  },
    46	
    47	  loadGamesLobby() {
    48	    const container = document.getElementById('sidebar-games-container');
    49	    if (container) {
    50	      const gamesList = GamesManager.activeSpectateGames || [];
    51	      if (gamesList.length === 0) {
    52	        container.innerHTML =
    53	          '<div class="text-center text-muted p-4"><i class="fas fa-gamepad fa-2x mb-2 d-block"></i>لا توجد معارك جارية الآن.<br>ابدأ تحدي مع من تحب من القائمة الجانبية.</div>';
    54	      } else {
    55	        container.innerHTML = gamesList
    56	          .map((g) => {
    57	            const t1 = g.player1Name || (g.player1 && (g.player1.username || g.player1.topic)) || '';
    58	            const t2 = g.player2Name || (g.player2 && (g.player2.username || g.player2.topic)) || '';
    59	            return `<div class="border rounded p-2 mb-2 bg-white">
    60	              <div class="small fw-bold text-center mb-1">${g.type === 'live' ? '📡 بث مباشر' : '⚔️ ملحمة'}</div>
    61	              <div class="d-flex justify-content-between small bg-light rounded p-1">
    62	                <span class="text-truncate ms-1">${escapeHtml(t1)}</span>
    63	                <span class="text-muted">VS</span>
    64	                <span class="text-truncate me-1">${escapeHtml(t2)}</span>
    65	              </div>
    66	            </div>`;
    67	          })
    68	          .join('');
    69	      }
    70	    }
    71	    const socket = window.socket;
    72	    if (socket) socket.emit('game:spectate:list');
    73	  },
    74	
    75	  renderSpectateGamesList() {
    76	    const games = GamesManager.activeSpectateGames || [];
    77	    const badge = document.getElementById('active-games-count-badge');
    78	    if (badge) {
    79	      badge.innerText = String(games.length);
    80	      badge.classList.toggle('d-none', games.length === 0);
    81	    }
    82	    const btn = document.getElementById('active-games-floating-btn');
    83	    if (btn) btn.classList.toggle('d-none', games.length === 0);
    84	
    85	    const container = document.getElementById('sidebar-spectate-container') || document.getElementById('active-games-sidebar-container');
    86	    if (!container) return;
    87	    if (games.length === 0) {
    88	      container.innerHTML = '<div class="text-center text-muted p-4"><i class="fas fa-tv fa-2x mb-2 d-block"></i>لا توجد ألعاب جارية للمشاهدة.</div>';
    89	      return;
    90	    }
    91	    container.innerHTML = games
    92	      .map(
    93	        (g) => `<div class="border rounded p-2 mb-2 bg-white cursor-pointer" data-game-id="${escapeHtml(g.gameId || '')}">
    94	          <div class="small fw-bold text-center mb-1">${g.type === 'live' ? '📡 بث مباشر' : '⚔️ ملحمة مباشرة'}</div>
    95	          <div class="d-flex justify-content-between small bg-light rounded p-1">
    96	            <span class="text-truncate ms-1">${escapeHtml(g.player1Name || (g.player1 && (g.player1.username || g.player1.topic)) || '')}</span>
    97	            <span class="text-muted">VS</span>
    98	            <span class="text-truncate me-1">${escapeHtml(g.player2Name || (g.player2 && (g.player2.username || g.player2.topic)) || '')}</span>
    99	          </div>
   100	          <div class="small text-center text-muted mt-1">${g.type === 'live' ? 'مباشر الآن' : 'جولة ' + (g.status || '')}</div>
   101	        </div>`
   102	      )
   103	      .join('');
   104	
   105	    container.querySelectorAll('[data-game-id]').forEach((el) => {
   106	      el.addEventListener('click', () => {
   107	        const gid = el.getAttribute('data-game-id');
   108	        const game = games.find((g) => String(g.gameId) === String(gid));
   109	        if (!game) return;
   110	        if (game.type === 'live') {
   111	          if (typeof window.ensureLiveBroadcastLoaded === 'function') {
   112	            window.ensureLiveBroadcastLoaded().then(() => {
   113	              if (window.liveBroadcastManager && typeof window.liveBroadcastManager.watchBroadcast === 'function') {
   114	                window.liveBroadcastManager.watchBroadcast(game.userId);
   115	              }
   116	            });
   117	          }
   118	          return;
   119	        }
   120	        GamesManager.activeGame = {
   121	          gameId: game.gameId,
   122	          battleId: game.gameId,
   123	          roomId: game.roomId,
   124	          status: game.status,
   125	          player1: game.player1 || { username: game.player1Name || 'لاعب 1' },
   126	          player2: game.player2 || { username: game.player2Name || 'لاعب 2' },
   127	          state: { isSpectator: true },
   128	        };
   129	        if (window.socket) window.socket.emit('battle:syncState', { roomId: Number(game.roomId) });
   130	      });
   131	    });
   132	  },
   133	
   134	  closeActiveGame() {
   135	    GamesManager.activeGame = null;
   136	  },
   137	};
   138	
   139	function escapeHtml(value) {
   140	  return String(value == null ? '' : value)
   141	    .replace(/&/g, '&amp;')
   142	    .replace(/</g, '&lt;')
   143	    .replace(/>/g, '&gt;')
   144	    .replace(/"/g, '&quot;')
   145	    .replace(/'/g, '&#39;');
   146	}