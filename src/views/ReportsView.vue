<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HelpLink from '@/components/common/HelpLink.vue'
import PeriodControls from '@/components/reports/PeriodControls.vue'
import TimeReportBreakdown from '@/components/reports/TimeReportBreakdown.vue'
import type { BreakdownRow } from '@/components/reports/breakdown'
import { useAuthStore } from '@/stores/auth'
import { useDictionariesStore } from '@/stores/dictionaries'
import { getProjectTimeReport, getTimeReport } from '@/api/timeReports'
import { getTaskTotalSeconds, listTimeEntries } from '@/api/timeEntries'
import { listProjectTasks } from '@/api/tasks'
import { ApiError } from '@/api/http'
import { formatDate, formatDuration } from '@/utils/format'
import { downloadCsv, hoursForCsv, toCsvRow } from '@/utils/csv'
import type { ProjectTimeReportResponse, TaskResponse, TimeEntry, TimeReportResponse } from '@/types/domain'

type Tab = 'user' | 'project' | 'task'
const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: 'user', label: 'По пользователю', icon: 'i-lucide-user' },
  { value: 'project', label: 'По проекту', icon: 'i-lucide-folder' },
  { value: 'task', label: 'По задаче', icon: 'i-lucide-check-square' }
]
const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
]

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const dictionaries = useDictionariesStore()

const now = new Date()
const qNum = (v: unknown) =>
  typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined

const tab = ref<Tab>(
  typeof route.query.tab === 'string' && TABS.some(t => t.value === route.query.tab)
    ? (route.query.tab as Tab)
    : 'user'
)
const year = ref<number>(qNum(route.query.year) ?? now.getFullYear())
const month = ref<number>(qNum(route.query.month) ?? now.getMonth() + 1)
const userId = ref<number | undefined>(qNum(route.query.user))
const projectId = ref<number | undefined>(qNum(route.query.project))
const taskId = ref<number | undefined>(qNum(route.query.task))

const ready = ref(false)
const loading = ref(false)
const errorText = ref<string | null>(null)

const userReport = ref<TimeReportResponse | null>(null)
const projectReport = ref<ProjectTimeReportResponse | null>(null)
const projectTasks = ref<TaskResponse[]>([])
const tasksLoading = ref(false)
const taskTotalSeconds = ref(0)
const taskEntries = ref<TimeEntry[]>([])

const periodLabel = computed(() =>
  month.value ? `${MONTHS[month.value - 1]} ${year.value}` : `${year.value} год`
)

const userItems = computed(() =>
  dictionaries.users.map(u => ({ label: u.displayName || u.username, value: u.id }))
)
const projectItems = computed(() =>
  dictionaries.projects.map(p => ({ label: p.name, value: p.id }))
)
const taskItems = computed(() =>
  projectTasks.value.map(t => ({ label: `#${t.id} · ${t.title}`, value: t.id }))
)
const selectedTask = computed(() => projectTasks.value.find(t => t.id === taskId.value) ?? null)

function userName(id: number): string {
  const u = dictionaries.userById.get(id)
  return u?.displayName || u?.username || `Пользователь #${id}`
}

const userRows = computed<BreakdownRow[]>(() =>
  (userReport.value?.byProject ?? []).map(p => ({
    key: p.projectId,
    label: p.projectName || `Проект #${p.projectId}`,
    totalSeconds: p.totalSeconds,
    entryCount: p.entryCount
  }))
)

const projectRows = computed<BreakdownRow[]>(() =>
  (projectReport.value?.byUser ?? []).map(u => ({
    key: u.userId,
    label: u.displayName || u.username || `Пользователь #${u.userId}`,
    sublabel: u.displayName && u.username ? `@${u.username}` : undefined,
    totalSeconds: u.totalSeconds,
    entryCount: u.entryCount
  }))
)

