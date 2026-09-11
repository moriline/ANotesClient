<script setup lang="ts">
import { computed } from 'vue'
import { formatDate, isDueToday, isOverdue } from '@/utils/format'

const props = defineProps<{ value: number | null | undefined }>()
const overdue = computed(() => isOverdue(props.value))
const today = computed(() => isDueToday(props.value))
</script>

<template>
  <span v-if="!value" class="text-muted">—</span>
  <span
    v-else
    class="inline-flex items-center gap-1"
    :class="overdue ? 'text-error' : today ? 'text-warning' : ''"
  >
    <UIcon v-if="overdue" name="i-lucide-alert-circle" class="size-3.5" />
    {{ formatDate(value) }}
  </span>
</template>
