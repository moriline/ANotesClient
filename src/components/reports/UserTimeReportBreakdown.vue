<script setup lang="ts">
// Разбивка отчёта «по пользователю» (reports.md #1) — теперь по задачам, а не
// по проектам: GET /api/reports/time отдаёт byProject[].entries[] — агрегат
// по КАЖДОЙ задаче (TaskTimeLine: taskId/taskTitle/totalSeconds/entryCount)
// внутри своей группы-проекта, специально чтобы построить ссылку на задачу
// без второго запроса. Отдельный компонент, а не расширение
// TimeReportBreakdown.vue: та плоская таблица (project/task-tab) не меняется,
// а тут структура принципиально другая — вложенные группы, а не строки.
import { computed } from 'vue'
import { formatDuration } from '@/utils/format'
import type { ProjectTimeEntries } from '@/types/domain'

const props = defineProps<{
  totalSeconds: number
  totalHours?: number
  entryCount: number
  periodLabel?: string
  groups: ProjectTimeEntries[]
  emptyText: string
}>()

const hoursLabel = computed(() => props.totalHours ?? Math.round((props.totalSeconds / 3600) * 100) / 100)

function projectTotal(g: ProjectTimeEntries): number {
  return g.entries.reduce((s, e) => s + e.totalSeconds, 0)
}

function barWidth(seconds: number): number {
  return props.totalSeconds > 0 ? Math.round((seconds / props.totalSeconds) * 100) : 0
}

function sharePercent(seconds: number): number {
  return props.totalSeconds > 0 ? Math.round((seconds / props.totalSeconds) * 100) : 0
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="grid gap-3" :class="periodLabel ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'">
      <div class="rounded-lg border border-default px-4 py-3">
        <p class="text-xs text-muted">Всего времени</p>
        <p class="mt-1 text-xl font-semibold text-highlighted">{{ formatDuration(totalSeconds) }}</p>
        <p class="text-xs text-muted">{{ hoursLabel }} ч</p>
      </div>
      <div class="rounded-lg border border-default px-4 py-3">
        <p class="text-xs text-muted">Записей</p>
        <p class="mt-1 text-xl font-semibold text-highlighted">{{ entryCount }}</p>
      </div>
      <div v-if="periodLabel" class="col-span-2 rounded-lg border border-default px-4 py-3 sm:col-span-1">
        <p class="text-xs text-muted">Период</p>
        <p class="mt-1 text-sm font-medium capitalize text-highlighted">{{ periodLabel }}</p>
      </div>
    </div>

    <div>
      <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Разбивка · Задача</p>

      <div v-if="!groups.length" class="rounded-lg border border-default px-4 py-8 text-center text-sm text-muted">
        {{ emptyText }}
      </div>

      <div v-else class="flex flex-col gap-4">
        <div v-for="g in groups" :key="g.projectId" class="overflow-hidden rounded-lg border border-default">
          <div class="flex items-center justify-between gap-2 bg-elevated/40 px-4 py-2">
            <span class="inline-flex items-center gap-1.5 text-sm font-medium text-highlighted">
              <UIcon name="i-lucide-folder" class="size-4 text-muted" />
              {{ g.projectName }}
            </span>
            <span class="font-mono text-xs text-muted">{{ formatDuration(projectTotal(g)) }}</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[560px] text-sm">
              <tbody>
                <tr v-for="t in g.entries" :key="t.taskId" class="border-t border-default">
                  <td class="px-4 py-2.5">
                    <RouterLink
                      :to="`/tasks/${g.projectId}/${t.taskId}`"
                      class="inline-flex min-w-0 items-center gap-1.5 hover:underline"
                    >
                      <UIcon name="i-lucide-check-square" class="size-3.5 shrink-0 text-muted" />
                      <span class="font-mono text-xs text-muted">#{{ t.taskId }}</span>
                      <span class="truncate font-medium text-highlighted">{{ t.taskTitle }}</span>
                    </RouterLink>
                  </td>
                  <td class="w-[34%] px-2 py-2.5">
                    <div class="flex items-center gap-2">
                      <div class="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                        <div class="h-full rounded-full bg-primary" :style="{ width: `${barWidth(t.totalSeconds)}%` }" />
                      </div>
                      <span class="w-9 shrink-0 text-right text-xs text-muted">{{ sharePercent(t.totalSeconds) }}%</span>
                    </div>
                  </td>
                  <td class="w-24 px-2 py-2.5 text-right font-mono">{{ formatDuration(t.totalSeconds) }}</td>
                  <td class="w-20 px-2 py-2.5 text-right text-muted">{{ t.entryCount }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
