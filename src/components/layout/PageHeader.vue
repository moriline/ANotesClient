<script setup lang="ts">
withDefaults(defineProps<{ title: string; subtitle?: string; bordered?: boolean }>(), {
  bordered: true
})
</script>

<template>
  <div class="pt-8 pb-5" :class="bordered ? 'border-b border-default' : ''">
    <div class="mx-auto w-[95%] px-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold leading-8 text-highlighted">{{ title }}</h1>
          <p v-if="subtitle" class="mt-1 text-[13px] text-muted">{{ subtitle }}</p>
        </div>
        <div class="flex items-center gap-2">
          <slot name="actions" />
        </div>
      </div>
      <div v-if="$slots.default" class="mt-4">
        <slot />
      </div>
    </div>
  </div>
</template>
