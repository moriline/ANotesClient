<script setup lang="ts">
import { computed } from 'vue'
import UserCell from '@/components/task/UserCell.vue'
import DueDate from '@/components/task/DueDate.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import type { ProjectStatusResponse, TaskResponse } from '@/types/domain'

// Карточка на доске (status_view.md). Всю карточку можно перетащить между
// колонками — обработчики drag висят на обёртке в StatusBoard. Меню «⋯» —
// путь к переносу с клавиатуры и на тач-экране, где нативного drag нет.
const props = defineProps<{
  task: TaskResponse
  /** Статусы-цели для меню «Перенести в …» (без скрытых и служебных). */
  moveTargets: ProjectStatusResponse[]
}>()
const emit = defineEmits<{ move: [toStatusId: number] }>()

const dictionaries = useDictionariesStore()

const assignee = computed(() =>
  props.task.assignedUserId ? dictionaries.userById.get(props.task.assignedUserId) : null
)

const menuItems = computed(() => [
  props.moveTargets
    .filter(s => s.id !== props.task.statusId)
    .map(s => ({
      label: s.statusName,
      icon: 'i-lucide-arrow-right',
      onSelect: () => emit('move', s.id)
    }))
])
</script>

<template>
  <div class="rounded-lg border border-default bg-default p-2.5 text-sm shadow-sm transition-colors hover:border-primary/50">
    <div class="mb-1 flex items-center gap-2">
      <span class="font-mono text-[11px] text-muted">#{{ task.id }}</span>
      <UIcon v-if="task.isArchived" name="i-lucide-archive" class="size-3 text-muted" />
      <span class="flex-1" />
      <span
        v-if="menuItems[0].length"
        class="shrink-0"
        @pointerdown.stop
        @click.stop
        @dragstart.stop.prevent
      >
        <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
          <UButton icon="i-lucide-ellipsis" variant="outline" color="primary" size="xs" />
        </UDropdownMenu>
      </span>
    </div>

    <RouterLink
      :to="`/tasks/${task.projectId}/${task.id}`"
      draggable="false"
      class="line-clamp-3 font-medium hover:text-primary hover:underline"
    >
      {{ task.title }}
    </RouterLink>

    <p v-if="task.parentTitle" class="mt-1 flex items-center gap-1 truncate text-xs text-muted">
      <UIcon name="i-lucide-package" class="size-3 shrink-0" />
      <span class="truncate">{{ task.parentTitle }}</span>
    </p>

    <div v-if="task.tags.length" class="mt-2 flex flex-wrap gap-1">
      <UBadge
        v-for="t in task.tags.slice(0, 3)"
        :key="t"
        size="xs"
        variant="subtle"
        color="neutral"
      >
        {{ t }}
      </UBadge>
      <span v-if="task.tags.length > 3" class="text-xs text-muted">+{{ task.tags.length - 3 }}</span>
    </div>

    <div class="mt-2 flex items-center justify-between gap-2 text-xs">
      <UserCell :user="assignee" size="xs" class="min-w-0" />
      <DueDate :value="task.dueDate" class="shrink-0" />
    </div>
  </div>
</template>
