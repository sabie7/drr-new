<script setup>
import { RefreshCw } from 'lucide-vue-next';
import { store, admin } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';

const fmtDate = (s) => String(s || '').replace('T', ' ').replace('Z', '').substring(0, 16);
const shortObj = (o) => {
  if (o === null || o === undefined) return '—';
  const s = typeof o === 'string' ? o : JSON.stringify(o);
  return s.length > 50 ? s.substring(0, 50) + '…' : s;
};
</script>

<template>
  <div>
    <PageHead title="سجل الإجراءات" sub="كل عملية تتم من اللوحة مسجلة هنا" @refresh="admin('get_auditlog')" />
    <UCard title="آخر الإجراءات">
      <template #actions>
        <UBtn size="sm" variant="secondary" :icon="RefreshCw" @click="admin('get_auditlog')">تحديث</UBtn>
      </template>
      <div class="overflow-x-auto">
        <table class="u-table">
          <thead><tr><th>التاريخ</th><th>المنفذ</th><th>الإجراء</th><th>الهدف</th><th>قبل</th><th>بعد</th></tr></thead>
          <tbody>
            <tr v-if="!store.audit.length"><td colspan="6" class="text-center text-xs text-ink-400">لا سجلات بعد</td></tr>
            <tr v-for="(e, i) in store.audit.slice(0, 150)" :key="i">
              <td class="whitespace-nowrap text-xs text-ink-500">{{ fmtDate(e.when) }}</td>
              <td>{{ e.actor || '—' }}</td>
              <td><code class="rounded bg-ink-100 px-1.5 py-0.5 text-[11px]" dir="ltr">{{ e.action }}</code></td>
              <td>{{ e.target || '—' }}</td>
              <td dir="ltr" class="max-w-[10rem] truncate text-[11px] text-ink-500">{{ shortObj(e.before) }}</td>
              <td dir="ltr" class="max-w-[10rem] truncate text-[11px] text-ink-500">{{ shortObj(e.after) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>
