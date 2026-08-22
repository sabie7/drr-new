<script setup>
import { reactive, watch } from 'vue';
import { Save, Plus, Trash2 } from 'lucide-vue-next';
import { store, admin } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UField from '../components/UField.vue';
import UToggle from '../components/UToggle.vue';

const news = reactive({ enabled: false, text: '', bgColor: '#ff0000', textColor: '#ffffff' });
const ads = reactive({ enabled: false, speed: 30, bgColor: '#fff8e1', textColor: '#4b3600', rows: [] });

watch(() => store.tickers, (t) => {
  t = t || {};
  const n = t.news || {};
  news.enabled = !!n.enabled; news.text = n.text || '';
  news.bgColor = n.bgColor || '#ff0000'; news.textColor = n.textColor || '#ffffff';
  const a = t.ads || {};
  const st = a.settings || {};
  ads.enabled = !!st.enabled; ads.speed = st.speed != null ? st.speed : 30;
  ads.bgColor = st.bgColor || '#fff8e1'; ads.textColor = st.textColor || '#4b3600';
  ads.rows = (a.ads || []).map(x => ({ content: x.content || '', linkUrl: x.linkUrl || '' }));
}, { immediate: true, deep: true });

function saveNews() {
  admin('set_news_ticker', { enabled: news.enabled, text: news.text.trim(), bgColor: news.bgColor, textColor: news.textColor });
}
function saveAds() {
  admin('set_ads_ticker', {
    settings: { enabled: ads.enabled, speed: parseInt(ads.speed, 10) || 30, bgColor: ads.bgColor, textColor: ads.textColor },
    ads: ads.rows.filter(r => r.content.trim()).map(r => ({ content: r.content.trim(), linkUrl: r.linkUrl.trim() }))
  });
}
</script>

<template>
  <div>
    <PageHead title="الشرائط الإخبارية" sub="الشريط الإخباري وشريط إعلانات الإدارة — تُطبق عند تحديث الصفحة" @refresh="admin('get_tickers')" />

    <UCard title="الشريط الإخباري" class="mb-5">
      <UToggle v-model="news.enabled" label="تفعيل الشريط" />
      <UField label="النص" class="mt-4 block"><textarea v-model="news.text" rows="2" placeholder="نص الخبر المتحرك..." class="u-textarea"></textarea></UField>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <UField label="لون الخلفية"><input v-model="news.bgColor" type="color"></UField>
        <UField label="لون النص"><input v-model="news.textColor" type="color"></UField>
      </div>
      <p class="mt-3 text-[11px] text-ink-400">ملاحظة: ألوان المظهر العامة (tickerBgColor) قد تتغلب على هذه الألوان إن ضُبطت.</p>
      <UBtn class="mt-4" :icon="Save" @click="saveNews">حفظ الشريط</UBtn>
    </UCard>

    <UCard title="شريط إعلانات الإدارة">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="flex items-end pb-1"><UToggle v-model="ads.enabled" label="تفعيل" /></div>
        <UField label="السرعة (ثواني)"><input v-model.number="ads.speed" type="number" min="5" max="300" class="u-input"></UField>
        <UField label="لون الخلفية"><input v-model="ads.bgColor" type="color"></UField>
        <UField label="لون النص"><input v-model="ads.textColor" type="color"></UField>
      </div>
      <div class="mt-5 space-y-3">
        <div v-for="(row, i) in ads.rows" :key="i" class="grid items-end gap-3 rounded-xl border border-ink-200/70 bg-ink-50/40 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <UField label="نص الإعلان"><input v-model="row.content" maxlength="300" class="u-input"></UField>
          <UField label="رابط (اختياري)"><input v-model="row.linkUrl" dir="ltr" class="u-input"></UField>
          <UBtn variant="danger" size="sm" :icon="Trash2" @click="ads.rows.splice(i, 1)">حذف</UBtn>
        </div>
        <p v-if="!ads.rows.length" class="text-[11px] text-ink-400">لا إعلانات</p>
      </div>
      <div class="mt-4 flex gap-2">
        <UBtn variant="success" size="sm" :icon="Plus" @click="ads.rows.push({ content: '', linkUrl: '' })">إضافة إعلان</UBtn>
        <UBtn :icon="Save" @click="saveAds">حفظ الشريط</UBtn>
      </div>
    </UCard>
  </div>
</template>
