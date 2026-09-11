<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import DataTableShell from '@/components/common/DataTableShell.vue'
import HelpLink from '@/components/common/HelpLink.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import StatusBadge from '@/components/task/StatusBadge.vue'
import UserCell from '@/components/task/UserCell.vue'
import DueDate from '@/components/task/DueDate.vue'
import EpicProgress from '@/components/task/EpicProgress.vue'
import EpicGroupHeader from '@/components/task/EpicGroupHeader.vue'
import MilestoneGroupHeader from '@/components/task/MilestoneGroupHeader.vue'
import StatusBoard from '@/components/task/StatusBoard.vue'
import TaskFormModal from '@/components/task/TaskFormModal.vue'
import RelativeTime from '@/components/common/RelativeTime.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { useAuthStore } from '@/stores/auth'
import { findTasks, getTask, deleteTask, updateTask, createTask } from '@/api/tasks'
import { isEpic } from '@/utils/taskType'
import { useConfirm } from '@/composables/useConfirm'
import { useEpicGrouping, type EpicGroup } from '@/composables/useEpicGrouping'
import { useMilestoneGrouping } from '@/composables/useMilestoneGrouping'
import { useEpicCollapse } from '@/composables/useEpicCollapse'
import { useStatusBoard } from '@/composables/useStatusBoard'
import { createTaskModalOpen, tasksVersion } from '@/composables/useGlobalUi'
import { ApiError } from '@/api/http'
import type { TaskResponse, TaskType } from '@/types/domain'

const route = useRoute()
const router = useRouter()
const dictionaries = useDictionariesStore()
const auth = useAuthStore()
const toast = useToast()
const { confirm } = useConfirm()

const PAGE_SIZE = 25

const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const projectId = ref<number | undefined>(route.query.project ? Number(route.query.project) : undefined)
const statusId = ref<number | undefined>(route.query.status ? Number(route.query.status) : undefined)
const assignedUserId = ref<number | undefined>(route.query.assignee ? Number(route.query.assignee) : undefined)
const assignedToMe = ref(route.query.mine === '1')
const showArchived = ref(route.query.archived === '1')
const selectedTags = ref<string[]>(typeof route.query.tag === 'string' ? route.query.tag.split(',').filter(Boolean) : [])
// Фильтр по вехе (plan.md §5.6): undefined — любая; -1 — «Без вехи» (noMilestone);
// положительное число — конкретная веха.
const NO_MILESTONE = -1
const milestoneFilter = ref<number | undefined>(
  route.query.milestone === 'none' ? NO_MILESTONE
    : route.query.milestone ? Number(route.query.milestone) : undefined
)
const page = ref(route.query.page ? Number(route.query.page) : 1)
// Фильтр по виду (parent_task.md §5.5) и режим отображения (§5.6, tasks_view.md).
const taskType = ref<TaskType | undefined>(
  route.query.type === 'epic' ? 'EPIC' : route.query.type === 'task' ? 'TASK' : undefined
)
const viewMode = ref<'list' | 'epics' | 'milestones' | 'board'>(
  route.query.view === 'epics' ? 'epics'
    : route.query.view === 'milestones' ? 'milestones'
      : route.query.view === 'board' ? 'board'
        : 'list'
)
// Явный выбор режима человеком важнее автоподбора (tasks_view.md §3). Вид в URL —
// это тоже явный выбор (кто-то поделился ссылкой именно на такой режим).
const userChangedMode = ref(!!route.query.view)

const typeItems = [
  { label: 'Все виды', value: undefined },
  { label: 'Только задачи', value: 'TASK' as const },
  { label: 'Только эпики', value: 'EPIC' as const }
]
const viewItems = [
  { label: 'Список', value: 'list' as const },
  { label: 'По эпикам', value: 'epics' as const },
  { label: 'По вехам', value: 'milestones' as const },
  { label: 'Доска', value: 'board' as const }
]

const tasks = ref<TaskResponse[]>([])
const total = ref(0)
const loading = ref(false)
const selectedIds = ref<Set<number>>(new Set())

const hasActiveFilters = computed(() =>
  !!search.value || !!projectId.value || !!statusId.value || !!assignedUserId.value ||
  assignedToMe.value || showArchived.value || selectedTags.value.length > 0 || !!taskType.value ||
  milestoneFilter.value !== undefined
)

const projectItems = computed(() => [
  { label: 'Все проекты', value: undefined },
  ...dictionaries.projects.map(p => ({ label: p.name, value: p.id }))
])

const statusItems = computed(() => {
  if (!projectId.value) return []
  const statuses = dictionaries.statusesByProject[projectId.value] ?? []
  return [{ label: 'Любой статус', value: undefined }, ...statuses.map(s => ({ label: s.statusName, value: s.id }))]
})

const userItems = computed(() => [
  { label: 'Все исполнители', value: undefined },
  ...dictionaries.users.map(u => ({ label: u.displayName || u.username, value: u.id }))
])

const projectMilestones = computed(() =>
  projectId.value ? dictionaries.milestonesByProject[projectId.value] ?? [] : []
)
const milestoneFilterItems = computed(() => [
  { label: 'Любая веха', value: undefined },
  { label: 'Без вехи', value: NO_MILESTONE },
  ...projectMilestones.value
    .filter(m => m.state !== 'CLOSED')
    .map(m => ({ label: m.title, value: m.id }))
])

