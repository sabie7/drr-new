<script setup>
import { RefreshCw } from 'lucide-vue-next';
import { store, admin, ask } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';

function mute(u) {
  const ms = prompt('مدة كتم ' + u.username + ' بالدقائق:', '10');
  if (ms !== null) admin('cp_mute_user', { name: u.username, roomId: u.roomid, ms: (parseInt(ms, 10) || 10) * 60000, reason: 'كتم من لوحة التحكم' });
}
function unmute(u) { admin('cp_unmute_user', { name: u.username, roomId: u.roomid }); }
function kick(u) {
  if (ask('طرد ' + u.username + '؟')) admin('cp_kick_user', { name: u.username, reason: 'طرد من لوحة التحكم' });
}
function ban(u) {
  if (ask('حظر ' + u.username + '؟')) admin('cp_ban_online', { name: u.username, reason: 'حظر من لوحة التحكم' });
}
</script>

<template>
  <div>
    <PageHead title="المتصلون الآن" sub="طرد، كتم، رفع كتم، أو حظر أي متصل" @refresh="admin('get_online_users')" />
    <UCard title="قائمة المتصلين">
      <template #actions>
        <UBtn size="sm" variant="secondary" :icon="RefreshCw" @click="admin('get_online_users')">تحديث</UBtn>
      </template>
      <div class="overflow-x-auto">
        <table class="u-table">
          <thead><tr><th>الاسم</th><th>النوع</th><th>الغرفة</th><th>IP</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            <tr v-if="!store.online.length"><td colspan="6" class="text-center text-xs text-ink-400">لا يوجد متصلون حالياً</td></tr>
            <tr v-for="u in store.online" :key="u.id || u.username">
              <td class="font-bold">
                {{ u.username }}
                <span v-if="u.guest" class="ms-1 rounded-full bg-ink-100 px-2 py-0.5 text-[9px] font-extrabold text-ink-500">زائر</span>
              </td>
              <td>{{ u.power || 'user' }}</td>
              <td>{{ u.roomName || '—' }}</td>
              <td dir="ltr" class="text-xs text-ink-500">{{ u.ip || '—' }}</td>
              <td>
                <span :class="u.idle ? 'text-ink-400' : 'font-bold text-emerald-600'">{{ u.idle ? 'خامل' : 'نشط' }}</span>
              </td>
              <td>
                <div class="flex flex-wrap gap-1.5">
                  <UBtn size="sm" variant="warning" @click="mute(u)">كتم</UBtn>
                  <UBtn size="sm" variant="ghost" @click="unmute(u)">رفع الكتم</UBtn>
                  <UBtn size="sm" variant="secondary" @click="kick(u)">طرد</UBtn>
                  <UBtn size="sm" variant="danger" @click="ban(u)">حظر</UBtn>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>
