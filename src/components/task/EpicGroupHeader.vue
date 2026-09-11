<script setup lang="ts">
import { computed } from 'vue'
import DueDate from '@/components/task/DueDate.vue'
import type { EpicGroup } from '@/composables/useEpicGrouping'

// Заголовок группы эпика (tasks_view.md §6.2). Свёрнутая строка отвечает на
// «как идут дела» без разворачивания: прогресс, счётчик, срок — на месте.
//
// Это div с role="button": внутри лежит ссылка на эпик, вложить её в <button>
// нельзя. Отсюда ручные обработчики Enter/Space и tabindex — без них заголовок
// недоступен с клавиатуры.
const props = defineProps<{ group: EpicGroup; collapsed: boolean }>()
defineEmits<{ toggle: [] }>()

// Полоса только при двух и более задачах: 0/1 — булево, нарисованное полосой.
const showBar = computed(() => !!props.group.epic && props.group.totalCount > 1)
</script>

<template>
  <div
    class="flex w-full cursor-pointer select-none items-center gap-3 border-b border-default bg-elevated/40 px-3 py-2.5 hover:bg-elevated/70"
    role="button"
    tabindex="0"
    :aria-expanded="!collapsed"
    @click="$emit('toggle')"
    @keydown.enter.prevent="$emit('toggle')"
    @keydown.space.prevent="$emit('toggle')"
  >
    <UIcon
      :name="collapsed ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
      class="size-4 shrink-0 text-muted"
    />
    <UIcon
      :name="group.epic ? 'i-lucide-package' : 'i-lucide-folder'"
      class="size-4 shrink-0"
      :class="group.epic ? 'text-primary' : 'text-muted'"
    />

    <span v-if="group.epic" class="hidden w-12 shrink-0 font-mono text-xs text-muted sm:block">
      #{{ group.epic.id }}
    </span>

    <RouterLink
      v-if="group.epic"
      :to="`/tasks/${group.epic.projectId}/${group.epic.id}`"
      class="truncate text-sm font-medium hover:text-primary hover:underline"
      :class="group.closed && 'text-muted line-through decoration-1'"
      @click.stop
    >
      {{ group.title }}
    </RouterLink>
    <span v-else class="truncate text-sm font-medium">{{ group.title }}</span>

    <span class="flex-1" />

    <UProgress
      v-if="showBar"
      :model-value="group.doneCount"
      :max="group.totalCount"
      :color="group.closed ? 'primary' : 'secondary'"
      size="xs"
      class="hidden w-24 shrink-0 sm:block"
    />

    <span class="shrink-0 font-mono text-xs text-muted">
      <template v-if="group.epic">
        {{ group.doneCount }}/{{ group.totalCount }}
        <span v-if="group.partial" class="text-dimmed"> · показана {{ group.visibleCount }}</span>
      </template>
      <template v-else>{{ group.visibleCount }}&nbsp;задач</template>
    </span>

    <span class="hidden w-16 shrink-0 text-right text-xs md:block">
      <DueDate v-if="group.dueDate" :value="group.dueDate" />
    </span>
  </div>
</template>
