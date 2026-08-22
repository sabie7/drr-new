<script setup>
import { reactive, watch } from 'vue';
import { Save } from 'lucide-vue-next';
import { store, admin } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UField from '../components/UField.vue';
import UToggle from '../components/UToggle.vue';

const FEATURES_BOOLS = [
  ['storiesEnabled', 'القصص'], ['wallEnabled', 'الجدار'], ['privateTabEnabled', 'الخاص'],
  ['roomsEnabled', 'الغرف'], ['voiceEnabled', 'الصوت'], ['gamesEnabled', 'الألعاب'],
  ['zajelEnabled', 'الزاجل'], ['quickChatEnabled', 'الدردشة السريعة'], ['profilesEnabled', 'الملفات الشخصية'],
  ['giftsEnabled', 'الهدايا'], ['liveBroadcastEnabled', 'البث المباشر'], ['battleChallengesEnabled', 'تحديات المعارك'],
  ['publicMessageDeletionEnabled', 'حذف الرسائل العامة'], ['publicMessageReplyEnabled', 'الرد على الرسائل'],
  ['statusColorEnabled', 'ألوان الحالة'], ['profileLightboxEnabled', 'عرض الصور المكبر'],
  ['mentionsEnabled', 'المنشن (@)'], ['sidebarAddonsEnabled', 'إضافات القائمة الجانبية'],
  ['sidebarMemberSearchEnabled', 'بحث الأعضاء'], ['wallPostCommentsEnabled', 'تعليقات الجدار'],
  ['wallPostLikesEnabled', 'إعجابات الجدار'], ['wallYoutubeBarEnabled', 'شريط يوتيوب'],
  ['disableCopy', 'منع النسخ'], ['disableRightClick', 'منع الزر الأيمن'],
  ['cameraEnabled', 'الكاميرا'], ['storySidebarIndicatorEnabled', 'مؤشر القصص في القائمة']
];

const f = reactive({ bools: {}, likes_notifications: 20, likes_effects: 100 });

watch(() => store.features, (ft) => {
  ft = ft || {};
  const b = {};
  for (const [key] of FEATURES_BOOLS) b[key] = ft[key] === undefined ? true : !!ft[key];
  f.bools = b;
  f.likes_notifications = ft.likes_notifications != null ? ft.likes_notifications : 20;
  f.likes_effects = ft.likes_effects != null ? ft.likes_effects : 100;
}, { immediate: true, deep: true });

function save() {
  admin('set_features', { ...f.bools, likes_notifications: parseInt(f.likes_notifications, 10) || 0, likes_effects: parseInt(f.likes_effects, 10) || 0 });
}
</script>

<template>
  <div>
    <PageHead title="الميزات" sub="تشغيل أو تعطيل ميزات الدردشة — تُطبق فوراً على جميع المتصلين بدون تحديث" @refresh="admin('get_features')" />

    <UCard title="مفاتيح الميزات" class="mb-5">
      <p class="mb-4 text-[11px] text-ink-400">التعطيل يخفي الميزة من الواجهة ويمنع استخدامها من العميل.</p>
      <div class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        <UToggle v-for="[key, label] in FEATURES_BOOLS" :key="key" v-model="f.bools[key]" :label />
      </div>
      <UBtn class="mt-5" :icon="Save" @click="save">حفظ الميزات</UBtn>
    </UCard>

    <UCard title="حدود الإعجابات">
      <div class="grid gap-4 sm:grid-cols-2">
        <UField label="حد إعجابات التنبيهات (likes_notifications)">
          <input v-model.number="f.likes_notifications" type="number" min="0" class="u-input">
        </UField>
        <UField label="حد إعجابات التأثيرات (likes_effects)">
          <input v-model.number="f.likes_effects" type="number" min="0" class="u-input">
        </UField>
      </div>
      <UBtn class="mt-5" :icon="Save" @click="save">حفظ الحدود</UBtn>
    </UCard>
  </div>
</template>
