export function toDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  return typeof value === 'number' ? new Date(value) : new Date(value)
}

export function formatDate(value: string | number | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function formatDateTime(value: string | number | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatRelativeTime(value: string | number | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 60) return 'только что'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} мин назад`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `${diffHour} ч назад`
  const diffDay = Math.round(diffHour / 24)
  if (diffDay < 7) return `${diffDay} дн назад`
  return formatDate(value)
}

function startOfToday(): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.getTime()
}

export function isOverdue(dueDate: number | null | undefined): boolean {
  if (!dueDate) return false
  return dueDate < startOfToday()
}

export function isDueToday(dueDate: number | null | undefined): boolean {
  if (!dueDate) return false
  const due = new Date(dueDate)
  const now = new Date()
  return due.toDateString() === now.toDateString()
}

// Тикающий дисплей таймера — HH:MM:SS (или MM:SS, если меньше часа), в отличие
// от formatDuration, который округляет до минут для итоговых сумм.
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds) return '0м'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.round((totalSeconds % 3600) / 60)
  if (hours === 0) return `${minutes}м`
  if (minutes === 0) return `${hours}ч`
  return `${hours}ч ${minutes}м`
}

// Русское склонение по числу: plural(1, ['задача','задачи','задач']) → 'задача'.
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0] + parts[1]![0]).toUpperCase()
}

const TAG_PALETTE = ['#3E8A61', '#628C2F', '#B45309', '#B91C1C', '#1D4ED8', '#7E22CE', '#0E7490', '#4D5B4A']

export function tagColor(tag: string): string {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_PALETTE[hash % TAG_PALETTE.length]!
}
