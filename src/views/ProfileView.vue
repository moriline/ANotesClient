<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import PageHeader from '@/components/layout/PageHeader.vue'
import NotificationSettingsCard from '@/components/profile/NotificationSettingsCard.vue'
import { useAuthStore } from '@/stores/auth'
import { changePassword, updateMe } from '@/api/users'
import { ApiError } from '@/api/http'
import { formatDateTime, initials } from '@/utils/format'
import { jwtExpiresAt } from '@/utils/jwt'

const auth = useAuthStore()
const toast = useToast()

const profileForm = reactive({ displayName: '', email: '', avatarUrl: '' })
const savingProfile = ref(false)

const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'Укажите имя').max(100, 'Максимум 100 символов'),
  email: z.string().trim().email('Неверный email').max(100, 'Максимум 100 символов'),
  avatarUrl: z.string().trim().max(255, 'Максимум 255 символов').optional()
})

function syncProfileForm() {
  profileForm.displayName = auth.profile?.displayName ?? ''
  profileForm.email = auth.profile?.email ?? ''
  profileForm.avatarUrl = auth.profile?.avatarUrl ?? ''
}

const profileDirty = computed(() => {
  const p = auth.profile
  if (!p) return false
  return profileForm.displayName.trim() !== (p.displayName ?? '')
    || profileForm.email.trim() !== (p.email ?? '')
    || profileForm.avatarUrl.trim() !== (p.avatarUrl ?? '')
})

async function saveProfile() {
  savingProfile.value = true
  try {
    await updateMe({
      displayName: profileForm.displayName.trim(),
      email: profileForm.email.trim(),
      avatarUrl: profileForm.avatarUrl.trim() || undefined
    })
    await auth.fetchProfile()
    syncProfileForm()
    toast.add({ title: 'Профиль сохранён', color: 'primary' })
  } catch (e) {
    toast.add({ title: 'Не удалось сохранить профиль', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    savingProfile.value = false
  }
}

const passwordForm = reactive({ currentPassword: '', newPassword: '', repeatPassword: '' })
const savingPassword = ref(false)

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Введите текущий пароль'),
  newPassword: z.string().min(6, 'Минимум 6 символов').max(100, 'Максимум 100 символов'),
  repeatPassword: z.string()
}).refine(v => v.newPassword === v.repeatPassword, {
  message: 'Пароли не совпадают',
  path: ['repeatPassword']
})

async function savePassword() {
  savingPassword.value = true
  try {
    await changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword
    })
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    passwordForm.repeatPassword = ''
    toast.add({ title: 'Пароль изменён', color: 'primary' })
  } catch (e) {
    toast.add({ title: 'Не удалось изменить пароль', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    savingPassword.value = false
  }
}

// Доступ для ИИ-агента живёт на отдельной странице (/agent). Здесь — только
// строка-статус: создан ли токен и до какого времени действует.
const agentTokenExpiresAt = computed(() => jwtExpiresAt(auth.agentToken))
const agentTokenExpired = computed(() => {
  const at = agentTokenExpiresAt.value
  return at != null && at <= Date.now()
})

onMounted(async () => {
  if (!auth.profile) await auth.fetchProfile().catch(() => {})
  syncProfileForm()
})
watch(() => auth.profile, syncProfileForm)
</script>

<template>
  <div>
    <PageHeader title="Профиль" :bordered="false" />

    <div class="mx-auto flex max-w-[640px] flex-col gap-6 px-6 pb-12">
      <UCard>
        <template #header>
          <p class="text-lg font-semibold">Профиль</p>
        </template>

        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-4">
            <UAvatar
              :src="profileForm.avatarUrl || auth.profile?.avatarUrl || undefined"
              :text="initials(profileForm.displayName || auth.profile?.displayName)"
              size="xl"
            />
            <div class="min-w-0">
              <p class="text-sm text-muted">@{{ auth.profile?.username }}</p>
              <div v-if="auth.roles.length" class="mt-1 flex flex-wrap gap-1.5">
                <UBadge v-for="role in auth.roles" :key="role" variant="subtle" color="secondary">{{ role }}</UBadge>
              </div>
            </div>
          </div>

          <UForm :schema="profileSchema" :state="profileForm" class="flex flex-col gap-4" @submit="saveProfile">
            <UFormField label="Полное имя" name="displayName" required>
              <UInput v-model="profileForm.displayName" class="w-full" />
            </UFormField>
            <UFormField label="Email" name="email" required>
              <UInput v-model="profileForm.email" type="email" class="w-full" />
            </UFormField>
            <UFormField label="Ссылка на аватар" name="avatarUrl" hint="Необязательно">
              <UInput v-model="profileForm.avatarUrl" placeholder="https://…" class="w-full" />
            </UFormField>
            <div class="flex justify-end">
              <UButton type="submit" color="primary" :loading="savingProfile" :disabled="!profileDirty">
                Сохранить изменения
              </UButton>
            </div>
          </UForm>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <p class="text-lg font-semibold">Пароль</p>
        </template>

        <UForm :schema="passwordSchema" :state="passwordForm" class="flex flex-col gap-4" @submit="savePassword">
          <UFormField label="Текущий пароль" name="currentPassword" required>
            <UInput v-model="passwordForm.currentPassword" type="password" class="w-full" />
          </UFormField>
          <UFormField label="Новый пароль" name="newPassword" required>
            <UInput v-model="passwordForm.newPassword" type="password" class="w-full" />
          </UFormField>
          <UFormField label="Повторите новый пароль" name="repeatPassword" required>
            <UInput v-model="passwordForm.repeatPassword" type="password" class="w-full" />
          </UFormField>
          <div class="flex justify-end">
            <UButton type="submit" color="primary" :loading="savingPassword">Изменить пароль</UButton>
          </div>
        </UForm>
      </UCard>

      <NotificationSettingsCard />

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-sparkles" class="size-5 text-primary" />
            <p class="text-lg font-semibold">Доступ для ИИ-агента</p>
          </div>
        </template>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted">
            <template v-if="auth.agentToken && !agentTokenExpired">
              Токен активен до {{ formatDateTime(agentTokenExpiresAt) }}
            </template>
            <template v-else-if="auth.agentToken">
              Токен истёк — создайте новый в разделе
            </template>
            <template v-else>
              Подключите ИИ-помощника к своим задачам через API
            </template>
          </p>
          <UButton to="/agent" color="primary" trailing-icon="i-lucide-arrow-right">
            Открыть раздел
          </UButton>
        </div>
      </UCard>
    </div>
  </div>
</template>
