<script setup lang="ts">
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { Marked, type TokenizerAndRendererExtension } from 'marked'
import DOMPurify from 'dompurify'
import { findTasks } from '@/api/tasks'
import { useAuthorizedImages } from '@/composables/useAuthorizedImages'

// Рендер markdown вики-страницы с разбором связей прямо в тексте:
//   [[Заголовок]] — ссылка на страницу проекта (или «красная» ссылка «создать»,
//                   если страницы с таким заголовком нет);
//   #123          — ссылка на задачу. id задачи СКВОЗНОЙ по всей системе (не
//                   TSK-123 — см. wiki.md), а маршрут задачи — /tasks/{projectId}/{taskId}.
//                   Ручки «получить задачу по id» в API нет, поэтому проект задачи
//                   резолвим одним запросом POST /api/find; пока не резолвнули,
//                   ссылка временно ведёт в проект текущей страницы.
// Связи для блока «Упоминается в» приходят отдельным запросом (backlinks);
// здесь — только исходящие ссылки внутри содержимого.

const props = defineProps<{
  source: string | null | undefined
  projectId: number
  /** Заголовок страницы (в нижнем регистре) → id, для резолва [[ссылок]]. */
  pageIndex: Map<string, number>
}>()

const router = useRouter()

// id задачи → её проект и заголовок. /find отдаёт задачи из всех проектов,
// где состоит пользователь. Каждый упомянутый id пытаемся резолвить один раз.
const taskInfo = ref(new Map<number, { projectId: number; title: string }>())
const attempted = new Set<number>()
let findInFlight = false

const referencedTaskIds = computed(() => {
  const ids = new Set<number>()
  const re = /#(\d{1,9})(?!\w)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(props.source ?? ''))) ids.add(Number(m[1]))
  return ids
})

watchEffect(() => {
  const ids = [...referencedTaskIds.value]
  const need = ids.some(id => !taskInfo.value.has(id) && !attempted.has(id))
  if (!need || findInFlight) return
  findInFlight = true
  ids.forEach(id => attempted.add(id))
  findTasks({ limit: 500 })
    .then((res) => {
      const next = new Map(taskInfo.value)
      for (const t of res.tasks ?? []) {
        if (t.id != null && t.projectId != null) {
          next.set(t.id, { projectId: t.projectId, title: t.title || `#${t.id}` })
        }
      }
      taskInfo.value = next
    })
    .catch(() => { /* оставим ссылку с проектом текущей страницы */ })
    .finally(() => { findInFlight = false })
})

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

const html = computed(() => {
  if (!props.source) return ''

  const wikiLink: TokenizerAndRendererExtension = {
    name: 'wikiLink',
    level: 'inline',
    start(src) {
      const i = src.indexOf('[[')
      return i === -1 ? undefined : i
    },
    tokenizer(src) {
      const m = /^\[\[([^\]\r\n|]{1,200})\]\]/.exec(src)
      if (!m) return undefined
      return { type: 'wikiLink', raw: m[0], text: m[1]!.trim() }
    },
    renderer(token) {
      const title = String(token.text)
      const id = props.pageIndex.get(title.toLowerCase())
      const label = escapeHtml(title)
      const enc = encodeURIComponent(title)
      return id
        ? `<a class="wiki-link" data-wiki="${id}" href="/projects/${props.projectId}/wiki/${id}">${label}</a>`
        : `<a class="wiki-link wiki-link--missing" title="Создать страницу" data-wiki-new="${enc}" href="/projects/${props.projectId}/wiki/new?title=${enc}">${label}</a>`
    }
  }

  const taskRef: TokenizerAndRendererExtension = {
    name: 'taskRef',
    level: 'inline',
    start(src) {
      const m = /#\d/.exec(src)
      return m ? m.index : undefined
    },
    tokenizer(src) {
      const m = /^#(\d{1,9})(?!\w)/.exec(src)
      if (!m) return undefined
      return { type: 'taskRef', raw: m[0], num: Number(m[1]) }
    },
    renderer(token) {
      const n = Number(token.num)
      const info = taskInfo.value.get(n)
      const proj = info?.projectId ?? props.projectId
      const tip = info ? ` title="${escapeHtml(info.title)}"` : ''
      return `<a class="wiki-taskref" data-task="${n}" data-task-project="${proj}" href="/tasks/${proj}/${n}"${tip}>#${n}</a>`
    }
  }

  const md = new Marked({ breaks: true, gfm: true })
  md.use({ extensions: [wikiLink, taskRef] })
  const raw = md.parse(props.source, { async: false }) as string
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['data-wiki', 'data-wiki-new', 'data-task', 'data-task-project', 'target'] })
})

// Картинки — обычный markdown ![]() на /api/wiki/files/… (wiki_files_client.md
// §1: своей схемы ссылок нет специально, чтобы текст оставался переносимым
// Markdown). Ручка отдачи требует Authorization — <img> его не пришлёт, поэтому
// после каждой перерисовки донагружаем такие картинки авторизованным fetch.
const rootEl = ref<HTMLElement>()
const { resolveAll } = useAuthorizedImages(rootEl)
watch(html, () => { nextTick(resolveAll) }, { immediate: true })

