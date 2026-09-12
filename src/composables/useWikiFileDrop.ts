import { reactive, ref, type Ref } from 'vue'
import { uploadWikiFile } from '@/api/wikiFiles'
import { ApiError } from '@/api/http'
import type { WikiFileResponse } from '@/types/domain'

export interface UploadingEntry { name: string; pct: number }

function referenceMarkdown(file: WikiFileResponse): string {
  return file.isImage ? `![${file.originalName}](${file.url})` : `[${file.originalName}](${file.url})`
}

/**
 * Три равноправных способа положить файл в редактор вики (wiki_files_client.md
 * §3): перетаскивание, вставка скриншота из буфера, кнопка «Вставить» в
 * панели вложений. Требует уже сохранённой страницы — вложение привязано к
 * pageId, у новой, ещё не сохранённой страницы его нет.
 */
export function useWikiFileDrop(
  pageId: { readonly value: number | undefined },
  textarea: Ref<HTMLTextAreaElement | undefined>,
  content: Ref<string>,
  onUploaded?: (file: WikiFileResponse) => void
) {
  const uploading = ref<UploadingEntry[]>([])
  const toast = useToast()

  function insertAtCursor(text: string) {
    const el = textarea.value
    if (!el) {
      content.value += text
      return
    }
    const start = el.selectionStart ?? content.value.length
    const end = el.selectionEnd ?? content.value.length
    content.value = content.value.slice(0, start) + text + content.value.slice(end)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + text.length
    })
  }

  function insertReference(file: WikiFileResponse) {
    insertAtCursor(referenceMarkdown(file))
  }

  async function insert(file: File) {
    if (!pageId.value) {
      toast.add({
        title: 'Сначала сохраните страницу',
        description: 'Прикреплять файлы можно после первого сохранения.',
        color: 'warning'
      })
      return
    }

    // Плейсхолдер сразу на месте курсора — видно, куда попадёт файл, ещё до
    // окончания загрузки. Заменяется по подстроке, а не по индексу: индекс
    // сместится, если текст успеют поправить, пока файл грузится.
    const placeholder = `![загрузка ${file.name}…]()`
    insertAtCursor(placeholder)

    const entry = reactive({ name: file.name, pct: 0 })
    uploading.value.push(entry)

    try {
      const saved = await uploadWikiFile(pageId.value, file, (pct) => { entry.pct = pct })
      content.value = content.value.replace(placeholder, referenceMarkdown(saved))
      onUploaded?.(saved)
    } catch (e) {
      content.value = content.value.replace(placeholder, '')
      toast.add({
        title: 'Не удалось загрузить файл',
        description: e instanceof ApiError ? e.message : undefined,
        color: 'error'
      })
    } finally {
      uploading.value = uploading.value.filter(u => u !== entry)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    for (const f of Array.from(e.dataTransfer?.files ?? [])) insert(f)
  }

  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter(i => i.kind === 'file')
      .map(i => i.getAsFile())
      .filter((f): f is File => !!f)
    if (!files.length) return // обычный текст — не мешаем стандартной вставке
    e.preventDefault()
    files.forEach(insert)
  }

  return { onDrop, onPaste, uploading, insert, insertReference }
}
