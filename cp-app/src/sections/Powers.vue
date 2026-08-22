<script setup>
import { computed } from 'vue';
import { Save, Plus, Trash2 } from 'lucide-vue-next';
import { store, admin, refreshState, ask } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UField from '../components/UField.vue';

const POWER_FLAGS = [
  ['kick', 'الطرد'], ['delbc', 'حذف البنرات'], ['alert', 'التنبيهات'], ['mynick', 'زخرفة اسمي'],
  ['unick', 'إزالة الزخرفة'], ['ban', 'الحظر'], ['publicmsg', 'رسالة عامة'], ['forcepm', 'فرض الخاص'],
  ['roomowner', 'ملكية غرفة'], ['createroom', 'إنشاء غرف'], ['rooms', 'إدارة الغرف'], ['edituser', 'تعديل الأعضاء'],
  ['setpower', 'منح الرتب'], ['upgrades', 'الترقيات'], ['history', 'سجل الدردشة'], ['cp', 'لوحة التحكم'],
  ['stealth', 'الدخول المخفي'], ['owner', 'المالك'], ['meiut', 'خاص دائم'], ['loveu', 'إهداءات'],
  ['ulike', 'الإعجابات'], ['flter', 'الفلاتر'], ['subs', 'الاشتراكات'], ['shrt', 'الاختصارات'],
  ['msgs', 'رسائل الترحيب'], ['bootedit', 'تعديل البوت'], ['grupes', 'المجموعات'], ['delmsg', 'حذف الرسائل'], ['delpic', 'حذف الصور']
];
const FLAG_KEYS = POWER_FLAGS.map(f => f[0]);
const FLAG_LABELS = Object.fromEntries(POWER_FLAGS);

const sortedPowers = computed(() =>
  store.powers
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (parseInt(a.p.rank, 10) || 0) - (parseInt(b.p.rank, 10) || 0))
);

function savePower(p, idx, evt) {
  const card = evt.target.closest('[data-pw-card]');
  const doc = {
    rank: parseInt(card.querySelector('.pw-rank').value, 10) || 0,
    name: card.querySelector('.pw-name').value.trim(),
    ico: p.ico || ''
  };
  card.querySelectorAll('.pw-flag').forEach(cb => { doc[cb.dataset.key] = cb.checked ? 1 : 0; });
  admin('save_as', { powers: store.powers.map((old, i) => (i === idx ? doc : old)) });
}
function addRank() {
  const maxRank = store.powers.reduce((mx, p) => Math.max(mx, parseInt(p.rank, 10) || 0), 0);
  const blank = {};
  FLAG_KEYS.forEach(k => { blank[k] = 0; });
  const powers = [...store.powers, { name: 'رتبة جديدة', rank: maxRank + 10, ...blank }];
  admin('save_as', { powers });
}
function removeRank(idx) {
  const p = store.powers[idx];
  if (!ask('حذف الرتبة "' + (p.name || '') + '" نهائياً؟')) return;
  admin('save_as', { powers: store.powers.filter((_, j) => j !== idx) });
}
</script>

<template>
  <div>
    <PageHead title="الصلاحيات والرتب" sub="الرتب مرتّبة حسب المستوى، مع إضافة وحذف الرتب — تُحفظ وتُبث مباشرة" @refresh="refreshState()" />

    <div class="mb-4">
      <UBtn variant="success" :icon="Plus" @click="addRank">إضافة رتبة جديدة</UBtn>
    </div>

    <p v-if="!store.powers.length" class="rounded-xl border border-dashed border-ink-300 bg-white p-6 text-center text-xs text-ink-400">لا توجد رتب محملة</p>
    <UCard
      v-for="({ p, i }) in sortedPowers"
      :key="i"
      :title="(p.name || ('رتبة ' + (i + 1))) + ' — مستوى ' + (p.rank || 0)"
      class="mb-4"
    >
      <template #actions>
        <UBtn size="sm" variant="danger" :icon="Trash2" @click="removeRank(i)">حذف الرتبة</UBtn>
      </template>
      <div data-pw-card>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UField label="اسم الرتبة"><input class="pw-name u-input" :value="p.name || ''"></UField>
          <UField label="المستوى (rank)"><input class="pw-rank u-input" type="number" :value="p.rank || 0"></UField>
        </div>
        <span class="u-label mt-4">الصلاحيات:</span>
        <div class="mt-1 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <label v-for="key in FLAG_KEYS" :key="key" class="flex cursor-pointer items-center gap-2 text-[11px] font-bold text-ink-600">
            <input type="checkbox" class="pw-flag size-3.5 accent-indigo-600" :data-key="key" :checked="!!p[key]">
            {{ FLAG_LABELS[key] }}
          </label>
        </div>
        <UBtn class="mt-4" size="sm" :icon="Save" @click="savePower(p, i, $event)">حفظ هذه الرتبة</UBtn>
      </div>
    </UCard>
  </div>
</template>
