<script setup>
import { ref, onMounted, watch } from 'vue';
import { Trash2, PackagePlus, ArchiveRestore, RefreshCcwDot, Search } from 'lucide-vue-next';
import { store, admin, fmtDate, ask } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';

const search = ref('');
let debounceT = null;

function loadFps() {
  admin('get_fps', { search: search.value.trim() });
}
function onSearch() {
  clearTimeout(debounceT);
  debounceT = setTimeout(loadFps, 350);
}
onMounted(loadFps);
watch(() => store.authed, (v) => { if (v) loadFps(); });
</script>

<template>
  <div>
    <PageHead title="أدوات وسجلات الدخول" sub="نسخ احتياطي، مسح السجلات، وسجل أجهزة الأعضاء" @refresh="admin('get_fps', {})" />

    <UCard title="أدوات النظام" class="mb-5">
      <div class="flex flex-wrap gap-2">
        <UBtn variant="danger" size="sm" :icon="Trash2" @click="ask('حذف سجل الدخول (البصمات) بالكامل؟') && admin('delete_fps')">حذف سجل الدخول (البصمات)</UBtn>
        <UBtn variant="danger" size="sm" :icon="Trash2" @click="ask('حذف سجل الإجراءات بالكامل؟') && admin('delete_actions')">حذف سجل الإجراءات</UBtn>
        <UBtn variant="success" size="sm" :icon="PackagePlus" @click="admin('backup')">نسخة احتياطية</UBtn>
        <UBtn variant="secondary" size="sm" :icon="ArchiveRestore" @click="ask('استعادة آخر نسخة محفوظة؟') && admin('restore')">استعادة</UBtn>
        <UBtn variant="ghost" size="sm" :icon="RefreshCcwDot" @click="ask('تحديث صفحات جميع المتصلين؟') && admin('reload_site')">تحديث الصفحات</UBtn>
      </div>
    </UCard>

    <UCard title="سجل الدخول (بصمات الأجهزة)">
      <div class="relative">
        <Search :size="15" class="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input v-model="search" class="u-input ps-9" placeholder="بحث بالاسم أو IP أو البصمة..." @input="onSearch">
      </div>
      <div class="mt-4 overflow-x-auto">
        <table class="u-table">
          <thead><tr><th>الاسم</th><th>IP</th><th>الجهاز</th><th>آخر ظهور</th></tr></thead>
          <tbody>
            <tr v-if="!store.fps.length"><td colspan="4" class="text-center text-xs text-ink-400">لا سجلات</td></tr>
            <tr v-for="(l, i) in store.fps" :key="i">
              <td class="font-bold">{{ l.topic || l.username }}</td>
              <td dir="ltr" class="text-xs">{{ l.ip || '—' }}</td>
              <td dir="ltr" class="text-xs text-ink-500">{{ String(l.fp2 || l.fp || '').substring(0, 16) || '—' }}</td>
              <td class="text-xs text-ink-500">{{ fmtDate(l.time) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>
