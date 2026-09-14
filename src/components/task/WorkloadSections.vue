<script setup lang="ts">
// Тело «доски» (секции по срочности) — общее для /dashboard (своя доска) и
// PersonBoardView (чужая, todo.txt п.2). Вынесено из DashboardView.vue как
// есть, только параметризовано пропсами вместо локальных computed.
import { useDictionariesStore } from '@/stores/dictionaries'
import EmptyState from '@/components/common/EmptyState.vue'
import StatusBadge from '@/components/task/StatusBadge.vue'
import DueDate from '@/components/task/DueDate.vue'
import type { TaskResponse } from '@/types/domain'

defineProps<{
  loading: boolean
  total: number
  tasksLength: number
  overdueTasks: TaskResponse[]
  dueSoonTasks: TaskResponse[]
  laterTasks: TaskResponse[]
  recentlyClosedTasks: TaskResponse[]
  projectName: (id: number) => string
  emptyDescription?: string
}>()

const dictionaries = useDictionariesStore()
</script>

<template>
  <div v-if="loading" class="flex flex-col gap-3">
    <USkeleton class="h-24 w-full" />
    <USkeleton class="h-24 w-full" />
  </div>

  <EmptyState
    v-else-if="!overdueTasks.length && !dueSoonTasks.length && !laterTasks.length && !recentlyClosedTasks.length"
    icon="i-lucide-circle-check"
    title="Ничего не назначено"
    :description="emptyDescription ?? 'Незакрытых задач с этим исполнителем не найдено.'"
  />

  <div v-else class="flex flex-col gap-8">
    <p v-if="total > tasksLength" class="text-xs text-muted">
      Показаны первые {{ tasksLength }} из {{ total }} назначенных задач.
    </p>

    <section v-if="overdueTasks.length">
      <h2 class="mb-3 flex items-center gap-1.5 text-sm font-semibold text-error">
        <UIcon name="i-lucide-alert-circle" class="size-4" />
        Просрочено ({{ overdueTasks.length }})
      </h2>
      <div class="flex flex-col divide-y divide-default rounded-lg border border-default">
        <RouterLink
          v-for="t in overdueTasks"
          :key="t.id"
          :to="`/tasks/${t.projectId}/${t.id}`"
          class="flex flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-elevated/60"
        >
          <span class="w-12 shrink-0 font-mono text-xs text-muted">#{{ t.id }}</span>
          <span class="min-w-0 flex-1 truncate text-sm">{{ t.title }}</span>
          <UBadge variant="subtle" color="neutral" size="sm">{{ projectName(t.projectId) }}</UBadge>
          <UBadge v-if="t.milestoneTitle" variant="subtle" color="secondary" size="sm">{{ t.milestoneTitle }}</UBadge>
          <StatusBadge :status="dictionaries.statusFor(t.projectId, t.statusId)" />
          <DueDate :value="t.dueDate" />
        </RouterLink>
      </div>
    </section>

    <section v-if="dueSoonTasks.length">
      <h2 class="mb-3 flex items-center gap-1.5 text-sm font-semibold text-warning">
        <UIcon name="i-lucide-clock" class="size-4" />
        На этой неделе ({{ dueSoonTasks.length }})
      </h2>
      <div class="flex flex-col divide-y divide-default rounded-lg border border-default">
        <RouterLink
          v-for="t in dueSoonTasks"
          :key="t.id"
          :to="`/tasks/${t.projectId}/${t.id}`"
          class="flex flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-elevated/60"
        >
          <span class="w-12 shrink-0 font-mono text-xs text-muted">#{{ t.id }}</span>
          <span class="min-w-0 flex-1 truncate text-sm">{{ t.title }}</span>
          <UBadge variant="subtle" color="neutral" size="sm">{{ projectName(t.projectId) }}</UBadge>
          <UBadge v-if="t.milestoneTitle" variant="subtle" color="secondary" size="sm">{{ t.milestoneTitle }}</UBadge>
          <StatusBadge :status="dictionaries.statusFor(t.projectId, t.statusId)" />
          <DueDate :value="t.dueDate" />
        </RouterLink>
      </div>
    </section>

    <section v-if="laterTasks.length">
      <h2 class="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
        <UIcon name="i-lucide-inbox" class="size-4" />
        Без срочности ({{ laterTasks.length }})
      </h2>
      <div class="flex flex-col divide-y divide-default rounded-lg border border-default">
        <RouterLink
          v-for="t in laterTasks"
          :key="t.id"
          :to="`/tasks/${t.projectId}/${t.id}`"
          class="flex flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-elevated/60"
        >
          <span class="w-12 shrink-0 font-mono text-xs text-muted">#{{ t.id }}</span>
          <span class="min-w-0 flex-1 truncate text-sm">{{ t.title }}</span>
          <UBadge variant="subtle" color="neutral" size="sm">{{ projectName(t.projectId) }}</UBadge>
          <UBadge v-if="t.milestoneTitle" variant="subtle" color="secondary" size="sm">{{ t.milestoneTitle }}</UBadge>
          <StatusBadge :status="dictionaries.statusFor(t.projectId, t.statusId)" />
          <DueDate :value="t.dueDate" />
        </RouterLink>
      </div>
    </section>

    <section v-if="recentlyClosedTasks.length">
      <h2 class="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
        <UIcon name="i-lucide-check-circle-2" class="size-4" />
        Недавно закрыто ({{ recentlyClosedTasks.length }})
      </h2>
      <div class="flex flex-col divide-y divide-default rounded-lg border border-default opacity-70">
        <RouterLink
          v-for="t in recentlyClosedTasks"
          :key="t.id"
          :to="`/tasks/${t.projectId}/${t.id}`"
          class="flex flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-elevated/60"
        >
          <span class="w-12 shrink-0 font-mono text-xs text-muted">#{{ t.id }}</span>
          <span class="min-w-0 flex-1 truncate text-sm text-muted line-through">{{ t.title }}</span>
          <UBadge variant="subtle" color="neutral" size="sm">{{ projectName(t.projectId) }}</UBadge>
          <UBadge v-if="t.milestoneTitle" variant="subtle" color="secondary" size="sm">{{ t.milestoneTitle }}</UBadge>
          <StatusBadge :status="dictionaries.statusFor(t.projectId, t.statusId)" />
        </RouterLink>
      </div>
    </section>
  </div>
</template>
