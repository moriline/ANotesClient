import { http, httpUpload } from './http'
import { useAuthStore } from '@/stores/auth'
import type { WikiFileResponse } from '@/types/domain'

export function listWikiFiles(pageId: number) {
  return http.get<WikiFileResponse[]>(`/wiki/${pageId}/files`)
}

export function uploadWikiFile(pageId: number, file: File, onProgress?: (pct: number) => void) {
  const form = new FormData()
  form.append('file', file)
  return httpUpload<WikiFileResponse>(`/wiki/${pageId}/files`, form, onProgress)
}

// force=true — удалить, даже если файл ещё упомянут в тексте страницы
// (обычный запрос в этом случае получает 409).
export function deleteWikiFile(id: number, force = false) {
  return http.delete<void>(`/wiki/files/${id}${force ? '?force=true' : ''}`)
}

/**
 * GET /api/wiki/files/{storedName} требует Authorization — обычный <img src>
 * его не пришлёт (см. openapi5.yaml: у ручки bearerAuth, как у скачивания
 * файлов задачи в files.ts). Поэтому картинки в тексте страницы вставляются
 * обычной markdown-ссылкой на этот путь, а рендерер (useAuthorizedImages)
 * донагружает их авторизованным fetch и подменяет src на blob-URL.
 */
export async function fetchWikiFileBlob(url: string): Promise<string> {
  const auth = useAuthStore()
  const res = await fetch(url, {
    headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {}
  })
  if (!res.ok) throw new Error('Не удалось загрузить файл')
  return URL.createObjectURL(await res.blob())
}

// Та же авторизация нужна и для скачивания — обычная <a href> ссылка на
// f.url не пришлёт Authorization, поэтому файл забирается тем же fetch и
// «нажимается» синтетической ссылкой с download-атрибутом.
export async function downloadWikiFile(file: WikiFileResponse): Promise<void> {
  const blobUrl = await fetchWikiFileBlob(file.url)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = file.originalName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(blobUrl)
}
