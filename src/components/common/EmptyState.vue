<script setup lang="ts">
withDefaults(defineProps<{
  icon?: string
  title: string
  description?: string
}>(), {
  icon: 'i-lucide-inbox'
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <UIcon :name="icon" class="size-10 text-primary" />
    <p class="text-base font-medium text-highlighted">{{ title }}</p>
    <p v-if="description" class="max-w-[40ch] text-sm text-muted">{{ description }}</p>
    <div v-if="$slots.action" class="mt-2">
      <slot name="action" />
    </div>
  </div>
</template>
