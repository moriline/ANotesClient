<script setup lang="ts">
// «Умный поиск» из todo.txt п.1 — попап с разделами поиска ровно под полем
// ввода (закрытие по Esc/клику вне — как в CommandPalette.vue), поле
// расширяется до трети экрана при открытии. Разделы «Комментарии» и «Логи
// времени» — через POST /api/comments/find и /api/time-entries/find
// (contentSearch/descriptionSearch, регистронезависимо, по всем задачам
// доступных проектов сразу). У обеих ручек нет параметра projectId — только
// taskId или ничего, поэтому фильтр «Проект» применяется на клиенте: через
// loadTaskLookup(pid) подтягивается набор задач нужного проекта (до 200,
// как и everywhere в этом клиенте), и по нему одновременно фильтруются
// результаты и резолвится название задачи/проекта для ссылки. Без фильтра
// проекта резолвим по последним 200 обновлённым задачам — попадание не
// гарантировано на очень старых задачах, это допустимо для превью в попапе,
// не авторитетный отчёт.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDictionariesStore } from '@/stores/dictionaries'
import { findTasks, getTask } from '@/api/tasks'
import { findComments } from '@/api/comments'
import { findTimeEntries } from '@/api/timeEntries'
import { listUsers } from '@/api/users'
import { initials, formatDuration } from '@/utils/format'
import type { CommentResponse, ProjectResponse, TaskResponse, TimeEntry, UserSummary } from '@/types/domain'

interface CommentHit { comment: CommentResponse; task?: TaskResponse }
interface LogHit { entry: TimeEntry; task?: TaskResponse }

const router = useRouter()
const dictionaries = useDictionariesStore()

const open = ref(false)
const query = ref('')
const projectFilter = ref<number | undefined>(undefined)
const loading = ref(false)
const rootEl = ref<HTMLElement | null>(null)

const projectResults = ref<ProjectResponse[]>([])
const taskResults = ref<TaskResponse[]>([])
const commentResults = ref<CommentHit[]>([])
const peopleResults = ref<UserSummary[]>([])
const logResults = ref<LogHit[]>([])
const searched = ref(false)

const projectFilterItems = computed(() => [
  { label: 'Все проекты', value: undefined },
  ...dictionaries.projects.map(p => ({ label: p.name, value: p.id }))
])

const widthClass = computed(() => (open.value ? 'w-[33vw] min-w-[360px] max-w-[640px]' : 'w-[220px]'))

function projectName(id: number) {
  return dictionaries.projectById.get(id)?.name ?? `#${id}`
}

function openPanel() {
  open.value = true
  dictionaries.loadProjects()
}

function close() {
  open.value = false
}

function clearResults() {
  projectResults.value = []
  taskResults.value = []
  commentResults.value = []
  peopleResults.value = []
  logResults.value = []
  searched.value = false
}

// Живёт, пока смонтирован SmartSearch (весь сеанс) — то же допущение о
// приемлемой устаревании кэша, что и у dictionaries.* в этом приложении.
const taskLookupCache = new Map<number | 'all', Promise<Map<number, TaskResponse>>>()
function loadTaskLookup(pid?: number): Promise<Map<number, TaskResponse>> {
  const key = pid ?? 'all'
  const cached = taskLookupCache.get(key)
  if (cached) return cached
  const request = pid
    ? findTasks({ projectId: pid, limit: 200 })
    : findTasks({ limit: 200, sortBy: 'updatedAt', sortDir: 'desc' })
  const promise = request
    .then(r => new Map(r.tasks.map(t => [t.id, t])))
    .catch(() => new Map<number, TaskResponse>())
  taskLookupCache.set(key, promise)
  return promise
}

