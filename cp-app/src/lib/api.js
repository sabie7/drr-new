import { io } from 'socket.io-client';
import { reactive } from 'vue';

export const store = reactive({
  connected: false,
  authed: false,
  loginError: '',
  password: '',
  toasts: [],
  siteweb: {},
  seo: {},
  appearance: {},
  dro3: [], emo: [], sico: [],
  powers: [],
  noletters: [],
  users: [],
  rooms: [],
  bands: [],
  shrt: [], msgs: [], subs: [],
  bans: { browsers: {}, systems: {} },
  health: {},
  audit: [],
  online: [],
  postsMod: [],
  storiesMod: [],
  addons: [],
  storyBans: [],
  userProfile: null,
  roomProfile: null,
  features: {},
  tickers: { news: {}, ads: { settings: {}, ads: [] } },
  badges: { enabled: false, badges: {} },
  loginBehavior: {},
  zajel: { approved: [], pending: [] },
  globalLimits: { public: 300, private: 300 },
  pendingEmojiUrl: '',
  pendingAddonUrl: '',
  fps: []
});

export const socket = io('/', { transports: ['websocket', 'polling'] });

let toastSeq = 0;
export function toast(msg, type = 'ok') {
  const id = ++toastSeq;
  store.toasts.push({ id, msg, type });
  setTimeout(() => {
    const i = store.toasts.findIndex(t => t.id === id);
    if (i !== -1) store.toasts.splice(i, 1);
  }, 3400);
}

export function admin(cmd, data) {
  try {
    window.__adminLog = window.__adminLog || [];
    window.__adminLog.push({ cmd, data: JSON.parse(JSON.stringify(data || {})) });
    if (window.__adminLog.length > 30) window.__adminLog.shift();
  } catch (e) {}
  socket.emit('msg', { cmd: 'admin', data: { cmd, pass: store.password, data: data || {} } });
}

export function tryLogin(pass) {
  if (!pass) { store.loginError = 'الرجاء إدخال كلمة المرور'; return; }
  store.password = pass;
  store.loginError = '';
  socket.emit('msg', { cmd: 'getstate', data: { password: pass } });
}

export function logout() {
  localStorage.removeItem('cp-pass');
  sessionStorage.removeItem('cp-pass');
  location.reload();
}

const MSG_HANDLERS = {
  error_list(d) {
    if (!store.authed) {
      store.loginError = (d && d.msg) || 'كلمة المرور غير صحيحة';
    } else {
      toast((d && d.msg) || 'خطأ صلاحية', 'err');
    }
  },
  siteweb(d) {
    store.siteweb = d || {};
    if (!store.authed) {
      store.authed = true;
      localStorage.setItem('cp-pass', store.password);
      toast('مرحباً بك في لوحة التحكم');
      admin('get_system_health');
    }
  },
  dro3(d) { store.dro3 = d || []; },
  emos(d) { store.emo = d || []; },
  sicos(d) { store.sico = d || []; },
  addons(d) { store.addons = d || []; },
  powers(d) { store.powers = d || []; },
  noletters(d) { store.noletters = d || []; },
  zaker() {},
  users_data(d) { store.users = d || []; },
  rlist(d) { store.rooms = d || []; },
  band_list(d) { store.bands = d || []; },
  setbansystem(d) { if (d) store.bans = d; },
  shrtlist(d) { store.shrt = d || []; },
  msgslist(d) { store.msgs = d || []; },
  subslist(d) { store.subs = d || []; },
  online_usrs(d) { store.online = d || []; },
  posts_moderation(d) { store.postsMod = d || []; },
  stories_moderation(d) { store.storiesMod = d || []; },
  story_bans(d) { store.storyBans = d || []; },
  user_profile(d) { store.userProfile = d || null; },
  room_profile(d) { store.roomProfile = d || null; },
  seo(d) { store.seo = d || {}; },
  seo_saved(d) { store.seo = d || store.seo; },
  appearance(d) { store.appearance = d || {}; },
  features_data(d) { store.features = d || {}; },
  tickers_data(d) { store.tickers = d || store.tickers; },
  badges_data(d) { store.badges = d || { enabled: false, badges: {} }; },
  login_behavior_data(d) { store.loginBehavior = d || {}; },
  global_limits_data(d) { store.globalLimits = d || { public: 300, private: 300 }; },
  zajel_cp_data(d) { store.zajel = d || { approved: [], pending: [] }; },
  cp_image_uploaded(d) {
    if (!d || !d.url) return;
    if (d.kind === 'badge') {
      const badges = { ...(store.badges.badges || {}) };
      badges[d.idx] = d.url;
      store.badges = { ...store.badges, badges };
      admin('set_badges', store.badges);
      toast('تم رفع الوسام — جاري الحفظ');
    } else if (d.kind === 'emoji') {
      store.pendingEmojiUrl = d.url;
      toast('تم رفع الصورة — اضغط إضافة ابتسامة');
    } else if (d.kind === 'addon_icon' || d.kind === 'addon_gift') {
      store.pendingAddonUrl = d.url;
      toast('تم رفع الصورة — اضغط إضافة');
    }
  }
};

socket.on('connect', () => {
  store.connected = true;
  const saved = localStorage.getItem('cp-pass') || sessionStorage.getItem('cp-pass') || '';
  if (saved) {
    // Re-authenticate on EVERY (re)connect: the server marks the socket
    // isAdmin only after a successful getstate, and admin commands from a
    // non-admin socket are rate-limited to 5/min then force-disconnected.
    store.password = saved;
    socket.emit('msg', { cmd: 'getstate', data: { password: saved } });
  }
});

socket.on('disconnect', () => { store.connected = false; });

socket.on('message', (msg) => {
  if (!msg || !msg.cmd) return;
  const h = MSG_HANDLERS[msg.cmd];
  if (h) h(msg.data);
});

socket.on('savedone', (data) => {
  toast((data && data.msg) || 'تم الحفظ بنجاح', 'ok');
  if (store.userProfile) admin('get_user_profile', { topic: store.userProfile.topic || store.userProfile.username });
});

socket.on('error-msg', (data) => { toast((data && data.msg) || 'خطأ', 'err'); });

socket.on('done_band', () => { toast('تم تنفيذ الحظر', 'ok'); });

socket.on('fpslist', (logs) => { store.fps = logs || []; });

socket.on('system_health', (h) => { store.health = h || {}; });

socket.on('auditlog', (list) => { store.audit = list || []; });

export function refreshState() {
  if (store.password) socket.emit('msg', { cmd: 'getstate', data: { password: store.password } });
}

// Template-safe confirm(): Vue templates cannot access window globals, so
// every confirmation dialog must go through this helper.
export function ask(msg) {
  return window.confirm(msg);
}

export function fmtBytes(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(1) + ' ' + u[i];
}

export function fmtUptime(sec) {
  if (sec === undefined || sec === null || isNaN(sec)) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  const out = [];
  if (d) out.push(d + 'ي');
  if (h) out.push(h + 'س');
  if (m) out.push(m + 'د');
  return out.length ? out.join(' ') : Math.floor(sec) + 'ث';
}

export function fmtDate(s) {
  return String(s || '').replace('T', ' ').replace('Z', '').substring(0, 16);
}
