<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  label: String,
  disabled: Boolean
});
defineEmits(['update:modelValue']);
</script>

<template>
  <label class="inline-flex cursor-pointer items-center gap-2.5 select-none" :class="disabled ? 'opacity-50 pointer-events-none' : ''">
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      class="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200"
      :class="modelValue ? 'bg-brand-600' : 'bg-ink-300'"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <span
        class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all duration-200"
        :class="modelValue ? 'start-[1.375rem]' : 'start-0.5'"
      />
    </button>
    <span v-if="label" class="text-xs font-bold text-ink-600">{{ label }}</span>
  </label>
</template>
