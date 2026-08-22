<script setup>
import { RefreshCw, Trash2, Image as ImageIcon } from 'lucide-vue-next';
import { store, admin, ask } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import { X } from 'lucide-vue-next';

const fmtDate = (s) => String(s || '').replace('T', ' ').replace('Z', '').substring(0, 16);
const isBanned = (id) => (store.storyBans || []).includes(String(id));
</script>

<template>
  <div>
    <PageHead title="الجدار والقصص" sub="إدارة منشورات الجدار والقصص وحظر الناشرين" @refresh="admin('get_posts_moderation'); admin('get_stories_moderation'); admin('get_story_bans')" />

    <UCard title="منشورات الجدار" class="mb-5">
      <template #actions>
        <UBtn size="sm" variant="secondary" :icon="RefreshCw" @click="admin('get_posts_moderation'); admin('get_stories_moderation')">تحديث</UBtn>
      </template>
      <div class="overflow-x-auto">
        <table class="u-table">
          <thead><tr><th>المستخدم</th><th>النص</th><th>تفاعل</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>
            <tr v-if="!store.postsMod.length"><td colspan="5" class="text-center text-xs text-ink-400">لا توجد منشورات</td></tr>
            <tr v-for="p in store.postsMod" :key="p.id">
              <td class="font-bold">{{ p.username }}</td>
              <td>{{ (p.text || '').substring(0, 60) }} <ImageIcon v-if="p.mediaUrl" :size="12" class="inline text-ink-400" /></td>
              <td class="text-xs">{{ p.likes || 0 }} إعجاب | {{ p.comments || 0 }} تعليق</td>
              <td class="text-xs text-ink-500">{{ fmtDate(p.createdAt) }}</td>
              <td><UBtn size="sm" variant="danger" @click="ask('حذف منشور ' + (p.username || '') + '؟') && admin('del_post', { postId: p.id })">حذف</UBtn></td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard title="القصص">
      <template #actions>
        <UBtn size="sm" variant="ghost" @click="admin('get_story_bans')">قائمة حظر القصص</UBtn>
      </template>
      <div v-if="store.storyBans.length" class="mb-4 flex flex-wrap items-center gap-1.5">
        <span class="text-[11px] font-bold text-ink-400">محظورو القصص:</span>
        <span v-for="id in store.storyBans" :key="id" class="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600" dir="ltr">
          {{ id }}
          <button @click="admin('set_story_ban', { userId: id, banned: false })"><X :size="11" /></button>
        </span>
      </div>
      <div class="overflow-x-auto">
        <table class="u-table">
          <thead><tr><th>المستخدم</th><th>النص</th><th>مشاهدات</th><th>إعجاب</th><th>التاريخ</th><th>إجراءات</th></tr></thead>
          <tbody>
            <tr v-if="!store.storiesMod.length"><td colspan="6" class="text-center text-xs text-ink-400">لا توجد قصص</td></tr>
            <tr v-for="s in store.storiesMod" :key="s.id">
              <td class="font-bold">{{ s.username }}</td>
              <td>{{ (s.text || '').substring(0, 50) }} <ImageIcon v-if="s.img" :size="12" class="inline text-ink-400" /></td>
              <td>{{ s.views || 0 }}</td>
              <td>{{ s.likes || 0 }}</td>
              <td class="text-xs text-ink-500">{{ fmtDate(s.createdAt) }}</td>
              <td>
                <div class="flex flex-wrap gap-1.5">
                  <UBtn size="sm" :variant="isBanned(s.userId) ? 'success' : 'warning'" @click="admin('set_story_ban', { userId: String(s.userId), banned: !isBanned(s.userId) })">
                    {{ isBanned(s.userId) ? 'رفع حظر القصص' : 'حظر القصص' }}
                  </UBtn>
                  <UBtn size="sm" variant="danger" :icon="Trash2" @click="ask('حذف ستوري ' + (s.username || '') + '؟') && admin('del_story', { storyId: s.id })">حذف</UBtn>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>
