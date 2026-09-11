// Нормализованная строка разбивки для TimeReportBreakdown — общая форма для
// отчётов по пользователю (byProject), по проекту (byUser) и по задаче
// (агрегат списаний по авторам, считается на клиенте).
export interface BreakdownRow {
  key: number
  label: string
  sublabel?: string
  totalSeconds: number
  entryCount: number
}
