<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Marked, type TokenizerAndRendererExtension } from 'marked'
import DOMPurify from 'dompurify'
import { helpTitle } from '@/help/topics'

// Рендер Markdown-страницы справки. Отличия от WikiMarkdown:
//   [[topic]] / [[topic#hash|подпись]] — ссылка на другой раздел справки;
//   заголовкам h2/h3 проставляются id (явный «{#id}» в конце текста или слаг),
//   чтобы работали якорные ссылки из интерфейса; наружу отдаётся список
//   заголовков для оглавления «На этой странице».

interface HelpHeading {
  id: string
  text: string
  level: number
}

const props = defineProps<{ source: string }>()
const emit = defineEmits<{ headings: [HelpHeading[]] }>()

const route = useRoute()
const router = useRouter()

const html = ref('')

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

function slugify(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const helpLink: TokenizerAndRendererExtension = {
  name: 'helpLink',
  level: 'inline',
  start(src) {
    const i = src.indexOf('[[')
    return i === -1 ? undefined : i
  },
  tokenizer(src) {
    const m = /^\[\[([a-z0-9-]+)(#[a-z0-9-]+)?(?:\|([^\]\r\n]{1,120}))?\]\]/i.exec(src)
    if (!m) return undefined
    return {
      type: 'helpLink',
      raw: m[0],
      topic: m[1]!.toLowerCase(),
      hash: m[2] ?? '',
      label: (m[3] ?? '').trim()
    }
  },
  renderer(token) {
    const topic = String(token.topic)
    const hash = String(token.hash || '')
    const label = String(token.label || '') || helpTitle(topic)
    return `<a class="help-xlink" href="/help/${topic}${hash}">${escapeHtml(label)}</a>`
  }
}

function render(src: string) {
  if (!src) {
    html.value = ''
    emit('headings', [])
    return
  }

  const md = new Marked({ breaks: true, gfm: true })
  md.use({ extensions: [helpLink] })
  let raw = md.parse(src, { async: false }) as string

  const heads: HelpHeading[] = []
  raw = raw.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_full, lvl: string, inner: string) => {
    const depth = Number(lvl)
    const explicit = /\{#([a-z0-9-]+)\}\s*$/i.exec(inner)
    const cleanInner = inner.replace(/\s*\{#[a-z0-9-]+\}\s*$/i, '').trim()
    const plain = cleanInner.replace(/<[^>]+>/g, '').trim()
    const id = explicit ? explicit[1]!.toLowerCase() : slugify(plain)
    heads.push({ id, text: plain, level: depth })
    return `<h${depth} id="${id}">${cleanInner}</h${depth}>`
  })

  // Внешние ссылки — в новой вкладке.
  raw = raw.replace(
    /<a href="(https?:\/\/[^"]+)"/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer"'
  )

  html.value = DOMPurify.sanitize(raw, { ADD_ATTR: ['id', 'target'] })
  emit('headings', heads)
}

watch(() => props.source, render, { immediate: true })

async function applyScroll() {
  await nextTick()
  const id = route.hash ? route.hash.slice(1) : ''
  const el = id ? document.getElementById(id) : null
  if (el) el.scrollIntoView({ block: 'start', behavior: 'auto' })
  else window.scrollTo({ top: 0 })
}

// Контент перерисовался (сменили раздел / пришёл текст) — доводим прокрутку сами:
// глобальный scrollBehavior отрабатывает раньше, чем появляется DOM.
watch(html, applyScroll, { flush: 'post' })
onMounted(applyScroll)

function onClick(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
  const anchor = (e.target as HTMLElement).closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href') || ''
  if (href.startsWith('/')) {
    e.preventDefault()
    router.push(href)
  } else if (href.startsWith('#')) {
    // Ссылка на подсекцию этой же страницы — через роутер, чтобы сработал
    // общий scrollBehavior с отступом под шапку.
    e.preventDefault()
    router.push({ path: route.path, hash: href })
  }
}
</script>

<template>
  <div
    v-if="html"
    class="help-content text-sm leading-6 text-default"
    @click="onClick"
    v-html="html"
  />
  <p v-else class="text-sm text-muted">Раздел пуст.</p>
</template>

<style scoped>
.help-content :deep(h1) {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.25;
  margin: 0 0 0.6em;
  color: var(--ui-text-highlighted);
}
.help-content :deep(h2),
.help-content :deep(h3),
.help-content :deep(h4) {
  font-weight: 600;
  line-height: 1.3;
  color: var(--ui-text-highlighted);
  scroll-margin-top: 5rem;
}
.help-content :deep(h2) { font-size: 1.2rem; margin: 1.6em 0 0.5em; }
.help-content :deep(h3) { font-size: 1.03rem; margin: 1.3em 0 0.4em; }
.help-content :deep(h4) { font-size: 0.95rem; margin: 1.1em 0 0.35em; }
.help-content :deep(p) { margin: 0 0 0.85em; }
.help-content :deep(ul),
.help-content :deep(ol) {
  margin: 0 0 0.85em;
  padding-inline-start: 1.4em;
}
.help-content :deep(li) { margin: 0.25em 0; }
.help-content :deep(li > ul),
.help-content :deep(li > ol) { margin: 0.25em 0; }
.help-content :deep(blockquote) {
  margin: 0 0 0.85em;
  padding: 0.1em 0 0.1em 0.9em;
  border-inline-start: 3px solid var(--ui-border-accented);
  color: var(--ui-text-muted);
}
.help-content :deep(code) {
  font-family: var(--font-mono);
  background: var(--ui-bg-elevated);
  border-radius: 0.25rem;
  padding: 0.1em 0.35em;
  font-size: 0.88em;
}
.help-content :deep(pre) {
  background: var(--ui-bg-elevated);
  border-radius: 0.5rem;
  padding: 0.85em 1em;
  overflow-x: auto;
  margin: 0 0 0.85em;
}
.help-content :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: 0.85em;
}
.help-content :deep(table) {
  border-collapse: collapse;
  margin: 0 0 0.85em;
  display: block;
  overflow-x: auto;
}
.help-content :deep(th),
.help-content :deep(td) {
  border: 1px solid var(--ui-border);
  padding: 0.4em 0.65em;
  text-align: start;
  vertical-align: top;
}
.help-content :deep(th) { background: var(--ui-bg-elevated); font-weight: 600; }
.help-content :deep(hr) {
  border: 0;
  border-top: 1px solid var(--ui-border);
  margin: 1.6em 0;
}
.help-content :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
  cursor: pointer;
}
.help-content :deep(a.help-xlink) {
  text-decoration: none;
  border-bottom: 1px solid color-mix(in oklab, var(--ui-primary) 45%, transparent);
}
.help-content :deep(a.help-xlink:hover) { border-bottom-color: var(--ui-primary); }
.help-content :deep(kbd) {
  font-family: var(--font-mono);
  font-size: 0.8em;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  border-radius: 0.25rem;
  padding: 0.05em 0.4em;
}
</style>
