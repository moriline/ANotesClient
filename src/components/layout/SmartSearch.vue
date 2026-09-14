<script setup lang="ts">
// «Умный поиск» из todo.txt п.1 — попап с разделами поиска ровно под полем
// ввода (закрытие по Esc/клику вне — как в CommandPalette.vue), поле
// расширяется до трети экрана при открытии. Разделы «Комментарии» и «Логи
// времени» — заглушки: у API нет ручек поиска по комментариям/учёту времени
// сразу по всем проектам (только по одной задаче за раз), делать полный
// перебор задач всех проектов на каждый ввод — неоправданный фан-аут запросов.
// Фильтр «Проект» уже здесь, чтобы потом ограничить этими двумя разделами
// поиск одним проектом, когда для него появится серверная поддержка.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDictionariesStore } from '@/stores/dictionaries'
import { findTasks } from '@/api/tasks'
import { listUsers } from '@/api/users'
import { initials } from '@/utils/format'
import type { ProjectResponse, TaskResponse, UserSummary } from '@/types/domain'

const router = useRouter()
const dictionaries = useDictionariesStore()

const open = ref(false)
const query = ref('')
const projectFilter = ref<number | undefined>(undefined)
const loading = ref(false)
const rootEl = ref<HTMLElement | null>(null)

const projectResults = ref<ProjectResponse[]>([])
const taskResults = ref<TaskResponse[]>([])
const peopleResults = ref<UserSummary[]>([])
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
  peopleResults.value = []
  searched.value = false
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
    // запроса и объединяем результат на клиенте.
    const [byTitle, byContent] = await Promise.all([
      findTasks({ titleSearch: q, projectId: pid, limit: 8 }).then(r => r.tasks).catch(() => []),
      findTasks({ contentSearch: q, projectId: pid, limit: 8 }).then(r => r.tasks).catch(() => [])
    ])
    const byId = new Map<number, TaskResponse>()
    for (const t of [...byTitle, ...byContent]) byId.set(t.id, t)
    taskResults.value = Array.from(byId.values()).slice(0, 8)
  } catch {
    taskResults.value = []
  }

  try {
    peopleResults.value = await listUsers({ q, limit: 6 })
  } catch {
    peopleResults.value = []
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
        Начните вводить — поиск идёт по проектам, задачам и людям
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

        <div class="border-t border-default p-2 opacity-60">
          <p class="flex items-center gap-1.5 px-1 pb-1 text-xs font-medium text-muted">
            Комментарии
            <UBadge label="скоро" size="xs" variant="subtle" color="neutral" />
          </p>
          <p class="px-1 py-1.5 text-sm text-dimmed">
            Поиск по комментариям сразу во всех проектах пока не поддержан API
          </p>
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

        <div class="border-t border-default p-2 opacity-60">
          <p class="flex items-center gap-1.5 px-1 pb-1 text-xs font-medium text-muted">
            Логи времени
            <UBadge label="скоро" size="xs" variant="subtle" color="neutral" />
          </p>
          <p class="px-1 py-1.5 text-sm text-dimmed">
            Поиск по комментариям учёта времени сразу во всех проектах пока не поддержан API
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