function onClick(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  const anchor = (e.target as HTMLElement).closest('a')
  if (!anchor) return
  const wiki = anchor.getAttribute('data-wiki')
  const wikiNew = anchor.getAttribute('data-wiki-new')
  const task = anchor.getAttribute('data-task')
  if (wiki) {
    e.preventDefault()
    router.push(`/projects/${props.projectId}/wiki/${wiki}`)
  } else if (wikiNew) {
    e.preventDefault()
    router.push({ path: `/projects/${props.projectId}/wiki/new`, query: { title: decodeURIComponent(wikiNew) } })
  } else if (task) {
    e.preventDefault()
    const proj = anchor.getAttribute('data-task-project') || props.projectId
    router.push(`/tasks/${proj}/${task}`)
  } else {
    // Обычная markdown-ссылка на внутренний путь — тоже через роутер.
    const href = anchor.getAttribute('href') ?? ''
    if (href.startsWith('/')) {
      e.preventDefault()
      router.push(href)
    }
  }
}
</script>

<template>
  <div
    v-if="html"
    ref="rootEl"
    class="wiki-markdown text-sm leading-6 text-default"
    @click="onClick"
    v-html="html"
  />
  <p v-else class="text-sm text-muted">Страница пустая.</p>
</template>

<style scoped>
.wiki-markdown :deep(h1),
.wiki-markdown :deep(h2),
.wiki-markdown :deep(h3),
.wiki-markdown :deep(h4) {
  font-weight: 600;
  line-height: 1.3;
  margin: 1.4em 0 0.5em;
  color: var(--ui-text-highlighted);
}
.wiki-markdown :deep(h1) { font-size: 1.4rem; }
.wiki-markdown :deep(h2) { font-size: 1.2rem; }
.wiki-markdown :deep(h3) { font-size: 1.05rem; }
.wiki-markdown :deep(p) { margin: 0 0 0.85em; }
.wiki-markdown :deep(ul),
.wiki-markdown :deep(ol) {
  margin: 0 0 0.85em;
  padding-inline-start: 1.4em;
}
.wiki-markdown :deep(li) { margin: 0.2em 0; }
.wiki-markdown :deep(li > ul),
.wiki-markdown :deep(li > ol) { margin: 0.2em 0; }
.wiki-markdown :deep(blockquote) {
  margin: 0 0 0.85em;
  padding-inline-start: 0.9em;
  border-inline-start: 3px solid var(--ui-border-accented);
  color: var(--ui-text-muted);
}
.wiki-markdown :deep(code) {
  font-family: var(--font-mono);
  background: var(--ui-bg-elevated);
  border-radius: 0.25rem;
  padding: 0.1em 0.35em;
  font-size: 0.88em;
}
.wiki-markdown :deep(pre) {
  background: var(--ui-bg-elevated);
  border-radius: 0.5rem;
  padding: 0.85em 1em;
  overflow-x: auto;
  margin: 0 0 0.85em;
}
.wiki-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: 0.85em;
}
.wiki-markdown :deep(table) {
  border-collapse: collapse;
  margin: 0 0 0.85em;
  display: block;
  overflow-x: auto;
}
.wiki-markdown :deep(th),
.wiki-markdown :deep(td) {
  border: 1px solid var(--ui-border);
  padding: 0.35em 0.6em;
  text-align: start;
}
.wiki-markdown :deep(hr) {
  border: 0;
  border-top: 1px solid var(--ui-border);
  margin: 1.5em 0;
}
.wiki-markdown :deep(img) { border-radius: 0.375rem; max-width: 100%; }
.wiki-markdown :deep(.wiki-broken-image) {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.3em 0.6em;
  border: 1px dashed var(--ui-border-accented);
  border-radius: 0.375rem;
  color: var(--ui-text-muted);
  font-size: 0.85em;
}
.wiki-markdown :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
  cursor: pointer;
}
.wiki-markdown :deep(a.wiki-link) {
  text-decoration: none;
  border-bottom: 1px solid color-mix(in oklab, var(--ui-primary) 45%, transparent);
}
.wiki-markdown :deep(a.wiki-link:hover) { border-bottom-color: var(--ui-primary); }
.wiki-markdown :deep(a.wiki-link--missing) {
  color: var(--ui-error);
  border-bottom: 1px dashed color-mix(in oklab, var(--ui-error) 55%, transparent);
}
.wiki-markdown :deep(a.wiki-taskref) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  text-decoration: none;
  padding: 0.05em 0.3em;
  border-radius: 0.25rem;
  background: var(--ui-bg-elevated);
}
.wiki-markdown :deep(a.wiki-taskref:hover) { color: var(--ui-primary); }
</style>
