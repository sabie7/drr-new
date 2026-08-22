<script setup>
defineProps({ title: String });
</script>

<template>
  <div class="rounded-2xl border border-ink-200/70 bg-white shadow-sm shadow-ink-900/[0.03]">
    <div v-if="title || $slots.actions" class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-5 py-3.5">
      <h3 class="text-[13px] font-extrabold text-ink-800">{{ title }}</h3>
      <div class="flex items-center gap-2"><slot name="actions" /></div>
    </div>
    <div class="p-5">
      <slot />
    </div>
  </div>
</template>
