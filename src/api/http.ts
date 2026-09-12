import { useAuthStore } from '@/stores/auth'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

interface HttpOptions extends RequestInit {
  /** Слать ли заголовок Authorization. По умолчанию true. */
  auth?: boolean
}

async function request<T>(path: string, init: HttpOptions = {}): Promise<T> {
  // Единственная точка подмены на демо-транспорт (client_pages.md §3.1) — весь
  // остальной код приложения (src/api/*.ts, сторы, компоненты) о демо не знает.
  // Динамический import — в боевой сборке VITE_DEMO инлайнится в false, ветка
  // и весь модуль demo/* (сид, обработчики) отбрасываются как недостижимые и
  // не попадают в bundle вообще (проверено: без этого демо весило +19 КБ в
  // проде, даже не исполняясь).
  if (import.meta.env.VITE_DEMO === 'true') {
    const { demoHttp } = await import('./demo/demoHttp')
    return demoHttp<T>(path, init)
  }

  const { auth = true, headers, ...rest } = init
  const authStore = useAuthStore()

  const finalHeaders: Record<string, string> = { ...(headers as Record<string, string> | undefined) }
  const isFormData = typeof FormData !== 'undefined' && rest.body instanceof FormData
  if (!isFormData && rest.body !== undefined && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json'
  }
  if (auth && authStore.token) {
    finalHeaders['Authorization'] = `Bearer ${authStore.token}`
  }

  let res: Response
  try {
    res = await fetch(`/api${path}`, { ...rest, headers: finalHeaders })
  } catch {
    throw new ApiError(0, 'Нет связи с сервером')
  }

  if (res.status === 401) {
    authStore.handleUnauthorized()
    throw new ApiError(401, 'Не авторизован')
  }
  if (res.status === 403) {
    throw new ApiError(403, 'Недостаточно прав')
  }

  if (!res.ok) {
    let message = res.statusText || `Ошибка ${res.status}`
    let body: unknown
    try {
      body = await res.clone().json()
      if (body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)) {
        message = String((body as Record<string, unknown>).message)
      }
    } catch {
      try {
        const text = await res.text()
        if (text) message = text
      } catch { /* ignore */ }
    }
    throw new ApiError(res.status, message, body)
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

function jsonBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined
  if (typeof FormData !== 'undefined' && body instanceof FormData) return body
  return JSON.stringify(body)
}

export const http = {
  get: <T>(path: string, init?: HttpOptions) => request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: HttpOptions) =>
    request<T>(path, { ...init, method: 'POST', body: jsonBody(body) }),
  put: <T>(path: string, body?: unknown, init?: HttpOptions) =>
    request<T>(path, { ...init, method: 'PUT', body: jsonBody(body) }),
  patch: <T>(path: string, body?: unknown, init?: HttpOptions) =>
    request<T>(path, { ...init, method: 'PATCH', body: jsonBody(body) }),
  delete: <T>(path: string, init?: HttpOptions) => request<T>(path, { ...init, method: 'DELETE' })
}

/**
 * Загрузка файла с прогрессом отправки — обычный fetch его не отдаёт, нужен
 * XMLHttpRequest (wiki_files_client.md §2). В демо-режиме прогресс не нужен
 * (файлы там не хранятся) — уходит через тот же demoHttp, что и остальные
 * ручки, и обработчик сам вернёт понятную ошибку "недоступно в демо".
 */
export function httpUpload<T>(
  path: string, form: FormData, onProgress?: (pct: number) => void
): Promise<T> {
  if (import.meta.env.VITE_DEMO === 'true') {
    return request<T>(path, { method: 'POST', body: form })
  }

  const authStore = useAuthStore()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api${path}`)
    if (authStore.token) xhr.setRequestHeader('Authorization', `Bearer ${authStore.token}`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100)
    }
    xhr.onload = () => {
      if (xhr.status === 401) {
        authStore.handleUnauthorized()
        reject(new ApiError(401, 'Не авторизован'))
        return
      }
      if (xhr.status >= 400) {
        let message = xhr.statusText || `Ошибка ${xhr.status}`
        let body: unknown
        try {
          body = JSON.parse(xhr.responseText)
          if (body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)) {
            message = String((body as Record<string, unknown>).message)
          }
        } catch { /* тело не JSON — оставляем statusText */ }
        reject(new ApiError(xhr.status, message, body))
        return
      }
      try {
        resolve(xhr.responseText ? JSON.parse(xhr.responseText) as T : (undefined as T))
      } catch {
        resolve(undefined as T)
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Нет связи с сервером'))
    xhr.send(form)
  })
}
