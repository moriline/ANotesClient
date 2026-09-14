// Общая логика «доски» — своей (/dashboard) и чужой (PersonBoardView, todo.txt
// п.2). Один запрос POST /api/find (по assignedUserId или assignedToMe) несёт
// projectId/milestoneId/milestoneTitle на каждой строке, поэтому фильтр и
// группировка по проекту/вехе — целиком клиентские, как и было в DashboardView.
import { computed, ref } from 'vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { findTasks } from '@/api/tasks'
import { ApiError } from '@/api/http'
import { isOverdue } from '@/utils/format'
import type { TaskResponse } from '@/types/domain'

const LIMIT = 500
const NO_MILESTONE = -1
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

// target — функция, а не готовый объект: у PersonBoardView.vue userId идёт из
// route-параметра, а сама страница не перемонтируется при переходе по ссылке
// на другого пользователя (тот же route record) — читаем текущее значение на
// каждый load(), а не то, что было на момент первого вызова composable.
export function useWorkloadBoard(target: () => { assignedUserId?: number; assignedToMe?: boolean }) {
  const dictionaries = useDictionariesStore()
  const toast = useToast()

  const loading = ref(true)
  const tasks = ref<TaskResponse[]>([])
  const total = ref(0)
  const loadError = ref<ApiError | null>(null)

  function ensureStatusesForTasks() {
    const seen = new Set<number>()
    for (const t of tasks.value) {
      if (t.projectId && !seen.has(t.projectId)) {
        seen.add(t.projectId)
        dictionaries.loadStatuses(t.projectId).catch(() => {})
      }
    }
  }

  async function load() {
    loading.value = true
    loadError.value = null
    try {
      const { assignedUserId, assignedToMe } = target()
      const res = await findTasks({
        assignedUserId,
        assignedToMe,
        isArchived: false,
        limit: LIMIT,
        sortBy: 'dueDate',
        sortDir: 'asc'
      })
      tasks.value = res.tasks
      total.value = res.total
      ensureStatusesForTasks()
    } catch (e) {
      loadError.value = e instanceof ApiError ? e : null
      toast.add({ title: 'Не удалось загрузить задачи', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  function isClosed(t: TaskResponse): boolean {
    return dictionaries.statusFor(t.projectId, t.statusId)?.isClosed ?? false
  }

  const projectId = ref<number | undefined>(undefined)
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

  const overdueTasks = computed(() => openTasks.value.filter(t => isOverdue(t.dueDate)))
  const dueSoonTasks = computed(() => openTasks.value.filter(t =>
    !isOverdue(t.dueDate) && t.dueDate != null && t.dueDate <= Date.now() + WEEK_MS
  ))
  const laterTasks = computed(() => openTasks.value.filter(t =>
    t.dueDate == null || (!isOverdue(t.dueDate) && t.dueDate > Date.now() + WEEK_MS)
  ))

  const recentlyClosedTasks = computed(() => filteredTasks.value
    .filter(t => isClosed(t) && Date.now() - new Date(t.updatedAt).getTime() <= DAY_MS)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  )

  function projectName(id: number): string {
    return dictionaries.projectById.get(id)?.name ?? `Проект #${id}`
  }

  return {
    NO_MILESTONE,
    loading,
    tasks,
    total,
    loadError,
    load,
    projectId,
    milestoneFilter,
    projectItems,
    milestoneItems,
    openTasks,
    overdueTasks,
    dueSoonTasks,
    laterTasks,
    recentlyClosedTasks,
    projectName
  }
}
