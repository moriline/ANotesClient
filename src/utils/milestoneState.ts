import { plural } from '@/utils/format'
import type { MilestoneState } from '@/types/domain'

// Оформление состояний вехи (plan.md §3). color — значение для :color у UBadge /
// UProgress; text — семантический класс цвета для ромба и акцентов (тема одна,
// см. CLAUDE.md: только семантические классы, не bg-violet-500).
export const MILESTONE_STATE_META: Record<MilestoneState, {
  label: string
  color: 'primary' | 'secondary' | 'warning' | 'error' | 'neutral'
  text: string
  dim: boolean
}> = {
  PLANNED:     { label: 'Запланирована',     color: 'neutral',   text: 'text-dimmed',    dim: false },
  IN_PROGRESS: { label: 'В работе',          color: 'secondary', text: 'text-secondary', dim: false },
  READY:       { label: 'Готова к закрытию', color: 'primary',   text: 'text-primary',   dim: false },
  AT_RISK:     { label: 'Под риском',        color: 'warning',   text: 'text-warning',   dim: false },
  LATE:        { label: 'Просрочена',        color: 'error',     text: 'text-error',     dim: false },
  CLOSED:      { label: 'Закрыта',           color: 'neutral',   text: 'text-muted',     dim: true }
}

// Порядок в легенде / выпадающих подсказках.
export const MILESTONE_STATE_ORDER: MilestoneState[] =
  ['PLANNED', 'IN_PROGRESS', 'AT_RISK', 'LATE', 'READY', 'CLOSED']

const DAY = 86_400_000

// Целых дней от сегодняшней полуночи до срока. Отрицательное — просрочка.
export function daysUntil(dueMs: number | null | undefined): number {
  if (!dueMs) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((dueMs - today.getTime()) / DAY)
}

// «осталось 12 дней» / «просрочена на 3 дня» / «срок сегодня». Для закрытой — ''.
export function dueLabel(dueMs: number | null | undefined, closed = false): string {
  if (closed || !dueMs) return ''
  const d = daysUntil(dueMs)
  if (d === 0) return 'срок сегодня'
  if (d > 0) return `осталось ${d} ${plural(d, ['день', 'дня', 'дней'])}`
  return `просрочена на ${-d} ${plural(-d, ['день', 'дня', 'дней'])}`
}

export function milestonePercent(m: { taskTotal: number; taskDone: number }): number {
  return m.taskTotal === 0 ? 0 : Math.round((m.taskDone / m.taskTotal) * 100)
}
