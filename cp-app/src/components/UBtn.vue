<script setup>
defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'md' },
  icon: [Object, Function, Boolean],
  block: Boolean
});
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center justify-center gap-1.5 rounded-lg font-bold transition-all duration-150 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50"
    :class="[
      {
        primary: 'bg-brand-600 text-white shadow-sm shadow-brand-600/30 hover:bg-brand-700',
        secondary: 'border border-ink-300 bg-white text-ink-700 hover:bg-ink-50 hover:border-ink-400',
        success: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 hover:bg-emerald-700',
        danger: 'bg-red-600 text-white shadow-sm shadow-red-600/30 hover:bg-red-700',
        warning: 'bg-amber-500 text-white shadow-sm shadow-amber-500/30 hover:bg-amber-600',
        ghost: 'text-ink-500 hover:bg-ink-100 hover:text-ink-800',
        soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100'
      }[variant],
      size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : size === 'lg' ? 'px-5 py-2.5 text-sm' : 'px-3.5 py-2 text-xs',
      block ? 'w-full' : ''
    ]"
  >
    <component :is="icon" v-if="icon" :size="size === 'sm' ? 13 : 15" />
    <slot />
  </button>
</template>
