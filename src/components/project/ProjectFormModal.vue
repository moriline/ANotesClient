<script setup lang="ts">
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'
import { z } from 'zod'
import { useDictionariesStore } from '@/stores/dictionaries'
import { createProject, updateProject } from '@/api/projects'
import { ApiError } from '@/api/http'
import type { ProjectResponse } from '@/types/domain'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ project?: ProjectResponse | null }>()
const emit = defineEmits<{ saved: [] }>()

const dictionaries = useDictionariesStore()
const toast = useToast()

const FALLBACK_COLORS = ['#3E8A61', '#7FB13F', '#0E7490', '#1D4ED8', '#7E22CE', '#B45309', '#B91C1C', '#4B5563']
const FALLBACK_ICONS = ['i-lucide-folder', 'i-lucide-briefcase', 'i-lucide-rocket', 'i-lucide-code', 'i-lucide-target', 'i-lucide-globe', 'i-lucide-layers', 'i-lucide-flag']

const colorOptions = computed(() => dictionaries.appearance?.colors?.length ? dictionaries.appearance.colors : FALLBACK_COLORS)
const iconOptions = computed(() => dictionaries.appearance?.icons?.length ? dictionaries.appearance.icons : FALLBACK_ICONS)

const schema = z.object({
  name: z.string().trim().min(3, 'Минимум 3 символа').max(50, 'Максимум 50 символов')
})

const state = reactive({ name: '', description: '', color: '', icon: '', tags: [] as string[] })
const submitting = ref(false)
const formRef = useTemplateRef<{ submit: () => Promise<void>; clear: () => void }>('form')

const isEdit = computed(() => !!props.project)

watch(open, (visible) => {
  if (visible) {
    dictionaries.loadAppearance()
    if (props.project) {
      state.name = props.project.name
      state.description = props.project.description ?? ''
      state.color = props.project.color ?? ''
      state.icon = props.project.icon ?? ''
      state.tags = [...props.project.tags]
    } else {
      state.name = ''
      state.description = ''
      state.color = colorOptions.value[0] ?? ''
      state.icon = iconOptions.value[0] ?? ''
      state.tags = []
    }
  } else {
    // Убираем ошибки валидации при закрытии, чтобы автофокусное поле
    // «Название» не «мигало» ошибкой при клике на «Отмена».
    formRef.value?.clear()
  }
})

async function onSubmit() {
  submitting.value = true
  try {
    const payload = {
      name: state.name.trim(),
      description: state.description || undefined,
      color: state.color || undefined,
      icon: state.icon || undefined,
      // Всегда шлём массив (в т.ч. пустой) — это единственное место, где
      // правится словарь тегов проекта, и снятие всех тегов должно применяться.
      tags: state.tags
    }
    if (isEdit.value && props.project) {
      await updateProject(props.project.id, payload)
      toast.add({ title: 'Проект обновлён', color: 'primary' })
    } else {
      await createProject(payload)
      toast.add({ title: 'Проект создан', color: 'primary' })
    }
    await dictionaries.loadProjects(true)
    emit('saved')
    open.value = false
  } catch (e) {
    toast.add({
      title: 'Не удалось сохранить проект',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="isEdit ? 'Изменить проект' : 'Новый проект'" :ui="{ content: 'max-w-[560px]' }">
    <template #body>
      <UForm
        ref="form"
        :schema="schema"
        :state="state"
        :validate-on="['input', 'change']"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField label="Название" name="name" required>
          <UInput v-model="state.name" autofocus class="w-full" />
        </UFormField>
        <UFormField label="Описание" name="description">
          <UTextarea v-model="state.description" :rows="3" class="w-full" />
        </UFormField>
        <UFormField label="Цвет">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in colorOptions"
              :key="c"
              type="button"
              class="size-7 rounded-full ring-offset-2"
              :class="state.color === c ? 'ring-2 ring-primary' : ''"
              :style="{ background: c }"
              :aria-label="c"
              @click="state.color = c"
            />
          </div>
        </UFormField>
        <UFormField label="Иконка">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="icon in iconOptions"
              :key="icon"
              type="button"
              class="flex size-9 items-center justify-center rounded-md border border-default"
              :class="state.icon === icon ? 'border-primary bg-primary/10 text-primary' : 'text-muted'"
              @click="state.icon = icon"
            >
              <UIcon :name="icon" class="size-4" />
            </button>
          </div>
        </UFormField>
        <UFormField label="Теги" name="tags">
          <UInputTags v-model="state.tags" placeholder="Введите тег и нажмите Enter" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton type="button" variant="outline" color="primary" @click="open = false">Отмена</UButton>
        <UButton type="button" color="primary" :loading="submitting" @click="formRef?.submit()">
          {{ isEdit ? 'Сохранить' : 'Создать проект' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
