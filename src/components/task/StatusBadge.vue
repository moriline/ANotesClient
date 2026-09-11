<script setup lang="ts">
import type { ProjectStatusResponse } from '@/types/domain'

defineProps<{ status: ProjectStatusResponse | null | undefined }>()
</script>

<template>
  <UBadge v-if="status" variant="subtle" color="neutral" class="gap-1.5">
    <span class="size-2 shrink-0 rounded-full" :style="{ background: status.statusColor || '#9CA3AF' }" />
    {{ status.statusName }}
  </UBadge>
  <UBadge v-else variant="subtle" color="neutral">Без статуса</UBadge>
</template>
