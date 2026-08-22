<script setup>
import { reactive, watch } from 'vue';
import { Save } from 'lucide-vue-next';
import { store, admin, refreshState } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UField from '../components/UField.vue';
import UToggle from '../components/UToggle.vue';
import ImageTile from '../components/ImageTile.vue';

const COLOR_DEFAULTS = {
  mainUiColor: '#794e4e', landingBgColor: '#3b3a3a', chatInputBg: '#794e4e',
  unifiedBtnBg: '#4c0d21', unifiedBtnHoverBg: '#3b0d1b', micIconColor: '#e8dcd4',
  micBtnBgColor: '#4c0d21', lineIconColor: '#e8dcd4', tickerBgColor: '#4c0d21', tickerTextColor: '#e8dcd4'
};

const FLAG_KEYS = ['showBanner', 'showFavicon', 'showDefaultAvatar', 'showOverlayImage', 'showPrivateTabBg', 'showDefaultRoom', 'enableCustomCover', 'showStatusOnLanding'];
const FLAG_LABELS = {
  showBanner: 'إظهار البنر',
  showFavicon: 'إظهار الشعار (الفافيكون)',
  showDefaultAvatar: 'الصورة الافتراضية للأعضاء',
  showOverlayImage: 'صورة الخلفية الزخرفية (أوفرلاي)',
  showPrivateTabBg: 'خلفية تبويب الخاص',
  showDefaultRoom: 'صورة الغرفة الافتراضية',
  enableCustomCover: 'غلاف الملف الشخصي المخصص',
  showStatusOnLanding: 'إظهار الحالة في الصفحة الرئيسية'
};

const MEDIA_TILES = [
  { kind: 'overlay_image', key: 'overlayImageUrl', label: 'صورة الأوفرلاي (خلفية زخرفية)' },
  { kind: 'private_tab_bg', key: 'privateTabBgUrl', label: 'خلفية تبويب الخاص' },
  { kind: 'system_message_image', key: 'defaultSystemMessageImageUrl', label: 'صورة رسائل النظام' },
  { kind: 'default_room', key: 'defaultRoomUrl', label: 'صورة الغرفة الافتراضية' },
  { kind: 'default_cover', key: 'defaultCoverUrl', label: 'غلاف الملف الشخصي' }
];

const f = reactive({
  siteName: '', siteTitle: '', siteDescription: '',
  ...COLOR_DEFAULTS,
  fontFamily: 'Arial, sans-serif', fontSize: 15, fontWeight: 700,
  footerText: '',
  flags: {},
  bannerWidth: '', bannerHeight: ''
});

function flagVal(v) { return v !== false && v !== 'false'; }

watch([() => store.appearance, () => store.seo], ([ap, seo]) => {
  ap = ap || {}; seo = seo || {};
  for (const k of Object.keys(COLOR_DEFAULTS)) f[k] = ap[k] || COLOR_DEFAULTS[k];
  f.fontFamily = ap.fontFamily || 'Arial, sans-serif';
  f.fontSize = ap.fontSize != null ? ap.fontSize : 15;
  f.fontWeight = ap.fontWeight != null ? ap.fontWeight : 700;
  f.footerText = ap.footerText || '';
  const fl = {};
  for (const k of FLAG_KEYS) fl[k] = flagVal(ap[k]);
  f.flags = fl;
  f.bannerWidth = ap.bannerWidth != null ? ap.bannerWidth : '';
  f.bannerHeight = ap.bannerHeight != null ? ap.bannerHeight : '';
  f.siteName = seo.siteName || ''; f.siteTitle = seo.siteTitle || ''; f.siteDescription = seo.siteDescription || '';
}, { immediate: true, deep: true });

function save() {
  const payload = {
    mainUiColor: f.mainUiColor, landingBgColor: f.landingBgColor,
    chatInputBg: f.chatInputBg, unifiedBtnBg: f.unifiedBtnBg,
    unifiedBtnHoverBg: f.unifiedBtnHoverBg, micIconColor: f.micIconColor,
    micBtnBgColor: f.micBtnBgColor, lineIconColor: f.lineIconColor,
    tickerBgColor: f.tickerBgColor, tickerTextColor: f.tickerTextColor,
    fontFamily: f.fontFamily,
    fontSize: parseInt(f.fontSize, 10), fontWeight: parseInt(f.fontWeight, 10),
    footerText: f.footerText.trim(),
    bannerWidth: f.bannerWidth === '' ? null : parseInt(f.bannerWidth, 10),
    bannerHeight: f.bannerHeight === '' ? null : parseInt(f.bannerHeight, 10)
  };
  for (const k of FLAG_KEYS) payload[k] = !!f.flags[k];
  admin('save_appearance', payload);
  admin('save_seo', { siteName: f.siteName, siteTitle: f.siteTitle, siteDescription: f.siteDescription });
}
</script>

