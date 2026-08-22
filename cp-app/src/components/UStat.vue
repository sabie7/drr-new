<script setup>
defineProps({ label: String, value: [String, Number] });
</script>

<template>
  <div class="rounded-xl border border-ink-200/70 bg-white px-4 py-3">
    <div class="truncate text-base font-extrabold text-ink-900">{{ value }}</div>
    <div class="mt-0.5 text-[11px] font-bold text-ink-400">{{ label }}</div>
  </div>
</template>
