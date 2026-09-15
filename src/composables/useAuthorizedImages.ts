import { onUnmounted, type Ref } from 'vue'

/**
 * <img src="{prefix}…"> из markdown-текста отрисуется сломанным — ручка
 * отдачи файла требует Authorization, а браузер не шлёт его к <img>
 * (wiki_files_client.md §4, вариант А: сервер не даёт cookie-сессию для
 * файлов, значит подмена на blob — единственный рабочий путь при текущем
 * контракте). Общий для вики (WikiMarkdown.vue, префикс /api/wiki/files/) и
 * файлов задачи (MarkdownView.vue, префикс /api/files/download/) — отличаются
 * только префикс и способ авторизованно забрать файл по src.
 * Вызывать resolveAll() после каждого обновления HTML — сам container не
 * меняется, меняется только его innerHTML, поэтому автослежение за самим
 * container ничего не поймает.
 */
export function useAuthorizedImages(
  container: Ref<HTMLElement | undefined | null>,
  prefix: string,
  resolve: (src: string) => Promise<string>
) {
  const cache = new Map<string, string>()

  function brokenPlaceholder(alt: string): HTMLElement {
    const span = document.createElement('span')
    span.style.cssText = 'display:inline-flex;align-items:center;gap:.4em;padding:.3em .6em;'
      + 'border:1px dashed var(--ui-border-accented);border-radius:.375rem;'
      + 'color:var(--ui-text-muted);font-size:.85em;'
    span.textContent = `Изображение недоступно: ${alt || 'файл'}`
    return span
  }

  async function resolveAll() {
    const imgs = container.value?.querySelectorAll<HTMLImageElement>(
      `img[src^="${prefix}"]`
    )
    if (!imgs?.length) return

    for (const img of Array.from(imgs)) {
      const src = img.getAttribute('src')!
      const cached = cache.get(src)
      if (cached) {
        img.src = cached
        continue
      }
      try {
        const blobUrl = await resolve(src)
        cache.set(src, blobUrl)
        // Картинку могли убрать из DOM, пока грузился fetch (сменили страницу).
        if (img.isConnected) img.src = blobUrl
      } catch {
        img.replaceWith(brokenPlaceholder(img.alt))
      }
    }
  }

  onUnmounted(() => {
    cache.forEach(url => URL.revokeObjectURL(url))
    cache.clear()
  })

  return { resolveAll }
}
