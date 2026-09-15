<script setup lang="ts">
// Ссылка/картинка на файл задачи в тексте — обычный markdown на
// TASK_FILE_PREFIX (см. files.ts, «Скопировать ссылку» у файла в
// TaskDetailView.vue), без своей схемы — тот же приём, что у вики
// (WikiMarkdown.vue). Ручка отдачи требует Authorization, которую браузер не
// пришлёт ни к <img src>, ни при обычном переходе по <a href>, поэтому
// картинки донагружаются авторизованным fetch (useAuthorizedImages), а клик
// по ссылке на файл скачивает его тем же способом вместо перехода браузера.
import { computed, nextTick, ref, watch } from 'vue'
import { marked, Marked } from 'marked'
import DOMPurify from 'dompurify'
import { mentionExtension, type MentionUser } from '@/utils/mentions'
import { TASK_FILE_PREFIX, downloadFile, fetchFileBlobByHref } from '@/api/files'
import { useAuthorizedImages } from '@/composables/useAuthorizedImages'

const props = defineProps<{
  source: string | null | undefined
  /** Если передан — токены @[Имя] известных участников подсвечиваются. */
  mentions?: MentionUser[]
}>()

const toast = useToast()

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

const rootEl = ref<HTMLElement>()
const { resolveAll } = useAuthorizedImages(rootEl, TASK_FILE_PREFIX, fetchFileBlobByHref)
watch(html, () => { nextTick(resolveAll) }, { immediate: true })

function onClick(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  const anchor = (e.target as HTMLElement).closest('a')
  const href = anchor?.getAttribute('href')
  if (!href || !href.startsWith(TASK_FILE_PREFIX)) return
  e.preventDefault()
  const fileName = decodeURIComponent(href.slice(TASK_FILE_PREFIX.length))
  downloadFile(fileName, anchor!.textContent || fileName)
    .catch(() => toast.add({ title: 'Не удалось скачать файл', color: 'error' }))
}
</script>

<template>
  <div v-if="html" ref="rootEl" class="markdown-view max-w-[68ch] text-sm leading-5" @click="onClick" v-html="html" />
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
.markdown-view :deep(img) { border-radius: 0.375rem; max-width: 100%; }
.markdown-view :deep(.mention) {
  color: var(--ui-primary);
  font-weight: 500;
  background: color-mix(in oklab, var(--ui-primary) 12%, transparent);
  border-radius: 0.25rem;
  padding: 0.02em 0.28em;
  white-space: nowrap;
}
</style>
