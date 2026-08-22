<script setup>
import { reactive } from 'vue';
import { RefreshCw, Megaphone, PackagePlus, ArchiveRestore, RefreshCcwDot } from 'lucide-vue-next';
import { store, admin, fmtBytes, fmtUptime, ask } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UStat from '../components/UStat.vue';

const bc = reactive({ msg: '' });

const stats = [
  { label: 'متصل الآن', value: () => store.health.onlineCount ?? '—' },
  { label: 'الأعضاء', value: () => store.users.length },
  { label: 'الغرف', value: () => store.rooms.length },
  { label: 'الحظر', value: () => store.bands.length },
  { label: 'الذاكرة', value: () => fmtBytes(store.health.memory?.rss) },
  { label: 'مدة التشغيل', value: () => fmtUptime(store.health.uptime) },
  { label: 'Node.js', value: () => store.health.node || '—' },
  { label: 'قاعدة البيانات', value: () => store.health.dbStatus === 'mongo' ? 'MongoDB' : store.health.dbStatus === 'memory' ? 'ذاكرة' : '—' }
];

function broadcast() {
  const v = bc.msg.trim();
  if (!v) return;
  admin('broadcast_msg', { msg: v });
  bc.msg = '';
}
</script>

<template>
  <div>
    <PageHead title="لوحة المعلومات" sub="نظرة سريعة على حالة النظام والإجراءات السريعة" @refresh="admin('get_system_health')" />
    <div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <UStat v-for="s in stats" :key="s.label" :label="s.label" :value="s.value()" />
    </div>

    <UCard title="إعلان عام فوري" class="mb-5">
      <p class="mb-3 text-[11px] text-ink-400">يظهر لجميع المتصلين حالاً كتنبيه.</p>
      <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="broadcast">
        <input v-model="bc.msg" class="u-input" placeholder="نص الإعلان...">
        <UBtn variant="warning" :icon="Megaphone" @click="broadcast">بث الإعلان</UBtn>
      </form>
    </UCard>

    <UCard title="إجراءات سريعة">
      <template #actions>
        <UBtn size="sm" variant="secondary" :icon="RefreshCw" @click="admin('get_system_health')">تحديث</UBtn>
      </template>
      <div class="flex flex-wrap gap-2">
        <UBtn variant="success" :icon="PackagePlus" @click="admin('backup')">نسخة احتياطية</UBtn>
        <UBtn variant="secondary" :icon="ArchiveRestore" @click="ask('استعادة آخر نسخة محفوظة؟') && admin('restore')">استعادة آخر نسخة</UBtn>
        <UBtn variant="ghost" :icon="RefreshCcwDot" @click="ask('تحديث صفحات جميع المتصلين؟') && admin('reload_site')">تحديث صفحات الجميع</UBtn>
      </div>
      <p class="mt-3 text-[11px] text-ink-400">النسخ الاحتياطي يحفظ لقطة JSON على الخادم، والاستعادة تعيد آخر لقطة.</p>
    </UCard>
  </div>
</template>
