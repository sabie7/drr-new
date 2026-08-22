<script setup>
import { ref, computed } from 'vue';
import { Search } from 'lucide-vue-next';
import { store, admin, refreshState, ask } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';

const q = ref('');
const filtered = computed(() => {
  let list = store.users;
  const s = q.value.trim().toLowerCase();
  if (s) list = list.filter(u => String(u.topic || u.username || '').toLowerCase().includes(s));
  return list.slice(0, 200);
});

function openProfile(u) {
  admin('get_user_profile', { topic: u.topic || u.username });
}
function setPower(u) {
  const p = prompt('الرتبة الجديدة لـ ' + (u.topic || u.username) + ':', u.power || 'user');
  if (p) admin('setuserpower', { name: u.topic || u.username, power: p.trim() });
}
function banUser(u) {
  if (ask('حظر ' + (u.topic || u.username) + '؟')) admin('save_band', { fp: u.fp || '', fp2: u.fp2 || '', ip: u.ip || '', reason: 'حظر من لوحة التحكم' });
}
function delUser(u) {
  if (ask('حذف ' + (u.topic || u.username) + ' نهائياً؟')) admin('delete_user', { name: u.topic || u.username });
}
</script>

<template>
  <div>
    <PageHead title="الأعضاء" sub="بحث، تعديل كامل للملف، إضافات وزخارف، حذف، تغيير رتبة" @refresh="admin('get_addons'); refreshState()" />

    <UCard title="بحث" class="mb-5">
      <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="q.trim() && openProfile({ topic: q.trim() })">
        <input v-model="q" class="u-input" placeholder="اسم العضو...">
        <UBtn :icon="Search" @click="q.trim() && openProfile({ topic: q.trim() })">بحث</UBtn>
      </form>
    </UCard>

    <UCard :title="`جميع الأعضاء (${store.users.length})`">
      <div class="overflow-x-auto">
        <table class="u-table">
          <thead><tr><th>الاسم</th><th>الرتبة</th><th>النقاط</th><th>IP</th><th>إجراءات</th></tr></thead>
          <tbody>
            <tr v-if="!filtered.length"><td colspan="5" class="text-center text-xs text-ink-400">{{ q ? 'لا نتائج مطابقة' : 'لا يوجد أعضاء' }}</td></tr>
            <tr v-for="u in filtered" :key="u.id || u.topic">
              <td class="font-bold">{{ u.topic || u.username }} <span v-if="u.verified" class="text-emerald-600">✓</span></td>
              <td>{{ u.power || 'user' }}</td>
              <td>{{ u.rep || 0 }} نقطة</td>
              <td dir="ltr" class="text-xs text-ink-500">{{ u.ip || '—' }}</td>
              <td>
                <div class="flex flex-wrap gap-1.5">
                  <UBtn size="sm" variant="secondary" @click="openProfile(u)">تعديل</UBtn>
                  <UBtn size="sm" variant="ghost" @click="setPower(u)">رتبة</UBtn>
                  <UBtn size="sm" variant="warning" @click="banUser(u)">حظر</UBtn>
                  <UBtn size="sm" variant="danger" @click="delUser(u)">حذف</UBtn>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>
