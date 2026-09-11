import type { Ctx } from '../demoHttp'
import { db } from '../store'
import { toMilestoneResponse, toTaskResponse } from '../derive'
import { badRequest, conflict, expectedVersion, nextId, notFound, nowMs } from '../util'
import type { DbMilestone } from '../seed'

export function listMilestones(ctx: Ctx) {
  const projectId = Number(ctx.params.projectId)
  const state = ctx.query.get('state') ?? 'all'
  let list = db.milestones.filter(m => m.projectId === projectId)
  if (state === 'open') list = list.filter(m => !m.closed)
  if (state === 'closed') list = list.filter(m => m.closed)
  return list.map(m => toMilestoneResponse(db, m)).sort((a, b) => a.dueDate - b.dueDate)
}

export function createMilestone(ctx: Ctx) {
  const projectId = Number(ctx.params.projectId)
  const body = ctx.body ?? {}
  if (!body.title) badRequest('Название обязательно')
  if (!body.dueDate) badRequest('Срок обязателен')
  if (db.milestones.some(m => m.projectId === projectId && m.title === body.title)) conflict('Веха с таким названием уже есть')
  const now = nowMs()
  const m: DbMilestone = {
    id: nextId(), projectId, title: body.title, description: body.description ?? null, dueDate: body.dueDate,
    closed: false, closedAt: null, closedByName: null, createdAt: now, updatedAt: now, version: 1
  }
  db.milestones.push(m)
  return undefined
}

export function getMilestone(ctx: Ctx) {
  const m = db.milestones.find(x => x.id === Number(ctx.params.id))
  if (!m) notFound('Веха не найдена')
  return toMilestoneResponse(db, m)
}

export function updateMilestone(ctx: Ctx) {
  const m = db.milestones.find(x => x.id === Number(ctx.params.id))
  if (!m) notFound('Веха не найдена')
  const expected = expectedVersion(ctx.headers)
  if (expected != null && expected !== m.version) conflict('Веху успели изменить')
  const body = ctx.body ?? {}
  if (body.title !== undefined) m.title = body.title
  if (body.description !== undefined) m.description = body.description
  if (body.dueDate !== undefined) m.dueDate = body.dueDate
  m.version += 1
  m.updatedAt = nowMs()
  return toMilestoneResponse(db, m)
}

export function deleteMilestone(ctx: Ctx) {
  const id = Number(ctx.params.id)
  const m = db.milestones.find(x => x.id === id)
  if (!m) notFound('Веха не найдена')
  const linked = db.tasks.filter(t => t.milestoneId === id)
  const mode = ctx.query.get('tasks')
  if (linked.length > 0 && !mode) conflict(`В вехе ${linked.length} задач — уточните действие`)
  if (mode === 'detach') linked.forEach(t => { t.milestoneId = null })
  if (mode === 'move') {
    const to = Number(ctx.query.get('to'))
    const target = db.milestones.find(x => x.id === to && x.projectId === m.projectId && !x.closed)
    if (!target) badRequest('Целевая веха не найдена или закрыта')
    linked.forEach(t => { t.milestoneId = to })
  }
  db.milestones = db.milestones.filter(x => x.id !== id)
  return undefined
}

export function closeMilestone(ctx: Ctx) {
  const m = db.milestones.find(x => x.id === Number(ctx.params.id))
  if (!m) notFound('Веха не найдена')
  if (m.closed) badRequest('Веха уже закрыта')
  m.closed = true
  m.closedAt = nowMs()
  m.closedByName = db.users.find(u => u.id === db.currentUserId)?.displayName ?? null
  m.updatedAt = nowMs()
  return toMilestoneResponse(db, m)
}

export function reopenMilestone(ctx: Ctx) {
  const m = db.milestones.find(x => x.id === Number(ctx.params.id))
  if (!m) notFound('Веха не найдена')
  if (!m.closed) badRequest('Веха уже открыта')
  m.closed = false
  m.closedAt = null
  m.closedByName = null
  m.updatedAt = nowMs()
  return toMilestoneResponse(db, m)
}

export function milestoneTasks(ctx: Ctx) {
  const id = Number(ctx.params.id)
  return db.tasks.filter(t => t.milestoneId === id && t.taskType === 'TASK').map(t => toTaskResponse(db, t))
}

export function setTaskMilestone(ctx: Ctx) {
  const t = db.tasks.find(x => x.id === Number(ctx.params.taskId))
  if (!t) notFound('Задача не найдена')
  const milestoneId = ctx.body?.milestoneId ?? null
  if (t.taskType === 'EPIC') badRequest('Эпик к вехе привязать нельзя')
  if (milestoneId != null) {
    const m = db.milestones.find(x => x.id === milestoneId)
    if (!m || m.projectId !== t.projectId) badRequest('Веха не найдена в этом проекте')
    // Проверено на живом сервере (2026-09-10): именно этот текст.
    if (m.closed) badRequest('Нельзя добавлять задачи в закрытую веху')
  }
  t.milestoneId = milestoneId
  t.version += 1
  t.updatedAt = nowMs()

  const res = toTaskResponse(db, t) as ReturnType<typeof toTaskResponse> & { milestoneReady?: boolean }
  if (milestoneId != null) {
    const siblings = db.tasks.filter(x => x.milestoneId === milestoneId)
    const allDone = siblings.length > 0 && siblings.every(s => db.statuses.find(st => st.id === s.statusId)?.isClosed)
    if (allDone) res.milestoneReady = true
  }
  return res
}
