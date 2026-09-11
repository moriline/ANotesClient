<script setup lang="ts">
import { computed } from 'vue'
import type { UserSummary } from '@/types/domain'
import { initials } from '@/utils/format'

const props = withDefaults(defineProps<{
  user: UserSummary | null | undefined
  size?: 'xs' | 'sm' | 'md'
}>(), { size: 'sm' })

const label = computed(() => props.user?.displayName || props.user?.username || '')
</script>

<template>
  <div v-if="user" class="flex min-w-0 items-center gap-2">
    <UAvatar :src="user.avatarUrl || undefined" :alt="label" :text="initials(label)" :size="size" />
    <span class="truncate">{{ label }}</span>
  </div>
  <span v-else class="italic text-muted">Не назначен</span>
</template>
