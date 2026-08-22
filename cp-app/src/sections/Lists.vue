<script setup>
import { ref } from 'vue';
import { Ban, Check, Plus, Trash2, X } from 'lucide-vue-next';
import { store, admin, refreshState } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UField from '../components/UField.vue';

const fltr = ref('');
const msgTitle = ref('');
const msgBody = ref('');
const shrtName = ref('');
const shrtValue = ref('');
const subsUser = ref('');
const subsPower = ref('');
const subsDays = ref('');

function fltrBlock() {
  const v = fltr.value.trim();
  if (!v) return;
  admin('fltr_add', { value: v, type: 'bmsgs' });
  fltr.value = '';
}
function fltrAllow() {
  const v = fltr.value.trim();
  if (!v) return;
  admin('fltr_del', { value: v });
  fltr.value = '';
}
function addMsg(category) {
  if (!msgBody.value.trim()) return;
  admin('msg_add', { category, adresse: msgTitle.value.trim(), msg: msgBody.value.trim() });
  msgTitle.value = ''; msgBody.value = '';
}
function addShrt() {
  const n = shrtName.value.trim(), v = shrtValue.value.trim();
  if (n && v) {
    admin('shrt_add', { name: n, value: v });
    shrtName.value = ''; shrtValue.value = '';
  }
}
function addSubs() {
  const user = subsUser.value.trim(), power = subsPower.value.trim(), days = subsDays.value.trim();
  if (user && power) {
    admin('subs_add', { iduser: user, topic: user, topic1: user, sub: power, time: days ? days + ' يوم' : '', timeis: Date.now() });
    subsUser.value = ''; subsPower.value = ''; subsDays.value = '';
  }
}
</script>

<template>
  <div>
    <PageHead title="فلاتر ورسائل وقوائم" sub="كلمات الفلتر، الاختصارات، رسائل الترحيب واليومية، الاشتراكات — تُطبق على الدردشة فوراً" @refresh="refreshState()" />

    <UCard title="الاختصارات" class="mb-5">
      <p class="mb-4 text-[11px] text-ink-400">عند كتابة اسم الاختصار في الدردشة يُستبدل تلقائياً بقيمته. مثال: الموقع ← https://example.com</p>
      <div class="grid items-end gap-3 sm:grid-cols-3">
        <UField label="الاختصار"><input v-model="shrtName" class="u-input"></UField>
        <UField label="القيمة"><input v-model="shrtValue" class="u-input"></UField>
        <UBtn variant="success" size="sm" :icon="Plus" @click="addShrt">إضافة</UBtn>
      </div>
      <div class="mt-4 flex flex-wrap gap-1.5">
        <span v-for="s in store.shrt" :key="s.name" class="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-700">
          <b dir="ltr">{{ s.name }}</b> = {{ String(s.value || '').substring(0, 24) }}
          <button class="text-red-500 hover:text-red-700" @click="admin('shrt_del', { name: s.name })"><X :size="11" /></button>
        </span>
        <span v-if="!store.shrt.length" class="text-[11px] text-ink-400">لا توجد اختصارات</span>
      </div>
    </UCard>

    <UCard title="كلمات الفلتر" class="mb-5">
      <div class="grid items-end gap-3 sm:grid-cols-3">
        <UField label="كلمة للحظر أو السماح"><input v-model="fltr" class="u-input" @keydown.enter="fltrBlock"></UField>
        <UBtn variant="danger" size="sm" :icon="Ban" @click="fltrBlock">حظر الكلمة</UBtn>
        <UBtn variant="secondary" size="sm" :icon="Check" @click="fltrAllow">سماح / حذف</UBtn>
      </div>
      <div class="mt-4 flex flex-wrap gap-1.5">
        <span v-for="n in store.noletters" :key="n.v || n" class="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-700">
          {{ n.v || n }}
          <button class="text-red-500 hover:text-red-700" @click="admin('fltr_del', { value: n.v || n })"><X :size="11" /></button>
        </span>
        <span v-if="!store.noletters.length" class="text-[11px] text-ink-400">لا توجد كلمات مفلترة</span>
      </div>
    </UCard>

    <UCard title="رسائل الترحيب واليومية" class="mb-5">
      <div class="grid gap-4 sm:grid-cols-2">
        <UField label="العنوان"><input v-model="msgTitle" class="u-input"></UField>
        <UField label="النص"><textarea v-model="msgBody" rows="2" class="u-textarea"></textarea></UField>
      </div>
      <div class="mt-3 flex gap-2">
        <UBtn size="sm" :icon="Plus" @click="addMsg('w')">ترحيب</UBtn>
        <UBtn size="sm" variant="secondary" :icon="Plus" @click="addMsg('d')">يومية</UBtn>
      </div>
      <div class="mt-4 flex flex-wrap gap-1.5">
        <span v-for="(m, i) in store.msgs" :key="i" class="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-700">
          <b>{{ m.category === 'w' ? 'ترحيب' : 'يومية' }}</b>: {{ m.adresse }} — {{ (m.msg || '').substring(0, 40) }}
          <button class="text-red-500 hover:text-red-700" @click="admin('msg_del', { adresse: m.adresse, msg: m.msg })"><X :size="11" /></button>
        </span>
        <span v-if="!store.msgs.length" class="text-[11px] text-ink-400">لا توجد رسائل</span>
      </div>
    </UCard>

    <UCard title="الاشتراكات">
      <div class="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UField label="اسم المستخدم"><input v-model="subsUser" class="u-input"></UField>
        <UField label="اسم الصلاحية"><input v-model="subsPower" class="u-input"></UField>
        <UField label="المدة (أيام)"><input v-model.number="subsDays" type="number" class="u-input"></UField>
        <UBtn variant="success" size="sm" :icon="Plus" @click="addSubs">إضافة</UBtn>
      </div>
      <div class="mt-4 overflow-x-auto">
        <table class="u-table">
          <thead><tr><th>المستخدم</th><th>الصلاحية</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!store.subs.length"><td colspan="4" class="text-center text-xs text-ink-400">لا توجد اشتراكات</td></tr>
            <tr v-for="s in store.subs" :key="s.iduser">
              <td class="font-bold">{{ s.topic || s.topic1 || s.iduser }}</td>
              <td>{{ s.sub }}</td>
              <td class="text-xs text-ink-500">{{ s.time }}</td>
              <td><UBtn size="sm" variant="danger" :icon="Trash2" @click="admin('subs_del', { iduser: s.iduser })">حذف</UBtn></td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>
