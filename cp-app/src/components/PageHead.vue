<script setup>
import { RefreshCw } from 'lucide-vue-next';

defineProps({ title: String, sub: String });
defineEmits(['refresh']);
</script>

<template>
  <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="text-lg font-extrabold tracking-tight text-ink-900">{{ title }}</h2>
      <p v-if="sub" class="mt-0.5 text-xs text-ink-500">{{ sub }}</p>
    </div>
    <button
      v-if="$attrs.onRefresh"
      type="button"
      class="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3 py-2 text-xs font-bold text-ink-600 shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 active:scale-[.97]"
      @click="$emit('refresh')"
    >
      <RefreshCw :size="14" />
      تحديث
    </button>
  </div>
</template>
