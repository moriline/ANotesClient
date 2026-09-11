<script setup lang="ts">
import { computed } from 'vue'
import { marked, Marked } from 'marked'
import DOMPurify from 'dompurify'
import { mentionExtension, type MentionUser } from '@/utils/mentions'

const props = defineProps<{
  source: string | null | undefined
  /** Если передан — токены @[Имя] известных участников подсвечиваются. */
  mentions?: MentionUser[]
}>()

marked.setOptions({ breaks: true })

const html = computed(() => {
  if (!props.source) return ''
  let raw: string
  if (props.mentions && props.mentions.length) {
    // Локальный инстанс — расширение не должно протекать в глобальный marked.
    const md = new Marked({ breaks: true })
    md.use({ extensions: [mentionExtension(props.mentions)] })
    raw = md.parse(props.source, { async: false }) as string
  } else {
    raw = marked.parse(props.source, { async: false }) as string
  }
  return DOMPurify.sanitize(raw)
})
</script>

<template>
  <div v-if="html" class="markdown-view max-w-[68ch] text-sm leading-5" v-html="html" />
  <p v-else class="text-sm text-muted">Без описания</p>
</template>

<style scoped>
.markdown-view :deep(h1),
.markdown-view :deep(h2),
.markdown-view :deep(h3) {
  font-weight: 600;
  margin: 1em 0 0.4em;
}
.markdown-view :deep(p) {
  margin: 0 0 0.75em;
}
.markdown-view :deep(ul),
.markdown-view :deep(ol) {
  margin: 0 0 0.75em;
  padding-inline-start: 1.25em;
}
.markdown-view :deep(code) {
  font-family: var(--font-mono);
  background: var(--ui-bg-elevated);
  border-radius: 0.25rem;
  padding: 0.1em 0.35em;
  font-size: 0.9em;
}
.markdown-view :deep(pre) {
  background: var(--ui-bg-elevated);
  border-radius: 0.5rem;
  padding: 0.75em;
  overflow-x: auto;
}
.markdown-view :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
}
.markdown-view :deep(.mention) {
  color: var(--ui-primary);
  font-weight: 500;
  background: color-mix(in oklab, var(--ui-primary) 12%, transparent);
  border-radius: 0.25rem;
  padding: 0.02em 0.28em;
  white-space: nowrap;
}
</style>
