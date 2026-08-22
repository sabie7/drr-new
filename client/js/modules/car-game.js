     1	/* ══════════════════════════════════════════════════════════════
     2	   CAR GAME — Car Dodger
     3	   Clean ES-module rebuild of the legacy Car Dodger, rendered into
     4	   the existing #game-stage canvas. Uses the game framework events:
     5	   game:start / game:action / game:end (server: src/socket/games.js).
     6	   The creator plays locally; spectators receive game:action moves.
     7	   ══════════════════════════════════════════════════════════════ */
     8	
     9	var api = { emit: null };
    10	var canvas = null;
    11	var ctx = null;
    12	var raf = null;
    13	var running = false;
    14	var gameId = null;
    15	var spectating = false;
    16	
    17	var car = { x: 0.5, w: 0.1, speed: 0.045 };
    18	var obstacles = [];
    19	var score = 0;
    20	var speed = 0.006;
    21	var spawnTimer = 0;
    22	var keys = {};
    23	
    24	function stage() {
    25	  return document.getElementById('game-stage');
    26	}
    27	
    28	function buildCanvas() {
    29	  var el = stage();
    30	  if (!el) return null;
    31	  el.innerHTML = '';
    32	  canvas = document.createElement('canvas');
    33	  canvas.className = 'car-game-canvas';
    34	  canvas.width = Math.max(280, el.clientWidth || 360);
    35	  canvas.height = Math.max(420, el.clientHeight || 480);
    36	  el.appendChild(canvas);
    37	  ctx = canvas.getContext('2d');
    38	  return canvas;
    39	}
    40	
    41	function reset() {
    42	  car.x = 0.5;
    43	  car.w = 0.1;
    44	  obstacles = [];
    45	  score = 0;
    46	  speed = 0.006;
    47	  spawnTimer = 0;
    48	}
    49	
    50	function draw() {
    51	  if (!ctx) return;
    52	  var W = canvas.width, H = canvas.height;
    53	  ctx.clearRect(0, 0, W, H);
    54	
    55	  ctx.fillStyle = '#222831';
    56	  ctx.fillRect(0, 0, W, H);
    57	
    58	  var laneW = W / 3;
    59	  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    60	  ctx.lineWidth = 2;
    61	  ctx.setLineDash([14, 12]);
    62	  for (var i = 1; i < 3; i++) {
    63	    ctx.beginPath();
    64	    ctx.moveTo(i * laneW, 0);
    65	    ctx.lineTo(i * laneW, H);
    66	    ctx.stroke();
    67	  }
    68	  ctx.setLineDash([]);
    69	
    70	  ctx.fillStyle = 'rgba(255,255,255,0.08)';
    71	  for (var oi = 0; oi < obstacles.length; oi++) {
    72	    var ob = obstacles[oi];
    73	    var ox = ob.x * W - ob.w * W / 2;
    74	    var oy = ob.y * H - ob.h * H;
    75	    ctx.fillStyle = '#f05454';
    76	    ctx.fillRect(ox, oy, ob.w * W, ob.h * H);
    77	    ctx.fillStyle = '#ffd166';
    78	    ctx.fillRect(ox + ob.w * W / 2 - W * 0.012, oy + ob.h * H * 0.15, W * 0.024, ob.h * H * 0.2);
    79	  }
    80	
    81	  var cx = car.x * W - car.w * W / 2;
    82	  var cy = H - H * 0.14 - H * 0.09;
    83	  ctx.fillStyle = '#4ecdc4';
    84	  ctx.fillRect(cx, cy, car.w * W, H * 0.09);
    85	  ctx.fillStyle = '#1a936f';
    86	  ctx.fillRect(cx + car.w * W / 2 - W * 0.015, cy - H * 0.02, W * 0.03, H * 0.02);
    87	}
    88	
    89	function step() {
    90	  if (keys.left) car.x -= car.speed;
    91	  if (keys.right) car.x += car.speed;
    92	  car.x = Math.max(0.03, Math.min(0.97, car.x));
    93	
    94	  spawnTimer++;
    95	  if (spawnTimer > Math.max(30, 70 - score * 0.8)) {
    96	    spawnTimer = 0;
    97	    var lane = Math.floor(Math.random() * 3);
    98	    var laneCenter = (lane + 0.5) / 3;
    99	    obstacles.push({ x: laneCenter + (Math.random() - 0.5) * 0.03, y: -0.1, w: 0.11, h: 0.12 });
   100	  }
   101	
   102	  for (var i = obstacles.length - 1; i >= 0; i--) {
   103	    obstacles[i].y += speed + score * 0.00005;
   104	    if (obstacles[i].y > 1.05) {
   105	      obstacles.splice(i, 1);
   106	      score++;
   107	      speed = Math.min(0.022, speed + 0.0004);
   108	    }
   109	  }
   110	
   111	  var carTop = 1 - 0.14 - 0.09;
   112	  for (var j = 0; j < obstacles.length; j++) {
   113	    var ob = obstacles[j];
   114	    if (ob.y + ob.h > carTop && ob.y < carTop + 0.09 + 0.02) {
   115	      if (Math.abs(ob.x - car.x) < (ob.w + car.w) / 2) {
   116	        gameOver();
   117	        return;
   118	      }
   119	    }
   120	  }
   121	
   122	  if (api.emit && gameId) {
   123	    api.emit('game:action', { gameId: gameId, action: 'move', payload: { x: car.x, score: score } });
   124	  }
   125	}
   126	
   127	function loop() {
   128	  if (!running) return;
   129	  step();
   130	  draw();
   131	  raf = requestAnimationFrame(loop);
   132	}
   133	
   134	function gameOver() {
   135	  running = false;
   136	  if (raf) cancelAnimationFrame(raf);
   137	  if (api.emit && gameId) api.emit('game:end', { gameId: gameId });
   138	  gameId = null;
   139	  if (ctx) {
   140	    ctx.fillStyle = 'rgba(0,0,0,0.6)';
   141	    ctx.fillRect(0, 0, canvas.width, canvas.height);
   142	    ctx.fillStyle = '#fff';
   143	    ctx.font = 'bold 26px sans-serif';
   144	    ctx.textAlign = 'center';
   145	    ctx.fillText('💥 انتهت اللعبة', canvas.width / 2, canvas.height / 2 - 10);
   146	    ctx.font = '18px sans-serif';
   147	    ctx.fillText('نتيجتك: ' + score, canvas.width / 2, canvas.height / 2 + 26);
   148	  }
   149	  keys = {};
   150	}
   151	
   152	function onKey(e, down) {
   153	  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = down;
   154	  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = down;
   155	}
   156	
   157	export function initCarGame(deps) {
   158	  api = deps || api;
   159	}
   160	
   161	export function launchCarGame() {
   162	  if (running) return;
   163	  if (!buildCanvas()) return;
   164	  reset();
   165	  spectating = false;
   166	  running = true;
   167	  if (api.emit) api.emit('game:start', { type: 'car-dodger' });
   168	  window.addEventListener('keydown', onKeyDown);
   169	  window.addEventListener('keyup', onKeyUp);
   170	  loop();
   171	}
   172	
   173	function onKeyDown(e) { onKey(e, true); }
   174	function onKeyUp(e) { onKey(e, false); }
   175	
   176	export function onCarGameCreated(game) {
   177	  if (!game || game.type !== 'car-dodger') return;
   178	  if (gameId) return;
   179	  if (!canvas) {
   180	    if (!buildCanvas()) return;
   181	    spectating = true;
   182	    running = false;
   183	    reset();
   184	    drawSpectate();
   185	  }
   186	  gameId = game.id;
   187	}
   188	
   189	function drawSpectate() {
   190	  if (!ctx) return;
   191	  var W = canvas.width, H = canvas.height;
   192	  ctx.clearRect(0, 0, W, H);
   193	  ctx.fillStyle = '#222831';
   194	  ctx.fillRect(0, 0, W, H);
   195	  ctx.fillStyle = 'rgba(255,255,255,0.7)';
   196	  ctx.font = '16px sans-serif';
   197	  ctx.textAlign = 'center';
   198	  ctx.fillText('👁️ أنت تشاهد مباراة Car Dodger', W / 2, H / 2 - 8);
   199	  ctx.font = '13px sans-serif';
   200	  ctx.fillText('انتظر حركة اللاعب...', W / 2, H / 2 + 16);
   201	}
   202	
   203	export function onCarGameAction(data) {
   204	  if (!data || !data.payload) return;
   205	  if (spectating && ctx && canvas) {
   206	    if (typeof data.payload.x === 'number') {
   207	      ctx.clearRect(0, 0, canvas.width, canvas.height);
   208	      drawSpectate();
   209	      var cx = data.payload.x * canvas.width;
   210	      ctx.fillStyle = '#4ecdc4';
   211	      ctx.fillRect(cx - canvas.width * 0.05, canvas.height - canvas.height * 0.23, canvas.width * 0.1, canvas.height * 0.09);
   212	      ctx.fillStyle = 'rgba(255,255,255,0.85)';
   213	      ctx.font = '13px sans-serif';
   214	      ctx.textAlign = 'center';
   215	      ctx.fillText((data.from || 'لاعب') + ' يلعب', canvas.width / 2, canvas.height - 12);
   216	    }
   217	  }
   218	}
   219	
   220	export function closeCarGame() {
   221	  running = false;
   222	  spectating = false;
   223	  if (raf) cancelAnimationFrame(raf);
   224	  raf = null;
   225	  gameId = null;
   226	  keys = {};
   227	  window.removeEventListener('keydown', onKeyDown);
   228	  window.removeEventListener('keyup', onKeyUp);
   229	  var el = stage();
   230	  if (el) el.innerHTML = '';
   231	  canvas = null;
   232	  ctx = null;
   233	}
   234	