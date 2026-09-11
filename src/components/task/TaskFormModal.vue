<script setup lang="ts">
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'
import { z } from 'zod'
import { useDictionariesStore } from '@/stores/dictionaries'
import { createTask } from '@/api/tasks'
import { bumpTasksVersion } from '@/composables/useGlobalUi'
import { ApiError } from '@/api/http'
import type { TaskType } from '@/types/domain'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{
  defaultProjectId?: number
  /** Создать задачу сразу внутри этого эпика — поле вида скрыто, вид всегда TASK. */
  parentId?: number
  parentTitle?: string
}>()
const emit = defineEmits<{ created: [] }>()

const dictionaries = useDictionariesStore()
const toast = useToast()

const schema = z.object({
  title: z.string().trim().min(1, 'Название не может быть пустым')
})

const state = reactive({
  title: '',
  description: '',
  tags: [] as string[]
})
// Вид сущности первым полем (parent_task.md §5.7). У эпика нет исполнителя и
// статуса — в этой модалке их и так нет, поэтому при выборе «Эпик» просто
// меняется отправляемый taskType и показывается пояснение.
const taskType = ref<TaskType>('TASK')
const projectId = ref<number | undefined>(props.defaultProjectId)
// Веха создаваемой задачи (plan.md §4.1) — только у обычной задачи. Ось,
// ортогональная эпику: задача внутри эпика тоже может иметь веху.
const milestoneId = ref<number | undefined>()
const keepOpen = ref(false)
const submitting = ref(false)
const projectTouched = ref(false)
const formRef = useTemplateRef<{ submit: () => Promise<void>; clear: () => void }>('form')

// Задача внутри эпика — вид зафиксирован (эпик в эпик вложить нельзя).
const lockedToTask = computed(() => props.parentId != null)
const isEpic = computed(() => !lockedToTask.value && taskType.value === 'EPIC')

const projectItems = computed(() => dictionaries.projects.map(p => ({ label: p.name, value: p.id })))

// Теги задачи выбираются из тегов выбранного проекта (ProjectResponse.tags).
const projectTagOptions = computed(() =>
  projectId.value ? dictionaries.projectById.get(projectId.value)?.tags ?? [] : []
)

// Открытые вехи выбранного проекта — для селектора «Веха».
const milestoneItems = computed(() => {
  const list = projectId.value ? dictionaries.milestonesByProject[projectId.value] ?? [] : []
  return list
    .filter(m => m.state !== 'CLOSED')
    .map(m => ({ label: m.title, value: m.id }))
})

// При смене проекта убираем теги, которых нет в новом проекте, сбрасываем веху
// (вехи пер-проектные) и подгружаем вехи нового проекта.
watch(projectId, (id) => {
  state.tags = state.tags.filter(t => projectTagOptions.value.includes(t))
  milestoneId.value = undefined
  if (id) dictionaries.loadMilestones(id).catch(() => {})
})

watch(open, (visible) => {
  if (visible) {
    dictionaries.loadProjects()
    projectId.value = props.defaultProjectId
    taskType.value = 'TASK'
    milestoneId.value = undefined
    if (projectId.value) dictionaries.loadMilestones(projectId.value).catch(() => {})
  } else {
    // Сбрасываем поля и ошибки валидации при любом закрытии
    // (Отмена, Esc, клик по фону, крестик) — чтобы при следующем
    // открытии модалка была чистой и без «повисшей» ошибки.
    resetForm()
  }
})

function resetForm() {
  state.title = ''
  state.description = ''
  state.tags = []
  taskType.value = 'TASK'
  milestoneId.value = undefined
  projectTouched.value = false
  projectId.value = props.defaultProjectId
  formRef.value?.clear()
}

async function onSubmit() {
  if (!projectId.value) {
    projectTouched.value = true
    return
  }
  submitting.value = true
  try {
    await createTask(projectId.value, {
      title: state.title.trim(),
      description: state.description || undefined,
      tags: state.tags.length ? state.tags : undefined,
      taskType: isEpic.value ? 'EPIC' : 'TASK',
      parentId: props.parentId,
      // Веху веха собирает только для задач; у эпика milestoneId быть не может.
      milestoneId: isEpic.value ? undefined : milestoneId.value
    })
    toast.add({ title: isEpic.value ? 'Эпик создан' : 'Задача создана', color: 'primary' })
    bumpTasksVersion()
    emit('created')
    if (keepOpen.value) {
      resetForm()
    } else {
      open.value = false
    }
  } catch (e) {
    toast.add({
      title: isEpic.value ? 'Не удалось создать эпик' : 'Не удалось создать задачу',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    formRef.value?.submit()
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="isEpic ? 'Новый эпик' : 'Новая задача'" :ui="{ content: 'max-w-[720px]' }">
    <template #body>
      <UForm
        ref="form"
        :schema="schema"
        :state="state"
        :validate-on="['input', 'change']"
        class="flex flex-col gap-4"
        @submit="onSubmit"
        @keydown="onKeydown"
      >
        <div
          v-if="lockedToTask"
          class="flex items-center gap-2 rounded-md bg-elevated/60 px-3 py-2 text-sm text-muted"
        >
          <UIcon name="i-lucide-package" class="size-4 shrink-0 text-primary" />
          <span>Задача в эпике <span class="font-medium text-default">{{ parentTitle }}</span></span>
        </div>
        <UFormField v-else label="Вид">
          <URadioGroup
            v-model="taskType"
            orientation="horizontal"
            :items="[
              { label: 'Задача', value: 'TASK' },
              { label: 'Эпик', value: 'EPIC' }
            ]"
          />
        </UFormField>

        <p v-if="isEpic" class="rounded-md bg-elevated/60 px-3 py-2 text-sm text-muted">
          Эпик объединяет задачи. Исполнители и статусы задаются у задач внутри.
        </p>

        <UFormField label="Название" name="title" required>
          <UInput v-model="state.title" autofocus placeholder="Например, «Настроить деплой на staging»" class="w-full" />
        </UFormField>
        <UFormField label="Проект" required :error="projectTouched && !projectId ? 'Выберите проект' : undefined">
          <USelectMenu
            v-model="projectId"
            :items="projectItems"
            value-key="value"
            placeholder="Выберите проект"
            class="w-full"
            @update:model-value="projectTouched = true"
          />
        </UFormField>
        <UFormField label="Теги">
          <USelectMenu
            v-if="projectTagOptions.length"
            v-model="state.tags"
            :items="projectTagOptions"
            multiple
            placeholder="Выберите теги"
            class="w-full"
          />
          <p v-else class="text-sm text-muted">
            {{ projectId ? 'У выбранного проекта нет тегов' : 'Сначала выберите проект' }}
          </p>
        </UFormField>
        <UFormField v-if="!isEpic && milestoneItems.length" label="Веха">
          <USelectMenu
            v-model="milestoneId"
            :items="milestoneItems"
            value-key="value"
            placeholder="Без вехи"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Описание" name="description">
          <UTextarea v-model="state.description" :rows="4" placeholder="Поддерживается Markdown" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between">
        <UCheckbox v-model="keepOpen" :label="isEpic ? 'Создать ещё один' : 'Создать ещё одну'" />
        <div class="flex gap-2">
          <UButton type="button" variant="outline" color="primary" @click="open = false">Отмена</UButton>
          <UButton type="button" color="primary" :loading="submitting" @click="formRef?.submit()">
            {{ isEpic ? 'Создать эпик' : 'Создать задачу' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
