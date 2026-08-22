<script setup>
import { computed, reactive, watch } from 'vue';
import { Save, Plus, Ban, Trash2, VolumeX, Footprints, ImageOff, Camera, CameraOff } from 'lucide-vue-next';
import { store, admin, fmtDate, ask } from '../lib/api.js';
import UModal from '../components/UModal.vue';
import UBtn from '../components/UBtn.vue';
import UField from '../components/UField.vue';

const u = computed(() => store.userProfile);

const powerOpts = computed(() => {
  const base = ['user', 'admin'];
  for (const p of store.powers) if (!base.includes(p.name)) base.push(p.name);
  return base;
});
const iconAssets = computed(() => store.addons.filter(a => a.type !== 'gift'));
const giftAssets = computed(() => store.addons.filter(a => a.type === 'gift'));
const gifts = computed(() => Array.isArray(u.value?.gifts) ? u.value.gifts : []);
const storyBanned = computed(() => (store.storyBans || []).includes(String(u.value?.id)));

const f = reactive({
  topic: '', power: 'user', rep: 0, likes: 0, coins: 0, wallPoints: 0,
  memberShip: 'free', co: '', gender: '', email: '', msg: '',
  verified: false, isAdmin: false, password: ''
});

let lastId = null;
watch(u, (x) => {
  if (!x || x.id === lastId) return;
  lastId = x.id;
  f.topic = x.topic || ''; f.power = x.power || 'user';
  f.rep = x.rep || 0; f.likes = x.likes || 0; f.coins = x.coins || 0; f.wallPoints = x.wallPoints || 0;
  f.memberShip = x.memberShip || 'free'; f.co = x.co || ''; f.gender = x.gender || '';
  f.email = x.email || ''; f.msg = x.msg || '';
  f.verified = !!x.verified; f.isAdmin = !!x.isAdmin; f.password = '';
}, { immediate: true });

function save() {
  const data = {
    original: u.value.topic || u.value.username,
    topic: f.topic.trim(), power: f.power,
    rep: f.rep, likes: f.likes, coins: f.coins, wallPoints: f.wallPoints,
    memberShip: f.memberShip.trim(), co: f.co.trim(), gender: f.gender.trim(),
    email: f.email.trim(), msg: f.msg.trim(),
    verified: f.verified, isAdmin: f.isAdmin
  };
  if (f.password.trim()) data.password = f.password.trim();
  admin('edit_user_profile', data);
}
function giveRep() {
  const v = prompt('كم نقطة يُضاف لـ ' + (u.value.topic || '') + '؟', '10');
  if (v) admin('cp_give_rep', { topic: u.value.topic || u.value.username, value: parseInt(v, 10) || 0 });
}
function mute() {
  const ms = prompt('مدة الكتم بالدقائق:', '10');
  if (ms !== null) admin('cp_mute_user', { name: u.value.topic || u.value.username, ms: (parseInt(ms, 10) || 10) * 60000, reason: 'كتم من لوحة التحكم' });
}
function kick() {
  if (ask('طرد ' + (u.value.topic || '') + ' من الاتصال؟')) admin('cp_kick_user', { name: u.value.topic || u.value.username, reason: 'طرد من لوحة التحكم' });
}
function ban() {
  if (ask('حظر ' + (u.value.topic || '') + '؟')) admin('cp_ban_online', { name: u.value.topic || u.value.username, reason: 'حظر من لوحة التحكم' });
}
function del() {
  if (ask('حذف حساب ' + (u.value.topic || '') + ' نهائياً؟')) admin('delete_user', { name: u.value.topic || u.value.username });
}
</script>

