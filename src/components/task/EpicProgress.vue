<script setup lang="ts">
import { computed } from 'vue'

// Прогресс эпика (parent_task.md §5.2). Считается на сервере по флагу isClosed
// статусов дочерних задач — клиент только отображает done/total/closed.
const props = withDefaults(defineProps<{
  done: number | null | undefined
  total: number | null | undefined
  closed?: boolean | null
  /** Компактный бейдж для таблицы; иначе — блок с полосой для правой панели. */
  compact?: boolean
}>(), { closed: false, compact: false })

// null/undefined — сервер не прислал прогресс (например, задача-эпик из списка,
// где поля не заполнены); отличаем от честного 0.
const known = computed(() => props.total != null)
const total = computed(() => props.total ?? 0)
const done = computed(() => props.done ?? 0)
// §7: полоса при одной задаче — это булево, изображённое полосой. Рисуем её
// только когда задач больше одной, иначе оставляем текст «0 из 1».
const showBar = computed(() => total.value > 1)
</script>

<template>
  <UBadge
    v-if="compact"
    variant="subtle"
    :color="closed ? 'primary' : 'neutral'"
    class="gap-1 font-mono"
  >
    <UIcon name="i-lucide-package" class="size-3" />
    <template v-if="!known">эпик</template>
    <template v-else-if="total > 0">{{ done }}/{{ total }}</template>
    <template v-else>0/0</template>
  </UBadge>

  <div v-else>
    <div class="mb-1 text-xs text-muted">Прогресс</div>
    <UProgress
      v-if="showBar"
      :model-value="done"
      :max="total"
      color="secondary"
      size="sm"
      class="mb-1.5"
    />
    <div class="font-mono text-sm">
      <template v-if="total > 0">{{ done }} из {{ total }}</template>
      <template v-else-if="known">В эпике пока нет задач</template>
      <template v-else>—</template>
    </div>
    <UBadge
      v-if="closed"
      color="primary"
      variant="subtle"
      size="sm"
      class="mt-2"
    >
      Все задачи выполнены
    </UBadge>
  </div>
</template>
