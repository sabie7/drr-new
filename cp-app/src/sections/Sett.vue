<script setup>
import { reactive, watch } from 'vue';
import { Save } from 'lucide-vue-next';
import { store, admin, refreshState } from '../lib/api.js';
import UCard from '../components/UCard.vue';
import UBtn from '../components/UBtn.vue';
import PageHead from '../components/PageHead.vue';
import UField from '../components/UField.vue';
import UToggle from '../components/UToggle.vue';

const GATE_DEFAULTS = { wall: 100, private: 200, story: 300, call: 400, mic: 500 };

const f = reactive({
  name: '', title: '', msgst: '',
  bg: '#40404f', buttons: '#f93634', background: '#40404f',
  allowg: false, allowreg: false,
  gates: { ...GATE_DEFAULTS }
});

watch(() => store.siteweb, (s) => {
  s = s || {};
  f.name = s.name || ''; f.title = s.title || ''; f.msgst = s.msgst ?? '';
  f.bg = s.bg || '#40404f'; f.buttons = s.buttons || '#f93634'; f.background = s.background || '#40404f';
  f.allowg = !!s.allowg; f.allowreg = !!s.allowreg;
  for (const k of Object.keys(GATE_DEFAULTS)) f.gates[k] = s.likeGates?.[k] !== undefined ? s.likeGates[k] : GATE_DEFAULTS[k];
}, { immediate: true, deep: true });

const gl = reactive({ public: 300, private: 300 });

watch(() => store.globalLimits, (g) => {
  g = g || {};
  gl.public = parseInt(g.public, 10) || 300;
  gl.private = parseInt(g.private, 10) || 300;
}, { immediate: true, deep: true });

function saveLimits() {
  admin('set_global_limits', { public: gl.public, private: gl.private });
}

function save() {
  admin('save_state', {
    name: f.name, title: f.title,
    bg: f.bg, buttons: f.buttons, background: f.background,
    msgst: f.msgst,
    allowg: f.allowg, allowreg: f.allowreg,
    likeGates: { ...f.gates }
  });
}
</script>

<template>
  <div>
    <PageHead title="الإعدادات العامة" sub="اسم الموقع، الألوان الأساسية، صلاحيات الدخول وبوابات الإعجابات" @refresh="refreshState()" />

    <UCard title="إعدادات الموقع" class="mb-5">
      <div class="grid gap-4 sm:grid-cols-3">
        <UField label="اسم الموقع"><input v-model="f.name" class="u-input"></UField>
        <UField label="العنوان"><input v-model="f.title" class="u-input"></UField>
        <UField label="عدد رسائل البث المحفوظة"><input v-model="f.msgst" type="number" min="0" class="u-input"></UField>
      </div>
      <div class="mt-4 grid gap-4 sm:grid-cols-3">
        <UField label="لون الخلفية"><input v-model="f.bg" type="color"></UField>
        <UField label="لون الأزرار"><input v-model="f.buttons" type="color"></UField>
        <UField label="لون المحتوى"><input v-model="f.background" type="color"></UField>
      </div>
      <div class="mt-4 flex flex-wrap gap-6">
        <UToggle v-model="f.allowg" label="السماح بدخول الزوار" />
        <UToggle v-model="f.allowreg" label="السماح بالتسجيل" />
      </div>
      <UBtn class="mt-5" :icon="Save" @click="save">حفظ الإعدادات</UBtn>
    </UCard>

    <UCard title="حدود طول الرسائل" class="mb-5">
      <p class="mb-4 text-[11px] text-ink-400">الحد الأقصى لعدد أحرف الرسالة العامة والخاصة (50–2000). تُطبَّق على المتصلين لحظياً.</p>
      <div class="grid gap-4 sm:grid-cols-2">
        <UField label="الرسائل العامة"><input v-model.number="gl.public" type="number" min="50" max="2000" class="u-input"></UField>
        <UField label="الرسائل الخاصة"><input v-model.number="gl.private" type="number" min="50" max="2000" class="u-input"></UField>
      </div>
      <UBtn class="mt-4" :icon="Save" @click="saveLimits">حفظ الحدود</UBtn>
    </UCard>

    <UCard title="بوابات الإعجابات">
      <p class="mb-3 text-[11px] text-ink-400">عدد الإعجابات المطلوبة لفتح كل ميزة (0 = مفتوحة بدون شرط). الأدمن والزوار مستثنون دائماً.</p>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <UField label="الجدار"><input v-model.number="f.gates.wall" type="number" min="0" class="u-input"></UField>
        <UField label="الخاص"><input v-model.number="f.gates.private" type="number" min="0" class="u-input"></UField>
        <UField label="القصص"><input v-model.number="f.gates.story" type="number" min="0" class="u-input"></UField>
        <UField label="المكالمات"><input v-model.number="f.gates.call" type="number" min="0" class="u-input"></UField>
        <UField label="المايك"><input v-model.number="f.gates.mic" type="number" min="0" class="u-input"></UField>
      </div>
      <UBtn class="mt-5" :icon="Save" @click="save">حفظ البوابات</UBtn>
    </UCard>
  </div>
</template>
