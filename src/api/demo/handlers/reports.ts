import type { Ctx } from '../demoHttp'
import { db } from '../store'
import { forbidden, toInt } from '../util'

// Месяц не задан → отчёт за весь год (plan_usage.md / reports.md соглашение).
function bounds(ctx: Ctx): { year: number; month: number; from: number; to: number } {
  const year = toInt(ctx.query.get('year') ?? undefined) ?? new Date().getFullYear()
  const month = toInt(ctx.query.get('month') ?? undefined) ?? 0
  const from = month ? Date.UTC(year, month - 1, 1) : Date.UTC(year, 0, 1)
  const to = month ? Date.UTC(year, month, 1) - 1 : Date.UTC(year + 1, 0, 1) - 1
  return { year, month, from, to }
}

export function userTimeReport(ctx: Ctx) {
  const { year, month, from, to } = bounds(ctx)
  const userId = toInt(ctx.query.get('userId') ?? undefined) ?? db.currentUserId
  const user = db.users.find(u => u.id === userId)
  const entries = db.timeEntries.filter(e => e.userId === userId && e.createdAt >= from && e.createdAt <= to)

  const byProjectMap = new Map<number, { seconds: number; count: number }>()
  for (const e of entries) {
    const task = db.tasks.find(t => t.id === e.taskId)
    if (!task) continue
    const acc = byProjectMap.get(task.projectId) ?? { seconds: 0, count: 0 }
    acc.seconds += e.seconds
    acc.count += 1
    byProjectMap.set(task.projectId, acc)
  }
  const byProject = [...byProjectMap.entries()].map(([projectId, acc]) => ({
    projectId, projectName: db.projects.find(p => p.id === projectId)?.name ?? '?',
    totalSeconds: acc.seconds, totalHours: Math.round((acc.seconds / 3600) * 100) / 100, entryCount: acc.count
  }))

  const totalSeconds = entries.reduce((s, e) => s + e.seconds, 0)
  return {
    userId, username: user?.username ?? '?', year, month, from, to,
    totalSeconds, totalHours: Math.round((totalSeconds / 3600) * 100) / 100, entryCount: entries.length, byProject
  }
}

export function projectTimeReport(ctx: Ctx) {
  const { year, month, from, to } = bounds(ctx)
  const projectId = Number(ctx.params.projectId)
  const project = db.projects.find(p => p.id === projectId)
  const isMember = db.members.some(m => m.projectId === projectId && m.userId === db.currentUserId)
  // Отчёт по чужому проекту — 403, страница рисует это как «Отчёт недоступен».
  if (!isMember) forbidden('Вы не участник проекта')

  const projectTaskIds = new Set(db.tasks.filter(t => t.projectId === projectId).map(t => t.id))
  const entries = db.timeEntries.filter(e => projectTaskIds.has(e.taskId) && e.createdAt >= from && e.createdAt <= to)

  const byUserMap = new Map<number, { seconds: number; count: number }>()
  for (const e of entries) {
    const acc = byUserMap.get(e.userId) ?? { seconds: 0, count: 0 }
    acc.seconds += e.seconds
    acc.count += 1
    byUserMap.set(e.userId, acc)
  }
  const byUser = [...byUserMap.entries()].map(([userId, acc]) => {
    const u = db.users.find(x => x.id === userId)
    return { userId, username: u?.username ?? '?', displayName: u?.displayName ?? '?', totalSeconds: acc.seconds, totalHours: Math.round((acc.seconds / 3600) * 100) / 100, entryCount: acc.count }
  })

  const totalSeconds = entries.reduce((s, e) => s + e.seconds, 0)
  return {
    projectId, projectName: project?.name ?? '?', year, month, from, to,
    totalSeconds, totalHours: Math.round((totalSeconds / 3600) * 100) / 100, entryCount: entries.length, byUser
  }
}
