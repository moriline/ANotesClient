<script setup lang="ts">
import { reactive, ref, useTemplateRef, watch } from 'vue'
import { z } from 'zod'
import { register } from '@/api/auth'
import { ApiError } from '@/api/http'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [] }>()

const toast = useToast()

const schema = z.object({
  username: z.string().trim().min(3, 'Минимум 3 символа').max(50, 'Максимум 50 символов'),
  email: z.string().trim().email('Введите корректный email').max(100, 'Максимум 100 символов'),
  password: z.string().min(6, 'Минимум 6 символов').max(100, 'Максимум 100 символов')
})

const state = reactive({ username: '', email: '', password: '' })
const submitting = ref(false)
const formRef = useTemplateRef<{ submit: () => Promise<void>; clear: () => void }>('form')

watch(open, (visible) => {
  if (visible) {
    state.username = ''
    state.email = ''
    state.password = ''
  } else {
    formRef.value?.clear()
  }
})

async function onSubmit() {
  submitting.value = true
  try {
    await register({ username: state.username.trim(), email: state.email.trim(), password: state.password })
    toast.add({ title: `Пользователь «${state.username.trim()}» создан`, color: 'primary' })
    emit('created')
    open.value = false
  } catch (e) {
    toast.add({
      title: 'Не удалось создать пользователя',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Новый пользователь" :ui="{ content: 'max-w-[440px]' }">
    <template #body>
      <UForm
        ref="form"
        :schema="schema"
        :state="state"
        :validate-on="['input', 'change']"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField label="Имя пользователя" name="username" required>
          <UInput v-model="state.username" autofocus class="w-full" />
        </UFormField>
        <UFormField label="Email" name="email" required>
          <UInput v-model="state.email" type="email" class="w-full" />
        </UFormField>
        <UFormField label="Пароль" name="password" required hint="Сообщите его пользователю">
          <UInput v-model="state.password" type="password" class="w-full" />
        </UFormField>
        <p class="text-xs text-muted">
          Создаётся обычный пользователь. Права администратора и деактивация — на стороне бэкенда / через список ниже.
        </p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton type="button" variant="outline" color="primary" @click="open = false">Отмена</UButton>
        <UButton type="button" color="primary" :loading="submitting" @click="formRef?.submit()">Создать</UButton>
      </div>
    </template>
  </UModal>
</template>