<template>
  <UModal v-if="u" :title="'تعديل العضو: ' + (u.topic || '')" wide @close="store.userProfile = null">
    <div class="grid gap-4 sm:grid-cols-2">
      <UField label="اسم المستخدم"><input v-model="f.topic" class="u-input"></UField>
      <UField label="الرتبة">
        <select v-model="f.power" class="u-select">
          <option v-for="p in powerOpts" :key="p" :value="p">{{ p }}</option>
        </select>
      </UField>
    </div>
    <div class="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <UField label="النقاط (rep)"><input v-model.number="f.rep" type="number" class="u-input"></UField>
      <UField label="الإعجابات"><input v-model.number="f.likes" type="number" class="u-input"></UField>
      <UField label="العملات"><input v-model.number="f.coins" type="number" class="u-input"></UField>
      <UField label="نقاط الجدار"><input v-model.number="f.wallPoints" type="number" class="u-input"></UField>
    </div>
    <div class="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <UField label="الاشتراك"><input v-model="f.memberShip" class="u-input"></UField>
      <UField label="الدولة (كود)"><input v-model="f.co" maxlength="3" class="u-input"></UField>
      <UField label="الجنس"><input v-model="f.gender" class="u-input"></UField>
      <UField label="البريد"><input v-model="f.email" dir="ltr" class="u-input"></UField>
    </div>
    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <UField label="الحالة / رسالة"><input v-model="f.msg" maxlength="120" class="u-input"></UField>
      <UField label="كلمة مرور جديدة (اختياري)"><input v-model="f.password" type="password" placeholder="اتركه فارغاً" class="u-input"></UField>
    </div>
    <div class="mt-4 flex flex-wrap gap-6">
      <label class="flex cursor-pointer items-center gap-2 text-xs font-bold text-ink-600">
        <input v-model="f.verified" type="checkbox" class="size-4 accent-indigo-600"> حساب موثق
      </label>
      <label class="flex cursor-pointer items-center gap-2 text-xs font-bold text-ink-600">
        <input v-model="f.isAdmin" type="checkbox" class="size-4 accent-indigo-600"> مشرف عام (isAdmin)
      </label>
    </div>
    <p class="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-400" dir="ltr">
      ID: {{ u.id }} | IP: {{ u.ip || '—' }} | FP: {{ String(u.fp || '').substring(0, 14) || '—' }} | {{ fmtDate(u.lastSeen) }}
    </p>

    <div class="mt-4 flex flex-wrap gap-2">
      <UBtn :icon="Save" @click="save">حفظ العضو</UBtn>
      <UBtn variant="success" size="sm" :icon="Plus" @click="giveRep">إعطاء نقاط</UBtn>
      <UBtn variant="warning" size="sm" :icon="VolumeX" @click="mute">كتم</UBtn>
      <UBtn variant="secondary" size="sm" :icon="Footprints" @click="kick">طرد</UBtn>
      <UBtn variant="danger" size="sm" :icon="Ban" @click="ban">حظر</UBtn>
      <UBtn variant="danger" size="sm" :icon="Trash2" @click="del">حذف الحساب</UBtn>
    </div>

    <h4 class="mt-6 mb-2 text-xs font-extrabold text-ink-800">الأيقونة الفائقة (Super Icon)</h4>
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="a in iconAssets"
        :key="a.url"
        class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors"
        :class="u.superIcon === a.url ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50'"
        @click="admin('assign_super_icon', { userId: u.id, iconUrl: a.url })"
      >
        <img :src="a.url" class="size-4 object-contain" alt="">
        {{ a.name || a.url }} <span v-if="u.superIcon === a.url">✓</span>
      </button>
      <UBtn size="sm" variant="danger" :icon="ImageOff" @click="admin('remove_super_icon', { userId: u.id })">إزالة</UBtn>
    </div>

    <h4 class="mt-6 mb-2 text-xs font-extrabold text-ink-800">الهدايا الممنوحة</h4>
    <div class="mb-2 flex flex-wrap gap-1.5">
      <span v-for="g in gifts" :key="g" class="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-700">
        {{ g }}
        <button class="text-red-500 hover:text-red-700" @click="admin('remove_gift', { userId: u.id, giftUrl: g })">×</button>
      </span>
      <span v-if="!gifts.length" class="text-[11px] text-ink-400">لا هدايا</span>
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="a in giftAssets"
        :key="a.url"
        class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors"
        :class="gifts.includes(a.url) ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50'"
        @click="admin('assign_gift', { userId: u.id, giftUrl: a.url })"
      >
        <img :src="a.url" class="size-4 object-contain" alt="">
        {{ a.name || a.url }} <span v-if="gifts.includes(a.url)">✓</span>
      </button>
    </div>

    <div class="mt-6">
      <UBtn :variant="storyBanned ? 'success' : 'warning'" size="sm" :icon="storyBanned ? Camera : CameraOff" @click="admin('set_story_ban', { userId: String(u.id), banned: !storyBanned })">
        {{ storyBanned ? 'رفع حظر القصص' : 'حظر نشر القصص' }}
      </UBtn>
    </div>
  </UModal>
</template>
