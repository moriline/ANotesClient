import { computed, type Ref } from 'vue'

// Геометрия временной шкалы дорожной карты (roadmap.md §4.2). Вся раскладка сводится
// к одной функции «дата → позиция в процентах»; проценты, а не пиксели, чтобы
// шкала перестраивалась при ресайзе окна без пересчёта в JS.

export type ScaleMode = 'week' | 'month' | 'quarter'

export interface Tick {
  key: string
  label: string
  /** Позиция деления, % от левого края шкалы. */
  pos: number
  /** Начало месяца/квартала/года — рисуем чуть заметнее. */
  major: boolean
}

const DAY = 86_400_000
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

// Масштаб по умолчанию — по фактическому диапазону данных (roadmap.md §4.5),
// а не фиксированный.
export function autoScale(from: Date, to: Date): ScaleMode {
  const days = (to.getTime() - from.getTime()) / DAY
  if (days <= 100) return 'week'
  if (days <= 560) return 'month'
  return 'quarter'
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function firstMondayFrom(d: Date): Date {
  const x = startOfDay(d)
  const dow = (x.getDay() + 6) % 7 // 0 = понедельник
  if (dow !== 0) x.setDate(x.getDate() + (7 - dow))
  return x
}

function firstOfMonthFrom(d: Date): Date {
  let x = new Date(d.getFullYear(), d.getMonth(), 1)
  if (x.getTime() < startOfDay(d).getTime()) x = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return x
}

function quarterStartFrom(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3)
  let x = new Date(d.getFullYear(), q * 3, 1)
  if (x.getTime() < startOfDay(d).getTime()) x = new Date(d.getFullYear(), (q + 1) * 3, 1)
  return x
}

const yy = (d: Date) => String(d.getFullYear() % 100).padStart(2, '0')

export function useTimeScale(from: Ref<Date>, to: Ref<Date>, mode: Ref<ScaleMode>) {
  const fromMs = computed(() => from.value.getTime())
  const spanMs = computed(() => Math.max(to.value.getTime() - fromMs.value, DAY))

  const posOf = (d: Date | number | string): number => {
    const t = d instanceof Date ? d.getTime() : new Date(d).getTime()
    return ((t - fromMs.value) / spanMs.value) * 100
  }

  // Внешний прямоугольник полосы — срок эпика. Math.max(..., 1.4) — минимальная
  // ширина: эпик на один день при годовом масштабе иначе выродится в невидимую
  // линию (roadmap.md §4.2).
  const barStyle = (start: Date | number | string, due: Date | number | string) => {
    const left = Math.max(0, Math.min(100, posOf(start)))
    const right = Math.max(0, Math.min(100, posOf(due)))
    const width = Math.min(Math.max(right - left, 1.4), 100 - left)
    return { left: `${left}%`, width: `${width}%` }
  }

  const ticks = computed<Tick[]>(() => {
    const out: Tick[] = []
    const end = to.value.getTime()

    if (mode.value === 'week') {
      for (let d = firstMondayFrom(from.value); d.getTime() <= end; d = new Date(d.getTime() + 7 * DAY)) {
        const first = d.getDate() <= 7
        out.push({
          key: `w${d.getTime()}`,
          label: first ? `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` : String(d.getDate()),
          pos: posOf(d),
          major: first
        })
      }
    } else if (mode.value === 'month') {
      for (let d = firstOfMonthFrom(from.value); d.getTime() <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        const jan = d.getMonth() === 0
        out.push({
          key: `m${d.getTime()}`,
          label: jan || out.length === 0 ? `${MONTHS_SHORT[d.getMonth()]} ${yy(d)}` : MONTHS_SHORT[d.getMonth()]!,
          pos: posOf(d),
          major: jan
        })
      }
    } else {
      for (let d = quarterStartFrom(from.value); d.getTime() <= end; d = new Date(d.getFullYear(), d.getMonth() + 3, 1)) {
        out.push({
          key: `q${d.getTime()}`,
          label: `Q${Math.floor(d.getMonth() / 3) + 1} ${yy(d)}`,
          pos: posOf(d),
          major: d.getMonth() === 0
        })
      }
    }

    return out.filter(t => t.pos >= -0.5 && t.pos <= 100.5)
  })

  return { posOf, barStyle, ticks }
}