// Поиск по номеру задачи ("42" / "#42") — у POST /api/find нет фильтра по
// id (FindTasksRequest), поэтому текстовый titleSearch/contentSearch номер
// не находит. С выбранным проектом бьём точно через нативный
// GET /api/projects/{pid}/tasks/{taskId} (быстро и надёжно, включая старые
// задачи); без фильтра проекта резолвим по тому же кэшу последних 200
// задач, что и остальной попап, — с тем же допущением о неполном покрытии.
async function resolveTaskById(id: number, pid?: number): Promise<TaskResponse | undefined> {
  if (pid) {
    try {
      return await getTask(pid, id)
    } catch {
      return undefined
    }
  }
  const lookup = await loadTaskLookup(undefined)
  return lookup.get(id)
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch([query, projectFilter], () => {
  clearTimeout(debounceTimer)
  const q = query.value.trim()
  if (!q) {
    loading.value = false
    clearResults()
    return
  }
  debounceTimer = setTimeout(() => runSearch(q), 250)
})

async function runSearch(q: string) {
  loading.value = true
  const pid = projectFilter.value
  const needle = q.toLowerCase()

  try {
    const projects = await dictionaries.loadProjects()
    projectResults.value = (pid ? projects.filter(p => p.id === pid) : projects)
      .filter(p => p.name.toLowerCase().includes(needle))
      .slice(0, 6)
  } catch {
    projectResults.value = []
  }

  try {
    // titleSearch и contentSearch комбинируются по И на бэкенде — чтобы
    // покрыть и заголовок, и описание/резюме/обсуждение, шлём два отдельных
    // запроса и объединяем результат на клиенте. "42" / "#42" дополнительно
    // резолвится как номер задачи (resolveTaskById) и ставится первым.
    const idMatch = q.trim().match(/^#?(\d+)$/)
    const [byTitle, byContent, byIdTask] = await Promise.all([
      findTasks({ titleSearch: q, projectId: pid, limit: 8 }).then(r => r.tasks).catch(() => []),
      findTasks({ contentSearch: q, projectId: pid, limit: 8 }).then(r => r.tasks).catch(() => []),
      idMatch ? resolveTaskById(Number(idMatch[1]), pid) : Promise.resolve(undefined)
    ])
    const seen = new Set<number>()
    const results: TaskResponse[] = []
    if (byIdTask) { results.push(byIdTask); seen.add(byIdTask.id) }
    for (const t of [...byTitle, ...byContent]) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      results.push(t)
    }
    taskResults.value = results.slice(0, 8)
  } catch {
    taskResults.value = []
  }

  try {
    const lookup = await loadTaskLookup(pid)
    const res = await findComments({ contentSearch: q, limit: pid ? 50 : 8 })
    const comments = pid ? res.comments.filter(c => lookup.has(c.taskId)) : res.comments
    commentResults.value = comments.slice(0, 8).map(c => ({ comment: c, task: lookup.get(c.taskId) }))
  } catch {
    commentResults.value = []
  }

  try {
    peopleResults.value = await listUsers({ q, limit: 6 })
  } catch {
    peopleResults.value = []
  }

  try {
    const lookup = await loadTaskLookup(pid)
    const res = await findTimeEntries({ descriptionSearch: q, limit: pid ? 50 : 8 })
    const entries = pid ? res.entries.filter(e => lookup.has(e.taskId)) : res.entries
    logResults.value = entries.slice(0, 8).map(e => ({ entry: e, task: lookup.get(e.taskId) }))
  } catch {
    logResults.value = []
  }

  searched.value = true
  loading.value = false
}

function goToProject(p: ProjectResponse) {
  close()
  router.push(`/tasks?project=${p.id}`)
}

function goToTask(t: TaskResponse) {
  close()
  router.push(`/tasks/${t.projectId}/${t.id}`)
}

function goToPerson(u: UserSummary) {
  close()
  router.push(`/people/${u.id}`)
}

function goToHitTask(task: TaskResponse | undefined) {
  if (!task) return
  close()
  router.push(`/tasks/${task.projectId}/${task.id}`)
}

function onKeydownCapture(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) close()
}
function onPointerDownCapture(e: PointerEvent) {
  if (!open.value) return
  const target = e.target as Node | null
  if (rootEl.value && target && !rootEl.value.contains(target)) close()
}
onMounted(() => {
  document.addEventListener('keydown', onKeydownCapture, true)
  document.addEventListener('pointerdown', onPointerDownCapture, true)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydownCapture, true)
  document.removeEventListener('pointerdown', onPointerDownCapture, true)
})
</script>

