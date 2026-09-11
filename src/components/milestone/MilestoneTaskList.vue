<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { findTasks, updateTask } from '@/api/tasks'
import { listMilestoneTasks, setTaskMilestone } from '@/api/milestones'
import { useConfirm } from '@/composables/useConfirm'
import { bumpTasksVersion } from '@/composables/useGlobalUi'
import { ApiError } from '@/api/http'
import { formatDate } from '@/utils/format'
import type { TaskResponse } from '@/types/domain'

// Задачи вехи с чекбоксами (plan.md §5.3). Отличие от списка задач эпика —
// колонка ЭПИКА у каждой задачи: веха собирает работу из разных направлений,
// и без неё непонятно, откуда задача. Задачи со сроком позже срока вехи
// помечаются ⚠ — они не успеют по определению.
const props = defineProps<{
  milestoneId: number
  projectId: number
  milestoneDueDate: number
  milestoneClosed: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const dictionaries = useDictionariesStore()
const toast = useToast()
const { confirm } = useConfirm()

const tasks = ref<TaskResponse[]>([])
const loading = ref(true)
const busyId = ref<number | null>(null)

const statuses = computed(() => dictionaries.statusesByProject[props.projectId] ?? [])
function statusOf(t: TaskResponse) {
  return statuses.value.find(s => s.id === t.statusId)
}
function isClosed(t: TaskResponse) {
  return statusOf(t)?.isClosed ?? false
}
function lateForMilestone(t: TaskResponse) {
  return !!t.dueDate && !isClosed(t) && t.dueDate > props.milestoneDueDate
}
const doneCount = computed(() => tasks.value.filter(isClosed).length)

async function reload() {
  loading.value = true
  try {
    tasks.value = await listMilestoneTasks(props.milestoneId)
  } catch (e) {
    toast.add({
      title: 'Не удалось загрузить задачи вехи',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  dictionaries.loadStatuses(props.projectId).catch(() => {})
  dictionaries.loadUsers().catch(() => {})
  reload()
})

defineExpose({ reload })

async function toggle(t: TaskResponse) {
  const closed = isClosed(t)
  const target = closed
    ? statuses.value.find(s => s.isDefault)
    : statuses.value.find(s => s.isClosed && !s.isHidden) ?? statuses.value.find(s => s.isClosed)
  if (!target) {
    toast.add({
      title: closed ? 'У проекта нет стартового статуса' : 'У проекта нет закрывающего статуса',
      description: 'Настройте статусы проекта.',
      color: 'warning'
    })
    return
  }
  const prevStatus = t.statusId
  const prevVersion = t.version
  t.statusId = target.id
  busyId.value = t.id
  try {
    const updated = await updateTask(props.projectId, t.id, { statusId: target.id }, prevVersion)
    Object.assign(t, updated)
    bumpTasksVersion()
    emit('changed')
  } catch (e) {
    t.statusId = prevStatus
    if (e instanceof ApiError && e.status === 409) {
      toast.add({ title: 'Задачу успели изменить', description: 'Откройте её и повторите.', color: 'warning' })
    } else {
      toast.add({
        title: 'Не удалось изменить статус',
        description: e instanceof ApiError ? e.message : undefined,
        color: 'error'
      })
    }
  } finally {
    busyId.value = null
  }
}

async function detach(t: TaskResponse) {
  const ok = await confirm({
    title: `Открепить «${t.title}» от вехи?`,
    description: 'Задача останется в проекте, но перестанет учитываться в прогрессе вехи.',
    confirmLabel: 'Открепить',
    danger: false
  })
  if (!ok) return
  try {
    await setTaskMilestone(t.id, null)
    bumpTasksVersion()
    await reload()
    emit('changed')
  } catch (e) {
    toast.add({
      title: 'Не удалось открепить задачу',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  }
}

// --- Добавление существующих задач в веху ------------------------------------
const addOpen = ref(false)
const candidates = ref<TaskResponse[]>([])
const candidatesLoading = ref(false)
const selectedIds = ref<number[]>([])
const adding = ref(false)

async function openAdd() {
  addOpen.value = true
  selectedIds.value = []
  candidatesLoading.value = true
  try {
    // Задачи проекта без вехи (эпики веха не собирает). noMilestone — фильтр /api/find.
    const res = await findTasks({
      projectId: props.projectId,
      taskType: 'TASK',
      noMilestone: true,
      isArchived: false,
      limit: 200,
      sortBy: 'updatedAt',
      sortDir: 'desc'
    })
    candidates.value = res.tasks
  } catch (e) {
    toast.add({
      title: 'Не удалось загрузить задачи',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    candidatesLoading.value = false
  }
}

const candidateItems = computed(() =>
  candidates.value.map(t => ({ label: `#${t.id} · ${t.title}`, value: t.id }))
)

async function confirmAdd() {
  if (!selectedIds.value.length) {
    addOpen.value = false
    return
  }
  adding.value = true
  try {
    // По одному: сервер валидирует проект/тип/срок вехи на каждой привязке.
    const results = await Promise.allSettled(
      selectedIds.value.map(id => setTaskMilestone(id, props.milestoneId))
    )
    const failed = results.filter(r => r.status === 'rejected').length
    if (failed) {
      toast.add({ title: `Не удалось привязать задач: ${failed}`, color: 'warning' })
    } else {
      toast.add({ title: 'Задачи добавлены в веху', color: 'primary' })
    }
    addOpen.value = false
    bumpTasksVersion()
    await reload()
    emit('changed')
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between gap-2">
      <p class="text-xs font-medium uppercase tracking-wide text-muted">
        Задачи вехи<template v-if="tasks.length"> ({{ doneCount }}/{{ tasks.length }})</template>
      </p>
      <UButton
        v-if="!milestoneClosed"
        icon="i-lucide-plus"
        size="xs"
        color="primary"
        @click="openAdd"
      >
        Добавить
      </UButton>
    </div>

    <div v-if="loading" class="flex flex-col gap-2">
      <USkeleton class="h-9 w-full" />
      <USkeleton class="h-9 w-full" />
    </div>

    <div
      v-else-if="!tasks.length"
      class="rounded-md border border-dashed border-default px-3 py-6 text-center text-sm text-muted"
    >
      В вехе пока нет задач. Добавьте задачи из проекта кнопкой «Добавить».
    </div>

    <div v-else class="flex flex-col divide-y divide-default border-y border-default">
      <div v-for="t in tasks" :key="t.id" class="group flex items-center gap-3 py-2">
        <UCheckbox
          :model-value="isClosed(t)"
          :disabled="busyId === t.id || milestoneClosed"
          @update:model-value="() => toggle(t)"
        />
        <span class="w-12 shrink-0 font-mono text-xs text-muted">#{{ t.id }}</span>
        <RouterLink
          :to="`/tasks/${projectId}/${t.id}`"
          class="min-w-0 flex-1 truncate text-sm hover:underline"
          :class="isClosed(t) && 'text-muted line-through'"
        >
          {{ t.title }}
        </RouterLink>

        <span
          v-if="t.parentId"
          class="hidden shrink-0 items-center gap-1 text-xs text-muted md:flex"
          :title="t.parentTitle || `Эпик #${t.parentId}`"
        >
          <UIcon name="i-lucide-package" class="size-3.5" />
          <span class="max-w-28 truncate">{{ t.parentTitle || `#${t.parentId}` }}</span>
        </span>

        <UIcon
          v-if="lateForMilestone(t)"
          name="i-lucide-triangle-alert"
          class="size-3.5 shrink-0 text-warning"
          :title="`Срок задачи (${formatDate(t.dueDate)}) позже срока вехи`"
        />

        <span
          v-if="statusOf(t)"
          class="hidden shrink-0 items-center gap-1.5 text-xs text-muted sm:flex"
        >
          <span class="size-2 rounded-full" :style="{ background: statusOf(t)?.statusColor || '#9CA3AF' }" />
          {{ statusOf(t)?.statusName }}
        </span>

        <div class="w-7 shrink-0">
          <UAvatar
            v-if="t.assignedUserId"
            :src="dictionaries.userById.get(t.assignedUserId)?.avatarUrl || undefined"
            :text="(dictionaries.userById.get(t.assignedUserId)?.displayName || dictionaries.userById.get(t.assignedUserId)?.username || '?').slice(0, 2)"
            size="2xs"
          />
        </div>

        <UButton
          v-if="!milestoneClosed"
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="xs"
          class="shrink-0 opacity-0 group-hover:opacity-100"
          title="Открепить от вехи"
          @click="detach(t)"
        />
      </div>
    </div>

    <UModal v-model:open="addOpen" title="Добавить задачи в веху" :ui="{ content: 'max-w-[560px]' }">
      <template #body>
        <div v-if="candidatesLoading" class="flex flex-col gap-2">
          <USkeleton class="h-9 w-full" />
          <USkeleton class="h-9 w-full" />
        </div>
        <div v-else-if="!candidates.length" class="text-sm text-muted">
          Все задачи проекта уже привязаны к вехам, либо задач нет.
        </div>
        <UFormField v-else label="Задачи без вехи">
          <USelectMenu
            v-model="selectedIds"
            :items="candidateItems"
            value-key="value"
            multiple
            placeholder="Выберите задачи"
            class="w-full"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton type="button" variant="outline" color="primary" @click="addOpen = false">Отмена</UButton>
          <UButton
            type="button"
            color="primary"
            :loading="adding"
            :disabled="!selectedIds.length"
            @click="confirmAdd"
          >
            Добавить ({{ selectedIds.length }})
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
