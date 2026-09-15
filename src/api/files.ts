import { API_ORIGIN, http } from './http'
import { useAuthStore } from '@/stores/auth'
import type { FileResponse } from '@/types/domain'

export function listTaskFiles(taskId: number) {
  return http.get<FileResponse[]>(`/files/tasks/${taskId}`)
}

export function uploadTaskFile(projectId: number, taskId: number, file: File) {
  const form = new FormData()
  form.append('file', file)
  return http.post<FileResponse>(`/files/projects/${projectId}/tasks/${taskId}`, form)
}

export function deleteFile(fileId: number) {
  return http.delete<void>(`/files/${fileId}`)
}

// Путь отдачи файла задачи — им помечены <img src>/<a href> для
// useAuthorizedImages и MarkdownView.vue (ссылка на файл из Описания/Резюме,
// как [[Заголовок]]/картинки в вики: обычный markdown, без своей схемы).
export const TASK_FILE_PREFIX = '/api/files/download/'

export function taskFileReferenceUrl(fileName: string): string {
  return `${TASK_FILE_PREFIX}${encodeURIComponent(fileName)}`
}

// Готовый markdown для вставки в Описание/Резюме — по кнопке «Скопировать
// ссылку» у файла в TaskDetailView.vue. Картинка — превью прямо в тексте,
// иначе просто ссылка с именем файла.
export function taskFileReferenceMarkdown(file: FileResponse, isImage: boolean): string {
  const url = taskFileReferenceUrl(file.fileName)
  return isImage ? `![${file.fileOriginalName}](${url})` : `[${file.fileOriginalName}](${url})`
}

/**
 * Скачивание и просмотр требуют заголовок Authorization — обычная ссылка
 * <a href> или <img src> его не пришлёт, поэтому файл забирается через fetch и
 * оборачивается в object-URL. Вызывающий обязан вызвать URL.revokeObjectURL,
 * когда URL больше не нужен.
 */
function fetchFile(fileName: string): Promise<Response> {
  const auth = useAuthStore()
  return fetch(`${API_ORIGIN}${taskFileReferenceUrl(fileName)}`, {
    headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {}
  })
}

export async function fetchFileObjectUrl(fileName: string): Promise<string> {
  const res = await fetchFile(fileName)
  if (!res.ok) throw new Error('Не удалось загрузить файл')
  return URL.createObjectURL(await res.blob())
}

// Для useAuthorizedImages в MarkdownView.vue — тот же fetch, но по готовому
// src из отрендеренного <img> (TASK_FILE_PREFIX + закодированное имя), не по
// голому имени файла.
export function fetchFileBlobByHref(href: string): Promise<string> {
  return fetchFileObjectUrl(decodeURIComponent(href.slice(TASK_FILE_PREFIX.length)))
}

export async function fetchFileText(fileName: string): Promise<string> {
  const res = await fetchFile(fileName)
  if (!res.ok) throw new Error('Не удалось загрузить файл')
  return res.text()
}

export async function downloadFile(fileName: string, saveAsName: string) {
  const url = await fetchFileObjectUrl(fileName)
  const link = document.createElement('a')
  link.href = url
  link.download = saveAsName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
