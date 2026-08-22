/* ═══════════════════════════════════════════════════
   SERVER-PART 08/16 · jsonld-seo-html-auth-helpers
   lines 1136–1440 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
  const canon = String(seo.canonicalUrl || '').replace(/\/+$/, '');
  const absolutize = (u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : canon + (u.charAt(0) === '/' ? '' : '/') + u);
  const name = seo.siteName || seo.siteTitle || 'شات درر';
  const altName = seo.siteTitle && seo.siteTitle !== name ? seo.siteTitle : 'DRR Chat';
  const desc = seo.siteDescription || '';
  const fav = absolutize(seo.faviconUrl || '');
  const banner = absolutize(seo.bannerUrl || seo.ogImage || '');
  const sameAs = Array.isArray(seo.sameAs) ? seo.sameAs.map(absolutize).filter(Boolean) : [];
  const add = (base, extra) => { const o = Object.assign({}, base); Object.keys(extra).forEach((k) => { if (extra[k]) o[k] = extra[k]; }); return o; };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      add({
        '@type': 'WebSite',
        '@id': canon + '/#website',
        url: canon + '/',
        name,
        alternateName: altName,
        description: desc,
        inLanguage: 'ar',
      }, { image: banner, publisher: { '@id': canon + '/#organization' } }),
      add({
        '@type': 'Organization',
        '@id': canon + '/#organization',
        name,
        url: canon + '/',
        description: desc,
        sameAs,
      }, { logo: fav ? { '@type': 'ImageObject', url: fav } : null, image: banner }),
      add({
        '@type': 'WebApplication',
        '@id': canon + '/#webapp',
        name,
        url: canon + '/',
        applicationCategory: 'CommunicationApplication',
        applicationSubCategory: 'Chat',
        operatingSystem: 'Any',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'OMR' },
        inLanguage: 'ar',
      }, { image: banner, publisher: { '@id': canon + '/#organization' } })
    ]
  };
}

// Rewrite the SEO-relevant <head> tags of the served HTML from settings.
function applySeoToHtml(html, seo) {
  if (!html || !seo) return html;
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escJson = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\u0000-\u001f\u007f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const title = seo.siteTitle || seo.siteName || '';
  const siteName = seo.siteName || seo.siteTitle || '';
  const desc = seo.siteDescription || '';
  const kw = seo.siteKeywords || '';
  const robots = seo.noindex ? 'noindex, nofollow' : (seo.robotsMeta || 'index, follow');
  const canon = String(seo.canonicalUrl || '').replace(/\/+$/, '');
  const absolutize = (u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : canon + (u.charAt(0) === '/' ? '' : '/') + u);
  const ogImg = absolutize(seo.ogImage || '');
  const favicon = seo.faviconUrl || '';
  const banner = seo.bannerUrl || '';
  const defaultAvatar = seo.defaultAvatarUrl || '';
  const gscCodes = String(seo.googleSiteVerification || '').split(',').map((s) => s.trim()).filter(Boolean);
  const sameAs = Array.isArray(seo.sameAs) ? seo.sameAs.map(absolutize).filter(Boolean) : [];
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  out = out.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}">`);
  out = out.replace(/<meta name="keywords"[^>]*>/, `<meta name="keywords" content="${esc(kw)}">`);
  out = out.replace(/<meta name="robots"[^>]*>/, (m) => `<meta name="robots" content="${esc(robots)}">` + (gscCodes.length ? '\n  ' + gscCodes.map((v) => `<meta name="google-site-verification" content="${esc(v)}">`).join('\n  ') : ''));
  out = out.replace(/<meta name="theme-color"[^>]*>/, `<meta name="theme-color" content="${esc(seo.themeColor || '')}">`);
  out = out.replace(/<meta name="msapplication-TileColor"[^>]*>/, `<meta name="msapplication-TileColor" content="${esc(seo.themeColor || '')}">`);
  out = out.replace(/<meta name="apple-mobile-web-app-title"[^>]*>/, `<meta name="apple-mobile-web-app-title" content="${esc(siteName)}">`);
  out = out.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(canon)}">`);
  out = out.replace(/<meta property="og:site_name"[^>]*>/, `<meta property="og:site_name" content="${esc(siteName)}">`);
  out = out.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}">`);
  out = out.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(desc)}">`);
  out = out.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(canon)}">`);
  if (ogImg) out = out.replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${esc(ogImg)}">`);
  out = out.replace(/<meta name="twitter:card"[^>]*>/, `<meta name="twitter:card" content="${esc(seo.twitterCard || 'summary_large_image')}">`);
  out = out.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(title)}">`);
  out = out.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(desc)}">`);
  if (ogImg) out = out.replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${esc(ogImg)}">`);
  out = out.replace(/<meta property="og:type"[^>]*>/, '<meta property="og:type" content="website">');
  out = out.replace(/<meta property="og:locale"[^>]*>/, '<meta property="og:locale" content="ar_AR">');
  // Live landing texts: H1 + intro paragraph follow the panel SEO values so
  // Google always sees exactly what the admin configured.
  if (title) out = out.replace(/(<h1 class="landing-title[^"]*">)[\s\S]*?(<\/h1>)/, `$1${esc(title)}$2`);
  if (desc) out = out.replace(/(<p class="landing-intro[^"]*">)[\s\S]*?(<\/p>)/, `$1${esc(desc)}$2`);
  // Footer text: inject the live value INTO the inline window.domainConfig so
  // the client-side footer script always sees it (config.js only fills gaps
  // and never overrides the inline object).
  try {
    const ap0 = appearanceSettings();
    const ft = String((ap0 && ap0.footerText) || '').trim();
    if (ft) {
      const escFt = ft.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      if (/\"footerText\"\s*:/.test(out)) {
        out = out.replace(/(\"footerText\"\s*:\s*\")[^\"]*(\")/, `$1${escFt}$2`);
      } else if (/\"domainId\"\s*:\s*\d+\s*\}/.test(out)) {
        out = out.replace(/(\"domainId\"\s*:\s*\d+)\s*(\})/, `$1,\"footerText\":\"${escFt}\"$2`);
      }
    }
  } catch (e) {}
  out = out.replace(/"sameAs"\s*:\s*\[[^\]]*\]/, `"sameAs": [${sameAs.map((u) => `"${esc(u)}"`).join(', ')}]`);
  const favAbs = absolutize(favicon);
  if (favAbs) {
    const base = favicon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('("url"\\s*:\\s*")' + base + '(")', 'g'), `$1${esc(favAbs)}$2`);
  }
  if (favicon) {
    out = out.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${esc(favicon)}">`);
    out = out.replace(/<link rel="shortcut icon"[^>]*>/, `<link rel="shortcut icon" href="${esc(favicon)}">`);
  }
  if (banner) {
    out = out.replace(/<link rel="preload" as="image"[^>]*>/, `<link rel="preload" as="image" href="${esc(banner)}">`);
    out = out.replace(/<img id="site-logo"[^>]*src="[^"]*"/, `<img id="site-logo" src="${esc(favicon || banner)}"`);
    out = out.replace(/<img([^>]*)class="[^"]*site-banner[^"]*"[^>]*>/, (m, beforeClass) => {
      return m.replace(/src="[^"]*"/, `src="${esc(banner)}"`);
    });
  }
  const rewriteConfigKey = (src, key, value) => {
    if (!value) return src;
    return src.replace(new RegExp('("' + key + '"\\s*:\\s*")[^"]*(")'), `$1${escJson(value)}$2`);
  };
  if (defaultAvatar) {
    out = rewriteConfigKey(out, 'defaultAvatarUrl', defaultAvatar);
  }
  if (banner) {
    out = rewriteConfigKey(out, 'bannerUrl', banner);
    out = rewriteConfigKey(out, 'ogImage', ogImg || banner);
  }
  if (favicon) {
    out = rewriteConfigKey(out, 'faviconUrl', favicon);
  }
  // Text SEO (name/title/description/keywords/canonical) must also reach the
  // inline domainConfig so the live client reflects panel edits automatically.
  out = rewriteConfigKey(out, 'siteName', siteName);
  out = rewriteConfigKey(out, 'siteTitle', title);
  out = rewriteConfigKey(out, 'siteDescription', desc);
  out = rewriteConfigKey(out, 'siteKeywords', kw);
  out = rewriteConfigKey(out, 'canonicalUrl', canon || siteName);
  out = rewriteConfigKey(out, 'themeColor', seo.themeColor || '');
  // Structured data (JSON-LD) must follow uploaded images automatically.
  out = out.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    '<script type="application/ld+json">\n' + JSON.stringify(buildJsonLd(seo), (k, v) => (v === undefined ? undefined : v), 2).replace(/<\//g, '<\\/') + '\n</script>'
  );
  // Landing visible texts (site name in header bar, h1 title, intro paragraph)
  // stay in sync with the CP edits so the served page is SEO-consistent.
  out = out.replace(/<span class="small fw-bold" id="header-site-name">[\s\S]*?<\/span>/, `<span class="small fw-bold" id="header-site-name">${esc(siteName)}</span>`);
  out = out.replace(/<h1 class="landing-title mb-1">[\s\S]*?<\/h1>/, `<h1 class="landing-title mb-1">${esc(title)}</h1>`);
  out = out.replace(/<p class="landing-intro mb-0">[\s\S]*?<\/p>/, `<p class="landing-intro mb-0">${esc(desc)}</p>`);
  // Live appearance/colors → rewrite theme-root-vars CSS and inline domainConfig.
  const ap = appearanceSettings();
  if (ap && typeof ap === 'object') {
    APPEARANCE_FIELDS.forEach((f) => {
      const raw = ap[f.key];
      if (raw === undefined || raw === null || String(raw) === '') return;
      let v = String(raw);
      if (f.css) {
        let cssVal = v;
        if (f.key === 'fontSize' && !/px$/i.test(cssVal)) cssVal += 'px';
        const cssVar = f.css;
        out = out.replace(new RegExp('(' + cssVar.replace(/-/g, '\\-') + '\\s*:\\s*)[^;]+;'), `$1${cssVal};`);
      }
      out = rewriteConfigKey(out, f.key, v);
    });
  }
  return out;
}

// ── REST helpers ──────────────────────────────────────────────────────────
function bearerToken(req) {
  const h = req.headers['authorization'] || '';
  if (h.indexOf('Bearer ') === 0) return h.slice(7).trim();
  return req.headers['x-chat-token'] || '';
}

function findUserByToken(token) {
  if (!token) return null;
  return db.users.findOne({ token: token });
}

function dbUserToAuthUser(doc, type) {
  return {
    id: doc.id,
    userId: doc.id,
    username: doc.topic || doc.username,
    topic: doc.topic || doc.username,
    pic: doc.pic || 'pic.png',
    ucol: doc.ucol || '#000000',
    mcol: doc.mcol || '#6c757d',
    bg: doc.bg || '#ffffff',
    fontColor: doc.fontColor || '#000000',
    msg: doc.msg || '',
    co: doc.co || 'us',
    country: doc.co || '',
    rep: doc.rep || 0,
    likes: doc.likes || 0,
    wallPoints: doc.wallPoints || 0,
    coins: doc.coins || 0,
    cover: doc.cover || '',
    membershipBg: doc.membershipBg || '',
    membershipFrame: doc.membershipFrame || '',
    group: doc.group || { id: 0, name: '', roleRank: doc.power === 'admin' ? 999 : 0 },
    rank: doc.power || '',
    power: doc.power || '',
    verified: !!doc.verified,
    isVerified: !!doc.verified,
    isAdmin: !!doc.isAdmin || doc.power === 'admin',
    type: type || 'member',
    mustChooseRoom: false,
    allowPrivate: doc.allowPrivate !== false,
    ...permissionsFor(doc).permissions,
    isActive: true,
  };
}

function makeToken() {
  // Always use a CSPRNG for session/auth tokens (helpers.stringGen uses Math.random).
  return crypto.randomBytes(64).toString('hex') + crypto.randomBytes(16).toString('base64url');
}

// ── Wall-posts persistence (keep wall across restarts; private/room chats clear) ──
function persistWall() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(WALL_PERSIST_FILE, JSON.stringify(wallPosts.slice(0, 500)), 'utf8');
  } catch (e) { logger.warn('wall.persist', 'Write failed', { error: e.message }); }
}

function loadWall() {
  try {
    if (fs.existsSync(WALL_PERSIST_FILE)) {
      const arr = JSON.parse(fs.readFileSync(WALL_PERSIST_FILE, 'utf8'));
      if (Array.isArray(arr)) { wallPosts.length = 0; wallPosts.push(...arr.slice(0, 500)); }
    }
  } catch (e) { logger.warn('wall.load', 'Load failed', { error: e.message }); }
}

// ── Story persistence + lifecycle (Instagram-style: 24h TTL, capped, pruned) ──
function persistStories() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORY_PERSIST_FILE, JSON.stringify(stories.slice(0, STORY_MAX)), 'utf8');
  } catch (e) { logger.warn('story.persist', 'Write failed', { error: e.message }); }
}

function loadStories() {
  try {
    if (fs.existsSync(STORY_PERSIST_FILE)) {
      const arr = JSON.parse(fs.readFileSync(STORY_PERSIST_FILE, 'utf8'));
      if (Array.isArray(arr)) { stories.length = 0; stories.push(...arr.slice(0, STORY_MAX)); }
    }
  } catch (e) { logger.warn('story.load', 'Load failed', { error: e.message }); }
}

// Remove expired stories (and orphaned story files) so RAM/disk stay light.
function pruneStories() {
  const now = Date.now();
  const kept = [];
  const dropFiles = new Set();
  let changed = false;
  for (const s of stories) {
    const t = new Date(s.createdAt).getTime();
    if (!Number.isFinite(t) || (now - t) > STORY_TTL_MS) { changed = true; if (s.mediaUrl) dropFiles.add(s.mediaUrl); continue; }
    kept.push(s);
  }
  if (kept.length > STORY_MAX) { changed = true; kept.slice(STORY_MAX).forEach((s) => { if (s.mediaUrl) dropFiles.add(s.mediaUrl); }); }
  if (changed) {
    stories.length = 0; stories.push(...kept.slice(0, STORY_MAX));
    persistStories();
  }
  // Best-effort cleanup of orphaned story files (only owned, recorded uploads).
  if (dropFiles.size) {
    dropFiles.forEach((url) => {
      try {
        if (!uploadOwners.has(String(url).split('?')[0])) return;
        const f = path.basename(String(url).split('?')[0]);
        const full = path.join(uploadDir, f);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      } catch (e) { /* noop */ }
    });
  }
}

// ── Voice mesh helpers ────────────────────────────────────────────────────
function roomMicState(roomId) {
  return voiceMics.get(String(roomId)) || {};
}
function broadcastRoomState(roomId) {
  const mics = roomMicState(roomId);
  io.to('room:' + roomId).emit('voice:state', { roomId: Number(roomId), mics });
}
function freeMicFor(roomId, micIndex) {
  const mics = roomMicState(roomId);
  const entry = mics[micIndex];
  if (entry) { delete mics[micIndex]; voiceUsers.delete(entry.socketId); broadcastRoomState(roomId); }
}
function freeMic(roomId, micIndex) { freeMicFor(roomId, micIndex); }
function freeAllMicsForSocket(socketId) {
  const u = voiceUsers.get(socketId);
  if (u) freeMic(u.roomId, u.micIndex);
}

// ── REST: /api/auth/* ─────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
