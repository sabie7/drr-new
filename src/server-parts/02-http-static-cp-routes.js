/* ═══════════════════════════════════════════════════
   SERVER-PART 02/16 · http-static-cp-routes
   lines 192–338 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
0
/* Kaz alwadi (c) 2026 — http-static-cp-routes */
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  if (config.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Performance: gzip all compressible responses (classic client bundle
// ~630KB raw ships at ~150KB over the wire). Zero behavioral change.
let compression = null;
try { compression = require('compression'); } catch (e) {}
if (compression) app.use(compression({ threshold: 1024 }));

// Long-lived caching for versioned static assets (?v=N is the bust mechanism).
const STATIC_CACHE = 'public, max-age=2592000';

// ── Static (same surface as the original server) ─────────────────────────
const INDEX_HTML = path.join(ROOT_DIR, 'index.html');
const CP_HTML = path.join(ROOT_DIR, 'cp.html');

app.get(['/', '/index.html'], (req, res) => {
  try {
    const html = fs.readFileSync(INDEX_HTML, 'utf8');
    // Dynamic page: never let proxies/browsers serve a stale copy (uploaded
    // banner/favicon/SEO must appear immediately on next visit).
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.type('html').send(applySeoToHtml(html, seoSettings()));
  } catch (e) {
    res.sendFile(INDEX_HTML);
  }
});

app.get('/robots.txt', (req, res) => {
  const seo = seoSettings();
  if (!seo.enableRobotsTxt) {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
    return;
  }
  const canon = (seo.canonicalUrl || '').replace(/\/+$/, '');
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /client/cp.html', 'Disallow: /cp'];
  if (canon) lines.push('', 'Sitemap: ' + canon + '/sitemap.xml');
  res.type('text/plain').send(lines.join('\n') + '\n');
});

app.get('/sitemap.xml', (req, res) => {
  const seo = seoSettings();
  const canon = (seo.canonicalUrl || '').replace(/\/+$/, '');
  const base = canon || req.protocol + '://' + req.get('host');
  let lastmod = new Date().toISOString().slice(0, 10);
  try { lastmod = new Date(fs.statSync(INDEX_HTML).mtime).toISOString().slice(0, 10); } catch (e) {}
  const urls = [`  <url>\n    <loc>${base}/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>`];
  const chunks = urls.map((u) => u).join('\n');
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${chunks}\n</urlset>\n`
  );
});
app.get(['/cp', '/cp.html', '/client/cp.html'], (req, res) => {
  const cpIndex = path.join(ROOT_DIR, 'cp-dist', 'index.html');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (fs.existsSync(cpIndex)) return res.sendFile(cpIndex);
  return res.sendFile(CP_HTML);
});
app.get('/cp-classic', (req, res) => res.sendFile(CP_HTML));
app.use('/cp-assets', express.static(path.join(ROOT_DIR, 'cp-dist'), { maxAge: '7d', immutable: true }));
// /js/config.js is generated live from the DB (SEO + appearance) so the client
// fallback config always matches the latest control-panel edits — no redeploy
// or cache-bust needed after panel changes. Same guard semantics as the static
// file: only fills window.domainConfig when the inline block is missing/empty.
app.get('/js/config.js', (req, res) => {
  const cfg = loadDomainConfig();
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  if (!cfg || !Object.keys(cfg).length) {
    res.sendFile(path.join(CLIENT_DIR, 'js', 'config.js'));
    return;
  }
  res.send('if (!window.domainConfig || !Object.keys(window.domainConfig).length) { window.domainConfig = ' + JSON.stringify(cfg) + '; }');
});
app.use('/client', express.static(CLIENT_DIR, { index: false }));
app.use('/js', express.static(path.join(CLIENT_DIR, 'js'), { index: false, setHeaders: (res) => res.setHeader('Cache-Control', STATIC_CACHE) }));
app.use('/css', express.static(path.join(CLIENT_DIR, 'css'), { index: false, setHeaders: (res) => res.setHeader('Cache-Control', STATIC_CACHE) }));
app.use('/dist', express.static(path.join(CLIENT_DIR, 'dist'), { index: false }));
app.use('/vendor', express.static(path.join(CLIENT_DIR, 'vendor'), { index: false, setHeaders: (res) => res.setHeader('Cache-Control', STATIC_CACHE) }));
app.use('/uploads', express.static(path.join(CLIENT_DIR, 'uploads'), { index: false }));
app.use('/assets', express.static(path.join(ROOT_DIR, 'assets')));
app.use('/flags', express.static(path.join(ROOT_DIR, 'assets', 'flag')));
app.get('/emoii.gif', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'emoii.gif')));
app.get('/mic.png', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'mic.png')));
app.get('/verified-badge.svg', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'verified-badge.svg')));
app.get('/keepalive', (req, res) => res.status(204).end());
app.get('/manifest.json', (req, res) => {
  try {
    // PWA manifest is generated from live settings so a swapped favicon/banner
    // is reflected automatically without touching the static file.
    const seo = seoSettings();
    const canon = String(seo.canonicalUrl || '').replace(/\/+$/, '');
    const absolutize = (u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : canon + (u.charAt(0) === '/' ? '' : '/') + u);
    const name = seo.siteName || seo.siteTitle || 'شات درر';
    const fav = absolutize(seo.faviconUrl || seo.bannerUrl || '');
    const banner = absolutize(seo.bannerUrl || seo.ogImage || fav || '');
    const typeOfUrl = (u) => { const e = String(u).toLowerCase(); if (e.endsWith('.png')) return 'image/png'; if (e.endsWith('.webp')) return 'image/webp'; if (e.endsWith('.gif')) return 'image/gif'; if (e.endsWith('.jpg') || e.endsWith('.jpeg')) return 'image/jpeg'; return 'image/png'; };
    const manifest = {
      name,
      short_name: name,
      description: seo.siteDescription || '',
      lang: 'ar',
      dir: 'rtl',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#3b3a3a',
      theme_color: seo.themeColor || '#794e4e',
      icons: [
        { src: fav, sizes: '192x192', type: typeOfUrl(fav), purpose: 'any' },
        { src: fav, sizes: '512x512', type: typeOfUrl(fav), purpose: 'maskable' },
        { src: banner, sizes: '1200x424', type: typeOfUrl(banner), purpose: 'any' }
      ]
    };
    res.type('application/manifest+json').send(JSON.stringify(manifest, null, 2));
  } catch (e) {
    res.sendFile(path.join(CLIENT_DIR, 'manifest.json'));
  }
});
app.get('/sw.js', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'sw.js')));

// ── In-memory presence/session stores (rebuilt per boot) ─────────────────
let db = null;
let presenceVersion = 0;
const onlineSockets = new Map();   // socketId -> userObj (presence entry)
const socketSession = new Map();   // socketId -> clientSessionId (to tell reconnect from new login)
const tokenToUser = new Map();     // token -> { uid, username, type, ... }
const roomHistory = new Map();     // roomId -> [ {id,user,userId,text,createdAt,replyTo,mediaUrl,mediaType}, ... ]
const roomBans = new Map();        // roomId -> [ {id,userId,username,reason,until} ]
const connSlots = new Map();       // ip -> open socket count (flood guard)
const likeGiven = new Set();       // "uid::like::target" - one like per target per user
const repGiven = new Set();        // "uid::rep::target" - one rep per target per user
const wallPosts = [];              // {id,userId,user,text,likes:[],comments:[],createdAt}
