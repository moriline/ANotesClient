// Построчный diff двух текстов через LCS. Хватает для истории вики-страниц
// (страница весит килобайты); отдельная библиотека (jsdiff из wiki.md §7.4) не
// тянется. При очень больших текстах отдаём грубый результат «всё заменено».

export type DiffLineType = 'ctx' | 'add' | 'del'

export interface DiffLine {
  type: DiffLineType
  text: string
}

const MAX_LINES = 4000

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = (before ?? '').split('\n')
  const b = (after ?? '').split('\n')

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      ...a.map((text): DiffLine => ({ type: 'del', text })),
      ...b.map((text): DiffLine => ({ type: 'add', text }))
    ]
  }

  const n = a.length
  const m = b.length
  // dp[i][j] — длина LCS суффиксов a[i:] и b[j:].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'ctx', text: a[i]! })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ type: 'del', text: a[i]! })
      i++
    } else {
      out.push({ type: 'add', text: b[j]! })
      j++
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++]! })
  while (j < m) out.push({ type: 'add', text: b[j++]! })
  return out
}

export function diffStat(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.type === 'add') added++
    else if (l.type === 'del') removed++
  }
  return { added, removed }
}
