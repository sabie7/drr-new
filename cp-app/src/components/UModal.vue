<script setup>
import { X } from 'lucide-vue-next';

defineProps({ title: String, wide: Boolean });
defineEmits(['close']);
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 backdrop-blur-sm sm:p-8" @click.self="$emit('close')">
        <div class="w-full rounded-2xl bg-white shadow-2xl" :class="wide ? 'max-w-3xl' : 'max-w-xl'">
          <div class="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <h3 class="text-sm font-extrabold text-ink-900">{{ title }}</h3>
            <button class="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700" @click="$emit('close')">
              <X :size="18" />
            </button>
          </div>
          <div class="max-h-[75vh] overflow-y-auto p-5">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
