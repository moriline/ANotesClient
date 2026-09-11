import { ApiError } from '../http'

// Утилиты демо-транспорта (client_pages.md §3). Ничего доменного здесь нет —
// только генерика, которую переиспользуют все handlers/*.

/** 120–300 мс на GET, чуть больше на запись — без задержки скелетоны загрузки
 * не успевают показаться и демо выглядит подозрительно быстрым (§3.5). */
export function delay(min = 120, max = 300): Promise<void> {
  const ms = min + Math.random() * (max - min)
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function notFound(what = 'Не найдено'): never {
  throw new ApiError(404, what)
}

export function badRequest(message: string): never {
  throw new ApiError(400, message)
}

export function forbidden(message = 'Недостаточно прав'): never {
  throw new ApiError(403, message)
}

export function conflict(message = 'Запись изменена параллельно'): never {
  throw new ApiError(409, message)
}

let seq = 10_000
/** Общий счётчик id для новых сущностей демо — по одному пулу на всё, реальным
 * API так делать незачем, а тут это просто гарантирует уникальность без учёта
 * коллекции. */
export function nextId(): number {
  return seq++
}

export function nowMs(): number {
  return Date.now()
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Заголовок X-Expected-Version, если он был передан (case-insensitive, как у
 * настоящего fetch). */
export function expectedVersion(headers: Record<string, string> | undefined): number | undefined {
  if (!headers) return undefined
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'x-expected-version') {
      const n = Number(headers[key])
      return Number.isFinite(n) ? n : undefined
    }
  }
  return undefined
}

/** Простое сопоставление пути с шаблоном вида /projects/:id/tasks/:taskId —
 * без регулярок, посегментно (client_pages.md §3.3). */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const pSegs = pattern.split('/').filter(Boolean)
  const uSegs = path.split('/').filter(Boolean)
  if (pSegs.length !== uSegs.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pSegs.length; i++) {
    const p = pSegs[i]!
    const u = decodeURIComponent(uSegs[i]!)
    if (p.startsWith(':')) params[p.slice(1)] = u
    else if (p !== u) return null
  }
  return params
}

export function toInt(s: string | undefined): number | undefined {
  if (s === undefined) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}
