<script setup lang="ts">
import { computed } from 'vue'
import { formatDateTime, formatRelativeTime } from '@/utils/format'

const props = defineProps<{ value: string | number | null | undefined }>()
const rel = computed(() => formatRelativeTime(props.value))
const full = computed(() => formatDateTime(props.value))
</script>

<template>
  <UTooltip :text="full">
    <span>{{ rel }}</span>
  </UTooltip>
</template>
