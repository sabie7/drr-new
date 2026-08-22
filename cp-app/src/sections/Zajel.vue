<script setup>
import { ref } from 'vue';
import { Plus, Trash2, Check, Send } from 'lucide-vue-next';
import { store, admin, ask } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';

const newMsg = ref('');

function publish() {
  const v = newMsg.value.trim();
  if (!v) return;
  admin('zajel_cp_add', { message: v });
  newMsg.value = '';
}
</script>

<template>
  <div>
    <PageHead title="الزاجل" sub="رسائل الزاجل المعتمدة والرسائل المنتظرة للمراجعة" @refresh="admin('zajel_cp_list')" />

    <UCard title="نشر رسالة مباشرة" class="mb-5">
      <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="publish">
        <input v-model="newMsg" maxlength="150" class="u-input" placeholder="نص رسالة الزاجل...">
        <UBtn variant="success" :icon="Send" @click="publish">نشر</UBtn>
      </form>
    </UCard>

    <UCard :title="`الرسائل المعتمدة (${store.zajel.approved.length})`" class="mb-5">
      <template #actions>
        <UBtn size="sm" variant="danger" :icon="Trash2" @click="ask('مسح جميع الرسائل المعتمدة؟') && admin('zajel_cp_clear', { list: 'approved' })">مسح الكل</UBtn>
      </template>
      <div class="overflow-x-auto">
        <table class="u-table">
          <thead><tr><th>#</th><th>الرسالة</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!store.zajel.approved.length"><td colspan="3" class="text-center text-xs text-ink-400">لا رسائل معتمدة</td></tr>
            <tr v-for="m in store.zajel.approved" :key="m.id">
              <td class="text-ink-400">{{ m.id }}</td>
              <td>{{ m.message }}</td>
              <td><UBtn size="sm" variant="danger" @click="admin('zajel_cp_del', { id: m.id, list: 'approved' })">حذف</UBtn></td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard :title="`قيد المراجعة (${store.zajel.pending.length})`">
      <template #actions>
        <UBtn size="sm" variant="danger" :icon="Trash2" @click="ask('مسح جميع الرسائل المنتظرة؟') && admin('zajel_cp_clear', { list: 'pending' })">مسح الكل</UBtn>
      </template>
      <div class="overflow-x-auto">
        <table class="u-table">
          <thead><tr><th>#</th><th>الكاتب</th><th>الرسالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            <tr v-if="!store.zajel.pending.length"><td colspan="4" class="text-center text-xs text-ink-400">لا رسائل منتظرة</td></tr>
            <tr v-for="m in store.zajel.pending" :key="m.id">
              <td class="text-ink-400">{{ m.id }}</td>
              <td class="font-bold">{{ m.username }}</td>
              <td>{{ m.message }}</td>
              <td>
                <div class="flex gap-1.5">
                  <UBtn size="sm" variant="success" :icon="Check" @click="admin('zajel_cp_approve', { id: m.id })">موافقة</UBtn>
                  <UBtn size="sm" variant="danger" @click="admin('zajel_cp_del', { id: m.id, list: 'pending' })">حذف</UBtn>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>
