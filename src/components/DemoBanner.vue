<script setup lang="ts">
const isDemo = import.meta.env.VITE_DEMO === 'true'
</script>

<template>
  <div
    v-if="isDemo"
    class="flex items-center justify-center gap-3 bg-secondary-100 px-4 py-1.5 text-xs text-secondary-900"
  >
    <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
    <span>
      Демо без сервера. Данные хранятся в этой вкладке и пропадут при перезагрузке.
    </span>
    <a href="https://github.com/moriline/ANotesClient" class="underline" target="_blank" rel="noopener noreferrer">
      Исходный код
    </a>
  </div>
</template>
