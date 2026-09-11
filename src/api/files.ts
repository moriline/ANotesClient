import { http } from './http'
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

/**
 * Скачивание и просмотр требуют заголовок Authorization — обычная ссылка
 * <a href> или <img src> его не пришлёт, поэтому файл забирается через fetch и
 * оборачивается в object-URL. Вызывающий обязан вызвать URL.revokeObjectURL,
 * когда URL больше не нужен.
 */
function fetchFile(fileName: string): Promise<Response> {
  const auth = useAuthStore()
  return fetch(`/api/files/download/${encodeURIComponent(fileName)}`, {
    headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {}
  })
}

export async function fetchFileObjectUrl(fileName: string): Promise<string> {
  const res = await fetchFile(fileName)
  if (!res.ok) throw new Error('Не удалось загрузить файл')
  return URL.createObjectURL(await res.blob())
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