<template>
  <div
    ref="rootEl"
    class="relative hidden transition-[width] duration-150 sm:block"
    :class="widthClass"
  >
    <UInput
      v-model="query"
      icon="i-lucide-search"
      placeholder="Поиск: проекты, задачи, люди…"
      class="w-full"
      autocomplete="off"
      @focus="openPanel"
    />

    <div
      v-if="open"
      class="absolute inset-x-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-default bg-white shadow-lg"
    >
      <div class="border-b border-default p-2">
        <USelectMenu
          v-model="projectFilter"
          :items="projectFilterItems"
          value-key="value"
          icon="i-lucide-folder"
          placeholder="Все проекты"
          class="w-full"
        />
      </div>

      <p v-if="!query.trim()" class="px-3 py-8 text-center text-sm text-muted">
        Начните вводить — поиск идёт по проектам, задачам, комментариям, людям и логам времени
      </p>

      <template v-else>
        <div class="p-2">
          <p class="px-1 pb-1 text-xs font-medium text-muted">Проекты</p>
          <USkeleton v-if="loading && !searched" class="h-8 w-full" />
          <p v-else-if="!projectResults.length" class="px-1 py-1.5 text-sm text-dimmed">Ничего не найдено</p>
          <button
            v-for="p in projectResults"
            :key="p.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-elevated/60"
            @click="goToProject(p)"
          >
            <UIcon name="i-lucide-folder" class="size-4 shrink-0 text-muted" />
            <span class="truncate">{{ p.name }}</span>
          </button>
        </div>

        <div class="border-t border-default p-2">
          <p class="px-1 pb-1 text-xs font-medium text-muted">Задачи</p>
          <USkeleton v-if="loading && !searched" class="h-8 w-full" />
          <p v-else-if="!taskResults.length" class="px-1 py-1.5 text-sm text-dimmed">Ничего не найдено</p>
          <button
            v-for="t in taskResults"
            :key="t.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-elevated/60"
            @click="goToTask(t)"
          >
            <UIcon
              :name="t.taskType === 'EPIC' ? 'i-lucide-package' : 'i-lucide-check-square'"
              class="size-4 shrink-0 text-muted"
            />
            <span class="min-w-0 flex-1 truncate">{{ t.title }}</span>
            <span class="shrink-0 text-xs text-dimmed">#{{ t.id }} · {{ projectName(t.projectId) }}</span>
          </button>
        </div>

        <div class="border-t border-default p-2">
          <p class="px-1 pb-1 text-xs font-medium text-muted">Комментарии</p>
          <USkeleton v-if="loading && !searched" class="h-8 w-full" />
          <p v-else-if="!commentResults.length" class="px-1 py-1.5 text-sm text-dimmed">Ничего не найдено</p>
          <div
            v-for="hit in commentResults"
            :key="hit.comment.id"
            class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm"
            :class="hit.task ? 'cursor-pointer hover:bg-elevated/60' : 'cursor-default opacity-60'"
            @click="goToHitTask(hit.task)"
          >
            <UIcon name="i-lucide-message-square" class="mt-0.5 size-4 shrink-0 text-muted" />
            <div class="min-w-0 flex-1">
              <p class="truncate">{{ hit.comment.content }}</p>
              <p class="truncate text-xs text-dimmed">
                {{ hit.task ? `${hit.task.title} · #${hit.task.id} · ${projectName(hit.task.projectId)}` : `Задача #${hit.comment.taskId}` }}
              </p>
            </div>
          </div>
        </div>

        <div class="border-t border-default p-2">
          <p class="px-1 pb-1 text-xs font-medium text-muted">Люди</p>
          <USkeleton v-if="loading && !searched" class="h-8 w-full" />
          <p v-else-if="!peopleResults.length" class="px-1 py-1.5 text-sm text-dimmed">Ничего не найдено</p>
          <button
            v-for="u in peopleResults"
            :key="u.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-elevated/60"
            @click="goToPerson(u)"
          >
            <UAvatar :src="u.avatarUrl || undefined" :text="initials(u.displayName || u.username)" size="2xs" />
            <span class="truncate">{{ u.displayName || u.username }}</span>
          </button>
        </div>

        <div class="border-t border-default p-2">
          <p class="px-1 pb-1 text-xs font-medium text-muted">Логи времени</p>
          <USkeleton v-if="loading && !searched" class="h-8 w-full" />
          <p v-else-if="!logResults.length" class="px-1 py-1.5 text-sm text-dimmed">Ничего не найдено</p>
          <div
            v-for="hit in logResults"
            :key="hit.entry.id"
            class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm"
            :class="hit.task ? 'cursor-pointer hover:bg-elevated/60' : 'cursor-default opacity-60'"
            @click="goToHitTask(hit.task)"
          >
            <UIcon name="i-lucide-clock" class="mt-0.5 size-4 shrink-0 text-muted" />
            <div class="min-w-0 flex-1">
              <p class="truncate">
                <span class="font-mono">{{ formatDuration(hit.entry.seconds) }}</span>
                <span v-if="hit.entry.description"> — {{ hit.entry.description }}</span>
              </p>
              <p class="truncate text-xs text-dimmed">
                {{ hit.task ? `${hit.task.title} · #${hit.task.id} · ${projectName(hit.task.projectId)}` : `Задача #${hit.entry.taskId}` }}
              </p>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
