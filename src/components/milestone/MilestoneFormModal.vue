<script setup lang="ts">
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'
import { z } from 'zod'
import { useDictionariesStore } from '@/stores/dictionaries'
import { createMilestone, updateMilestone } from '@/api/milestones'
import { ApiError } from '@/api/http'
import type { MilestoneResponse } from '@/types/domain'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ projectId: number; milestone?: MilestoneResponse | null }>()
const emit = defineEmits<{ created: []; saved: [milestone: MilestoneResponse] }>()

const dictionaries = useDictionariesStore()
const toast = useToast()

const schema = z.object({
  title: z.string().trim().min(1, 'Название не может быть пустым').max(200, 'Максимум 200 символов'),
  dueDate: z.string().min(1, 'Укажите срок — веха без даты бессмысленна')
})

const state = reactive({ title: '', dueDate: '', description: '' })
const submitting = ref(false)
const formRef = useTemplateRef<{ submit: () => Promise<void>; clear: () => void }>('form')

const isEdit = computed(() => !!props.milestone)

function msToInput(ms: number | null | undefined): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : ''
}
function inputToMs(v: string): number {
  return new Date(`${v}T00:00:00`).getTime()
}

watch(open, (visible) => {
  if (visible) {
    if (props.milestone) {
      state.title = props.milestone.title
      state.dueDate = msToInput(props.milestone.dueDate)
      state.description = props.milestone.description ?? ''
    } else {
      state.title = ''
      state.dueDate = ''
      state.description = ''
    }
  } else {
    formRef.value?.clear()
  }
})

async function onSubmit() {
  submitting.value = true
  try {
    if (isEdit.value && props.milestone) {
      const updated = await updateMilestone(
        props.milestone.id,
        {
          title: state.title.trim(),
          dueDate: inputToMs(state.dueDate),
          description: state.description.trim() || undefined
        },
        props.milestone.version
      )
      toast.add({ title: 'Веха обновлена', color: 'primary' })
      await dictionaries.loadMilestones(props.projectId, true)
      emit('saved', updated)
    } else {
      await createMilestone(props.projectId, {
        title: state.title.trim(),
        dueDate: inputToMs(state.dueDate),
        description: state.description.trim() || undefined
      })
      toast.add({ title: 'Веха создана', color: 'primary' })
      await dictionaries.loadMilestones(props.projectId, true)
      emit('created')
    }
    open.value = false
  } catch (e) {
    // 409 — дубль названия в проекте либо устаревшая версия; сервер шлёт
    // понятный текст, показываем его как есть.
    toast.add({
      title: 'Не удалось сохранить веху',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="isEdit ? 'Изменить веху' : 'Новая веха'" :ui="{ content: 'max-w-[560px]' }">
    <template #body>
      <UForm
        ref="form"
        :schema="schema"
        :state="state"
        :validate-on="['input', 'change']"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField label="Название" name="title" required>
          <UInput v-model="state.title" autofocus placeholder="Например, «Релиз 1.2»" class="w-full" />
        </UFormField>
        <UFormField label="Срок" name="dueDate" required>
          <input
            v-model="state.dueDate"
            type="date"
            class="w-full rounded-md border border-default bg-default px-2.5 py-1.5 text-sm"
          >
        </UFormField>
        <UFormField label="Описание" name="description">
          <UTextarea v-model="state.description" :rows="3" placeholder="Поддерживается Markdown" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton type="button" variant="outline" color="primary" @click="open = false">Отмена</UButton>
        <UButton type="button" color="primary" :loading="submitting" @click="formRef?.submit()">
          {{ isEdit ? 'Сохранить' : 'Создать веху' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
