/* ═══════════════════════════════════════════════════
   SERVER-PART 06/16 · seo-appearance-features-tickers
   lines 879–1082 of original modern-server.js
   ⚠ ORDER MATTERS — assembled by build-server.cjs
   ═══════════════════════════════════════════════ */
0
/* Kaz alwadi (c) 2026 — seo-appearance-features-tickers */
  try {
    if (!fs.existsSync(INDEX_HTML)) return {};
    const html = fs.readFileSync(INDEX_HTML, 'utf8');
    const m = html.match(/window\.domainConfig\s*=\s*(\{[\s\S]*?\});/);
    if (!m) return {};
    // Safe JSON parse — never use new Function/eval on file content
    let base;
    try { base = JSON.parse(m[1]); } catch (e) { logger.warn('cfg', 'Could not parse inline domainConfig', { error: e.message }); return {}; }
    // Merge live SEO/uploaded images over the static file so /api/settings/
    // appearance and the inline domainConfig always reflect DB updates (e.g.
    // banner/favicon/avatar uploaded from the CP).
    const seo = seoSettings();
    const out = Object.assign({}, base);
    if (seo && typeof seo === 'object') {
      if (seo.siteName) out.siteName = seo.siteName;
      if (seo.siteTitle) out.siteTitle = seo.siteTitle;
      if (seo.siteDescription) out.siteDescription = seo.siteDescription;
      if (seo.siteKeywords) out.siteKeywords = seo.siteKeywords;
      if (seo.canonicalUrl) out.canonicalUrl = seo.canonicalUrl;
      if (seo.bannerUrl) out.bannerUrl = seo.bannerUrl;
      if (seo.faviconUrl) out.faviconUrl = seo.faviconUrl;
      if (seo.defaultAvatarUrl) out.defaultAvatarUrl = seo.defaultAvatarUrl;
      if (seo.ogImage) out.ogImage = seo.ogImage;
      if (seo.themeColor) out.themeColor = seo.themeColor;
    }
    // Merge live appearance/color overrides (from the CP) over the static file.
    const ap = appearanceSettings();
    if (ap && typeof ap === 'object') {
      APPEARANCE_FIELDS.forEach((f) => {
        if (ap[f.key] !== undefined && ap[f.key] !== null && String(ap[f.key]) !== '') out[f.key] = ap[f.key];
      });
    }
    return out;
  } catch (e) {
    logger.warn('cfg', 'Could not parse domainConfig', { error: e.message });
    return {};
  }
}

// ── SEO settings (persisted in db.settings.seo, injected at serve time) ──
const SEO_DEFAULTS = {
  siteName: 'شات درر',
  siteTitle: 'شات درر',
  siteDescription: 'شات درر: وجهتك الأولى للدردشة الخليجية والعربية. تواصل مع أصدقاء جدد من عمان والسعودية وكافة الدول في بيئة آمنة وسريعة. انضم إلينا الآن وابدأ التواصل!',
  siteKeywords: 'شات درر , دردشة خليجية , شات عمان , شات كتابي , تعارف خليجي , شات السعودية , شات تعب , شات مسقط , شات الخليج , شات عربي',
  canonicalUrl: 'https://drr-chat.bonto.run',
  robotsMeta: 'index, follow',
  enableSitemap: true,
  enableRobotsTxt: true,
  ogImage: '/uploads/site/banner-1787149093493-d1868e0a.jpg',
  twitterCard: 'summary_large_image',
  themeColor: '#794e4e',
  noindex: false,
  faviconUrl: '/uploads/site/favicon-1787149110961-9e3b4707.png',
  bannerUrl: '/uploads/site/banner-1787149093493-d1868e0a.jpg',
  defaultAvatarUrl: '/uploads/site/pic-1787149117871-c2563702.png',
  googleSiteVerification: '',
  sameAs: []
};

function seoSettings() {
  const doc = moduleSettings();
  if (!doc) return Object.assign({}, SEO_DEFAULTS);
  if (doc.seo && typeof doc.seo === 'object' && Object.keys(doc.seo).length) return Object.assign({}, SEO_DEFAULTS, doc.seo);
  return Object.assign({}, SEO_DEFAULTS);
}

