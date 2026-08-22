<script setup>
import { reactive, watch, ref } from 'vue';
import { Plus, Save, Eraser, UserPlus, UserMinus, X } from 'lucide-vue-next';
import { store, admin, refreshState, ask } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UField from '../components/UField.vue';
import UToggle from '../components/UToggle.vue';

const newName = ref('');
const modName = ref('');

const f = reactive({
  name: '', owner: '', password: '', capacity: 0,
  roomLevel: 0, requiredLikes: 0, roomMaxMicSlots: 4, roomDescription: '',
  isActive: true, allowCamera: false, allowBroadcast: false, disableChat: false
});
const editing = ref(null);

watch(() => store.roomProfile, (r) => {
  if (!r) { editing.value = null; return; }
  editing.value = r;
  f.name = r.name || ''; f.owner = r.owner || '';
  f.password = r.password || '';
  f.capacity = r.capacity || 0; f.roomLevel = r.roomLevel || 0;
  f.requiredLikes = r.requiredLikes || 0; f.roomMaxMicSlots = r.roomMaxMicSlots || 4;
  f.roomDescription = r.roomDescription || '';
  f.isActive = !!r.isActive; f.allowCamera = !!r.allowCamera;
  f.allowBroadcast = !!r.allowBroadcast; f.disableChat = !!r.disableChat;
}, { immediate: true, deep: true });

function addRoom() {
  const n = newName.value.trim();
  if (!n) return;
  admin('add_room', { name: n });
  newName.value = '';
}
function editRoom(r) { admin('get_room_profile', { id: r.id }); }
function delRoom(r) {
  if (ask('حذف غرفة ' + r.name + '؟')) admin('delete_room', { id: r.id });
}
function saveRoom() {
  admin('edit_room_full', {
    id: editing.value.id,
    name: f.name, owner: f.owner,
    roomPassword: f.password,
    removePassword: f.password ? 'false' : 'true',
    capacity: f.capacity, roomLevel: f.roomLevel,
    requiredLikes: f.requiredLikes, roomMaxMicSlots: f.roomMaxMicSlots,
    roomDescription: f.roomDescription,
    isActive: f.isActive, allowCamera: f.allowCamera,
    allowBroadcast: f.allowBroadcast, disableChat: f.disableChat
  });
}
function addMod() {
  const n = modName.value.trim();
  if (n) admin('add_room_moderator', { id: editing.value.id, username: n });
}
function delMod() {
  const n = modName.value.trim();
  if (n) admin('del_room_moderator', { id: editing.value.id, username: n });
}
const mods = (r) => (r.moderators || []).map(m => m.username || m.topic || m);
</script>

<template>
  <div>
    <PageHead title="الغرف" sub="إنشاء وتعديل الغرف، المشرفين، وكلمات المرور" @refresh="refreshState()" />

    <UCard title="قائمة الغرف" class="mb-5">
      <form class="mb-4 flex flex-col gap-2 sm:flex-row" @submit.prevent="addRoom">
        <input v-model="newName" class="u-input" placeholder="اسم الغرفة الجديدة">
        <UBtn variant="success" :icon="Plus" @click="addRoom">إضافة غرفة</UBtn>
      </form>
      <div class="overflow-x-auto">
        <table class="u-table">
          <thead><tr><th>الاسم</th><th>المالك</th><th>كلمة مرور</th><th>نشطة</th><th>مقفلة</th><th>إجراءات</th></tr></thead>
          <tbody>
            <tr v-if="!store.rooms.length"><td colspan="6" class="text-center text-xs text-ink-400">لا توجد غرف</td></tr>
            <tr v-for="r in store.rooms" :key="r.id">
              <td class="font-bold">{{ r.name }}</td>
              <td>{{ r.owner || r.roomOwner || '—' }}</td>
              <td>{{ (r.hasPassword || r.password) ? 'موجودة' : '—' }}</td>
              <td>{{ r.isActive ? 'نعم' : 'لا' }}</td>
              <td>{{ r.isLocked ? 'نعم' : 'لا' }}</td>
              <td>
                <div class="flex gap-1.5">
                  <UBtn size="sm" variant="secondary" @click="editRoom(r)">تعديل</UBtn>
                  <UBtn size="sm" variant="danger" @click="delRoom(r)">حذف</UBtn>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard v-if="editing" :title="'تعديل الغرفة: ' + editing.name">
      <template #actions>
        <UBtn size="sm" variant="ghost" :icon="X" @click="store.roomProfile = null">إغلاق</UBtn>
      </template>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UField label="الاسم"><input v-model="f.name" class="u-input"></UField>
        <UField label="المالك"><input v-model="f.owner" class="u-input"></UField>
        <UField label="كلمة المرور (فارغ = إزالة)">
          <input v-model="f.password" :placeholder="editing.hasPassword ? 'موجودة حالياً' : 'لا توجد'" class="u-input">
        </UField>
        <UField label="سعة المكالمات/الكاميرات"><input v-model.number="f.capacity" type="number" class="u-input"></UField>
        <UField label="مستوى الغرفة"><input v-model.number="f.roomLevel" type="number" class="u-input"></UField>
        <UField label="إعجابات مطلوبة"><input v-model.number="f.requiredLikes" type="number" class="u-input"></UField>
        <UField label="أقصى مايكات"><input v-model.number="f.roomMaxMicSlots" type="number" class="u-input"></UField>
        <UField label="الوصف"><input v-model="f.roomDescription" class="u-input"></UField>
      </div>
      <div class="mt-4 flex flex-wrap gap-6">
        <UToggle v-model="f.isActive" label="نشطة" />
        <UToggle v-model="f.allowCamera" label="كاميرا" />
        <UToggle v-model="f.allowBroadcast" label="بث مباشر" />
        <UToggle v-model="f.disableChat" label="تعطيل الدردشة" />
      </div>
      <div class="mt-4">
        <span class="u-label">المشرفون الحاليون:</span>
        <div class="flex flex-wrap items-center gap-1.5">
          <span v-for="m in mods(editing)" :key="m" class="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-700">{{ m }}</span>
          <span v-if="!mods(editing).length" class="text-[11px] text-ink-400">لا يوجد مشرفون</span>
        </div>
      </div>
      <div class="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
        <UField label="اسم المشرف"><input v-model="modName" class="u-input"></UField>
        <UBtn variant="success" size="sm" :icon="UserPlus" @click="addMod">إضافة مشرف</UBtn>
        <UBtn variant="warning" size="sm" :icon="UserMinus" @click="delMod">إزالة مشرف</UBtn>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <UBtn :icon="Save" @click="saveRoom">حفظ الغرفة</UBtn>
        <UBtn variant="secondary" :icon="Eraser" @click="ask('مسح محادثة الغرفة ' + editing.name + '؟') && admin('clear_room_chat', { id: editing.id })">مسح محادثة الغرفة</UBtn>
      </div>
    </UCard>
  </div>
</template>
