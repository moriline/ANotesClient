<script setup lang="ts">
// Раньше тег был кнопкой с router.push по клику: не настоящая ссылка, поэтому
// не открывалась в новой вкладке (Ctrl/Cmd+клик, средняя кнопка, «открыть в
// новой вкладке» из контекстного меню — ничего не работало), а обычный клик
// уводил со страницы задачи без way back. Теперь это настоящая ссылка
// (RouterLink → <a href>) и target="_blank": открывается в новой вкладке
// всегда, страница задачи никуда не девается — возвращаться незачем.
import { computed } from 'vue'
import { tagColor } from '@/utils/format'

const props = withDefaults(defineProps<{ tags: string[]; max?: number }>(), { max: 3 })

const visible = computed(() => props.tags.slice(0, props.max))
const hiddenCount = computed(() => Math.max(0, props.tags.length - props.max))
</script>

<template>
  <div v-if="tags.length" class="flex flex-wrap items-center gap-1">
    <UTooltip v-for="tag in visible" :key="tag" text="Открыть в новой вкладке: задачи с этим тегом">
      <RouterLink
        :to="{ path: '/tasks', query: { tag } }"
        target="_blank"
        rel="noopener"
        :aria-label="`Открыть в новой вкладке: задачи с тегом «${tag}»`"
      >
        <UBadge
          variant="subtle"
          icon="i-lucide-tag"
          class="cursor-pointer transition-opacity hover:opacity-70"
          :style="{ backgroundColor: `${tagColor(tag)}1F`, color: tagColor(tag) }"
        >
          {{ tag }}
        </UBadge>
      </RouterLink>
    </UTooltip>
    <span v-if="hiddenCount > 0" class="text-xs text-muted">+{{ hiddenCount }}</span>
  </div>
</template>
