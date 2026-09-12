import { onUnmounted, type Ref } from 'vue'
import { fetchWikiFileBlob } from '@/api/wikiFiles'

const WIKI_FILE_PREFIX = '/api/wiki/files/'

/**
 * <img src="/api/wiki/files/…"> из content вики отрисуется сломанным —
 * ручка отдачи файла требует Authorization, а браузер не шлёт его к <img>
 * (wiki_files_client.md §4, вариант А: сервер не даёт cookie-сессию для
 * файлов, значит подмена на blob — единственный рабочий путь при текущем
 * контракте). Вызывать resolveAll() после каждого обновления HTML — сам
 * container не меняется, меняется только его innerHTML, поэтому автослежение
 * за самим container ничего не поймает.
 */
export function useAuthorizedImages(container: Ref<HTMLElement | undefined | null>) {
  const cache = new Map<string, string>()

  function brokenPlaceholder(alt: string): HTMLElement {
    const span = document.createElement('span')
    span.className = 'wiki-broken-image'
    span.textContent = `Изображение недоступно: ${alt || 'файл'}`
    return span
  }

  async function resolveAll() {
    const imgs = container.value?.querySelectorAll<HTMLImageElement>(
      `img[src^="${WIKI_FILE_PREFIX}"]`
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
        const blobUrl = await fetchWikiFileBlob(src)
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