<template>
  <div>
    <PageHead title="المظهر والألوان" sub="ألوان الواجهة والخطوط ونصوص الصفحة الرئيسية — تنطبق فوراً" @refresh="refreshState()" />

    <UCard title="نصوص الواجهة الرئيسية" class="mb-5">
      <p class="mb-3 text-[11px] text-ink-400">تظهر في الصفحة الرئيسية وتُستخدم كعناوين SEO (H1 والوصف التعريفي).</p>
      <div class="grid gap-4 sm:grid-cols-2">
        <UField label="اسم الموقع (الشريط العلوي)"><input v-model="f.siteName" class="u-input"></UField>
        <UField label="العنوان الرئيسي H1"><input v-model="f.siteTitle" class="u-input"></UField>
      </div>
      <UField label="الوصف الافتتاحي (يظهر تحت العنوان ويُستخدم في وصف جوجل)" class="mt-4 block">
        <textarea v-model="f.siteDescription" rows="3" class="u-textarea"></textarea>
      </UField>
      <p class="mt-2 text-[11px] text-ink-400">نصيحة SEO: اجعل الوصف 120–160 حرفاً، يتضمن كلمات مفتاحية مهمة بشكل طبيعي.</p>
    </UCard>

    <UCard title="ألوان الموقع والخطوط" class="mb-5">
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <UField label="اللون الرئيسي"><input v-model="f.mainUiColor" type="color"></UField>
        <UField label="خلفية الواجهة"><input v-model="f.landingBgColor" type="color"></UField>
        <UField label="خلفية إدخال الدردشة"><input v-model="f.chatInputBg" type="color"></UField>
        <UField label="لون الأزرار"><input v-model="f.unifiedBtnBg" type="color"></UField>
        <UField label="الأزرار عند المرور"><input v-model="f.unifiedBtnHoverBg" type="color"></UField>
        <UField label="لون أيقونة المايك"><input v-model="f.micIconColor" type="color"></UField>
        <UField label="خلفية زر المايك"><input v-model="f.micBtnBgColor" type="color"></UField>
        <UField label="لون الأيقونات"><input v-model="f.lineIconColor" type="color"></UField>
        <UField label="خلفية شريط التنبيهات"><input v-model="f.tickerBgColor" type="color"></UField>
        <UField label="نص شريط التنبيهات"><input v-model="f.tickerTextColor" type="color"></UField>
        <UField label="الخط"><input v-model="f.fontFamily" placeholder="Arial, sans-serif" class="u-input"></UField>
        <UField label="حجم الخط / الوزن">
          <div class="flex gap-2">
            <input v-model.number="f.fontSize" type="number" min="10" max="24" class="u-input">
            <input v-model.number="f.fontWeight" type="number" min="300" max="900" step="100" class="u-input">
          </div>
        </UField>
      </div>
      <UField label="نص الفوتر (أسفل الصفحة الرئيسية — فارغ = النص الافتراضي)" class="mt-4 block">
        <input v-model="f.footerText" placeholder="شات درر © 2026 — دردشة خليجية وعربية مجانية" class="u-input">
      </UField>
    </UCard>

    <UCard title="إظهار وإخفاء عناصر الموقع" class="mb-5">
      <p class="mb-4 text-[11px] text-ink-400">تُطبق فوراً على جميع المتصلين بعد الحفظ.</p>
      <div class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <UToggle v-for="(label, key) in FLAG_LABELS" :key="key" v-model="f.flags[key]" :label />
      </div>
      <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UField label="عرض البنر (بكسل) — فارغ = تلقائي"><input v-model="f.bannerWidth" type="number" min="0" class="u-input"></UField>
        <UField label="ارتفاع البنر (بكسل) — فارغ = تلقائي"><input v-model="f.bannerHeight" type="number" min="0" class="u-input"></UField>
      </div>
    </UCard>

    <UCard title="صور وخلفيات إضافية">
      <p class="mb-4 text-[11px] text-ink-400">تُرفع مباشرة وتُطبق على جميع المتصلين فوراً بدون تحديث.</p>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <ImageTile
          v-for="t in MEDIA_TILES"
          :key="t.kind"
          :src="store.appearance[t.key] || ''"
          :label="t.label"
          :kind="t.kind"
        />
      </div>
    </UCard>

    <UBtn class="mt-5" size="lg" :icon="Save" @click="save">حفظ كل إعدادات المظهر</UBtn>
  </div>
</template>
