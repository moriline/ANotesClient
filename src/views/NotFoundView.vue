<script setup lang="ts">
withDefaults(defineProps<{ title?: string }>(), { title: 'Страница не найдена' })
</script>

<template>
  <div class="mx-auto flex max-w-[1440px] flex-col items-center justify-center gap-3 px-6 py-24 text-center">
    <UIcon name="i-lucide-compass" class="size-10 text-muted" />
    <p class="text-base font-medium text-highlighted">{{ title }}</p>
    <RouterLink to="/tasks" class="text-sm text-primary hover:underline">Вернуться к списку задач</RouterLink>
  </div>
</template>
