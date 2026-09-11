<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
</script>

<template>
  <UModal v-model:open="commandPaletteOpen" :ui="{ content: 'max-w-xl' }">
    <template #content>
      <UCommandPalette
        v-model:search-term="searchTerm"
        :groups="groups"
        :loading="loading"
        placeholder="Поиск задач и переход по разделам…"
      />
    </template>
  </UModal>
</template>
