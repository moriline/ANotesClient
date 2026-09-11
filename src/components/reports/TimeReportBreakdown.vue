<script setup lang="ts">
import { computed } from 'vue'
import { formatDuration } from '@/utils/format'
import type { BreakdownRow } from './breakdown'

const props = withDefaults(defineProps<{
  totalSeconds: number
  totalHours?: number
  entryCount: number
  periodLabel?: string
  rows: BreakdownRow[]
  rowHeader: string
  selectable?: boolean
  emptyText: string
}>(), {
  selectable: false
})

const emit = defineEmits<{ select: [key: number] }>()

const maxSeconds = computed(() => props.rows.reduce((m, r) => Math.max(m, r.totalSeconds), 0))
const hoursLabel = computed(() => props.totalHours ?? Math.round((props.totalSeconds / 3600) * 100) / 100)

function barWidth(seconds: number): number {
  return maxSeconds.value > 0 ? Math.round((seconds / maxSeconds.value) * 100) : 0
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
      <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Разбивка · {{ rowHeader }}</p>

      <div v-if="!rows.length" class="rounded-lg border border-default px-4 py-8 text-center text-sm text-muted">
        {{ emptyText }}
      </div>

      <div v-else class="overflow-x-auto rounded-lg border border-default">
        <table class="w-full min-w-[560px] text-sm">
          <thead class="bg-elevated/40 text-left text-xs text-muted">
            <tr>
              <th class="px-4 py-2">{{ rowHeader }}</th>
              <th class="w-[38%] px-2 py-2">Доля</th>
              <th class="w-24 px-2 py-2 text-right">Время</th>
              <th class="w-20 px-2 py-2 text-right">Записей</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.key"
              class="border-t border-default"
              :class="selectable ? 'cursor-pointer hover:bg-elevated/40' : ''"
              @click="selectable && emit('select', row.key)"
            >
              <td class="px-4 py-2.5">
                <p class="font-medium text-highlighted">{{ row.label }}</p>
                <p v-if="row.sublabel" class="text-xs text-muted">{{ row.sublabel }}</p>
              </td>
              <td class="px-2 py-2.5">
                <div class="flex items-center gap-2">
                  <div class="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                    <div class="h-full rounded-full bg-primary" :style="{ width: `${barWidth(row.totalSeconds)}%` }" />
                  </div>
                  <span class="w-9 shrink-0 text-right text-xs text-muted">{{ sharePercent(row.totalSeconds) }}%</span>
                </div>
              </td>
              <td class="px-2 py-2.5 text-right font-mono">{{ formatDuration(row.totalSeconds) }}</td>
              <td class="px-2 py-2.5 text-right text-muted">{{ row.entryCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