function seoSave(patch) {
  if (!db || !db.settings) return seoSettings();
  const doc = moduleSettings();
  const cur = Object.assign({}, SEO_DEFAULTS, (doc && doc.seo) || {});
  const keys = ['siteName', 'siteTitle', 'siteDescription', 'siteKeywords', 'canonicalUrl', 'robotsMeta', 'enableSitemap', 'enableRobotsTxt', 'ogImage', 'twitterCard', 'themeColor', 'noindex', 'faviconUrl', 'bannerUrl', 'defaultAvatarUrl', 'googleSiteVerification', 'sameAs'];
  keys.forEach((k) => { if (patch[k] !== undefined) cur[k] = patch[k]; });
  if (doc) doc.seo = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { seo: cur } });
  return cur;
}

// ── Appearance / colors (persisted in db.settings.appearance, injected at
//    serve time into the theme CSS vars + inline domainConfig) ──
const APPEARANCE_FIELDS = [
  { key: 'mainUiColor', css: '--main-ui-color' },
  { key: 'landingBgColor', css: '--landing-bg-color' },
  { key: 'chatInputBg', css: '--chat-input-bg' },
  { key: 'unifiedBtnBg', css: '--unified-btn-bg' },
  { key: 'unifiedBtnHoverBg', css: '--unified-btn-hover-bg' },
  { key: 'micIconColor', css: '--mic-icon-color' },
  { key: 'micBtnBgColor', css: '--mic-btn-bg-color' },
  { key: 'lineIconColor', css: '--line-icon-color' },
  { key: 'tickerBgColor', css: null },
  { key: 'tickerTextColor', css: null },
  { key: 'fontFamily', css: '--font-family' },
  { key: 'fontSize', css: '--font-size' },
  { key: 'fontWeight', css: '--font-weight' },
  { key: 'footerText', css: null },
  // Visibility flags + extra media consumed by client applySiteAppearance()
  { key: 'showBanner', css: null },
  { key: 'bannerWidth', css: null },
  { key: 'bannerHeight', css: null },
  { key: 'showFavicon', css: null },
  { key: 'showOverlayImage', css: null },
  { key: 'overlayImageUrl', css: null },
  { key: 'showPrivateTabBg', css: null },
  { key: 'privateTabBgUrl', css: null },
  { key: 'showDefaultAvatar', css: null },
  { key: 'defaultSystemMessageImageUrl', css: null },
  { key: 'showDefaultRoom', css: null },
  { key: 'defaultRoomUrl', css: null },
  { key: 'enableCustomCover', css: null },
  { key: 'defaultCoverUrl', css: null },
  { key: 'showStatusOnLanding', css: null }
];

function appearanceSettings() {
  const doc = moduleSettings();
  if (doc && doc.appearance && typeof doc.appearance === 'object') return Object.assign({}, doc.appearance);
  return {};
}

function appearanceSave(patch) {
  if (!db || !db.settings) return appearanceSettings();
  const doc = moduleSettings();
  const cur = Object.assign({}, (doc && doc.appearance) || {});
  APPEARANCE_FIELDS.forEach((f) => { if (patch[f.key] !== undefined) cur[f.key] = patch[f.key]; });
  if (doc) doc.appearance = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { appearance: cur } });
  return cur;
}

