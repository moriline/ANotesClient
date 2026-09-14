<script setup lang="ts">
// Личная доска другого пользователя (todo.txt п.2) — то же самое, что
// /dashboard, но по assignedUserId вместо assignedToMe. Полную доску видит
// только admin или Manager общего с этим пользователем проекта
// (useUserBoardAccess.ts); всем остальным — только имя и аватар.
import { computed, onMounted, ref, watch } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import WorkloadSections from '@/components/task/WorkloadSections.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { useWorkloadBoard } from '@/composables/useWorkloadBoard'
import { canViewUserBoard } from '@/composables/useUserBoardAccess'
import { initials } from '@/utils/format'

const props = defineProps<{ userId: string }>()
const targetId = computed(() => Number(props.userId))

const dictionaries = useDictionariesStore()
const target = computed(() => dictionaries.userById.get(targetId.value))
const targetName = computed(() => target.value?.displayName || target.value?.username || `Пользователь #${targetId.value}`)

const access = ref<'checking' | 'full' | 'limited'>('checking')

const {
  loading, tasks, total, load,
  projectId, milestoneFilter, projectItems, milestoneItems,
  openTasks, overdueTasks, dueSoonTasks, laterTasks, recentlyClosedTasks,
  projectName
} = useWorkloadBoard(() => ({ assignedUserId: targetId.value }))

async function init() {
  access.value = 'checking'
  await dictionaries.loadUsers().catch(() => {})
  const allowed = await canViewUserBoard(targetId.value)
  access.value = allowed ? 'full' : 'limited'
  if (allowed) {
    dictionaries.loadProjects().catch(() => {})
    load()
  }
}

onMounted(init)
// userId в маршруте не меняется без перехода по новой ссылке, но ссылка на
// другого пользователя (например, из умного поиска) может прилететь, пока
// эта же страница уже открыта — компонент не перемонтируется.
watch(() => props.userId, init)
</script>

<template>
  <div>
    <PageHeader :title="`Доска: ${targetName}`" :subtitle="access === 'full' ? `Назначено: ${openTasks.length}` : undefined">
      <div v-if="access === 'full'" class="flex flex-wrap items-center gap-2">
        <USelectMenu v-model="projectId" :items="projectItems" value-key="value" icon="i-lucide-folder" placeholder="Все проекты" class="w-[190px]" />
        <USelectMenu v-model="milestoneFilter" :items="milestoneItems" value-key="value" icon="i-lucide-diamond" placeholder="Любая веха" class="w-[190px]" />
      </div>
    </PageHeader>

    <div class="mx-auto w-[95%] px-6 py-6">
      <RouterLink to="/people" class="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-highlighted">
        <UIcon name="i-lucide-arrow-left" class="size-4" />
        Назад к списку
      </RouterLink>

      <div v-if="access === 'checking'" class="flex flex-col gap-3">
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-24 w-full" />
      </div>

      <template v-else-if="access === 'limited'">
        <div class="flex flex-col items-center gap-3 rounded-lg border border-default py-14 text-center">
          <UAvatar :src="target?.avatarUrl || undefined" :text="initials(targetName)" size="xl" />
          <p class="text-base font-medium">{{ targetName }}</p>
          <EmptyState
            icon="i-lucide-lock"
            title="Доска недоступна"
            description="Занятость и задачи другого пользователя видят только администраторы и менеджеры общих с ним проектов."
          />
        </div>
      </template>

      <WorkloadSections
        v-else
        :loading="loading"
        :total="total"
        :tasks-length="tasks.length"
        :overdue-tasks="overdueTasks"
        :due-soon-tasks="dueSoonTasks"
        :later-tasks="laterTasks"
        :recently-closed-tasks="recentlyClosedTasks"
        :project-name="projectName"
        :empty-description="`Незакрытых задач, назначенных на ${targetName}, не найдено.`"
      />
    </div>
  </div>
</template>
