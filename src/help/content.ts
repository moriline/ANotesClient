// Markdown-контент справки. Импортируется только из HelpView, поэтому весь текст
// разделов попадает в ленивый чанк /help, а не в общий бандл. Метаданные
// (заголовки, подсказки, группы) — в ./topics.ts.

const sources = import.meta.glob('./content/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

export function helpSource(topic: string): string | null {
  return sources[`./content/${topic}.md`] ?? null
}
