<script setup>
import { ref, watch, computed } from 'vue';
import {
  LayoutDashboard, Activity, Settings2, SlidersHorizontal, Palette, Globe, Newspaper,
  LogIn, Send, Smile, Medal, ListFilter, Users, ShieldCheck, DoorOpen, ShieldBan,
  ScrollText, Wrench, History, LogOut, Menu, X, Lock, Eye, EyeOff, Wifi, WifiOff
} from 'lucide-vue-next';
import { store, tryLogin, logout, toast, admin } from './lib/api.js';
import UBtn from './components/UBtn.vue';
import UserProfileModal from './sections/UserProfileModal.vue';

import DashSection from './sections/Dash.vue';
import LiveSection from './sections/Live.vue';
import SettSection from './sections/Sett.vue';
import FeaturesSection from './sections/Features.vue';
import AppearSection from './sections/Appear.vue';
import SeoSection from './sections/Seo.vue';
import TickersSection from './sections/Tickers.vue';
import LoginbehSection from './sections/Loginbeh.vue';
import ZajelSection from './sections/Zajel.vue';
import EmosSection from './sections/Emos.vue';
import BadgesSection from './sections/Badges.vue';
import ListsSection from './sections/Lists.vue';
import UsersSection from './sections/Users.vue';
import PowersSection from './sections/Powers.vue';
import RoomsSection from './sections/Rooms.vue';
import BansSection from './sections/Bans.vue';
import ModSection from './sections/Mod.vue';
import ToolsSection from './sections/Tools.vue';
import AuditSection from './sections/Audit.vue';

const NAV = [
  {
    group: 'عام',
    items: [
      { id: 'dash', label: 'لوحة المعلومات', icon: LayoutDashboard },
      { id: 'live', label: 'المتصلون الآن', icon: Activity }
    ]
  },
  {
    group: 'إعدادات الموقع',
    items: [
      { id: 'sett', label: 'الإعدادات العامة', icon: Settings2 },
      { id: 'features', label: 'الميزات', icon: SlidersHorizontal },
      { id: 'appear', label: 'المظهر والألوان', icon: Palette },
      { id: 'seo', label: 'SEO وصور الموقع', icon: Globe },
      { id: 'tickers', label: 'الشرائط الإخبارية', icon: Newspaper },
      { id: 'loginbeh', label: 'سلوك الدخول', icon: LogIn }
    ]
  },
  {
    group: 'المحتوى',
    items: [
      { id: 'zajel', label: 'الزاجل', icon: Send },
      { id: 'emos', label: 'الابتسامات والإهداءات', icon: Smile },
      { id: 'badges', label: 'أوسمة النقاط', icon: Medal },
      { id: 'lists', label: 'فلاتر وقوائم', icon: ListFilter }
    ]
  },
  {
    group: 'الإدارة',
    items: [
      { id: 'users', label: 'الأعضاء', icon: Users },
      { id: 'powers', label: 'الصلاحيات والرتب', icon: ShieldCheck },
      { id: 'rooms', label: 'الغرف', icon: DoorOpen },
      { id: 'bans', label: 'الحظر', icon: ShieldBan },
      { id: 'mod', label: 'الجدار والقصص', icon: ScrollText }
    ]
  },
  {
    group: 'النظام',
    items: [
      { id: 'tools', label: 'أدوات وسجلات', icon: Wrench },
      { id: 'audit', label: 'سجل الإجراءات', icon: History }
    ]
  }
];

const SECTIONS = {
  dash: DashSection, live: LiveSection, sett: SettSection, features: FeaturesSection,
  appear: AppearSection, seo: SeoSection, tickers: TickersSection, loginbeh: LoginbehSection,
  zajel: ZajelSection, emos: EmosSection, badges: BadgesSection, lists: ListsSection,
  users: UsersSection, powers: PowersSection, rooms: RoomsSection, bans: BansSection,
  mod: ModSection, tools: ToolsSection, audit: AuditSection
};

const LAZY = {
  live: () => admin('get_online_users'),
  features: () => admin('get_features'),
  tickers: () => admin('get_tickers'),
  badges: () => admin('get_badges_cp'),
  loginbeh: () => admin('get_login_behavior'),
  zajel: () => admin('zajel_cp_list'),
  emos: () => admin('get_addons'),
  powers: () => {},
  users: () => admin('get_addons'),
  rooms: () => { if (!store.roomProfile && store.rooms[0]) admin('get_room_profile', { id: store.rooms[0].id }); },
  mod: () => { admin('get_posts_moderation'); admin('get_stories_moderation'); admin('get_story_bans'); admin('get_addons'); },
  tools: () => admin('get_fps', {}),
  audit: () => admin('get_auditlog')
};

const activeTab = ref('dash');
const drawer = ref(false);
const pass = ref('');
const showPass = ref(false);

function switchTab(id) {
  activeTab.value = id;
  drawer.value = false;
  if (LAZY[id]) LAZY[id]();
}

const currentTitle = computed(() => {
  for (const g of NAV) {
    const it = g.items.find(i => i.id === activeTab.value);
    if (it) return it.label;
  }
  return '';
});