// Словарь тегов для фильтра — только теги проектов (ProjectResponse.tags).
// Он не зависит от того, какие теги сейчас стоят на задачах: снятие тега
// с задачи не должно менять список доступных тегов.
const allTags = computed(() => {
  const set = new Set<string>()
  for (const p of dictionaries.projects) for (const t of p.tags ?? []) set.add(t)
  return [...set].sort((a, b) => a.localeCompare(b))
})

// Фильтр по тегам самой задачи (task.tags), клиентский — в пределах
// текущей страницы результатов.
const visibleTasks = computed(() => {
  if (!selectedTags.value.length) return tasks.value
  return tasks.value.filter(t => selectedTags.value.every(tag => t.tags.includes(tag)))
})

const allSelected = computed(() => visibleTasks.value.length > 0 && visibleTasks.value.every(t => selectedIds.value.has(t.id)))

// --- Режим «По эпикам» (parent_task.md §5.6, tasks_view.md) ---------------------
// Группировка целиком на клиенте. Заголовки и прогресс эпиков — из справочника
// dictionaries.epicsByProject (GET /api/projects/{id}/epics): дочерняя задача не
// несёт childTotal/childDone родителя, а фильтр «мои задачи» вообще не возвращает
// эпики. В режиме группировки грузятся ВСЕ задачи проекта (без пагинации) —
// иначе группа, разрезанная границей страницы, рассыпает представление (§2.4).
const projectEpics = computed(() =>
  projectId.value ? dictionaries.epicsByProject[projectId.value] ?? [] : []
)
const projectEpicCount = computed(() => projectEpics.value.length)

const groups = useEpicGrouping(visibleTasks, projectEpics)

// Фильтры, сужающие выдачу (в отличие от выбора проекта): при них прячем
// пустые/непопавшие группы, оставляя только те, где есть совпадения (§2.2).
// taskType в режиме группировки не применяется (нужны оба вида), поэтому не в счёт.
const narrowingFilters = computed(() =>
  !!search.value.trim() || !!statusId.value || !!assignedUserId.value ||
  assignedToMe.value || selectedTags.value.length > 0 || milestoneFilter.value !== undefined
)
const displayGroups = computed(() =>
  narrowingFilters.value ? groups.value.filter(g => g.visibleCount > 0) : groups.value
)

const { isCollapsed, toggle: toggleGroup, collapseAll, expandAll } = useEpicCollapse(projectId)
const allGroupIds = computed(() => displayGroups.value.map(g => g.id))
function collapseAllGroups() { collapseAll() }
function expandAllGroups() { expandAll(allGroupIds.value) }

// --- Режим «По вехам» (plan.md §5.6) — тот же механизм, ключ группы другой -----
const msGroups = useMilestoneGrouping(visibleTasks, projectMilestones)
const displayMilestoneGroups = computed(() =>
  narrowingFilters.value ? msGroups.value.filter(g => g.visibleCount > 0) : msGroups.value
)
const {
  isCollapsed: isMsCollapsed,
  toggle: toggleMsGroup,
  collapseAll: collapseAllMs,
  expandAll: expandAllMs
} = useEpicCollapse(projectId, 'milestoneExpanded')
function collapseAllMsGroups() { collapseAllMs() }
function expandAllMsGroups() { expandAllMs(displayMilestoneGroups.value.map(g => g.id)) }

// Создание задачи прямо в пустом эпике из заголовка группы
const epicCreateOpen = ref(false)
const createParentId = ref<number | undefined>()
const createParentTitle = ref<string | undefined>()
function addToEpic(group: EpicGroup) {
  createParentId.value = group.id
  createParentTitle.value = group.title
  epicCreateOpen.value = true
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined

function scheduleFetch() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchTasks, 300)
}

// Общие поля фильтра для POST /api/find. contentSearch, а не titleSearch:
// у бэкенда titleSearch — регистрозависимая подстрока («redesign» не находит
// «Redesign…»), contentSearch ищет без учёта регистра по названию и описанию.
function baseFilter(opts?: { ignoreStatus?: boolean }) {
  return {
    contentSearch: search.value.trim() || undefined,
    projectId: projectId.value,
    // На доске фильтр по статусу не применяется — он спрятал бы колонки.
    statusId: opts?.ignoreStatus ? undefined : (projectId.value ? statusId.value : undefined),
    assignedUserId: assignedToMe.value ? undefined : assignedUserId.value,
    assignedToMe: assignedToMe.value || undefined,
    // Вехи пер-проектные — фильтр по вехе работает только с выбранным проектом.
    milestoneId: projectId.value && milestoneFilter.value != null && milestoneFilter.value > 0
      ? milestoneFilter.value
      : undefined,
    noMilestone: projectId.value && milestoneFilter.value === NO_MILESTONE ? true : undefined,
    isArchived: showArchived.value || undefined,
    sortBy: 'updatedAt',
    sortDir: 'desc' as const
  }
}

// «#104» или просто «104» — номер задачи. contentSearch номер не найдёт (это
// подстрока по названию/описанию), а у /api/find нет фильтра по id вовсе —
// задачи адресуются глобальным id, отдельной ручки «по id» тоже нет (та же
// причина, по которой WikiMarkdown резолвит #id через /api/find с limit).
const TASK_NUMBER = /^#?(\d+)$/

