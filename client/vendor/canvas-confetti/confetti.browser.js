     1	// canvas-confetti v1.9.4 built on 2025-10-25T05:14:56.640Z
     2	!(function (window, module) {
     3	// source content
     4	/* globals Map */
     5	
     6	(function main(global, module, isWorker, workerSize) {
     7	  var canUseWorker = !!(
     8	    global.Worker &&
     9	    global.Blob &&
    10	    global.Promise &&
    11	    global.OffscreenCanvas &&
    12	    global.OffscreenCanvasRenderingContext2D &&
    13	    global.HTMLCanvasElement &&
    14	    global.HTMLCanvasElement.prototype.transferControlToOffscreen &&
    15	    global.URL &&
    16	    global.URL.createObjectURL);
    17	
    18	  var canUsePaths = typeof Path2D === 'function' && typeof DOMMatrix === 'function';
    19	  var canDrawBitmap = (function () {
    20	    // this mostly supports ssr
    21	    if (!global.OffscreenCanvas) {
    22	      return false;
    23	    }
    24	
    25	    try {
    26	      var canvas = new OffscreenCanvas(1, 1);
    27	      var ctx = canvas.getContext('2d');
    28	      ctx.fillRect(0, 0, 1, 1);
    29	      var bitmap = canvas.transferToImageBitmap();
    30	      ctx.createPattern(bitmap, 'no-repeat');
    31	    } catch (e) {
    32	      return false;
    33	    }
    34	
    35	    return true;
    36	  })();
    37	
    38	  function noop() {}
    39	
    40	  // create a promise if it exists, otherwise, just
    41	  // call the function directly
    42	  function promise(func) {
    43	    var ModulePromise = module.exports.Promise;
    44	    var Prom = ModulePromise !== void 0 ? ModulePromise : global.Promise;
    45	
    46	    if (typeof Prom === 'function') {
    47	      return new Prom(func);
    48	    }
    49	
    50	    func(noop, noop);
    51	
    52	    return null;
    53	  }
    54	
    55	  var bitmapMapper = (function (skipTransform, map) {
    56	    // see https://github.com/catdad/canvas-confetti/issues/209
    57	    // creating canvases is actually pretty expensive, so we should create a
    58	    // 1:1 map for bitmap:canvas, so that we can animate the confetti in
    59	    // a performant manner, but also not store them forever so that we don't
    60	    // have a memory leak
    61	    return {
    62	      transform: function(bitmap) {
    63	        if (skipTransform) {
    64	          return bitmap;
    65	        }
    66	
    67	        if (map.has(bitmap)) {
    68	          return map.get(bitmap);
    69	        }
    70	
    71	        var canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    72	        var ctx = canvas.getContext('2d');
    73	        ctx.drawImage(bitmap, 0, 0);
    74	
    75	        map.set(bitmap, canvas);
    76	
    77	        return canvas;
    78	      },
    79	      clear: function () {
    80	        map.clear();
    81	      }
    82	    };
    83	  })(canDrawBitmap, new Map());
    84	
    85	  var raf = (function () {
    86	    var TIME = Math.floor(1000 / 60);
    87	    var frame, cancel;
    88	    var frames = {};
    89	    var lastFrameTime = 0;
    90	
    91	    if (typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function') {
    92	      frame = function (cb) {
    93	        var id = Math.random();
    94	
    95	        frames[id] = requestAnimationFrame(function onFrame(time) {
    96	          if (lastFrameTime === time || lastFrameTime + TIME - 1 < time) {
    97	            lastFrameTime = time;
    98	            delete frames[id];
    99	
   100	            cb();
   101	          } else {
   102	            frames[id] = requestAnimationFrame(onFrame);
   103	          }
   104	        });
   105	
   106	        return id;
   107	      };
   108	      cancel = function (id) {
   109	        if (frames[id]) {
   110	          cancelAnimationFrame(frames[id]);
   111	        }
   112	      };
   113	    } else {
   114	      frame = function (cb) {
   115	        return setTimeout(cb, TIME);
   116	      };
   117	      cancel = function (timer) {
   118	        return clearTimeout(timer);
   119	      };
   120	    }
   121	
   122	    return { frame: frame, cancel: cancel };
   123	  }());
   124	
   125	  var getWorker = (function () {
   126	    var worker;
   127	    var prom;
   128	    var resolves = {};
   129	
   130	    function decorate(worker) {
   131	      function execute(options, callback) {
   132	        worker.postMessage({ options: options || {}, callback: callback });
   133	      }
   134	      worker.init = function initWorker(canvas) {
   135	        var offscreen = canvas.transferControlToOffscreen();
   136	        worker.postMessage({ canvas: offscreen }, [offscreen]);
   137	      };
   138	
   139	      worker.fire = function fireWorker(options, size, done) {
   140	        if (prom) {
   141	          execute(options, null);
   142	          return prom;
   143	        }
   144	
   145	        var id = Math.random().toString(36).slice(2);
   146	
   147	        prom = promise(function (resolve) {
   148	          function workerDone(msg) {
   149	            if (msg.data.callback !== id) {
   150	              return;
   151	            }
   152	
   153	            delete resolves[id];
   154	            worker.removeEventListener('message', workerDone);
   155	
   156	            prom = null;
   157	
   158	            bitmapMapper.clear();
   159	
   160	            done();
   161	            resolve();
   162	          }
   163	
   164	          worker.addEventListener('message', workerDone);
   165	          execute(options, id);
   166	
   167	          resolves[id] = workerDone.bind(null, { data: { callback: id }});
   168	        });
   169	
   170	        return prom;
   171	      };
   172	
   173	      worker.reset = function resetWorker() {
   174	        worker.postMessage({ reset: true });
   175	
   176	        for (var id in resolves) {
   177	          resolves[id]();
   178	          delete resolves[id];
   179	        }
   180	      };
   181	    }
   182	
   183	    return function () {
   184	      if (worker) {
   185	        return worker;
   186	      }
   187	
   188	      if (!isWorker && canUseWorker) {
   189	        var code = [
   190	          'var CONFETTI, SIZE = {}, module = {};',
   191	          '(' + main.toString() + ')(this, module, true, SIZE);',
   192	          'onmessage = function(msg) {',
   193	          '  if (msg.data.options) {',
   194	          '    CONFETTI(msg.data.options).then(function () {',
   195	          '      if (msg.data.callback) {',
   196	          '        postMessage({ callback: msg.data.callback });',
   197	          '      }',
   198	          '    });',
   199	          '  } else if (msg.data.reset) {',
   200	          '    CONFETTI && CONFETTI.reset();',
   201	          '  } else if (msg.data.resize) {',
   202	          '    SIZE.width = msg.data.resize.width;',
   203	          '    SIZE.height = msg.data.resize.height;',
   204	          '  } else if (msg.data.canvas) {',
   205	          '    SIZE.width = msg.data.canvas.width;',
   206	          '    SIZE.height = msg.data.canvas.height;',
   207	          '    CONFETTI = module.exports.create(msg.data.canvas);',
   208	          '  }',
   209	          '}',
   210	        ].join('\n');
   211	        try {
   212	          worker = new Worker(URL.createObjectURL(new Blob([code])));
   213	        } catch (e) {
   214	          // eslint-disable-next-line no-console
   215	          typeof console !== 'undefined' && typeof console.warn === 'function' ? console.warn('🎊 Could not load worker', e) : null;
   216	
   217	          return null;
   218	        }
   219	
   220	        decorate(worker);
   221	      }
   222	
   223	      return worker;
   224	    };
   225	  })();
   226	
   227	  var defaults = {
   228	    particleCount: 50,
   229	    angle: 90,
   230	    spread: 45,
   231	    startVelocity: 45,
   232	    decay: 0.9,
   233	    gravity: 1,
   234	    drift: 0,
   235	    ticks: 200,
   236	    x: 0.5,
   237	    y: 0.5,
   238	    shapes: ['square', 'circle'],
   239	    zIndex: 100,
   240	    colors: [
   241	      '#26ccff',
   242	      '#a25afd',
   243	      '#ff5e7e',
   244	      '#88ff5a',
   245	      '#fcff42',
   246	      '#ffa62d',
   247	      '#ff36ff'
   248	    ],
   249	    // probably should be true, but back-compat
   250	    disableForReducedMotion: false,
   251	    scalar: 1
   252	  };
   253	
   254	  function convert(val, transform) {
   255	    return transform ? transform(val) : val;
   256	  }
   257	
   258	  function isOk(val) {
   259	    return !(val === null || val === undefined);
   260	  }
   261	
   262	  function prop(options, name, transform) {
   263	    return convert(
   264	      options && isOk(options[name]) ? options[name] : defaults[name],
   265	      transform
   266	    );
   267	  }
   268	
   269	  function onlyPositiveInt(number){
   270	    return number < 0 ? 0 : Math.floor(number);
   271	  }
   272	
   273	  function randomInt(min, max) {
   274	    // [min, max)
   275	    return Math.floor(Math.random() * (max - min)) + min;
   276	  }
   277	
   278	  function toDecimal(str) {
   279	    return parseInt(str, 16);
   280	  }
   281	
   282	  function colorsToRgb(colors) {
   283	    return colors.map(hexToRgb);
   284	  }
   285	
   286	  function hexToRgb(str) {
   287	    var val = String(str).replace(/[^0-9a-f]/gi, '');
   288	
   289	    if (val.length < 6) {
   290	        val = val[0]+val[0]+val[1]+val[1]+val[2]+val[2];
   291	    }
   292	
   293	    return {
   294	      r: toDecimal(val.substring(0,2)),
   295	      g: toDecimal(val.substring(2,4)),
   296	      b: toDecimal(val.substring(4,6))
   297	    };
   298	  }
   299	
   300	  function getOrigin(options) {
   301	    var origin = prop(options, 'origin', Object);
   302	    origin.x = prop(origin, 'x', Number);
   303	    origin.y = prop(origin, 'y', Number);
   304	
   305	    return origin;
   306	  }
   307	
   308	  function setCanvasWindowSize(canvas) {
   309	    canvas.width = document.documentElement.clientWidth;
   310	    canvas.height = document.documentElement.clientHeight;
   311	  }
   312	
   313	  function setCanvasRectSize(canvas) {
   314	    var rect = canvas.getBoundingClientRect();
   315	    canvas.width = rect.width;
   316	    canvas.height = rect.height;
   317	  }
   318	
   319	  function getCanvas(zIndex) {
   320	    var canvas = document.createElement('canvas');
   321	
   322	    canvas.style.position = 'fixed';
   323	    canvas.style.top = '0px';
   324	    canvas.style.left = '0px';
   325	    canvas.style.pointerEvents = 'none';
   326	    canvas.style.zIndex = zIndex;
   327	
   328	    return canvas;
   329	  }
   330	
   331	  function ellipse(context, x, y, radiusX, radiusY, rotation, startAngle, endAngle, antiClockwise) {
   332	    context.save();
   333	    context.translate(x, y);
   334	    context.rotate(rotation);
   335	    context.scale(radiusX, radiusY);
   336	    context.arc(0, 0, 1, startAngle, endAngle, antiClockwise);
   337	    context.restore();
   338	  }
   339	
   340	  function randomPhysics(opts) {
   341	    var radAngle = opts.angle * (Math.PI / 180);
   342	    var radSpread = opts.spread * (Math.PI / 180);
   343	
   344	    return {
   345	      x: opts.x,
   346	      y: opts.y,
   347	      wobble: Math.random() * 10,
   348	      wobbleSpeed: Math.min(0.11, Math.random() * 0.1 + 0.05),
   349	      velocity: (opts.startVelocity * 0.5) + (Math.random() * opts.startVelocity),
   350	      angle2D: -radAngle + ((0.5 * radSpread) - (Math.random() * radSpread)),
   351	      tiltAngle: (Math.random() * (0.75 - 0.25) + 0.25) * Math.PI,
   352	      color: opts.color,
   353	      shape: opts.shape,
   354	      tick: 0,
   355	      totalTicks: opts.ticks,
   356	      decay: opts.decay,
   357	      drift: opts.drift,
   358	      random: Math.random() + 2,
   359	      tiltSin: 0,
   360	      tiltCos: 0,
   361	      wobbleX: 0,
   362	      wobbleY: 0,
   363	      gravity: opts.gravity * 3,
   364	      ovalScalar: 0.6,
   365	      scalar: opts.scalar,
   366	      flat: opts.flat
   367	    };
   368	  }
   369	
   370	  function updateFetti(context, fetti) {
   371	    fetti.x += Math.cos(fetti.angle2D) * fetti.velocity + fetti.drift;
   372	    fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + fetti.gravity;
   373	    fetti.velocity *= fetti.decay;
   374	
   375	    if (fetti.flat) {
   376	      fetti.wobble = 0;
   377	      fetti.wobbleX = fetti.x + (10 * fetti.scalar);
   378	      fetti.wobbleY = fetti.y + (10 * fetti.scalar);
   379	
   380	      fetti.tiltSin = 0;
   381	      fetti.tiltCos = 0;
   382	      fetti.random = 1;
   383	    } else {
   384	      fetti.wobble += fetti.wobbleSpeed;
   385	      fetti.wobbleX = fetti.x + ((10 * fetti.scalar) * Math.cos(fetti.wobble));
   386	      fetti.wobbleY = fetti.y + ((10 * fetti.scalar) * Math.sin(fetti.wobble));
   387	
   388	      fetti.tiltAngle += 0.1;
   389	      fetti.tiltSin = Math.sin(fetti.tiltAngle);
   390	      fetti.tiltCos = Math.cos(fetti.tiltAngle);
   391	      fetti.random = Math.random() + 2;
   392	    }
   393	
   394	    var progress = (fetti.tick++) / fetti.totalTicks;
   395	
   396	    var x1 = fetti.x + (fetti.random * fetti.tiltCos);
   397	    var y1 = fetti.y + (fetti.random * fetti.tiltSin);
   398	    var x2 = fetti.wobbleX + (fetti.random * fetti.tiltCos);
   399	    var y2 = fetti.wobbleY + (fetti.random * fetti.tiltSin);
   400	
   401	    context.fillStyle = 'rgba(' + fetti.color.r + ', ' + fetti.color.g + ', ' + fetti.color.b + ', ' + (1 - progress) + ')';
   402	
   403	    context.beginPath();
   404	
   405	    if (canUsePaths && fetti.shape.type === 'path' && typeof fetti.shape.path === 'string' && Array.isArray(fetti.shape.matrix)) {
   406	      context.fill(transformPath2D(
   407	        fetti.shape.path,
   408	        fetti.shape.matrix,
   409	        fetti.x,
   410	        fetti.y,
   411	        Math.abs(x2 - x1) * 0.1,
   412	        Math.abs(y2 - y1) * 0.1,
   413	        Math.PI / 10 * fetti.wobble
   414	      ));
   415	    } else if (fetti.shape.type === 'bitmap') {
   416	      var rotation = Math.PI / 10 * fetti.wobble;
   417	      var scaleX = Math.abs(x2 - x1) * 0.1;
   418	      var scaleY = Math.abs(y2 - y1) * 0.1;
   419	      var width = fetti.shape.bitmap.width * fetti.scalar;
   420	      var height = fetti.shape.bitmap.height * fetti.scalar;
   421	
   422	      var matrix = new DOMMatrix([
   423	        Math.cos(rotation) * scaleX,
   424	        Math.sin(rotation) * scaleX,
   425	        -Math.sin(rotation) * scaleY,
   426	        Math.cos(rotation) * scaleY,
   427	        fetti.x,
   428	        fetti.y
   429	      ]);
   430	
   431	      // apply the transform matrix from the confetti shape
   432	      matrix.multiplySelf(new DOMMatrix(fetti.shape.matrix));
   433	
   434	      var pattern = context.createPattern(bitmapMapper.transform(fetti.shape.bitmap), 'no-repeat');
   435	      pattern.setTransform(matrix);
   436	
   437	      context.globalAlpha = (1 - progress);
   438	      context.fillStyle = pattern;
   439	      context.fillRect(
   440	        fetti.x - (width / 2),
   441	        fetti.y - (height / 2),
   442	        width,
   443	        height
   444	      );
   445	      context.globalAlpha = 1;
   446	    } else if (fetti.shape === 'circle') {
   447	      context.ellipse ?
   448	        context.ellipse(fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI) :
   449	        ellipse(context, fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI);
   450	    } else if (fetti.shape === 'star') {
   451	      var rot = Math.PI / 2 * 3;
   452	      var innerRadius = 4 * fetti.scalar;
   453	      var outerRadius = 8 * fetti.scalar;
   454	      var x = fetti.x;
   455	      var y = fetti.y;
   456	      var spikes = 5;
   457	      var step = Math.PI / spikes;
   458	
   459	      while (spikes--) {
   460	        x = fetti.x + Math.cos(rot) * outerRadius;
   461	        y = fetti.y + Math.sin(rot) * outerRadius;
   462	        context.lineTo(x, y);
   463	        rot += step;
   464	
   465	        x = fetti.x + Math.cos(rot) * innerRadius;
   466	        y = fetti.y + Math.sin(rot) * innerRadius;
   467	        context.lineTo(x, y);
   468	        rot += step;
   469	      }
   470	    } else {
   471	      context.moveTo(Math.floor(fetti.x), Math.floor(fetti.y));
   472	      context.lineTo(Math.floor(fetti.wobbleX), Math.floor(y1));
   473	      context.lineTo(Math.floor(x2), Math.floor(y2));
   474	      context.lineTo(Math.floor(x1), Math.floor(fetti.wobbleY));
   475	    }
   476	
   477	    context.closePath();
   478	    context.fill();
   479	
   480	    return fetti.tick < fetti.totalTicks;
   481	  }
   482	
   483	  function animate(canvas, fettis, resizer, size, done) {
   484	    var animatingFettis = fettis.slice();
   485	    var context = canvas.getContext('2d');
   486	    var animationFrame;
   487	    var destroy;
   488	
   489	    var prom = promise(function (resolve) {
   490	      function onDone() {
   491	        animationFrame = destroy = null;
   492	
   493	        context.clearRect(0, 0, size.width, size.height);
   494	        bitmapMapper.clear();
   495	
   496	        done();
   497	        resolve();
   498	      }
   499	
   500	      function update() {
   501	        if (isWorker && !(size.width === workerSize.width && size.height === workerSize.height)) {
   502	          size.width = canvas.width = workerSize.width;
   503	          size.height = canvas.height = workerSize.height;
   504	        }
   505	
   506	        if (!size.width && !size.height) {
   507	          resizer(canvas);
   508	          size.width = canvas.width;
   509	          size.height = canvas.height;
   510	        }
   511	
   512	        context.clearRect(0, 0, size.width, size.height);
   513	
   514	        animatingFettis = animatingFettis.filter(function (fetti) {
   515	          return updateFetti(context, fetti);
   516	        });
   517	
   518	        if (animatingFettis.length) {
   519	          animationFrame = raf.frame(update);
   520	        } else {
   521	          onDone();
   522	        }
   523	      }
   524	
   525	      animationFrame = raf.frame(update);
   526	      destroy = onDone;
   527	    });
   528	
   529	    return {
   530	      addFettis: function (fettis) {
   531	        animatingFettis = animatingFettis.concat(fettis);
   532	
   533	        return prom;
   534	      },
   535	      canvas: canvas,
   536	      promise: prom,
   537	      reset: function () {
   538	        if (animationFrame) {
   539	          raf.cancel(animationFrame);
   540	        }
   541	
   542	        if (destroy) {
   543	          destroy();
   544	        }
   545	      }
   546	    };
   547	  }
   548	
   549	  function confettiCannon(canvas, globalOpts) {
   550	    var isLibCanvas = !canvas;
   551	    var allowResize = !!prop(globalOpts || {}, 'resize');
   552	    var hasResizeEventRegistered = false;
   553	    var globalDisableForReducedMotion = prop(globalOpts, 'disableForReducedMotion', Boolean);
   554	    var shouldUseWorker = canUseWorker && !!prop(globalOpts || {}, 'useWorker');
   555	    var worker = shouldUseWorker ? getWorker() : null;
   556	    var resizer = isLibCanvas ? setCanvasWindowSize : setCanvasRectSize;
   557	    var initialized = (canvas && worker) ? !!canvas.__confetti_initialized : false;
   558	    var preferLessMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion)').matches;
   559	    var animationObj;
   560	
   561	    function fireLocal(options, size, done) {
   562	      var particleCount = prop(options, 'particleCount', onlyPositiveInt);
   563	      var angle = prop(options, 'angle', Number);
   564	      var spread = prop(options, 'spread', Number);
   565	      var startVelocity = prop(options, 'startVelocity', Number);
   566	      var decay = prop(options, 'decay', Number);
   567	      var gravity = prop(options, 'gravity', Number);
   568	      var drift = prop(options, 'drift', Number);
   569	      var colors = prop(options, 'colors', colorsToRgb);
   570	      var ticks = prop(options, 'ticks', Number);
   571	      var shapes = prop(options, 'shapes');
   572	      var scalar = prop(options, 'scalar');
   573	      var flat = !!prop(options, 'flat');
   574	      var origin = getOrigin(options);
   575	
   576	      var temp = particleCount;
   577	      var fettis = [];
   578	
   579	      var startX = canvas.width * origin.x;
   580	      var startY = canvas.height * origin.y;
   581	
   582	      while (temp--) {
   583	        fettis.push(
   584	          randomPhysics({
   585	            x: startX,
   586	            y: startY,
   587	            angle: angle,
   588	            spread: spread,
   589	            startVelocity: startVelocity,
   590	            color: colors[temp % colors.length],
   591	            shape: shapes[randomInt(0, shapes.length)],
   592	            ticks: ticks,
   593	            decay: decay,
   594	            gravity: gravity,
   595	            drift: drift,
   596	            scalar: scalar,
   597	            flat: flat
   598	          })
   599	        );
   600	      }
   601	
   602	      // if we have a previous canvas already animating,
   603	      // add to it
   604	      if (animationObj) {
   605	        return animationObj.addFettis(fettis);
   606	      }
   607	
   608	      animationObj = animate(canvas, fettis, resizer, size , done);
   609	
   610	      return animationObj.promise;
   611	    }
   612	
   613	    function fire(options) {
   614	      var disableForReducedMotion = globalDisableForReducedMotion || prop(options, 'disableForReducedMotion', Boolean);
   615	      var zIndex = prop(options, 'zIndex', Number);
   616	
   617	      if (disableForReducedMotion && preferLessMotion) {
   618	        return promise(function (resolve) {
   619	          resolve();
   620	        });
   621	      }
   622	
   623	      if (isLibCanvas && animationObj) {
   624	        // use existing canvas from in-progress animation
   625	        canvas = animationObj.canvas;
   626	      } else if (isLibCanvas && !canvas) {
   627	        // create and initialize a new canvas
   628	        canvas = getCanvas(zIndex);
   629	        document.body.appendChild(canvas);
   630	      }
   631	
   632	      if (allowResize && !initialized) {
   633	        // initialize the size of a user-supplied canvas
   634	        resizer(canvas);
   635	      }
   636	
   637	      var size = {
   638	        width: canvas.width,
   639	        height: canvas.height
   640	      };
   641	
   642	      if (worker && !initialized) {
   643	        worker.init(canvas);
   644	      }
   645	
   646	      initialized = true;
   647	
   648	      if (worker) {
   649	        canvas.__confetti_initialized = true;
   650	      }
   651	
   652	      function onResize() {
   653	        if (worker) {
   654	          // TODO this really shouldn't be immediate, because it is expensive
   655	          var obj = {
   656	            getBoundingClientRect: function () {
   657	              if (!isLibCanvas) {
   658	                return canvas.getBoundingClientRect();
   659	              }
   660	            }
   661	          };
   662	
   663	          resizer(obj);
   664	
   665	          worker.postMessage({
   666	            resize: {
   667	              width: obj.width,
   668	              height: obj.height
   669	            }
   670	          });
   671	          return;
   672	        }
   673	
   674	        // don't actually query the size here, since this
   675	        // can execute frequently and rapidly
   676	        size.width = size.height = null;
   677	      }
   678	
   679	      function done() {
   680	        animationObj = null;
   681	
   682	        if (allowResize) {
   683	          hasResizeEventRegistered = false;
   684	          global.removeEventListener('resize', onResize);
   685	        }
   686	
   687	        if (isLibCanvas && canvas) {
   688	          if (document.body.contains(canvas)) {
   689	            document.body.removeChild(canvas);
   690	          }
   691	          canvas = null;
   692	          initialized = false;
   693	        }
   694	      }
   695	
   696	      if (allowResize && !hasResizeEventRegistered) {
   697	        hasResizeEventRegistered = true;
   698	        global.addEventListener('resize', onResize, false);
   699	      }
   700	
   701	      if (worker) {
   702	        return worker.fire(options, size, done);
   703	      }
   704	
   705	      return fireLocal(options, size, done);
   706	    }
   707	
   708	    fire.reset = function () {
   709	      if (worker) {
   710	        worker.reset();
   711	      }
   712	
   713	      if (animationObj) {
   714	        animationObj.reset();
   715	      }
   716	    };
   717	
   718	    return fire;
   719	  }
   720	
   721	  // Make default export lazy to defer worker creation until called.
   722	  var defaultFire;
   723	  function getDefaultFire() {
   724	    if (!defaultFire) {
   725	      defaultFire = confettiCannon(null, { useWorker: true, resize: true });
   726	    }
   727	    return defaultFire;
   728	  }
   729	
   730	  function transformPath2D(pathString, pathMatrix, x, y, scaleX, scaleY, rotation) {
   731	    var path2d = new Path2D(pathString);
   732	
   733	    var t1 = new Path2D();
   734	    t1.addPath(path2d, new DOMMatrix(pathMatrix));
   735	
   736	    var t2 = new Path2D();
   737	    // see https://developer.mozilla.org/en-US/docs/Web/API/DOMMatrix/DOMMatrix
   738	    t2.addPath(t1, new DOMMatrix([
   739	      Math.cos(rotation) * scaleX,
   740	      Math.sin(rotation) * scaleX,
   741	      -Math.sin(rotation) * scaleY,
   742	      Math.cos(rotation) * scaleY,
   743	      x,
   744	      y
   745	    ]));
   746	
   747	    return t2;
   748	  }
   749	
   750	  function shapeFromPath(pathData) {
   751	    if (!canUsePaths) {
   752	      throw new Error('path confetti are not supported in this browser');
   753	    }
   754	
   755	    var path, matrix;
   756	
   757	    if (typeof pathData === 'string') {
   758	      path = pathData;
   759	    } else {
   760	      path = pathData.path;
   761	      matrix = pathData.matrix;
   762	    }
   763	
   764	    var path2d = new Path2D(path);
   765	    var tempCanvas = document.createElement('canvas');
   766	    var tempCtx = tempCanvas.getContext('2d');
   767	
   768	    if (!matrix) {
   769	      // attempt to figure out the width of the path, up to 1000x1000
   770	      var maxSize = 1000;
   771	      var minX = maxSize;
   772	      var minY = maxSize;
   773	      var maxX = 0;
   774	      var maxY = 0;
   775	      var width, height;
   776	
   777	      // do some line skipping... this is faster than checking
   778	      // every pixel and will be mostly still correct
   779	      for (var x = 0; x < maxSize; x += 2) {
   780	        for (var y = 0; y < maxSize; y += 2) {
   781	          if (tempCtx.isPointInPath(path2d, x, y, 'nonzero')) {
   782	            minX = Math.min(minX, x);
   783	            minY = Math.min(minY, y);
   784	            maxX = Math.max(maxX, x);
   785	            maxY = Math.max(maxY, y);
   786	          }
   787	        }
   788	      }
   789	
   790	      width = maxX - minX;
   791	      height = maxY - minY;
   792	
   793	      var maxDesiredSize = 10;
   794	      var scale = Math.min(maxDesiredSize/width, maxDesiredSize/height);
   795	
   796	      matrix = [
   797	        scale, 0, 0, scale,
   798	        -Math.round((width/2) + minX) * scale,
   799	        -Math.round((height/2) + minY) * scale
   800	      ];
   801	    }
   802	
   803	    return {
   804	      type: 'path',
   805	      path: path,
   806	      matrix: matrix
   807	    };
   808	  }
   809	
   810	  function shapeFromText(textData) {
   811	    var text,
   812	        scalar = 1,
   813	        color = '#000000',
   814	        // see https://nolanlawson.com/2022/04/08/the-struggle-of-using-native-emoji-on-the-web/
   815	        fontFamily = '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "EmojiOne Color", "Android Emoji", "Twemoji Mozilla", "system emoji", sans-serif';
   816	
   817	    if (typeof textData === 'string') {
   818	      text = textData;
   819	    } else {
   820	      text = textData.text;
   821	      scalar = 'scalar' in textData ? textData.scalar : scalar;
   822	      fontFamily = 'fontFamily' in textData ? textData.fontFamily : fontFamily;
   823	      color = 'color' in textData ? textData.color : color;
   824	    }
   825	
   826	    // all other confetti are 10 pixels,
   827	    // so this pixel size is the de-facto 100% scale confetti
   828	    var fontSize = 10 * scalar;
   829	    var font = '' + fontSize + 'px ' + fontFamily;
   830	
   831	    var canvas = new OffscreenCanvas(fontSize, fontSize);
   832	    var ctx = canvas.getContext('2d');
   833	
   834	    ctx.font = font;
   835	    var size = ctx.measureText(text);
   836	    var width = Math.ceil(size.actualBoundingBoxRight + size.actualBoundingBoxLeft);
   837	    var height = Math.ceil(size.actualBoundingBoxAscent + size.actualBoundingBoxDescent);
   838	
   839	    var padding = 2;
   840	    var x = size.actualBoundingBoxLeft + padding;
   841	    var y = size.actualBoundingBoxAscent + padding;
   842	    width += padding + padding;
   843	    height += padding + padding;
   844	
   845	    canvas = new OffscreenCanvas(width, height);
   846	    ctx = canvas.getContext('2d');
   847	    ctx.font = font;
   848	    ctx.fillStyle = color;
   849	
   850	    ctx.fillText(text, x, y);
   851	
   852	    var scale = 1 / scalar;
   853	
   854	    return {
   855	      type: 'bitmap',
   856	      // TODO these probably need to be transfered for workers
   857	      bitmap: canvas.transferToImageBitmap(),
   858	      matrix: [scale, 0, 0, scale, -width * scale / 2, -height * scale / 2]
   859	    };
   860	  }
   861	
   862	  module.exports = function() {
   863	    return getDefaultFire().apply(this, arguments);
   864	  };
   865	  module.exports.reset = function() {
   866	    getDefaultFire().reset();
   867	  };
   868	  module.exports.create = confettiCannon;
   869	  module.exports.shapeFromPath = shapeFromPath;
   870	  module.exports.shapeFromText = shapeFromText;
   871	}((function () {
   872	  if (typeof window !== 'undefined') {
   873	    return window;
   874	  }
   875	
   876	  if (typeof self !== 'undefined') {
   877	    return self;
   878	  }
   879	
   880	  return this || {};
   881	})(), module, false));
   882	
   883	// end source content
   884	
   885	  window.confetti = module.exports;
   886	}(window, {}));
   887	