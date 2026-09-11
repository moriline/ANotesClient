<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import DataTableShell from '@/components/common/DataTableShell.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import UserCell from '@/components/task/UserCell.vue'
import ProjectFormModal from '@/components/project/ProjectFormModal.vue'
import ProjectMembersModal from '@/components/project/ProjectMembersModal.vue'
import ProjectStatusesModal from '@/components/project/ProjectStatusesModal.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { deleteProject } from '@/api/projects'
import { findTasks } from '@/api/tasks'
import { useConfirm } from '@/composables/useConfirm'
import { ApiError } from '@/api/http'
import type { ProjectResponse } from '@/types/domain'

const dictionaries = useDictionariesStore()
const toast = useToast()
const { confirm } = useConfirm()

const loading = ref(true)
const showArchived = ref(false)
const counts = reactive<Record<number, { open: number; total: number }>>({})

const formOpen = ref(false)
const editingProject = ref<ProjectResponse | null>(null)
const membersOpen = ref(false)
const membersProject = ref<ProjectResponse | null>(null)
const statusesOpen = ref(false)
const statusesProject = ref<ProjectResponse | null>(null)

const visibleProjects = computed(() => dictionaries.projects.filter(p => showArchived.value || p.isActive))

async function loadCounts() {
  await Promise.all(dictionaries.projects.map(async (p) => {
    try {
      // Эпики — контейнеры, а не единицы работы (parent_task.md §3.9): в счётчики
      // задач проекта они не входят.
      const [all, open] = await Promise.all([
        findTasks({ projectId: p.id, taskType: 'TASK', limit: 1 }),
        findTasks({ projectId: p.id, taskType: 'TASK', isArchived: false, limit: 1 })
      ])
      counts[p.id] = { total: all.total, open: open.total }
    } catch {
      counts[p.id] = { total: 0, open: 0 }
    }
  }))
}

