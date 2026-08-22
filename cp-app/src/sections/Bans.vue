<script setup>
import { ref, watch } from 'vue';
import { Plus, Save } from 'lucide-vue-next';
import { store, admin, refreshState } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UField from '../components/UField.vue';

const BROWSERS = { browser_all: 'الكل (حظر كل المتصفحات)', browser1: 'Chrome', browser2: 'Firefox', browser3: 'Safari', browser4: 'Opera', browser6: 'Edge', browser_other: 'متصفحات أخرى / غير معروفة' };
const SYSTEMS = { system_all: 'الكل (حظر كل الأنظمة)', system1: 'Windows', system2: 'Linux', system3: 'Android', system4: 'iOS', system5: 'Mac OS', system_other: 'أنظمة أخرى / غير معروفة' };

const val = ref('');
const reason = ref('');
const bb = ref({});
const so = ref({});

watch(() => store.bans, () => {
  const b = {}, s = {};
  for (const k of Object.keys(BROWSERS)) b[k] = store.bans?.browsers?.[k] === true;
  for (const k of Object.keys(SYSTEMS)) s[k] = store.bans?.systems?.[k] === true;
  bb.value = b;
  so.value = s;
}, { immediate: true, deep: true });

function addBan() {
  const v = val.value.trim();
  if (!v) return;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(v);
  admin('save_band', { fp: isIp ? '' : v, ip: isIp ? v : '', reason: reason.value.trim() || 'حظر يدوي' });
  val.value = '';
}
function unban(b) {
  admin('delete_band', { fp: b.device_band || '', ip: b.ip_band || '' });
}
function saveBrowsers() { admin('save_browser_bans', { browser: { ...bb.value } }); }
function saveSystems() { admin('save_system_bans', { os: { ...so.value } }); }
</script>

<template>
  <div>
    <PageHead title="الحظر" sub="حظر الأجهزة وعناوين IP والمتصفحات وأنظمة التشغيل — يُطبق فوراً عند الدخول" @refresh="refreshState()" />

    <UCard title="حظر يدوي (جهاز أو IP)" class="mb-5">
      <p class="mb-3 text-[11px] text-ink-400">اكتب عنوان IP لحظر العنوان، أو معرف الجهاز (fp) لحظر الجهاز بالكامل حتى لو غيّر متصفحه.</p>
      <div class="grid items-end gap-4 sm:grid-cols-3">
        <UField label="عنوان IP أو معرف الجهاز"><input v-model="val" dir="ltr" class="u-input" @keydown.enter="addBan"></UField>
        <UField label="السبب (اختياري)"><input v-model="reason" class="u-input"></UField>
        <UBtn variant="danger" :icon="Plus" @click="addBan">حظر</UBtn>
      </div>
      <div class="mt-5 overflow-x-auto">
        <table class="u-table">
          <thead><tr><th>القيمة المحظورة</th><th>النوع</th><th>التاريخ</th><th>السبب</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!store.bands.length"><td colspan="5" class="text-center text-xs text-ink-400">لا يوجد حظر</td></tr>
            <tr v-for="b in store.bands" :key="b._id || b.id || b.device_band || b.ip_band">
              <td><code class="rounded bg-ink-100 px-1.5 py-0.5 text-[11px]" dir="ltr">{{ b.device_band || b.ip_band }}</code></td>
              <td>{{ b.device_band ? 'جهاز' : 'IP' }}</td>
              <td class="text-xs text-ink-500">{{ String(b.date || '').replace('T', ' ').replace('Z', '').substring(0, 16) }}</td>
              <td>{{ b.name_band || '' }}</td>
              <td><UBtn size="sm" variant="danger" @click="unban(b)">إلغاء</UBtn></td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard title="حظر متصفحات" class="mb-5">
      <p class="mb-3 text-[11px] text-ink-400">يُمنع الدخول من المتصفح المحظور فوراً. «متصفحات أخرى» تشمل أي متصفح غير معروف أو نادر.</p>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <label v-for="(label, key) in BROWSERS" :key="key" class="flex cursor-pointer items-center gap-2 text-xs font-bold text-ink-600">
          <input v-model="bb[key]" type="checkbox" class="size-4 accent-indigo-600"> {{ label }}
        </label>
      </div>
      <UBtn class="mt-4" size="sm" :icon="Save" @click="saveBrowsers">حفظ حظر المتصفحات</UBtn>
    </UCard>

    <UCard title="حظر أنظمة تشغيل">
      <p class="mb-3 text-[11px] text-ink-400">يُمنع الدخول من النظام المحظور فوراً. «أنظمة أخرى» تشمل أي نظام غير معروف.</p>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <label v-for="(label, key) in SYSTEMS" :key="key" class="flex cursor-pointer items-center gap-2 text-xs font-bold text-ink-600">
          <input v-model="so[key]" type="checkbox" class="size-4 accent-indigo-600"> {{ label }}
        </label>
      </div>
      <UBtn class="mt-4" size="sm" :icon="Save" @click="saveSystems">حفظ حظر الأنظمة</UBtn>
    </UCard>
  </div>
</template>
