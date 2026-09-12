<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { commandPaletteOpen, createTaskModalOpen } from '@/composables/useGlobalUi'
import { findTasks } from '@/api/tasks'
import { findWikiPages } from '@/api/wiki'
import type { TaskResponse, WikiPageResponse } from '@/types/domain'

const router = useRouter()
const searchTerm = ref('')
const taskResults = ref<TaskResponse[]>([])
const wikiResults = ref<WikiPageResponse[]>([])
const loading = ref(false)
const contentEl = ref<HTMLElement | null>(null)

watch(searchTerm, async (term) => {
  const query = term.trim()
  if (!query) {
    taskResults.value = []
    wikiResults.value = []
    return
  }
  loading.value = true
  try {
    // contentSearch — регистронезависимый поиск по названию и описанию
    // (titleSearch у бэкенда чувствителен к регистру).
    const [tasks, wiki] = await Promise.all([
      findTasks({ contentSearch: query, limit: 6 }).then(r => r.tasks).catch(() => []),
      findWikiPages({ contentSearch: query, limit: 5 }).then(r => r.pages).catch(() => [])
    ])
    taskResults.value = tasks
    wikiResults.value = wiki
  } catch {
    taskResults.value = []
    wikiResults.value = []
  } finally {
    loading.value = false
  }
})

watch(commandPaletteOpen, (isOpen) => {
  if (!isOpen) searchTerm.value = ''
})

function go(path: string) {
  commandPaletteOpen.value = false
  router.push(path)
}

const taskGroup = computed(() => ({
  id: 'tasks',
  label: 'Задачи',
  items: taskResults.value.map(t => ({
    label: t.title,
    suffix: `#${t.id}`,
    onSelect: () => go(`/tasks/${t.projectId}/${t.id}`)
  }))
}))

const wikiGroup = computed(() => ({
  id: 'wiki',
  label: 'База знаний',
  items: wikiResults.value.map(p => ({
    label: p.title,
    icon: 'i-lucide-file-text',
    suffix: `#${p.id}`,
    // Краткое описание страницы как сниппет результата (null у старых страниц).
    description: p.summary ?? undefined,
    onSelect: () => go(`/projects/${p.projectId}/wiki/${p.id}`)
  }))
}))

const navGroup = {
  id: 'nav',
  label: 'Переход',
  items: [
    { label: 'Моя доска', icon: 'i-lucide-layout-dashboard', onSelect: () => go('/dashboard') },
    { label: 'Задачи', icon: 'i-lucide-check-square', onSelect: () => go('/tasks') },
    { label: 'Проекты', icon: 'i-lucide-folder', onSelect: () => go('/projects') },
    { label: 'Отчёты', icon: 'i-lucide-bar-chart-3', onSelect: () => go('/reports') },
    { label: 'Пользователи', icon: 'i-lucide-users', onSelect: () => go('/people') },
    { label: 'Мой профиль', icon: 'i-lucide-user', onSelect: () => go('/profile') },
    { label: 'ИИ-агент', icon: 'i-lucide-sparkles', onSelect: () => go('/agent') },
    { label: 'Справка', icon: 'i-lucide-circle-help', onSelect: () => go('/help') }
  ]
}

const actionsGroup = {
  id: 'actions',
  label: 'Действия',
  items: [
    {
      label: 'Создать задачу',
      icon: 'i-lucide-plus',
      onSelect: () => {
        commandPaletteOpen.value = false
        createTaskModalOpen.value = true
      }
    }
  ]
}

const groups = computed(() => [taskGroup.value, wikiGroup.value, navGroup, actionsGroup])

// Подстраховка: наблюдалась «зависшая» палитра — не закрывается ни по Esc, ни
// кликом по фону, блокирует интерфейс, лечится только жёсткой перезагрузкой
// страницы. У встроенного закрытия Nuxt UI/Reka (DialogContent) нет
// независимого запасного пути: Esc при dismissible=true целиком полагается на
// внутреннюю логику Reka, а клик вне контента идёт через Reka-утилиту
// pointerDownOutside, которая сама вызывает preventDefault (= не закрывать),
// если кликнутый элемент к моменту обработки уже не в DOM (!target.isConnected)
// — гоночное состояние с перерисовкой в момент клика. Слушаем на capture-фазе
// document — отрабатывает раньше внутренних обработчиков независимо от того,
// что там пошло не так, и не мешает штатному закрытию (оно просто выставит
// тот же commandPaletteOpen = false ещё раз).
function onKeydownCapture(e: KeyboardEvent) {
  if (e.key === 'Escape' && commandPaletteOpen.value) commandPaletteOpen.value = false
}
function onPointerDownCapture(e: PointerEvent) {
  if (!commandPaletteOpen.value) return
  const target = e.target as Node | null
  if (contentEl.value && target && !contentEl.value.contains(target)) commandPaletteOpen.value = false
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
  <UModal v-model:open="commandPaletteOpen" :ui="{ content: 'max-w-xl' }">
    <template #content>
      <div ref="contentEl">
        <UCommandPalette
          v-model:search-term="searchTerm"
          :groups="groups"
          :loading="loading"
          placeholder="Поиск задач и переход по разделам…"
        />
      </div>
    </template>
  </UModal>
</template>
