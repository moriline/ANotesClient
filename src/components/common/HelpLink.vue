<script setup lang="ts">
import { computed } from 'vue'
import { helpHint, helpTitle } from '@/help/topics'

// Значок «?» рядом с элементом интерфейса. По наведению (как ⓘ у «Описания»
// задачи) открывает поповер с короткой подсказкой и ссылкой в нужный раздел
// справки — сам по себе никуда не переходит. Ссылка внутри — RouterLink, поэтому
// ⌘/Ctrl-клик по ней открывает справку в новой вкладке.
const props = defineProps<{
  topic: string
  hash?: string
  label?: string
  /** Текст поповера. Если не задан — берётся общая подсказка раздела (helpHint). */
  hint?: string
}>()

const to = computed(() => ({
  path: `/help/${props.topic}`,
  hash: props.hash ? `#${props.hash}` : undefined
}))

const body = computed(() => props.hint ?? helpHint(props.topic))
</script>

<template>
  <UPopover
    mode="hover"
    :open-delay="120"
    :close-delay="80"
    :content="{ side: 'top', align: 'start' }"
    :ui="{ content: 'max-w-xs' }"
  >
    <button
      type="button"
      :aria-label="label ?? `Справка: ${helpTitle(topic)}`"
      class="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-dimmed transition-colors hover:text-primary"
      @click.stop.prevent
    >
      <UIcon name="i-lucide-circle-help" class="size-3.5" />
    </button>

    <template #content>
      <div class="flex max-w-xs flex-col gap-1.5 p-3 text-xs leading-5 text-default">
        <p class="font-medium text-highlighted">Справка</p>
        <p class="text-muted">{{ body }}</p>
        <RouterLink
          :to="to"
          class="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Открыть раздел «{{ helpTitle(topic) }}»
          <UIcon name="i-lucide-arrow-right" class="size-3 shrink-0" />
        </RouterLink>
      </div>
    </template>
  </UPopover>
</template>
