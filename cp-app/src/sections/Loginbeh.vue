<script setup>
import { reactive, watch } from 'vue';
import { Save } from 'lucide-vue-next';
import { store, admin, refreshState } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UField from '../components/UField.vue';
import UToggle from '../components/UToggle.vue';

const f = reactive({
  behavior: 'default_room',
  openUsersTabOnLogin: false,
  lowLikesRoomId: 0,
  lowLikesMaxLikes: 0
});

watch(() => store.loginBehavior, (l) => {
  l = l || {};
  f.behavior = l.behavior || 'default_room';
  f.openUsersTabOnLogin = !!l.openUsersTabOnLogin;
  f.lowLikesRoomId = parseInt(l.lowLikesRoomId, 10) || 0;
  f.lowLikesMaxLikes = parseInt(l.lowLikesMaxLikes, 10) || 0;
}, { immediate: true, deep: true });

function save() {
  admin('set_login_behavior', {
    behavior: f.behavior,
    openUsersTabOnLogin: f.openUsersTabOnLogin,
    lowLikesRoomId: parseInt(f.lowLikesRoomId, 10) || 0,
    lowLikesMaxLikes: parseInt(f.lowLikesMaxLikes, 10) || 0
  });
}
</script>

<template>
  <div>
    <PageHead title="سلوك الدخول" sub="ماذا يحدث بعد دخول العضو للدردشة وتوجيه الأعضاء الجدد تلقائياً" @refresh="refreshState(); admin('get_login_behavior')" />
    <UCard>
      <div class="grid items-end gap-4 sm:grid-cols-2">
        <UField label="بعد الدخول">
          <select v-model="f.behavior" class="u-select">
            <option value="default_room">دخول غرفة تلقائياً (حسب الإعدادات أدناه)</option>
            <option value="lobby">البقاء في اللوبي (بدون غرفة)</option>
          </select>
        </UField>
        <div class="pb-1"><UToggle v-model="f.openUsersTabOnLogin" label="فتح قائمة الأعضاء بعد الدخول" /></div>
      </div>

      <div class="mt-6 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
        <h4 class="mb-1 text-xs font-extrabold text-ink-800">توجيه العضو الجديد بدون إعجابات</h4>
        <p class="mb-4 text-[11px] leading-relaxed text-ink-500">
          عند دخول عضو عدد إعجاباته أقل من الحد المحدد، يُوجَّه تلقائياً إلى الغرفة التي تختارها هنا بدل الغرفة العامة.
          اترك القيمة صفر لتعطيل التوجيه.
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          <UField label="غرفة الأعضاء الجدد">
            <select v-model.number="f.lowLikesRoomId" class="u-select">
              <option :value="0">معطّل — الغرفة العامة</option>
              <option v-for="r in store.rooms" :key="r.id" :value="parseInt(r.id, 10)">{{ r.name }}</option>
            </select>
          </UField>
          <UField label="الحد الأقصى للإعجابات للتوجيه" hint="مثال: 50 → أي عضو بأقل من 50 إعجاب يُوجَّه للغرفة المحددة">
            <input v-model.number="f.lowLikesMaxLikes" type="number" min="0" class="u-input">
          </UField>
        </div>
      </div>

      <UBtn class="mt-5" :icon="Save" @click="save">حفظ سلوك الدخول</UBtn>
    </UCard>
  </div>
</template>