async function fetchTasks() {
  if (viewMode.value === 'epics') return fetchGrouped()
  if (viewMode.value === 'milestones') return fetchMilestoneGrouped()
  if (viewMode.value === 'board') return fetchBoard()

  const numberMatch = TASK_NUMBER.exec(search.value.trim())
  if (numberMatch) return fetchByTaskNumber(Number(numberMatch[1]))

  loading.value = true
  try {
    const res = await findTasks({
      ...baseFilter(),
      taskType: taskType.value,
      limit: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE
    })
    tasks.value = res.tasks
    total.value = res.total
    selectedIds.value = new Set()
    ensureStatusesForTasks()
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить задачи', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loading.value = false
  }
}

// Выбран проект — задачу можно получить напрямую (GET .../tasks/{id}), без
// оглядки на прочие фильтры: «найди мне #104» это прямой переход, а не сужение
// списка. Без проекта id глобальный, а ручки «по id» нет — просматриваем, как
// WikiMarkdown резолвит #id, лимитом в 500 (тот же компромисс, тот же повод).
async function fetchByTaskNumber(id: number) {
  loading.value = true
  try {
    let found: TaskResponse | null = null
    if (projectId.value) {
      try {
        found = await getTask(projectId.value, id)
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e
      }
    } else {
      const res = await findTasks({ limit: 500 })
      found = res.tasks.find(t => t.id === id) ?? null
    }
    tasks.value = found ? [found] : []
    total.value = tasks.value.length
    selectedIds.value = new Set()
    ensureStatusesForTasks()
  } catch (e) {
    toast.add({ title: 'Не удалось найти задачу', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loading.value = false
  }
}

// В режиме группировки контракт не помогает: флага `grouped` в FindTasksRequest
// нет, поэтому все незакрытые задачи проекта собираем сами, страницами по 200
// (предел /api/find). Строка списка ~300 байт, потолок в 4000 задач — ~1.2 МБ.
const GROUPING_HARD_CAP = 4000
async function fetchGrouped() {
  if (!projectId.value) {
    tasks.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const pid = projectId.value
    const [all] = await Promise.all([
      fetchAllProjectTasks(pid),
      dictionaries.loadEpics(pid, true) // свежий прогресс после любых правок
    ])
    if (projectId.value !== pid) return // проект успели сменить
    tasks.value = all
    selectedIds.value = new Set()
    dictionaries.loadStatuses(pid).catch(() => {})
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить задачи', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loading.value = false
  }
}

// Режим «По вехам»: как fetchGrouped, но со свежим списком вех проекта
// (заголовки и прогресс групп считает сервер).
async function fetchMilestoneGrouped() {
  if (!projectId.value) {
    tasks.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const pid = projectId.value
    const [all] = await Promise.all([
      fetchAllProjectTasks(pid),
      dictionaries.loadMilestones(pid, true)
    ])
    if (projectId.value !== pid) return
    tasks.value = all
    selectedIds.value = new Set()
    dictionaries.loadStatuses(pid).catch(() => {})
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить задачи', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function fetchAllProjectTasks(pid: number, ignoreStatus = false): Promise<TaskResponse[]> {
  const LIMIT = 200
  const all: TaskResponse[] = []
  for (let offset = 0; ; offset += LIMIT) {
    const res = await findTasks({ ...baseFilter({ ignoreStatus }), projectId: pid, limit: LIMIT, offset })
    all.push(...res.tasks)
    total.value = res.total
    if (res.tasks.length < LIMIT || all.length >= res.total || all.length >= GROUPING_HARD_CAP) break
  }
  return all
}

// --- Режим «Доска» (status_view.md) -------------------------------------------
// Колонки — статусы проекта, карточки — задачи в колонке своего statusId.
// Данные те же, что у режима «по эпикам»: все задачи проекта разом. Раскладку по
// колонкам и фильтрацию эпиков делает useStatusBoard. Серверных изменений нет.
const boardStatuses = computed(() =>
  projectId.value ? dictionaries.statusesByProject[projectId.value] ?? [] : []
)
const boardColumns = useStatusBoard(boardStatuses, visibleTasks)

async function fetchBoard() {
  if (!projectId.value) {
    tasks.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const pid = projectId.value
    const [all] = await Promise.all([
      fetchAllProjectTasks(pid, true), // фильтр по статусу на доске игнорируем
      dictionaries.loadStatuses(pid)
    ])
    if (projectId.value !== pid) return // проект успели сменить
    tasks.value = all
    selectedIds.value = new Set()
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить доску', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loading.value = false
  }
}

// Перенос карточки между колонками — оптимистично, с откатом и разбором 409
// (status_view.md §6). X-Expected-Version берём у карточки: на доске её легко
// забыть передать, а перетаскивание — самое частое место конкурентной правки.
async function moveCard({ task, toStatusId }: { task: TaskResponse; toStatusId: number }) {
  if (task.statusId === toStatusId) return
  const from = task.statusId
  task.statusId = toStatusId // оптимистично: карточка едет сразу
  try {
    const updated = await updateTask(task.projectId, task.id, { statusId: toStatusId }, task.version)
    Object.assign(task, updated) // забираем новый version — иначе следующий перенос даст ложный 409
  } catch (e) {
    task.statusId = from // сначала вернуть карточку на место, потом обновлять доску
    if (e instanceof ApiError && e.status === 409) {
      toast.add({
        title: 'Карточку только что перенёс другой пользователь',
        description: 'Доска обновлена — попробуйте снова',
        color: 'warning'
      })
      fetchBoard()
    } else {
      toast.add({
        title: 'Не удалось перенести карточку',
        description: e instanceof ApiError ? e.message : undefined,
        color: 'error'
      })
    }
  }
}

// Бейджи статусов в таблице берутся из dictionaries.statusesByProject —
// статусы «пер-проектные», поэтому без фильтра по проекту нужно подгрузить
// их для всех проектов, встретившихся в выдаче, иначе каждая задача
// показывается как «Без статуса», пока не откроешь её карточку. loadStatuses
// кэширует по projectId, так что повторные вызовы почти бесплатны.
function ensureStatusesForTasks() {
  const seen = new Set<number>()
  for (const t of tasks.value) {
    if (t.projectId && !seen.has(t.projectId)) {
      seen.add(t.projectId)
      dictionaries.loadStatuses(t.projectId).catch(() => {})
    }
  }
}

function syncQuery() {
  router.replace({
    query: {
      q: search.value || undefined,
      project: projectId.value,
      status: statusId.value,
      assignee: assignedUserId.value,
      mine: assignedToMe.value ? '1' : undefined,
      archived: showArchived.value ? '1' : undefined,
      tag: selectedTags.value.length ? selectedTags.value.join(',') : undefined,
      type: taskType.value === 'EPIC' ? 'epic' : taskType.value === 'TASK' ? 'task' : undefined,
      milestone: milestoneFilter.value === NO_MILESTONE ? 'none' : milestoneFilter.value || undefined,
      view: viewMode.value === 'list' ? undefined : viewMode.value,
      page: page.value > 1 ? page.value : undefined
    }
  })
}

watch(projectId, (id) => {
  statusId.value = undefined
  milestoneFilter.value = undefined
  if (id) {
    dictionaries.loadStatuses(id).catch(() => {})
    dictionaries.loadEpics(id).catch(() => {}) // для счётчика эпиков и автоподбора режима
    dictionaries.loadMilestones(id).catch(() => {}) // для фильтра/группировки по вехам
  }
})

// Автоподбор режима (tasks_view.md §3): выбран ровно один проект и в нём есть
// эпики → сразу группировка. Выбор проекта и есть сигнал «покажи структуру».
// userChangedMode защищает явный выбор человека от возврата при смене фильтра.
watch([projectId, projectEpicCount], () => {
  if (userChangedMode.value) return
  viewMode.value = projectId.value && projectEpicCount.value > 0 ? 'epics' : 'list'
})

watch([search], () => { page.value = 1; syncQuery(); scheduleFetch() })
watch([projectId, statusId, assignedUserId, assignedToMe, showArchived, taskType, milestoneFilter, viewMode], () => {
  page.value = 1
  syncQuery()
  fetchTasks()
})
// Фильтр по тегам — клиентский, перезапрос не нужен, только синк URL.
watch(selectedTags, syncQuery, { deep: true })
watch(page, () => { syncQuery(); fetchTasks() })
watch(tasksVersion, () => fetchTasks())

// Клавиатура в режиме группировки (tasks_view.md §7): Shift+←/→ — свернуть /
// развернуть все. isTyping обязателен, иначе стрелки в поле поиска будут
// сворачивать группы вместо перемещения курсора по тексту.
function isTyping(el: EventTarget | null) {
  return el instanceof HTMLElement &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}
function onKeydown(e: KeyboardEvent) {
  if (isTyping(e.target)) return
  if (viewMode.value === 'epics') {
    if (e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); collapseAllGroups() }
    else if (e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); expandAllGroups() }
  } else if (viewMode.value === 'milestones') {
    if (e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); collapseAllMsGroups() }
    else if (e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); expandAllMsGroups() }
  }
}

