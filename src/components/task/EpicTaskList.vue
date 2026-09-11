<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import TaskFormModal from '@/components/task/TaskFormModal.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { listEpicTasks, updateTask } from '@/api/tasks'
import { bumpTasksVersion } from '@/composables/useGlobalUi'
import { ApiError } from '@/api/http'
import type { TaskResponse } from '@/types/domain'

// Список задач эпика с чекбоксами (parent_task.md §5.3). Чекбокс переключает
// статус между стартовым и закрывающим БЕЗ открытия задачи — иначе эпиками
// не пользуются. Обновление оптимистичное с откатом; после изменения родитель
// перезапрашивает прогресс эпика (он считается на сервере).
const props = defineProps<{ epicId: number; projectId: number; epicTitle: string }>()
const emit = defineEmits<{ changed: [] }>()

const dictionaries = useDictionariesStore()
const toast = useToast()

const children = ref<TaskResponse[]>([])
const loading = ref(true)
const busyId = ref<number | null>(null)
const createOpen = ref(false)

const statuses = computed(() => dictionaries.statusesByProject[props.projectId] ?? [])
const doneCount = computed(() => children.value.filter(isClosed).length)

function statusOf(t: TaskResponse) {
  return statuses.value.find(s => s.id === t.statusId)
}
function isClosed(t: TaskResponse) {
  return statusOf(t)?.isClosed ?? false
}

async function reload() {
  loading.value = true
  try {
    children.value = await listEpicTasks(props.epicId)
  } catch (e) {
    toast.add({
      title: 'Не удалось загрузить задачи эпика',
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

async function toggle(child: TaskResponse) {
  const closed = isClosed(child)
  const target = closed
    // вернуть в работу — стартовый статус проекта
    ? statuses.value.find(s => s.isDefault)
    // закрыть — первый закрывающий (не скрытый по возможности)
    : statuses.value.find(s => s.isClosed && !s.isHidden) ?? statuses.value.find(s => s.isClosed)
  if (!target) {
    toast.add({
      title: closed ? 'У проекта нет стартового статуса' : 'У проекта нет закрывающего статуса',
      description: 'Настройте статусы проекта.',
      color: 'warning'
    })
    return
  }

  const prevStatus = child.statusId
  const prevVersion = child.version
  child.statusId = target.id // оптимистично
  busyId.value = child.id
  try {
    // X-Expected-Version берётся у ЗАДАЧИ (меняется её статус, не эпика).
    const updated = await updateTask(props.projectId, child.id, { statusId: target.id }, prevVersion)
    Object.assign(child, updated)
    bumpTasksVersion()
    emit('changed') // прогресс эпика пересчитывается на сервере
  } catch (e) {
    child.statusId = prevStatus // откат
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

function onCreated() {
  createOpen.value = false
  reload()
  emit('changed')
}
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between gap-2">
      <p class="text-xs font-medium uppercase tracking-wide text-muted">
        Задачи<template v-if="children.length"> ({{ doneCount }}/{{ children.length }})</template>
      </p>
      <!-- Единственная кнопка добавления — всегда здесь, на фиксированном месте
           (как «Загрузить файл» в блоке файлов). Заглушка пустого эпика — только текст. -->
      <UButton icon="i-lucide-plus" size="xs" color="primary" @click="createOpen = true">
        Задача
      </UButton>
    </div>

    <div v-if="loading" class="flex flex-col gap-2">
      <USkeleton class="h-8 w-full" />
      <USkeleton class="h-8 w-full" />
    </div>

    <div v-else-if="!children.length" class="rounded-md border border-dashed border-default px-3 py-6 text-center text-sm text-muted">
      В эпике пока нет задач — добавьте первую кнопкой «Задача» выше.
    </div>

    <div v-else class="flex flex-col divide-y divide-default border-y border-default">
      <div v-for="child in children" :key="child.id" class="flex items-center gap-3 py-2">
        <UCheckbox
          :model-value="isClosed(child)"
          :disabled="busyId === child.id"
          @update:model-value="() => toggle(child)"
        />
        <span class="w-12 shrink-0 font-mono text-xs text-muted">#{{ child.id }}</span>
        <RouterLink
          :to="`/tasks/${projectId}/${child.id}`"
          class="min-w-0 flex-1 truncate text-sm hover:underline"
          :class="isClosed(child) && 'text-muted line-through'"
        >
          {{ child.title }}
        </RouterLink>
        <span
          v-if="statusOf(child)"
          class="hidden shrink-0 items-center gap-1.5 text-xs text-muted sm:flex"
        >
          <span class="size-2 rounded-full" :style="{ background: statusOf(child)?.statusColor || '#9CA3AF' }" />
          {{ statusOf(child)?.statusName }}
        </span>
        <div class="w-8 shrink-0">
          <UAvatar
            v-if="child.assignedUserId"
            :src="dictionaries.userById.get(child.assignedUserId)?.avatarUrl || undefined"
            :text="(dictionaries.userById.get(child.assignedUserId)?.displayName || dictionaries.userById.get(child.assignedUserId)?.username || '?').slice(0, 2)"
            size="2xs"
          />
        </div>
      </div>
    </div>

    <TaskFormModal
      v-model:open="createOpen"
      :default-project-id="projectId"
      :parent-id="epicId"
      :parent-title="epicTitle"
      @created="onCreated"
    />
  </div>
</template>
