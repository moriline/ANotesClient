<script setup lang="ts">
// Экран, на который таймер выходит при остановке или при переключении на
// другую задачу, пока текущая работает (workTimer.ts). Записывает итог через
// тот же POST /api/tasks/{id}/time, что и ручная форма на странице задачи —
// таймер не заводит отдельного способа сохранения времени.
import { ref, watch } from 'vue'
import { useWorkTimerStore } from '@/stores/workTimer'
import { logTime } from '@/api/timeEntries'
import { bumpTasksVersion } from '@/composables/useGlobalUi'
import { ApiError } from '@/api/http'

const timer = useWorkTimerStore()
const toast = useToast()

const hours = ref(0)
const minutes = ref(0)
const description = ref('')
const saving = ref(false)

watch(() => timer.logModalOpen, (open) => {
  if (!open) return
  const total = Math.round(timer.elapsedSeconds)
  hours.value = Math.floor(total / 3600)
  minutes.value = Math.round((total % 3600) / 60)
  description.value = ''
})

async function submit() {
  if (!timer.active) return
  const seconds = Math.round((hours.value || 0) * 3600 + (minutes.value || 0) * 60)
  if (seconds <= 0) {
    toast.add({ title: 'Укажите затраченное время', color: 'error' })
    return
  }
  saving.value = true
  try {
    await logTime(timer.active.taskId, {
      seconds,
      description: description.value.trim() || undefined,
      startTime: timer.active.startedAt
    })
    bumpTasksVersion()
    toast.add({ title: 'Время записано', color: 'primary' })
    timer.clear()
    timer.resolveModal()
  } catch (e) {
    toast.add({ title: 'Не удалось записать время', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    saving.value = false
  }
}

function discard() {
  timer.clear()
  timer.resolveModal()
}
</script>

<template>
  <UModal :open="timer.logModalOpen" title="Записать время" @update:open="(v: boolean) => { if (!v) timer.cancelModal() }">
    <template #body>
      <div v-if="timer.active" class="flex flex-col gap-3">
        <p class="text-sm text-muted">
          <span class="font-medium text-highlighted">{{ timer.active.taskTitle }}</span> — таймер остановлен на паузе.
        </p>
        <p v-if="timer.pendingStart" class="text-xs text-muted">
          Чтобы запустить таймер по «{{ timer.pendingStart.title }}», сначала запишите или сбросьте это время.
        </p>
        <div class="flex gap-2">
          <UFormField label="Часы" class="flex-1">
            <UInputNumber v-model="hours" :min="0" :step="1" class="w-full" />
          </UFormField>
          <UFormField label="Минуты" class="flex-1">
            <UInputNumber v-model="minutes" :min="0" :max="59" :step="5" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Комментарий">
          <UInput v-model="description" placeholder="Что делали" class="w-full" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton variant="ghost" color="neutral" @click="discard">Сбросить</UButton>
        <div class="flex gap-2">
          <UButton variant="outline" color="primary" @click="timer.cancelModal()">Отмена</UButton>
          <UButton color="primary" :loading="saving" @click="submit">Записать</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
