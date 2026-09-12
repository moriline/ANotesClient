<script setup lang="ts">
// Компактная полоска идущего таймера — смонтирована в AppHeader, поэтому
// видна на любой странице, а не только на странице задачи: ключевой сценарий
// («часто переключаться между проектами») требует видеть и останавливать
// таймер, не возвращаясь на задачу, где он был запущен.
import { useWorkTimerStore } from '@/stores/workTimer'
import { formatClock } from '@/utils/format'
import WorkTimerLogModal from '@/components/layout/WorkTimerLogModal.vue'

const timer = useWorkTimerStore()
</script>

<template>
  <div v-if="timer.active" class="border-b border-default bg-primary-50/60">
    <div class="mx-auto flex h-9 w-[95%] items-center gap-2 px-6 text-sm">
      <UIcon name="i-lucide-timer" class="size-4 shrink-0 text-primary" />
      <RouterLink
        :to="`/tasks/${timer.active.projectId}/${timer.active.taskId}`"
        class="min-w-0 flex-1 truncate hover:underline"
      >
        {{ timer.active.taskTitle }}
      </RouterLink>
      <span class="shrink-0 font-mono tabular-nums">{{ formatClock(timer.elapsedSeconds) }}</span>
      <UButton
        :icon="timer.isRunning ? 'i-lucide-pause' : 'i-lucide-play'"
        variant="ghost"
        color="primary"
        size="xs"
        :aria-label="timer.isRunning ? 'Пауза' : 'Продолжить'"
        @click="timer.isRunning ? timer.pause() : timer.resume()"
      />
      <UButton
        icon="i-lucide-square"
        variant="ghost"
        color="primary"
        size="xs"
        aria-label="Остановить"
        @click="timer.requestStop()"
      />
    </div>
  </div>
  <WorkTimerLogModal />
</template>
