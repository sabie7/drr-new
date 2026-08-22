<script setup>
defineProps({ label: String, hint: String });
</script>

<template>
  <div>
    <label v-if="label" class="u-label">{{ label }}</label>
    <slot />
    <p v-if="hint" class="mt-1 text-[11px] leading-relaxed text-ink-400">{{ hint }}</p>
  </div>
</template>
