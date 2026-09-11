<script setup lang="ts">
// Пометка «через агента» (ai.md §3.4): действие выполнено ИИ-агентом от имени
// человека. Ставится рядом с именем, а не вместо него. Цвет secondary
// (светло-зелёный sprout) — пометка информирующая, не тревожная.
withDefaults(defineProps<{ size?: 'xs' | 'sm' | 'md' }>(), { size: 'xs' })
</script>

<template>
  <UBadge
    :size="size"
    variant="subtle"
    color="secondary"
    icon="i-lucide-sparkles"
    :title="'Действие выполнено ИИ-агентом от имени пользователя'"
  >
    через агента
  </UBadge>
</template>