async function load() {
  loading.value = true
  try {
    await Promise.all([dictionaries.loadProjects(true), dictionaries.loadUsers()])
    await loadCounts()
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить проекты', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  editingProject.value = null
  formOpen.value = true
}

function openEdit(project: ProjectResponse) {
  editingProject.value = project
  formOpen.value = true
}

function openMembers(project: ProjectResponse) {
  membersProject.value = project
  membersOpen.value = true
}

function openStatuses(project: ProjectResponse) {
  statusesProject.value = project
  statusesOpen.value = true
}

async function removeProject(project: ProjectResponse) {
  const ok = await confirm({
    title: `Удалить проект «${project.name}»?`,
    description: 'Все задачи проекта станут недоступны. Это действие нельзя отменить.'
  })
  if (!ok) return
  try {
    await deleteProject(project.id)
    toast.add({ title: 'Проект удалён', color: 'primary' })
    await load()
  } catch (e) {
    toast.add({ title: 'Не удалось удалить проект', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}
</script>

<template>
  <div>
    <PageHeader title="Проекты">
      <template #actions>
        <UButton icon="i-lucide-plus" color="primary" @click="openCreate">Проект</UButton>
      </template>
      <USwitch v-model="showArchived" label="Показывать архивные" />
    </PageHeader>

    <div class="mx-auto w-[95%] px-6 py-6">
      <DataTableShell :loading="loading" :empty="!loading && visibleProjects.length === 0">
        <template #empty>
          <EmptyState icon="i-lucide-folder-plus" title="Пока нет проектов" description="Создайте первый проект для команды">
            <template #action>
              <UButton color="primary" @click="openCreate">Создать проект</UButton>
            </template>
          </EmptyState>
        </template>

        <thead class="bg-elevated/40 text-left text-xs text-muted">
          <tr>
            <th class="px-4 py-2">Проект</th>
            <th class="w-44 px-2 py-2">Владелец</th>
            <th class="w-24 px-2 py-2">Задачи</th>
            <th class="w-24 px-2 py-2">Статус</th>
            <th class="w-20 px-2 py-2 text-center">Дорожная карта</th>
            <th class="w-20 px-2 py-2 text-center">Вехи</th>
            <th class="w-20 px-2 py-2 text-center">База знаний</th>
            <th class="w-20 px-2 py-2 text-center">Участники</th>
            <th class="w-20 px-2 py-2 text-center">Статусы</th>
            <th class="w-12 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="project in visibleProjects"
            :key="project.id"
            class="border-t border-default hover:bg-elevated/40"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <span class="flex size-7 shrink-0 items-center justify-center rounded-md" :style="{ background: `${project.color || '#3E8A61'}1F` }">
                  <UIcon :name="project.icon || 'i-lucide-folder'" class="size-4" :style="{ color: project.color || '#3E8A61' }" />
                </span>
                <div class="min-w-0">
                  <RouterLink
                    :to="{ path: '/tasks', query: { project: project.id } }"
                    class="block truncate font-medium hover:text-primary hover:underline"
                  >
                    {{ project.name }}
                  </RouterLink>
                  <p v-if="project.description" class="truncate text-xs text-muted">{{ project.description }}</p>
                </div>
              </div>
            </td>
            <td class="px-2 py-3">
              <UserCell :user="dictionaries.userById.get(project.ownerUserId)" />
            </td>
            <td class="px-2 py-3 font-mono text-[13px]">
              {{ counts[project.id]?.open ?? '—' }} / {{ counts[project.id]?.total ?? '—' }}
            </td>
            <td class="px-2 py-3">
              <UBadge v-if="project.isActive" variant="subtle" color="primary">Активен</UBadge>
              <UBadge v-else variant="subtle" color="neutral">В архиве</UBadge>
            </td>
            <td class="px-2 py-3 text-center">
              <UTooltip text="Дорожная карта — временная шкала эпиков">
                <UButton
                  :to="`/projects/${project.id}/roadmap`"
                  icon="i-lucide-calendar-range"
                  variant="outline"
                  color="primary"
                  size="xs"
                  aria-label="Дорожная карта"
                />
              </UTooltip>
            </td>
            <td class="px-2 py-3 text-center">
              <UTooltip text="Вехи — контрольные точки по срокам">
                <UButton
                  :to="`/projects/${project.id}/milestones`"
                  icon="i-lucide-diamond"
                  variant="outline"
                  color="primary"
                  size="xs"
                  aria-label="Вехи"
                />
              </UTooltip>
            </td>
            <td class="px-2 py-3 text-center">
              <UTooltip text="База знаний проекта">
                <UButton
                  :to="`/projects/${project.id}/wiki`"
                  icon="i-lucide-book-open"
                  variant="outline"
                  color="primary"
                  size="xs"
                  aria-label="База знаний"
                />
              </UTooltip>
            </td>
            <td class="px-2 py-3 text-center">
              <UTooltip text="Участники проекта">
                <UButton
                  icon="i-lucide-users"
                  variant="outline"
                  color="primary"
                  size="xs"
                  aria-label="Участники"
                  @click="openMembers(project)"
                />
              </UTooltip>
            </td>
            <td class="px-2 py-3 text-center">
              <UTooltip text="Статусы задач проекта">
                <UButton
                  icon="i-lucide-list-checks"
                  variant="outline"
                  color="primary"
                  size="xs"
                  aria-label="Статусы"
                  @click="openStatuses(project)"
                />
              </UTooltip>
            </td>
            <td class="px-2 py-3">
              <UDropdownMenu
                :items="[[
                  { label: 'Изменить', icon: 'i-lucide-pencil', onSelect: () => openEdit(project) }
                ], [
                  { label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeProject(project) }
                ]]"
              >
                <UButton icon="i-lucide-ellipsis" variant="outline" color="primary" size="xs" />
              </UDropdownMenu>
            </td>
          </tr>
        </tbody>
      </DataTableShell>
    </div>

    <ProjectFormModal v-model:open="formOpen" :project="editingProject" />
    <ProjectMembersModal v-model:open="membersOpen" :project="membersProject" />
    <ProjectStatusesModal v-model:open="statusesOpen" :project="statusesProject" />
  </div>
</template>
