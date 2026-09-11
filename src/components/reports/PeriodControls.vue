<script setup lang="ts">
import { computed } from 'vue'

// month: 0 — весь год, 1–12 — конкретный месяц.
const year = defineModel<number>('year', { required: true })
const month = defineModel<number>('month', { required: true })

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const yearItems = computed(() => {
  const current = new Date().getFullYear()
  return Array.from({ length: 6 }, (_, i) => ({ label: String(current - i), value: current - i }))
})

const monthItems = [
  { label: 'Весь год', value: 0 },
  ...MONTHS.map((label, i) => ({ label, value: i + 1 }))
]
</script>

<template>
  <div class="flex items-end gap-3">
    <label class="flex flex-col gap-1 text-xs text-muted">
      Месяц
      <USelectMenu v-model="month" :items="monthItems" value-key="value" class="w-[150px]" />
    </label>
    <label class="flex flex-col gap-1 text-xs text-muted">
      Год
      <USelectMenu v-model="year" :items="yearItems" value-key="value" class="w-[110px]" />
    </label>
  </div>
</template>
