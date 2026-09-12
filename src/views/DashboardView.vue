<script setup lang="ts">
// Личная доска — «мои задачи» через все проекты сразу, без привязки к одному
// выбранному проекту (в отличие от /tasks, где фильтр по вехе работает только
// внутри выбранного проекта). Один запрос POST /api/find с assignedToMe:true
// уже несёт projectId/milestoneId/milestoneTitle на каждой строке — фильтр и
// группировка по проекту/вехе целиком клиентские, второго похода в API не
// нужно. «Доска» здесь — секции по срочности (Просрочено/На неделе/Позже), а
// не колонки по статусу: статусы per-project, единого набора колонок через
// разные проекты не существует.
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HelpLink from '@/components/common/HelpLink.vue'
import StatusBadge from '@/components/task/StatusBadge.vue'
import DueDate from '@/components/task/DueDate.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { findTasks } from '@/api/tasks'
import { ApiError } from '@/api/http'
import { isOverdue } from '@/utils/format'
import type { TaskResponse } from '@/types/domain'

const dictionaries = useDictionariesStore()
const toast = useToast()

const LIMIT = 500
const loading = ref(true)
const tasks = ref<TaskResponse[]>([])
const total = ref(0)

async function load() {
  loading.value = true
  try {
    const res = await findTasks({
      assignedToMe: true,
      isArchived: false,
      limit: LIMIT,
      sortBy: 'dueDate',
      sortDir: 'asc'
    })
    tasks.value = res.tasks
    total.value = res.total
    ensureStatusesForTasks()
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить мои задачи', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loading.value = false
  }
}

// Статусы per-project — чтобы понять, закрыта ли задача, нужен словарь
// статусов именно её проекта (тот же приём, что в TaskListView).
function ensureStatusesForTasks() {
  const seen = new Set<number>()
  for (const t of tasks.value) {
    if (t.projectId && !seen.has(t.projectId)) {
      seen.add(t.projectId)
      dictionaries.loadStatuses(t.projectId).catch(() => {})
    }
  }
}

function isClosed(t: TaskResponse): boolean {
  return dictionaries.statusFor(t.projectId, t.statusId)?.isClosed ?? false
}

// --- Фильтры: строятся из уже загруженных задач, без похода в API ---------
const projectId = ref<number | undefined>(undefined)
const NO_MILESTONE = -1
const milestoneFilter = ref<number | undefined>(undefined)

const projectItems = computed(() => {
  const ids = [...new Set(tasks.value.map(t => t.projectId))]
  return [
    { label: 'Все проекты', value: undefined },
    ...ids.map(id => ({ label: dictionaries.projectById.get(id)?.name ?? `Проект #${id}`, value: id }))
  ]
})

const milestoneItems = computed(() => {
  const map = new Map<number, string>()
  for (const t of tasks.value) {
    if (t.milestoneId != null) map.set(t.milestoneId, t.milestoneTitle || `Веха #${t.milestoneId}`)
  }
  return [
    { label: 'Любая веха', value: undefined },
    { label: 'Без вехи', value: NO_MILESTONE },
    ...[...map.entries()].map(([id, title]) => ({ label: title, value: id }))
  ]
})

const filteredTasks = computed(() => tasks.value.filter(t => {
  if (projectId.value != null && t.projectId !== projectId.value) return false
  if (milestoneFilter.value === NO_MILESTONE) return t.milestoneId == null
  if (milestoneFilter.value != null) return t.milestoneId === milestoneFilter.value
  return true
}))

const openTasks = computed(() => filteredTasks.value.filter(t => !isClosed(t)))

const WEEK_MS = 7 * 86_400_000
const overdueTasks = computed(() => openTasks.value.filter(t => isOverdue(t.dueDate)))
const dueSoonTasks = computed(() => openTasks.value.filter(t =>
  !isOverdue(t.dueDate) && t.dueDate != null && t.dueDate <= Date.now() + WEEK_MS
))
const laterTasks = computed(() => openTasks.value.filter(t =>
  t.dueDate == null || (!isOverdue(t.dueDate) && t.dueDate > Date.now() + WEEK_MS)
))

function projectName(id: number): string {
  return dictionaries.projectById.get(id)?.name ?? `Проект #${id}`
}

onMounted(() => {
  dictionaries.loadProjects().catch(() => {})
  load()
})
</script>

<template>
  <div>
    <PageHeader title="Моя доска" :subtitle="`Назначено мне: ${openTasks.length}`">
      <template #actions>
        <HelpLink
          topic="dashboard"
          label="Справка: моя доска"
          hint="Мои задачи через все проекты сразу — по срочности (просрочено/на неделе/позже), с фильтром по проекту и вехе."
        />
      </template>

      <div class="flex flex-wrap items-center gap-2">
        <USelectMenu v-model="projectId" :items="projectItems" value-key="value" icon="i-lucide-folder" placeholder="Все проекты" class="w-[190px]" />
        <USelectMenu v-model="milestoneFilter" :items="milestoneItems" value-key="value" icon="i-lucide-diamond" placeholder="Любая веха" class="w-[190px]" />
      </div>
    </PageHeader>

    <div class="mx-auto w-[95%] px-6 py-6">
      <div v-if="loading" class="flex flex-col gap-3">
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-24 w-full" />
      </div>

      <EmptyState
        v-else-if="!openTasks.length"
        icon="i-lucide-circle-check"
        title="Ничего не назначено"
        description="Задач, где вы исполнитель и которые ещё не закрыты, не найдено."
      />

      <div v-else class="flex flex-col gap-8">
        <p v-if="total > tasks.length" class="text-xs text-muted">
          Показаны первые {{ tasks.length }} из {{ total }} назначенных задач.
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
      </div>
    </div>
  </div>
</template>
