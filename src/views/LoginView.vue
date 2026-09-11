<script setup lang="ts">
import { reactive, ref } from 'vue'
import { z } from 'zod'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api/http'
import PasswordInput from '@/components/common/PasswordInput.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const schema = z.object({
  username: z.string().trim().min(1, 'Введите имя пользователя'),
  password: z.string().min(1, 'Введите пароль')
})

const state = reactive({ username: '', password: '' })
const submitting = ref(false)
const error = ref('')

async function onSubmit() {
  error.value = ''
  submitting.value = true
  try {
    await auth.login(state)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/tasks'
    router.push(redirect)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Не удалось войти'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-white px-4">
    <div class="w-full max-w-[380px]">
      <div class="mb-8 flex flex-col items-center gap-2">
        <span class="flex size-9 items-center justify-center rounded-full bg-primary">
          <UIcon name="i-lucide-sprout" class="size-5 text-white" />
        </span>
        <span class="text-lg font-semibold">ANotes</span>
      </div>

      <UForm :schema="schema" :state="state" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField label="Имя пользователя" name="username">
          <UInput v-model="state.username" autofocus class="w-full" placeholder="ivan" />
        </UFormField>
        <UFormField label="Пароль" name="password">
          <PasswordInput v-model="state.password" placeholder="••••••••" autocomplete="current-password" />
        </UFormField>

        <p v-if="error" class="text-sm text-error">{{ error }}</p>

        <UButton type="submit" color="primary" block :loading="submitting">Войти</UButton>
      </UForm>

      <p class="mt-4 text-center text-sm text-muted">
        Нет аккаунта?
        <RouterLink to="/register" class="text-primary hover:underline">Зарегистрироваться</RouterLink>
      </p>
    </div>
  </div>
</template>
