<script setup lang="ts">
// Личная доска — «мои задачи» через все проекты сразу, без привязки к одному
// выбранному проекту (в отличие от /tasks, где фильтр по вехе работает только
// внутри выбранного проекта). Секции по срочности (Просрочено/На неделе/Позже),
// а не колонки по статусу: статусы per-project, единого набора колонок через
// разные проекты не существует. Логика вынесена в useWorkloadBoard — та же,
// что и у чужой доски в PersonBoardView.vue (todo.txt п.2).
import { onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import HelpLink from '@/components/common/HelpLink.vue'
import WorkloadSections from '@/components/task/WorkloadSections.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { useWorkloadBoard } from '@/composables/useWorkloadBoard'

const dictionaries = useDictionariesStore()
const {
  loading, tasks, total, load,
  projectId, milestoneFilter, projectItems, milestoneItems,
  openTasks, overdueTasks, dueSoonTasks, laterTasks, recentlyClosedTasks,
  projectName
} = useWorkloadBoard(() => ({ assignedToMe: true }))

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
      <WorkloadSections
        :loading="loading"
        :total="total"
        :tasks-length="tasks.length"
        :overdue-tasks="overdueTasks"
        :due-soon-tasks="dueSoonTasks"
        :later-tasks="laterTasks"
        :recently-closed-tasks="recentlyClosedTasks"
        :project-name="projectName"
        empty-description="Задач, где вы исполнитель и которые ещё не закрыты, не найдено."
      />
    </div>
  </div>
</template>
