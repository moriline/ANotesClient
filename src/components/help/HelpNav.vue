<script setup lang="ts">
import { HELP_GROUPS } from '@/help/topics'

defineProps<{ current: string }>()
</script>

<template>
  <nav class="text-sm">
    <div v-for="group in HELP_GROUPS" :key="group.title" class="mb-4 last:mb-0">
      <p class="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-dimmed">
        {{ group.title }}
      </p>
      <ul class="flex flex-col">
        <li v-for="topic in group.topics" :key="topic.id">
          <RouterLink
            :to="`/help/${topic.id}`"
            class="block rounded-md px-2 py-1.5 transition-colors"
            :class="topic.id === current
              ? 'bg-elevated font-medium text-highlighted'
              : 'text-muted hover:bg-elevated/60 hover:text-highlighted'"
          >
            {{ topic.title }}
          </RouterLink>
        </li>
      </ul>
    </div>
  </nav>
</template>
