<script setup>
import { ref } from 'vue';
import { ImagePlus } from 'lucide-vue-next';
import UBtn from './UBtn.vue';
import { admin } from '../lib/api.js';

const props = defineProps({
  src: String,
  label: String,
  kind: String,
  idx: [String, Number]
});
const file = ref(null);

function pick() { file.value && file.value.click(); }

function onChange(e) {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = String(ev.target.result);
    if (!/^data:image\//.test(dataUrl)) return;
    admin('upload_site_image', { kind: props.kind, dataUrl, idx: props.idx });
  };
  reader.readAsDataURL(f);
}
</script>

<template>
  <div class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-ink-300 bg-ink-50/60 p-3">
    <img v-if="src" :src="src" class="size-14 rounded-lg object-contain" alt="">
    <ImagePlus v-else :size="26" class="text-ink-300" />
    <span class="text-center text-[11px] font-bold text-ink-500">{{ label }}</span>
    <UBtn size="sm" variant="secondary" :icon="ImagePlus" @click="pick">رفع</UBtn>
    <input ref="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="onChange">
  </div>
</template>