// ── Client feature toggles (persisted in db.settings.features; consumed by
//    main.js via GET /api/settings/features). Keys mirror exactly what the
//    live client reads off window.featuresSettings. ──
const FEATURES_DEFAULTS = {
  storiesEnabled: true, wallEnabled: true, privateTabEnabled: true, roomsEnabled: true,
  voiceEnabled: true, gamesEnabled: true, zajelEnabled: true, quickChatEnabled: true,
  profilesEnabled: true, giftsEnabled: true, liveBroadcastEnabled: false,
  battleChallengesEnabled: true, publicMessageDeletionEnabled: false, publicMessageReplyEnabled: true,
  statusColorEnabled: true, profileLightboxEnabled: true, mentionsEnabled: true,
  sidebarAddonsEnabled: true, sidebarMemberSearchEnabled: true, wallPostCommentsEnabled: true,
  wallPostLikesEnabled: true, wallYoutubeBarEnabled: true, disableCopy: false, disableRightClick: false,
  cameraEnabled: true, storySidebarIndicatorEnabled: true,
  likes_notifications: 20, likes_effects: 100
};
function featuresSettings() {
  const doc = moduleSettings();
  return Object.assign({}, FEATURES_DEFAULTS, (doc && doc.features && typeof doc.features === 'object') ? doc.features : {});
}
function featuresSave(patch) {
  if (!db || !db.settings) return featuresSettings();
  const doc = moduleSettings();
  const cur = Object.assign({}, FEATURES_DEFAULTS, (doc && doc.features) || {});
  Object.keys(FEATURES_DEFAULTS).forEach((k) => { if (patch && patch[k] !== undefined) cur[k] = patch[k]; });
  if (doc) doc.features = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { features: cur } });
  return cur;
}

// ── News ticker (landing/chat top bar; consumed via /api/settings/news-ticker) ──
const NEWS_TICKER_DEFAULTS = { enabled: false, text: '', bgColor: '#ff0000', textColor: '#ffffff' };
function newsTickerSettings() {
  const doc = moduleSettings();
  return Object.assign({}, NEWS_TICKER_DEFAULTS, (doc && doc.newsTicker && typeof doc.newsTicker === 'object') ? doc.newsTicker : {});
}
function newsTickerSave(patch) {
  if (!db || !db.settings) return newsTickerSettings();
  const doc = moduleSettings();
  const cur = Object.assign({}, NEWS_TICKER_DEFAULTS, (doc && doc.newsTicker) || {});
  Object.keys(NEWS_TICKER_DEFAULTS).forEach((k) => { if (patch && patch[k] !== undefined) cur[k] = patch[k]; });
  if (doc) doc.newsTicker = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { newsTicker: cur } });
  return cur;
}

// ── Admin ads ticker ({settings:{enabled,speed,bgColor,textColor}, ads:[{id,content,linkUrl}]}) ──
const ADS_TICKER_DEFAULTS = { settings: { enabled: false, speed: 30, bgColor: '#fff8e1', textColor: '#4b3600' }, ads: [] };
function adsTickerSettings() {
  const doc = moduleSettings();
  const d = (doc && doc.adsTicker && typeof doc.adsTicker === 'object') ? doc.adsTicker : {};
  return {
    settings: Object.assign({}, ADS_TICKER_DEFAULTS.settings, (d && d.settings && typeof d.settings === 'object') ? d.settings : {}),
    ads: Array.isArray(d.ads) ? d.ads : []
  };
}
function adsTickerSave(data) {
  if (!db || !db.settings) return adsTickerSettings();
  const doc = moduleSettings();
  const cur = adsTickerSettings();
  if (data && data.settings && typeof data.settings === 'object') {
    ['enabled', 'speed', 'bgColor', 'textColor'].forEach((k) => { if (data.settings[k] !== undefined) cur.settings[k] = data.settings[k]; });
  }
  if (data && Array.isArray(data.ads)) {
    cur.ads = data.ads.slice(0, 50)
      .map((a) => ({
        id: (a && a.id !== undefined && a.id !== '') ? String(a.id).substring(0, 40) : ('ad_' + Date.now() + '_' + Math.floor(Math.random() * 10000)),
        content: String((a && a.content) || '').trim().substring(0, 300),
        linkUrl: String((a && a.linkUrl) || '').trim().substring(0, 300)
      }))
      .filter((a) => a.content);
  }
  if (doc) doc.adsTicker = cur;
  if (db.settings) db.settings.updateOne({}, { $set: { adsTicker: cur } });
  return cur;
}

// ── Profile badges (wallPoints tiers; shape {enabled, badges:{1:url..6:url}}) ──
const BADGE_LEVELS = [1, 2, 3, 4, 5, 6];