// Разбивка по задаче считается на клиенте из списка списаний: у эндпоинтов
// /api/tasks/{id}/time… нет агрегата по пользователям.
const taskRows = computed<BreakdownRow[]>(() => {
  const map = new Map<number, { seconds: number; count: number }>()
  for (const e of taskEntries.value) {
    const cur = map.get(e.userId) ?? { seconds: 0, count: 0 }
    cur.seconds += e.seconds
    cur.count += 1
    map.set(e.userId, cur)
  }
  return [...map.entries()]
    .map(([id, v]) => ({ key: id, label: userName(id), totalSeconds: v.seconds, entryCount: v.count }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
})

function messageFor(e: unknown, notFound: string, forbidden: string): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return forbidden
    if (e.status === 404) return notFound
    return e.message
  }
  return 'Не удалось загрузить отчёт.'
}

async function loadUserReport() {
  const uid = userId.value ?? auth.profile?.id
  if (!uid) return
  loading.value = true
  errorText.value = null
  try {
    userReport.value = await getTimeReport({ userId: uid, year: year.value, month: month.value || undefined })
  } catch (e) {
    userReport.value = null
    errorText.value = messageFor(
      e,
      'Пользователь не найден.',
      'Нет ни одного общего проекта с этим пользователем — его отчёт недоступен.'
    )
  } finally {
    loading.value = false
  }
}

async function loadProjectReport() {
  if (!projectId.value) {
    projectReport.value = null
    return
  }
  loading.value = true
  errorText.value = null
  try {
    projectReport.value = await getProjectTimeReport(projectId.value, { year: year.value, month: month.value || undefined })
  } catch (e) {
    projectReport.value = null
    errorText.value = messageFor(e, 'Проект не найден.', 'Вы не участник этого проекта — отчёт недоступен.')
  } finally {
    loading.value = false
  }
}

async function loadProjectTasks() {
  if (!projectId.value) {
    projectTasks.value = []
    return
  }
  tasksLoading.value = true
  try {
    projectTasks.value = await listProjectTasks(projectId.value)
  } catch {
    projectTasks.value = []
  } finally {
    tasksLoading.value = false
  }
}

async function loadTaskReport() {
  if (!taskId.value) {
    taskTotalSeconds.value = 0
    taskEntries.value = []
    return
  }
  loading.value = true
  errorText.value = null
  try {
    const [total, entries] = await Promise.all([
      getTaskTotalSeconds(taskId.value),
      listTimeEntries(taskId.value)
    ])
    taskTotalSeconds.value = total
    taskEntries.value = entries.slice().sort((a, b) => {
      const ta = new Date(a.startTime ?? a.createdAt).getTime()
      const tb = new Date(b.startTime ?? b.createdAt).getTime()
      return tb - ta
    })
  } catch (e) {
    taskTotalSeconds.value = 0
    taskEntries.value = []
    errorText.value = messageFor(e, 'Задача недоступна.', 'Задача недоступна.')
  } finally {
    loading.value = false
  }
}

async function refreshTab() {
  errorText.value = null
  if (tab.value === 'user') {
    if (!userId.value) userId.value = auth.profile?.id
    await loadUserReport()
  } else if (tab.value === 'project') {
    if (!projectId.value) projectId.value = dictionaries.projects[0]?.id
    await loadProjectReport()
  } else {
    if (!projectId.value) projectId.value = dictionaries.projects[0]?.id
    await loadProjectTasks()
    if (taskId.value && !projectTasks.value.some(t => t.id === taskId.value)) taskId.value = undefined
    await loadTaskReport()
  }
}

function syncQuery() {
  router.replace({
    query: {
      tab: tab.value,
      year: String(year.value),
      month: month.value ? String(month.value) : undefined,
      user: tab.value === 'user' && userId.value ? String(userId.value) : undefined,
      project: tab.value !== 'user' && projectId.value ? String(projectId.value) : undefined,
      task: tab.value === 'task' && taskId.value ? String(taskId.value) : undefined
    }
  })
}