function doLogin() { tryLogin(pass.value.trim()); }
</script>

<template>
  <!-- ══ Login ══ -->
  <div v-if="!store.authed" class="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-900 p-4">
    <div class="pointer-events-none absolute -top-32 -start-32 size-96 rounded-full bg-brand-600/20 blur-3xl" />
    <div class="pointer-events-none absolute -bottom-40 -end-24 size-[28rem] rounded-full bg-brand-500/10 blur-3xl" />
    <div class="relative w-full max-w-sm">
      <div class="mb-8 text-center">
        <div class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-600/40">
          <ShieldCheck :size="28" class="text-white" />
        </div>
        <h1 class="text-xl font-extrabold text-white">لوحة التحكم</h1>
        <p class="mt-1 text-xs text-ink-400">الدخول مخصص للإدارة فقط</p>
      </div>
      <form class="rounded-2xl border border-white/10 bg-white p-6 shadow-2xl" @submit.prevent="doLogin">
        <label class="u-label">كلمة المرور</label>
        <div class="relative">
          <Lock :size="15" class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            v-model="pass"
            :type="showPass ? 'text' : 'password'"
            class="u-input ps-9 pe-9"
            placeholder="••••••••"
            autocomplete="current-password"
          >
          <button type="button" class="absolute end-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700" @click="showPass = !showPass">
            <EyeOff v-if="showPass" :size="16" /><Eye v-else :size="16" />
          </button>
        </div>
        <p v-if="store.loginError" class="mt-2 text-xs font-bold text-red-600">{{ store.loginError }}</p>
        <UBtn block size="lg" class="mt-4" @click="doLogin">دخول</UBtn>
      </form>
    </div>
  </div>

  <!-- ══ Shell ══ -->
  <div v-else class="flex min-h-screen">
    <!-- backdrop -->
    <Transition name="fade">
      <div v-if="drawer" class="fixed inset-0 z-30 bg-ink-950/50 lg:hidden" @click="drawer = false" />
    </Transition>

    <!-- sidebar -->
    <aside
      class="fixed inset-y-0 z-40 flex w-64 flex-col bg-ink-900 transition-transform duration-200 lg:static lg:translate-x-0"
      :class="drawer ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'"
    >
      <div class="flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] px-5">
        <div class="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-600/30">
          <ShieldCheck :size="18" class="text-white" />
        </div>
        <div>
          <div class="text-sm font-extrabold leading-tight text-white">لوحة التحكم</div>
          <div class="text-[10px] font-bold text-ink-500">إدارة الموقع</div>
        </div>
        <button class="ms-auto grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-white/5 lg:hidden" @click="drawer = false">
          <X :size="18" />
        </button>
      </div>
      <nav class="flex-1 overflow-y-auto px-3 py-4">
        <div v-for="g in NAV" :key="g.group" class="mb-4">
          <div class="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-wider text-ink-600">{{ g.group }}</div>
          <button
            v-for="it in g.items"
            :key="it.id"
            class="mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-xs font-bold transition-colors"
            :class="activeTab === it.id ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/40' : 'text-ink-400 hover:bg-white/5 hover:text-ink-100'"
            @click="switchTab(it.id)"
          >
            <component :is="it.icon" :size="16" class="shrink-0" />
            <span>{{ it.label }}</span>
          </button>
        </div>
      </nav>
      <div class="shrink-0 border-t border-white/[0.06] p-3">
        <button class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-bold text-ink-400 transition-colors hover:bg-red-500/10 hover:text-red-400" @click="logout()">
          <LogOut :size="16" />
          تسجيل الخروج
        </button>
      </div>
    </aside>

    <!-- main -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-ink-200/70 bg-white/85 px-4 backdrop-blur lg:px-6">
        <button class="grid size-9 place-items-center rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-50 lg:hidden" @click="drawer = true">
          <Menu :size="18" />
        </button>
        <h1 class="truncate text-sm font-extrabold text-ink-900">{{ currentTitle }}</h1>
        <div class="ms-auto flex items-center gap-2">
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold"
            :class="store.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'"
          >
            <component :is="store.connected ? Wifi : WifiOff" :size="12" />
            {{ store.connected ? 'متصل' : 'منقطع' }}
          </span>
        </div>
      </header>
      <main class="mx-auto w-full max-w-6xl flex-1 p-4 lg:p-6">
        <component :is="SECTIONS[activeTab]" />
      </main>
    </div>
  </div>

  <!-- user profile modal -->
  <UserProfileModal />

  <!-- toasts -->
  <div class="fixed bottom-4 start-4 z-[60] flex flex-col gap-2">
    <TransitionGroup name="fade">
      <div
        v-for="t in store.toasts"
        :key="t.id"
        class="max-w-xs rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-lg"
        :class="t.type === 'err' ? 'bg-red-600' : t.type === 'warn' ? 'bg-amber-500' : 'bg-ink-800'"
      >
        {{ t.msg }}
      </div>
    </TransitionGroup>
  </div>
</template>
