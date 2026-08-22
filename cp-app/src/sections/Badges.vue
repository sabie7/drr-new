<script setup>
import { watch, ref } from 'vue';
import { Save, X } from 'lucide-vue-next';
import { store, admin } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UToggle from '../components/UToggle.vue';
import ImageTile from '../components/ImageTile.vue';

const BADGE_TIERS = [
  [1, 'وسام البداية', 1000], [2, 'وسام التميز', 3000], [3, 'وسام النشاط', 5000],
  [4, 'وسام القوة', 10000], [5, 'وسام النخبة', 20000], [6, 'وسام الأسطورة', 50000]
];

const enabled = ref(false);
watch(() => store.badges, (b) => { enabled.value = !!(b && b.enabled); }, { immediate: true });

function save() {
  admin('set_badges', { ...store.badges, enabled: enabled.value });
}
function clearTier(lv) {
  const badges = { ...(store.badges.badges || {}) };
  delete badges[lv];
  admin('set_badges', { ...store.badges, badges });
}
</script>

<template>
  <div>
    <PageHead title="أوسمة النقاط" sub="صور مخصصة لأوسمة نقاط الجدار الستة في ملف العضو" @refresh="admin('get_badges_cp')" />
    <UCard>
      <UToggle v-model="enabled" label="إظهار الأوسمة في الملفات الشخصية" />
      <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div v-for="t in BADGE_TIERS" :key="t[0]" class="flex flex-col gap-2">
          <ImageTile
            :src="store.badges.badges?.[t[0]] || ''"
            :label="t[1] + ' — ' + t[2].toLocaleString('en') + ' نقطة'"
            kind="badge"
            :idx="t[0]"
          />
          <UBtn v-if="store.badges.badges?.[t[0]]" size="sm" variant="ghost" :icon="X" @click="clearTier(t[0])">إزالة</UBtn>
        </div>
      </div>
      <UBtn class="mt-5" :icon="Save" @click="save">حفظ الأوسمة</UBtn>
    </UCard>
  </div>
</template>