onMounted(() => {
  // Список задач не ждёт справочники: POST /api/find уходит сразу, а
  // проекты/пользователи/статусы наполняют фильтры и подписи ячеек
  // реактивно по мере готовности.
  fetchTasks()
  dictionaries.loadProjects().catch(() => {})
  dictionaries.loadUsers().catch(() => {})
  if (projectId.value) {
    dictionaries.loadStatuses(projectId.value).catch(() => {})
    dictionaries.loadEpics(projectId.value).catch(() => {})
    dictionaries.loadMilestones(projectId.value).catch(() => {})
  }
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function resetFilters() {
  // В группировке/доске «Сбросить» должен убирать сужение, не выкидывая из
  // текущего проекта — НО только если есть что убирать помимо самого проекта.
  // Иначе (project/view — единственное выставленное, напр. прямая ссылка
  // ?project=5&view=epics) сбрасывать нечего, и кнопка молча ничего не делает —
  // тот самый баг. Поэтому: если, кроме project, что-то ещё активно — щадящий
  // сброс (остаёмся в проекте/группировке); если project/view — единственное
  // активное — сбрасываем и их тоже.
  const otherFiltersActive = !!search.value || !!statusId.value || !!assignedUserId.value ||
    assignedToMe.value || showArchived.value || selectedTags.value.length > 0 ||
    !!taskType.value || milestoneFilter.value !== undefined

  search.value = ''
  statusId.value = undefined
  assignedUserId.value = undefined
  assignedToMe.value = false
  showArchived.value = false
  selectedTags.value = []
  taskType.value = undefined
  milestoneFilter.value = undefined
  page.value = 1

  if (viewMode.value === 'list' || !otherFiltersActive) {
    projectId.value = undefined
    viewMode.value = 'list'
    userChangedMode.value = false
  }
}

// Строка не кликабельна целиком (консистентно с /projects) — переход по задаче
// только через ссылку в колонке «Название». Здесь — для пункта меню «Открыть».
function openTask(task: TaskResponse) {
  router.push(`/tasks/${task.projectId}/${task.id}`)
}

function toggleSelect(id: number) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(visibleTasks.value.map(t => t.id))
  }
}