watch(tab, () => {
  if (!ready.value) return
  syncQuery()
  refreshTab()
})
watch([year, month], () => {
  if (!ready.value) return
  syncQuery()
  if (tab.value === 'user') loadUserReport()
  else if (tab.value === 'project') loadProjectReport()
})
watch(userId, () => {
  if (!ready.value || tab.value !== 'user') return
  syncQuery()
  loadUserReport()
})
watch(projectId, () => {
  if (!ready.value) return
  taskId.value = undefined
  syncQuery()
  if (tab.value === 'project') loadProjectReport()
  else if (tab.value === 'task') refreshTaskSide()
})
watch(taskId, () => {
  if (!ready.value || tab.value !== 'task') return
  syncQuery()
  loadTaskReport()
})

async function refreshTaskSide() {
  await loadProjectTasks()
  await loadTaskReport()
}

function goToProjectTasks(id: number) {
  router.push({ path: '/tasks', query: { project: id } })
}

// CSV — единственный формат экспорта без новой зависимости (XLSX/PDF её
// требуют); только «По пользователю»/«По проекту», как и просили. «По задаче»
// не трогаем — там и так виден полный список списаний на странице.
const canExport = computed(() =>
  (tab.value === 'user' && !!userReport.value) || (tab.value === 'project' && !!projectReport.value)
)

function exportCsv() {
  const rows: string[] = []
  if (tab.value === 'user' && userReport.value) {
    const who = userName(userReport.value.userId)
    rows.push(toCsvRow([`Отчёт по пользователю: ${who}`, periodLabel.value]))
    rows.push('')
    rows.push(toCsvRow(['Проект', 'Время', 'Часы', 'Записей']))
    for (const r of userRows.value) rows.push(toCsvRow([r.label, formatDuration(r.totalSeconds), hoursForCsv(r.totalSeconds), r.entryCount]))
    rows.push(toCsvRow(['Итого', formatDuration(userReport.value.totalSeconds), hoursForCsv(userReport.value.totalSeconds), userReport.value.entryCount]))
    downloadCsv(`отчёт-по-пользователю-${who}-${periodLabel.value}.csv`, rows)
  } else if (tab.value === 'project' && projectReport.value) {
    const projName = projectReport.value.projectName || `Проект #${projectReport.value.projectId}`
    rows.push(toCsvRow([`Отчёт по проекту: ${projName}`, periodLabel.value]))
    rows.push('')
    rows.push(toCsvRow(['Пользователь', 'Время', 'Часы', 'Записей']))
    for (const r of projectRows.value) rows.push(toCsvRow([r.label, formatDuration(r.totalSeconds), hoursForCsv(r.totalSeconds), r.entryCount]))
    rows.push(toCsvRow(['Итого', formatDuration(projectReport.value.totalSeconds), hoursForCsv(projectReport.value.totalSeconds), projectReport.value.entryCount]))
    downloadCsv(`отчёт-по-проекту-${projName}-${periodLabel.value}.csv`, rows)
  }
}

onMounted(async () => {
  await Promise.all([
    dictionaries.loadProjects().catch(() => {}),
    dictionaries.loadUsers().catch(() => {})
  ])
  await refreshTab()
  ready.value = true
  syncQuery()
})
</script>

