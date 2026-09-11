<script setup lang="ts">
import { computed, ref } from 'vue'
import BoardCard from '@/components/task/BoardCard.vue'
import type { BoardColumn } from '@/composables/useStatusBoard'
import type { ProjectStatusResponse, TaskResponse } from '@/types/domain'

// Доска: колонки по статусам, перетаскивание карточек между ними (status_view.md).
// Нативный HTML5 drag-and-drop — без сторонней библиотеки. Внутри колонки порядок
// не двигаем: сервер позицию не хранит (§3.3), а карточка, вернувшаяся на место
// после отпускания мыши, читается как поломка.
const props = defineProps<{
  columns: BoardColumn[]
  loading?: boolean
}>()
const emit = defineEmits<{ move: [payload: { task: TaskResponse; toStatusId: number }] }>()

const draggingTask = ref<TaskResponse | null>(null)
const dragOverId = ref<number | null>(null)

// Цели для меню «Перенести в …» на карточке — реальные колонки, без служебной.
const moveTargets = computed<ProjectStatusResponse[]>(() =>
  props.columns.filter(c => !c.synthetic).map(c => c.status)
)

function canDrop(col: BoardColumn) {
  return !!draggingTask.value && !col.synthetic && draggingTask.value.statusId !== col.status.id
}

function onDragStart(task: TaskResponse, e: DragEvent) {
  draggingTask.value = task
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox не начнёт перетаскивание, если в dataTransfer ничего не положить.
    e.dataTransfer.setData('text/plain', String(task.id))
  }
}

function onDragEnd() {
  draggingTask.value = null
  dragOverId.value = null
}

function onDragOver(col: BoardColumn, e: DragEvent) {
  if (!canDrop(col)) return
  e.preventDefault() // разрешаем drop только в подходящую колонку
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverId.value = col.status.id
}

function onDragLeave(e: DragEvent) {
  // dragleave всплывает и с внутренних элементов — гасим подсветку только когда
  // курсор вышел за пределы самой колонки, иначе она мигает над каждой карточкой.
  const el = e.currentTarget as HTMLElement
  if (!el.contains(e.relatedTarget as Node | null)) dragOverId.value = null
}

function onDrop(col: BoardColumn) {
  const task = draggingTask.value
  dragOverId.value = null
  draggingTask.value = null
  if (task && !col.synthetic && task.statusId !== col.status.id) {
    emit('move', { task, toStatusId: col.status.id })
  }
}

function dotColor(s: ProjectStatusResponse) {
  return s.statusColor || '#9CA3AF'
}
</script>

<template>
  <div v-if="loading" class="flex gap-3 overflow-x-auto pb-2">
    <div v-for="i in 4" :key="i" class="w-[280px] shrink-0 space-y-2">
      <USkeleton class="h-9 w-full" />
      <USkeleton v-for="j in 3" :key="j" class="h-24 w-full" />
    </div>
  </div>

  <div v-else class="flex items-start gap-3 overflow-x-auto pb-2">
    <div
      v-for="col in columns"
      :key="col.status.id"
      class="flex max-h-[calc(100vh-15rem)] min-h-[9rem] w-[280px] shrink-0 flex-col rounded-lg border border-default bg-elevated/30"
    >
      <div class="flex items-center gap-2 border-b border-default px-3 py-2">
        <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: dotColor(col.status) }" />
        <span class="truncate text-sm font-medium" :class="col.synthetic && 'text-muted'">
          {{ col.status.statusName }}
        </span>
        <span class="ml-auto shrink-0 font-mono text-xs text-muted">
          <template v-if="col.total > col.cards.length">{{ col.cards.length }} из {{ col.total }}</template>
          <template v-else>{{ col.cards.length }}</template>
        </span>
      </div>

      <div
        class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors"
        :class="dragOverId === col.status.id
          ? 'bg-primary/5 ring-2 ring-inset ring-primary/40'
          : 'ring-2 ring-inset ring-transparent'"
        @dragover="onDragOver(col, $event)"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop(col)"
      >
        <div
          v-for="task in col.cards"
          :key="task.id"
          draggable="true"
          class="cursor-grab select-none rounded-lg active:cursor-grabbing"
          :class="draggingTask?.id === task.id && 'opacity-40'"
          @dragstart="onDragStart(task, $event)"
          @dragend="onDragEnd"
        >
          <BoardCard
            :task="task"
            :move-targets="moveTargets"
            @move="(sid: number) => emit('move', { task, toStatusId: sid })"
          />
        </div>

        <p v-if="!col.cards.length" class="px-2 py-6 text-center text-xs text-muted">
          {{ col.synthetic ? 'Нет задач без статуса' : 'Пусто' }}
        </p>
      </div>
    </div>
  </div>
</template>
