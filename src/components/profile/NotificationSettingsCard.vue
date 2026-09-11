<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getNotificationSettings, updateNotificationSetting } from '@/api/notifications'
import { ApiError } from '@/api/http'
import type { NotificationSettingResponse } from '@/types/domain'

// Карточка «Уведомления» в профиле (spec §7.6). Тумблер in-app на каждый тип,
// который отдаёт сервер. Выключенный тип не создаёт записей вовсе
// (notifications.md §6).

const toast = useToast()

const settings = ref<NotificationSettingResponse[]>([])
const loading = ref(true)
const savingType = ref<string | null>(null)

const LABELS: Record<string, string> = {
  MENTION: 'Упоминания',
  ASSIGNED: 'Назначение задачи на меня',
  COMMENT: 'Комментарии в моих задачах',
  STATUS_CHANGED: 'Смена статуса моих задач',
  DUE_SOON: 'Приближение срока'
}
const HINTS: Record<string, string> = {
  MENTION: 'Когда вас упомянули через @ в комментарии или описании',
  ASSIGNED: 'Когда задачу назначили на вас',
  COMMENT: 'Новый комментарий в задаче, где вы автор или исполнитель',
  STATUS_CHANGED: 'Когда статус вашей задачи сменил кто-то другой',
  DUE_SOON: 'За день до срока'
}
function label(type: string): string {
  return LABELS[type] ?? type
}

onMounted(load)

async function load() {
  loading.value = true
  try {
    settings.value = await getNotificationSettings()
  } catch (e) {
    toast.add({
      title: 'Не удалось загрузить настройки уведомлений',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

async function toggle(row: NotificationSettingResponse, value: boolean) {
  const previous = row.inApp
  row.inApp = value
  savingType.value = row.type
  try {
    settings.value = await updateNotificationSetting(row.type, { inApp: value })
  } catch (e) {
    row.inApp = previous
    toast.add({
      title: 'Не удалось сохранить',
      description: e instanceof ApiError ? e.message : undefined,
      color: 'error'
    })
  } finally {
    savingType.value = null
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <p class="text-lg font-semibold">Уведомления</p>
    </template>

    <div v-if="loading" class="flex flex-col gap-3">
      <USkeleton class="h-6 w-full" />
      <USkeleton class="h-6 w-2/3" />
    </div>

    <p v-else-if="!settings.length" class="text-sm text-muted">
      Типы уведомлений сейчас недоступны.
    </p>

    <div v-else class="flex flex-col divide-y divide-default">
      <div
        v-for="row in settings"
        :key="row.type"
        class="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
      >
        <div class="min-w-0">
          <p class="text-sm">{{ label(row.type) }}</p>
          <p v-if="HINTS[row.type]" class="text-xs text-muted">{{ HINTS[row.type] }}</p>
        </div>
        <USwitch
          :model-value="row.inApp"
          :loading="savingType === row.type"
          @update:model-value="(v: boolean) => toggle(row, v)"
        />
      </div>
    </div>

    <p class="mt-4 text-xs text-muted">
      Приходят в колокольчик в шапке. Почтовых и push-уведомлений нет.
    </p>
  </UCard>
</template>