<template>
  <div>
    <PageHeader title="Отчёты по времени" subtitle="Списанное время по пользователям, проектам и задачам">
      <template #actions>
        <UButton v-if="canExport" icon="i-lucide-download" variant="outline" color="primary" @click="exportCsv">
          Экспорт CSV
        </UButton>
        <HelpLink topic="reports" label="Справка: отчёты по времени" />
      </template>
      <div class="inline-flex rounded-lg border border-default p-0.5">
        <button
          v-for="t in TABS"
          :key="t.value"
          type="button"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors"
          :class="tab === t.value ? 'bg-elevated font-medium text-highlighted' : 'text-muted hover:text-highlighted'"
          @click="tab = t.value"
        >
          <UIcon :name="t.icon" class="size-4" />
          {{ t.label }}
        </button>
      </div>
    </PageHeader>

    <div class="mx-auto w-[95%] px-6 py-6">
      <div class="mb-6 flex flex-wrap items-end gap-3">
        <label v-if="tab === 'user'" class="flex flex-col gap-1 text-xs text-muted">
          Пользователь
          <USelectMenu v-model="userId" :items="userItems" value-key="value" placeholder="Выберите" class="w-[240px]" />
        </label>

        <label v-if="tab !== 'user'" class="flex flex-col gap-1 text-xs text-muted">
          Проект
          <USelectMenu v-model="projectId" :items="projectItems" value-key="value" placeholder="Выберите" class="w-[240px]" />
        </label>

        <label v-if="tab === 'task'" class="flex flex-col gap-1 text-xs text-muted">
          Задача
          <USelectMenu
            v-model="taskId"
            :items="taskItems"
            value-key="value"
            :loading="tasksLoading"
            :disabled="!projectId || !taskItems.length"
            placeholder="Выберите задачу"
            class="w-[360px]"
          />
        </label>

        <PeriodControls v-if="tab !== 'task'" v-model:year="year" v-model:month="month" />
      </div>

      <EmptyState
        v-if="errorText"
        icon="i-lucide-triangle-alert"
        title="Отчёт недоступен"
        :description="errorText || undefined"
      />

      <div v-else-if="loading" class="flex flex-col gap-3">
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-48 w-full" />
      </div>

      <template v-else-if="tab === 'user'">
        <TimeReportBreakdown
          v-if="userReport"
          :total-seconds="userReport.totalSeconds"
          :total-hours="userReport.totalHours"
          :entry-count="userReport.entryCount"
          :period-label="periodLabel"
          :rows="userRows"
          row-header="Проект"
          selectable
          empty-text="За выбранный период списаний времени нет."
          @select="goToProjectTasks"
        />
      </template>

      <template v-else-if="tab === 'project'">
        <EmptyState
          v-if="!projectId"
          icon="i-lucide-folder"
          title="Выберите проект"
          description="Отчёт покажет, кто и сколько времени списал по проекту за период."
        />
        <TimeReportBreakdown
          v-else-if="projectReport"
          :total-seconds="projectReport.totalSeconds"
          :total-hours="projectReport.totalHours"
          :entry-count="projectReport.entryCount"
          :period-label="periodLabel"
          :rows="projectRows"
          row-header="Пользователь"
          empty-text="За выбранный период по проекту время не списывали."
        />
      </template>

      <template v-else>
        <EmptyState v-if="!projectId" icon="i-lucide-folder" title="Выберите проект" />
        <EmptyState
          v-else-if="!taskId"
          icon="i-lucide-check-square"
          title="Выберите задачу"
          description="Отчёт покажет суммарное время и все списания по задаче."
        />
        <div v-else class="flex flex-col gap-6">
          <RouterLink
            :to="`/tasks/${projectId}/${taskId}`"
            class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-highlighted"
          >
            <UIcon name="i-lucide-external-link" class="size-4" />
            <span class="font-mono">#{{ taskId }}</span>
            <span>{{ selectedTask?.title ?? 'Открыть задачу' }}</span>
          </RouterLink>

          <TimeReportBreakdown
            :total-seconds="taskTotalSeconds"
            :entry-count="taskEntries.length"
            :rows="taskRows"
            row-header="Пользователь"
            empty-text="По задаче ещё не списывали время."
          />

          <div v-if="taskEntries.length">
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Все списания ({{ taskEntries.length }})
            </p>
            <div class="overflow-x-auto rounded-lg border border-default">
              <table class="w-full min-w-[560px] text-sm">
                <thead class="bg-elevated/40 text-left text-xs text-muted">
                  <tr>
                    <th class="w-28 px-4 py-2">Дата</th>
                    <th class="px-2 py-2">Пользователь</th>
                    <th class="w-24 px-2 py-2 text-right">Время</th>
                    <th class="px-2 py-2">Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in taskEntries" :key="e.id" class="border-t border-default">
                    <td class="whitespace-nowrap px-4 py-2 text-muted">{{ formatDate(e.startTime ?? e.createdAt) }}</td>
                    <td class="px-2 py-2">{{ userName(e.userId) }}</td>
                    <td class="px-2 py-2 text-right font-mono">{{ formatDuration(e.seconds) }}</td>
                    <td class="px-2 py-2 text-muted">{{ e.description || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