function selectedTasks(): TaskResponse[] {
  return tasks.value.filter(t => selectedIds.value.has(t.id))
}

async function assignToMe(task: TaskResponse) {
  if (!auth.profile) return
  try {
    await updateTask(task.projectId, task.id, { assignedUserId: auth.profile.id })
    toast.add({ title: 'Исполнитель назначен', color: 'primary' })
    fetchTasks()
  } catch (e) {
    toast.add({ title: 'Не удалось назначить исполнителя', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

async function duplicateTask(task: TaskResponse) {
  try {
    await createTask(task.projectId, {
      title: `${task.title} (копия)`,
      description: task.description ?? undefined,
      tags: task.tags.length ? [...task.tags] : undefined
    })
    toast.add({ title: 'Задача продублирована', color: 'primary' })
    fetchTasks()
  } catch (e) {
    toast.add({ title: 'Не удалось продублировать задачу', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

async function removeTask(task: TaskResponse) {
  // Эпик с задачами внутри требует явного выбора (открепить / удалить всё) —
  // это делается на странице эпика. Здесь — только пустой эпик / обычная задача.
  if (isEpic(task) && (task.childTotal ?? 0) > 0) {
    const ok = await confirm({
      title: `В эпике «${task.title}» есть задачи`,
      description: 'Открепить их и удалить эпик? Сами задачи останутся в проекте.',
      confirmLabel: 'Открепить и удалить эпик'
    })
    if (!ok) return
    try {
      await deleteTask(task.projectId, task.id, 'detach')
      toast.add({ title: 'Эпик удалён, задачи откреплены', color: 'primary' })
      fetchTasks()
    } catch (e) {
      toast.add({ title: 'Не удалось удалить эпик', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
    }
    return
  }
  const ok = await confirm({
    title: isEpic(task) ? `Удалить эпик «${task.title}»?` : `Удалить задачу «${task.title}»?`,
    description: isEpic(task)
      ? 'Эпик будет удалён. Это действие нельзя отменить.'
      : 'Задача и все комментарии к ней будут удалены. Это действие нельзя отменить.'
  })
  if (!ok) return
  try {
    await deleteTask(task.projectId, task.id)
    toast.add({ title: isEpic(task) ? 'Эпик удалён' : 'Задача удалена', color: 'primary' })
    fetchTasks()
  } catch (e) {
    toast.add({ title: 'Не удалось удалить', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

async function bulkDelete() {
  const items = selectedTasks()
  const ok = await confirm({
    title: `Удалить задачи (${items.length})?`,
    description: 'Выбранные задачи и комментарии к ним будут удалены. Это действие нельзя отменить.'
  })
  if (!ok) return
  try {
    await Promise.all(items.map(t => deleteTask(t.projectId, t.id)))
    toast.add({ title: 'Задачи удалены', color: 'primary' })
    fetchTasks()
  } catch (e) {
    toast.add({ title: 'Не удалось удалить часть задач', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

const bulkAssigneeId = ref<number | undefined>(undefined)
async function bulkAssign() {
  if (!bulkAssigneeId.value) return
  const items = selectedTasks()
  try {
    await Promise.all(items.map(t => updateTask(t.projectId, t.id, { assignedUserId: bulkAssigneeId.value })))
    toast.add({ title: 'Исполнитель назначен', color: 'primary' })
    bulkAssigneeId.value = undefined
    fetchTasks()
  } catch (e) {
    toast.add({ title: 'Не удалось назначить исполнителя', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

const openCount = computed(() => total.value)
</script>

<template>
  <div>
    <PageHeader title="Задачи">
      <template #title>
        Задачи
        <span class="text-[13px] font-normal text-muted">(Найдено: {{ openCount }})</span>
      </template>
      <template #actions>
        <UButton v-if="selectedIds.size === 0" icon="i-lucide-plus" color="primary" @click="createTaskModalOpen = true">Задача</UButton>
      </template>

      <div v-if="selectedIds.size === 0" class="flex flex-col gap-2">
        <div class="flex flex-wrap items-end gap-2">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Поиск строки или #номер" class="w-[240px]" />
          <!-- Подпись — постоянная (UFormField), а не placeholder: тот пропадает,
               как только фильтр заполнен, и непонятно, какое поле за что отвечает
               (плавающих/анимированных лейблов в этой версии Nuxt UI нет). -->
          <UFormField label="Проект">
            <template #label>
              <span class="inline-flex items-center gap-1">
                Проект
                <!-- С этой страницы нельзя было попасть в базу знаний проекта —
                     только через /projects. Значок при подписи, а не отдельная
                     кнопка в ряду: не ломает высоту строки и явно привязан к
                     выбранному здесь проекту. -->
                <RouterLink
                  v-if="projectId"
                  :to="`/projects/${projectId}/wiki`"
                  class="inline-flex size-4 items-center justify-center rounded-full text-dimmed transition-colors hover:text-primary"
                  title="База знаний проекта"
                  aria-label="База знаний проекта"
                >
                  <UIcon name="i-lucide-book-open" class="size-3.5" />
                </RouterLink>
              </span>
            </template>
            <USelectMenu v-model="projectId" :items="projectItems" value-key="value" placeholder="Любой" class="w-[180px]" />
          </UFormField>
          <UFormField label="Статус">
            <USelectMenu
              v-model="statusId"
              :items="statusItems"
              value-key="value"
              :disabled="!projectId || viewMode === 'board'"
              placeholder="Любой"
              class="w-[160px]"
            />
          </UFormField>
          <UFormField label="Веха">
            <USelectMenu
              v-model="milestoneFilter"
              :items="milestoneFilterItems"
              value-key="value"
              :disabled="!projectId"
              placeholder="Любая"
              class="w-[160px]"
            />
          </UFormField>
          <UFormField label="Исполнитель">
            <USelectMenu v-model="assignedUserId" :items="userItems" value-key="value" :disabled="assignedToMe" placeholder="Любой" class="w-[180px]" />
          </UFormField>
          <UFormField label="Вид">
            <USelectMenu
              v-model="taskType"
              :items="typeItems"
              value-key="value"
              :disabled="viewMode !== 'list'"
              placeholder="Любой"
              class="w-[150px]"
            />
          </UFormField>
          <UFormField v-if="allTags.length" label="Теги">
            <USelectMenu
              v-model="selectedTags"
              :items="allTags"
              multiple
              icon="i-lucide-tag"
              placeholder="Любые"
              class="w-[180px]"
            />
          </UFormField>
          <UCheckbox v-model="assignedToMe" label="Назначено мне" class="mb-2" />
          <USwitch v-model="showArchived" label="Архивные" class="mb-2" />
          <UButton v-if="hasActiveFilters" variant="outline" color="primary" icon="i-lucide-x" @click="resetFilters">Сбросить</UButton>
        </div>

        <!-- Отдельная строка, не делит перенос с фильтрами выше: набор фильтров
             меняется (Сбросить то есть, то нет, Теги то есть, то нет), и если
             этот блок был просто ещё одним элементом того же flex-wrap, он
             прыгал по строке в зависимости от того, что перед ним успело
             перенестись. Здесь его позиция не зависит от фильтров вообще. -->
        <div class="flex items-center gap-1">
          <USelectMenu
            v-model="viewMode"
            :items="viewItems"
            value-key="value"
            class="w-[140px]"
            @update:model-value="userChangedMode = true"
          />
          <HelpLink
            topic="task-list"
            hash="views"
            label="Справка: режимы отображения списка"
            hint="Режимы списка: Список, По эпикам, Доска, По вехам. Плюс фильтры (проект, статус, веха, исполнитель, теги) и поиск по заголовку и описанию."
          />
        </div>
      </div>

      <div v-else class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium">Выбрано: {{ selectedIds.size }}</span>
        <USelectMenu v-model="bulkAssigneeId" :items="dictionaries.users.map(u => ({ label: u.displayName || u.username, value: u.id }))" value-key="value" placeholder="Назначить" class="w-[180px]" @update:model-value="bulkAssign" />
        <UButton color="error" variant="soft" icon="i-lucide-trash-2" @click="bulkDelete">Удалить</UButton>
        <UButton variant="outline" color="primary" @click="selectedIds = new Set()">Отменить выбор</UButton>
      </div>
    </PageHeader>

    <div class="mx-auto w-[95%] px-6 py-6">
      <DataTableShell
        v-if="viewMode === 'list'"
        :loading="loading"
        :empty="!loading && visibleTasks.length === 0"
      >
        <template #empty>
          <EmptyState
            v-if="!hasActiveFilters"
            icon="i-lucide-sprout"
            title="Пока ни одной задачи"
            description="Создайте первую — она появится здесь"
          >
            <template #action>
              <UButton color="primary" @click="createTaskModalOpen = true">Создать задачу</UButton>
            </template>
          </EmptyState>
          <EmptyState v-else icon="i-lucide-search-x" title="Ничего не найдено" description="Попробуйте изменить фильтры">
            <template #action>
              <UButton variant="outline" color="primary" @click="resetFilters">Сбросить фильтры</UButton>
            </template>
          </EmptyState>
        </template>

        <thead class="bg-elevated/40 text-left text-xs text-muted">
          <tr>
            <th class="w-10 px-4 py-2"><UCheckbox :model-value="allSelected" @update:model-value="toggleSelectAll" /></th>
            <th class="w-20 px-2 py-2">Ключ</th>
            <th class="px-2 py-2">Название</th>
            <th class="w-44 px-2 py-2">Статус</th>
            <th class="w-40 px-2 py-2">Исполнитель</th>
            <th class="w-36 px-2 py-2">Срок</th>
            <th class="w-28 px-2 py-2">Обновлена</th>
            <th class="w-12 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in visibleTasks"
            :key="task.id"
            class="border-t border-default hover:bg-elevated/40"
          >
            <td class="px-4 py-3">
              <UCheckbox :model-value="selectedIds.has(task.id)" @update:model-value="toggleSelect(task.id)" />
            </td>
            <td class="px-2 py-3 font-mono text-[13px] text-muted">
              <span class="inline-flex items-center gap-1">
                <UIcon v-if="isEpic(task)" name="i-lucide-package" class="size-3.5 text-primary" />
                #{{ task.id }}
              </span>
            </td>
            <td class="px-2 py-3">
              <div class="max-w-[420px]" :class="{ 'pl-5': task.parentId != null }">
                <RouterLink
                  :to="`/tasks/${task.projectId}/${task.id}`"
                  class="block truncate hover:text-primary hover:underline"
                  :class="{ 'font-medium': isEpic(task) }"
                >
                  {{ task.title }}
                </RouterLink>
                <p v-if="task.parentId && task.parentTitle" class="truncate text-xs text-muted">
                  в эпике: {{ task.parentTitle }}
                </p>
              </div>
            </td>
            <td class="px-2 py-3">
              <EpicProgress
                v-if="isEpic(task)"
                compact
                :done="task.childDone"
                :total="task.childTotal"
                :closed="task.epicClosed"
              />
              <StatusBadge v-else :status="dictionaries.statusFor(task.projectId, task.statusId)" />
            </td>
            <td class="px-2 py-3">
              <span v-if="isEpic(task)" class="text-muted">—</span>
              <UserCell v-else :user="task.assignedUserId ? dictionaries.userById.get(task.assignedUserId) : null" />
            </td>
            <td class="px-2 py-3"><DueDate :value="task.dueDate" /></td>
            <td class="px-2 py-3 text-muted"><RelativeTime :value="task.updatedAt" /></td>
            <td class="px-2 py-3">
              <UDropdownMenu
                :items="isEpic(task)
                  ? [[
                    { label: 'Открыть', icon: 'i-lucide-external-link', onSelect: () => openTask(task) }
                  ], [
                    { label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeTask(task) }
                  ]]
                  : [[
                    { label: 'Открыть', icon: 'i-lucide-external-link', onSelect: () => openTask(task) },
                    { label: 'Назначить на себя', icon: 'i-lucide-user-check', onSelect: () => assignToMe(task) },
                    { label: 'Дублировать', icon: 'i-lucide-copy', onSelect: () => duplicateTask(task) }
                  ], [
                    { label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeTask(task) }
                  ]]"
              >
                <UButton icon="i-lucide-ellipsis" variant="outline" color="primary" size="xs" />
              </UDropdownMenu>
            </td>
          </tr>
        </tbody>

        <template #pagination>
          <div class="flex items-center justify-between">
            <p class="text-sm text-muted">Показано {{ visibleTasks.length }} из {{ total }}</p>
            <UPagination v-model:page="page" :total="total" :items-per-page="PAGE_SIZE" />
          </div>
        </template>
      </DataTableShell>

      <!-- Режим «По эпикам» (tasks_view.md): все задачи проекта, без пагинации -->
      <template v-else-if="viewMode === 'epics'">
        <EmptyState
          v-if="!projectId"
          icon="i-lucide-layers"
          title="Выберите проект"
          description="Группировка по эпикам работает в пределах одного проекта — эпик принадлежит проекту"
        />

        <div v-else-if="loading" class="flex flex-col gap-2">
          <USkeleton v-for="i in 6" :key="i" class="h-11 w-full" />
        </div>

        <EmptyState
          v-else-if="!displayGroups.length"
          icon="i-lucide-layers"
          :title="narrowingFilters ? 'Ничего не найдено' : 'В проекте нет эпиков'"
          :description="narrowingFilters
            ? 'Ни одна задача не подошла под фильтр'
            : 'Заведите эпик, чтобы сгруппировать задачи по направлениям работы'"
        >
          <template #action>
            <UButton
              v-if="narrowingFilters"
              variant="outline"
              color="primary"
              @click="resetFilters"
            >
              Сбросить фильтры
            </UButton>
            <UButton
              v-else
              color="primary"
              icon="i-lucide-plus"
              @click="createTaskModalOpen = true"
            >
              Создать эпик
            </UButton>
          </template>
        </EmptyState>

        <div v-else class="overflow-hidden rounded-lg border border-default">
          <div class="flex items-center justify-between gap-2 border-b border-default bg-elevated/20 px-3 py-1.5 text-xs text-muted">
            <span>{{ displayGroups.length }} гр. · {{ visibleTasks.length }} задач на экране</span>
            <div class="flex gap-3">
              <button type="button" class="hover:text-primary" @click="expandAllGroups">Развернуть все</button>
              <button type="button" class="hover:text-primary" @click="collapseAllGroups">Свернуть все</button>
            </div>
          </div>

          <template v-for="g in displayGroups" :key="g.id">
            <EpicGroupHeader
              :group="g"
              :collapsed="isCollapsed(g.id)"
              @toggle="toggleGroup(g.id)"
            />
            <template v-if="!isCollapsed(g.id)">
              <div
                v-for="t in g.tasks"
                :key="t.id"
                class="flex items-center gap-3 border-b border-default py-2 pl-10 pr-3 text-sm hover:bg-elevated/30"
              >
                <span class="w-11 shrink-0 font-mono text-xs text-muted">#{{ t.id }}</span>
                <!-- Ссылка только на тексте названия (как в плоском списке и на доске),
                     а не на всей flex-полосе — обёртка забирает свободное место. -->
                <div class="min-w-0 flex-1">
                  <RouterLink
                    :to="`/tasks/${t.projectId}/${t.id}`"
                    class="inline-block max-w-full truncate align-middle hover:text-primary hover:underline"
                  >
                    {{ t.title }}
                  </RouterLink>
                </div>
                <div class="w-44 shrink-0">
                  <StatusBadge :status="dictionaries.statusFor(t.projectId, t.statusId)" />
                </div>
                <div class="hidden w-40 shrink-0 sm:block">
                  <UserCell :user="t.assignedUserId ? dictionaries.userById.get(t.assignedUserId) : null" size="xs" />
                </div>
                <div class="hidden w-36 shrink-0 text-right md:block"><DueDate :value="t.dueDate" /></div>
              </div>
              <div
                v-if="!g.tasks.length"
                class="border-b border-default py-2.5 pl-10 pr-3 text-xs text-muted"
              >
                В эпике пока нет задач.
                <UButton variant="link" size="xs" color="primary" class="align-baseline" @click="addToEpic(g)">
                  Добавить
                </UButton>
              </div>
            </template>
          </template>
        </div>
      </template>

      <!-- Режим «По вехам» (plan.md §5.6): все задачи проекта, группы по вехам -->
      <template v-else-if="viewMode === 'milestones'">
        <EmptyState
          v-if="!projectId"
          icon="i-lucide-diamond"
          title="Выберите проект"
          description="Группировка по вехам работает в пределах одного проекта — веха принадлежит проекту"
        />

        <div v-else-if="loading" class="flex flex-col gap-2">
          <USkeleton v-for="i in 6" :key="i" class="h-11 w-full" />
        </div>

        <EmptyState
          v-else-if="!displayMilestoneGroups.length"
          icon="i-lucide-diamond"
          :title="narrowingFilters ? 'Ничего не найдено' : 'В проекте нет вех'"
          :description="narrowingFilters
            ? 'Ни одна задача не подошла под фильтр'
            : 'Заведите вехи, чтобы сгруппировать задачи по срокам поставки'"
        >
          <template #action>
            <UButton
              v-if="narrowingFilters"
              variant="outline"
              color="primary"
              @click="resetFilters"
            >
              Сбросить фильтры
            </UButton>
            <UButton
              v-else
              :to="`/projects/${projectId}/milestones`"
              color="primary"
              icon="i-lucide-plus"
            >
              К вехам проекта
            </UButton>
          </template>
        </EmptyState>

        <div v-else class="overflow-hidden rounded-lg border border-default">
          <div class="flex items-center justify-between gap-2 border-b border-default bg-elevated/20 px-3 py-1.5 text-xs text-muted">
            <span>{{ displayMilestoneGroups.length }} гр. · {{ visibleTasks.length }} задач на экране</span>
            <div class="flex gap-3">
              <button type="button" class="hover:text-primary" @click="expandAllMsGroups">Развернуть все</button>
              <button type="button" class="hover:text-primary" @click="collapseAllMsGroups">Свернуть все</button>
            </div>
          </div>

          <template v-for="g in displayMilestoneGroups" :key="g.id">
            <MilestoneGroupHeader
              :group="g"
              :collapsed="isMsCollapsed(g.id)"
              @toggle="toggleMsGroup(g.id)"
            />
            <template v-if="!isMsCollapsed(g.id)">
              <div
                v-for="t in g.tasks"
                :key="t.id"
                class="flex items-center gap-3 border-b border-default py-2 pl-10 pr-3 text-sm hover:bg-elevated/30"
              >
                <span class="w-11 shrink-0 font-mono text-xs text-muted">#{{ t.id }}</span>
                <div class="min-w-0 flex-1">
                  <RouterLink
                    :to="`/tasks/${t.projectId}/${t.id}`"
                    class="inline-block max-w-full truncate align-middle hover:text-primary hover:underline"
                  >
                    {{ t.title }}
                  </RouterLink>
                </div>
                <span
                  v-if="t.parentId"
                  class="hidden shrink-0 items-center gap-1 text-xs text-muted lg:flex"
                  :title="t.parentTitle || `Эпик #${t.parentId}`"
                >
                  <UIcon name="i-lucide-package" class="size-3.5" />
                  <span class="max-w-28 truncate">{{ t.parentTitle || `#${t.parentId}` }}</span>
                </span>
                <div class="w-44 shrink-0">
                  <StatusBadge :status="dictionaries.statusFor(t.projectId, t.statusId)" />
                </div>
                <div class="hidden w-40 shrink-0 sm:block">
                  <UserCell :user="t.assignedUserId ? dictionaries.userById.get(t.assignedUserId) : null" size="xs" />
                </div>
                <div class="hidden w-36 shrink-0 text-right md:block"><DueDate :value="t.dueDate" /></div>
              </div>
              <div
                v-if="!g.tasks.length"
                class="border-b border-default py-2.5 pl-10 pr-3 text-xs text-muted"
              >
                В вехе пока нет задач — добавьте их на странице вехи.
              </div>
            </template>
          </template>
        </div>
      </template>

      <!-- Режим «Доска» (status_view.md): колонки по статусам, drag между ними -->
      <template v-else>
        <EmptyState
          v-if="!projectId"
          icon="i-lucide-square-kanban"
          title="Выберите проект"
          description="Доска показывает задачи одного проекта колонками по статусам"
        />
        <EmptyState
          v-else-if="!loading && !boardColumns.length"
          icon="i-lucide-square-kanban"
          title="У проекта нет статусов"
          description="Добавьте статусы проекта — из них соберутся колонки доски"
        />
        <StatusBoard v-else :columns="boardColumns" :loading="loading" @move="moveCard" />
      </template>
    </div>

    <TaskFormModal
      v-model:open="epicCreateOpen"
      :default-project-id="projectId"
      :parent-id="createParentId"
      :parent-title="createParentTitle"
    />
  </div>
</template>
