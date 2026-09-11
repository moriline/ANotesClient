import type { Ctx } from '../demoHttp'
import { db } from '../store'
import { toTaskResponse, isStatusClosed, childrenOf } from '../derive'
import { badRequest, conflict, expectedVersion, nextId, notFound, nowMs, toInt } from '../util'
import type { DbTask } from '../seed'

// --- Поиск / список --------------------------------------------------------

export function findTasks(ctx: Ctx) {
  const q = ctx.body ?? {}
  let list = db.tasks.slice()

  if (q.projectId != null) list = list.filter(t => t.projectId === q.projectId)
  if (q.taskType) list = list.filter(t => t.taskType === q.taskType)
  if (q.parentId != null) list = list.filter(t => t.parentId === q.parentId)
  if (q.milestoneId != null) list = list.filter(t => t.milestoneId === q.milestoneId)
  if (q.noMilestone) list = list.filter(t => t.milestoneId == null && t.taskType === 'TASK')
  if (q.assignedUserId != null) list = list.filter(t => t.assignedUserId === q.assignedUserId)
  if (q.assignedToMe) list = list.filter(t => t.assignedUserId === db.currentUserId)
  if (q.statusId != null) list = list.filter(t => t.statusId === q.statusId)
  if (q.isArchived != null) list = list.filter(t => t.isArchived === q.isArchived)
  else list = list.filter(t => !t.isArchived)
  // titleSearch — с учётом регистра, только заголовок (openapi5.yaml). contentSearch —
  // без учёта регистра, заголовок и описание.
  if (q.titleSearch) list = list.filter(t => t.title.includes(q.titleSearch))
  if (q.contentSearch) {
    const needle = String(q.contentSearch).toLowerCase()
    list = list.filter(t => t.title.toLowerCase().includes(needle) || (t.description ?? '').toLowerCase().includes(needle))
  }

  const sortBy = q.sortBy ?? 'updatedAt'
  const dir = q.sortDir === 'asc' ? 1 : -1
  list.sort((a, b) => {
    const av = (a as any)[sortBy]
    const bv = (b as any)[sortBy]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return av > bv ? dir : av < bv ? -dir : 0
  })

  const total = list.length
  const limit = q.limit ?? 25
  const offset = q.offset ?? 0
  const page = list.slice(offset, offset + limit)
  return { tasks: page.map(t => toTaskResponse(db, t)), total, limit, offset }
}

export function listProjectTasks(ctx: Ctx) {
  const projectId = Number(ctx.params.projectId)
  return db.tasks.filter(t => t.projectId === projectId && !t.isArchived).map(t => toTaskResponse(db, t))
}

export function getTask(ctx: Ctx) {
  const t = db.tasks.find(x => x.id === Number(ctx.params.taskId) && x.projectId === Number(ctx.params.projectId))
  if (!t) notFound('Задача не найдена')
  return toTaskResponse(db, t)
}

export function createTask(ctx: Ctx) {
  const projectId = Number(ctx.params.projectId)
  const body = ctx.body ?? {}
  if (!body.title) badRequest('Название обязательно')
  const taskType = body.taskType ?? 'TASK'
  const defaultStatus = db.statuses.find(s => s.projectId === projectId && s.isDefault)
  const now = nowMs()
  const task: DbTask = {
    id: nextId(), projectId, title: body.title, description: body.description ?? null, summary: null,
    creatorUserId: db.currentUserId, assignedUserId: null,
    statusId: taskType === 'EPIC' ? null : (defaultStatus?.id ?? null),
    dueDate: null, startDate: null, estimatedHours: null, tags: body.tags ?? [], isArchived: false,
    createdAt: now, updatedAt: now, version: 1, taskType,
    parentId: body.parentId ?? null, milestoneId: body.milestoneId ?? null
  }
  db.tasks.push(task)
  return undefined
}

export function patchTask(ctx: Ctx) {
  const t = db.tasks.find(x => x.id === Number(ctx.params.taskId) && x.projectId === Number(ctx.params.projectId))
  if (!t) notFound('Задача не найдена')
  const expected = expectedVersion(ctx.headers)
  if (expected != null && expected !== t.version) conflict('Задачу успели изменить')

  const before = { statusId: t.statusId, assignedUserId: t.assignedUserId }
  const body = ctx.body ?? {}
  if (body.title !== undefined) t.title = body.title
  if (body.description !== undefined) t.description = body.description
  if (body.tags !== undefined) t.tags = body.tags
  if (body.assignedUserId !== undefined) t.assignedUserId = body.assignedUserId
  if (body.statusId !== undefined) t.statusId = body.statusId
  if (body.dueDate !== undefined) t.dueDate = body.dueDate
  if (body.startDate !== undefined) t.startDate = body.startDate
  if (body.estimatedHours !== undefined) t.estimatedHours = body.estimatedHours
  if (body.isArchived !== undefined) t.isArchived = body.isArchived
  t.version += 1
  t.updatedAt = nowMs()

  if (body.statusId !== undefined && body.statusId !== before.statusId) {
    logActivity(t, 'STATUS_CHANGED', {})
  }
  if (body.assignedUserId !== undefined && body.assignedUserId !== before.assignedUserId && body.assignedUserId != null) {
    logActivity(t, 'ASSIGNED', {})
  }

  const res = toTaskResponse(db, t)
  if (t.milestoneId != null && isStatusClosed(db, t.statusId)) {
    const siblings = db.tasks.filter(x => x.milestoneId === t.milestoneId)
    if (siblings.every(s => isStatusClosed(db, s.statusId))) (res as any).milestoneReady = true
  }
  return res
}

export function deleteTask(ctx: Ctx) {
  const id = Number(ctx.params.taskId)
  const t = db.tasks.find(x => x.id === id && x.projectId === Number(ctx.params.projectId))
  if (!t) notFound('Задача не найдена')
  const children = t.taskType === 'EPIC' ? childrenOf(db, id) : []
  const mode = ctx.query.get('children')
  if (children.length > 0 && !mode) conflict(`В эпике ${children.length} задач — уточните действие`)
  if (mode === 'detach') children.forEach(c => { c.parentId = null })
  if (mode === 'delete') db.tasks = db.tasks.filter(x => x.parentId !== id)
  db.tasks = db.tasks.filter(x => x.id !== id)
  db.comments = db.comments.filter(c => c.taskId !== id)
  db.timeEntries = db.timeEntries.filter(e => e.taskId !== id)
  return undefined
}

export function setTaskParent(ctx: Ctx) {
  const t = db.tasks.find(x => x.id === Number(ctx.params.taskId))
  if (!t) notFound('Задача не найдена')
  const parentId = ctx.body?.parentId ?? null
  if (parentId != null) {
    const parent = db.tasks.find(x => x.id === parentId)
    if (!parent || parent.taskType !== 'EPIC' || parent.projectId !== t.projectId) badRequest('Эпик не найден в этом проекте')
  }
  t.parentId = parentId
  t.version += 1
  t.updatedAt = nowMs()
  return toTaskResponse(db, t)
}

export function convertTask(ctx: Ctx) {
  const t = db.tasks.find(x => x.id === Number(ctx.params.taskId))
  if (!t) notFound('Задача не найдена')
  const to = ctx.body?.to
  if (to === 'EPIC') {
    if (t.parentId != null) badRequest('Задача внутри эпика не может стать эпиком')
    t.taskType = 'EPIC'
    t.assignedUserId = null
    t.statusId = null
  } else if (to === 'TASK') {
    if (childrenOf(db, t.id).length > 0) badRequest('Внутри эпика есть задачи')
    t.taskType = 'TASK'
    const def = db.statuses.find(s => s.projectId === t.projectId && s.isDefault)
    t.statusId = def?.id ?? null
  }
  t.version += 1
  t.updatedAt = nowMs()
  return toTaskResponse(db, t)
}

export function epicTasks(ctx: Ctx) {
  return childrenOf(db, Number(ctx.params.epicId)).map(t => toTaskResponse(db, t))
}

export function projectEpics(ctx: Ctx) {
  const projectId = Number(ctx.params.projectId)
  return db.tasks.filter(t => t.projectId === projectId && t.taskType === 'EPIC').map(t => toTaskResponse(db, t))
}

// --- Комментарии -------------------------------------------------------------

function toCommentResponse(c: (typeof db.comments)[number]) {
  return {
    id: c.id, taskId: c.taskId, userId: c.userId, content: c.content, visibility: c.visibility,
    actorType: c.actorType, createdAt: new Date(c.createdAt).toISOString(), isEdited: c.isEdited,
    updatedAt: c.updatedAt != null ? new Date(c.updatedAt).toISOString() : null
  }
}

export function listComments(ctx: Ctx) {
  const taskId = Number(ctx.params.taskId)
  return db.comments.filter(c => c.taskId === taskId).sort((a, b) => a.createdAt - b.createdAt).map(toCommentResponse)
}

export function createComment(ctx: Ctx) {
  const taskId = Number(ctx.params.taskId)
  const body = ctx.body ?? {}
  if (!body.content) badRequest('Комментарий не может быть пустым')
  const now = nowMs()
  db.comments.push({
    id: nextId(), taskId, userId: db.currentUserId, content: body.content,
    visibility: body.visibility ?? 'PUBLIC', actorType: 'HUMAN', createdAt: now, isEdited: false, updatedAt: null
  })
  const t = db.tasks.find(x => x.id === taskId)
  if (t) logActivity(t, 'COMMENT_ADDED', {})
  return undefined
}

export function updateComment(ctx: Ctx) {
  const c = db.comments.find(x => x.id === Number(ctx.params.commentId))
  if (!c) notFound('Комментарий не найден')
  c.content = ctx.body?.content ?? c.content
  c.isEdited = true
  c.updatedAt = nowMs()
  return toCommentResponse(c)
}

export function deleteComment(ctx: Ctx) {
  const idx = db.comments.findIndex(x => x.id === Number(ctx.params.commentId))
  if (idx === -1) notFound('Комментарий не найден')
  db.comments.splice(idx, 1)
  return undefined
}

// --- Резюме (AI) -------------------------------------------------------------

export function getSummary(ctx: Ctx) {
  const t = db.tasks.find(x => x.id === Number(ctx.params.taskId))
  if (!t) notFound('Задача не найдена')
  return { taskId: t.id, summary: t.summary ?? '', updatedAt: new Date(t.updatedAt).toISOString() }
}

export function putSummary(ctx: Ctx) {
  const t = db.tasks.find(x => x.id === Number(ctx.params.taskId))
  if (!t) notFound('Задача не найдена')
  t.summary = ctx.body?.summary ?? ''
  t.updatedAt = nowMs()
  return { taskId: t.id, summary: t.summary, updatedAt: new Date(t.updatedAt).toISOString() }
}

// --- Учёт времени -------------------------------------------------------------

// Баг был здесь: для эпика суммировались записи «на самом id» — а у эпика их
// не бывает, время всегда висит на дочерних задачах (derive.ts делает это
// правильно для дорожной карты, эта ручка — нет). GET /api/tasks/{id}/time на
// живом бэкенде суммирует детей для эпика; повторяем то же самое здесь.
export function timeTotal(ctx: Ctx) {
  const taskId = Number(ctx.params.taskId)
  const task = db.tasks.find(t => t.id === taskId)
  const ids = task?.taskType === 'EPIC' ? childrenOf(db, taskId).map(k => k.id) : [taskId]
  return db.timeEntries.filter(e => ids.includes(e.taskId)).reduce((s, e) => s + e.seconds, 0)
}

function toTimeEntry(e: (typeof db.timeEntries)[number]) {
  return {
    id: e.id, taskId: e.taskId, userId: e.userId, seconds: e.seconds, description: e.description,
    startTime: e.startTime != null ? new Date(e.startTime).toISOString() : null, createdAt: new Date(e.createdAt).toISOString()
  }
}

export function listTimeEntries(ctx: Ctx) {
  const taskId = Number(ctx.params.taskId)
  return db.timeEntries.filter(e => e.taskId === taskId).sort((a, b) => b.createdAt - a.createdAt).map(toTimeEntry)
}

export function createTimeEntry(ctx: Ctx) {
  const taskId = Number(ctx.params.taskId)
  const body = ctx.body ?? {}
  if (!body.seconds) badRequest('Укажите время')
  const now = nowMs()
  const entry = {
    id: nextId(), taskId, userId: db.currentUserId, seconds: body.seconds,
    description: body.description ?? null, startTime: body.startTime ?? now, createdAt: now
  }
  db.timeEntries.push(entry)
  return toTimeEntry(entry)
}

export function deleteTimeEntry(ctx: Ctx) {
  const idx = db.timeEntries.findIndex(x => x.id === Number(ctx.params.entryId))
  if (idx === -1) notFound('Запись не найдена')
  db.timeEntries.splice(idx, 1)
  return undefined
}

// --- Активность -------------------------------------------------------------

function toActivityResponse(a: (typeof db.activity)[number]) {
  return {
    id: a.id, projectId: a.projectId, taskId: a.taskId, userId: a.userId, username: a.username,
    actionType: a.actionType, details: a.details, visibility: a.visibility, actorType: a.actorType,
    actorSession: a.actorSession, createdAt: new Date(a.createdAt).toISOString()
  }
}

let activitySeq = 1000
function logActivity(t: DbTask, actionType: string, details: Record<string, unknown>) {
  const user = db.users.find(u => u.id === db.currentUserId)!
  db.activity.push({
    id: activitySeq++, projectId: null, taskId: t.id, userId: user.id, username: user.username,
    actionType, details, visibility: 'PUBLIC', actorType: 'HUMAN', actorSession: null, createdAt: nowMs()
  })
}

export function projectActivity(ctx: Ctx) {
  const limit = toInt(ctx.query.get('limit') ?? undefined) ?? 50
  return db.activity.filter(a => a.projectId === Number(ctx.params.projectId)).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(toActivityResponse)
}

export function taskActivity(ctx: Ctx) {
  const limit = toInt(ctx.query.get('limit') ?? undefined) ?? 50
  return db.activity.filter(a => a.taskId === Number(ctx.params.taskId)).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(toActivityResponse)
}

// --- Файлы -------------------------------------------------------------------

function toFileResponse(f: (typeof db.files)[number]) {
  return { ...f, createdAt: new Date(f.createdAt).toISOString() }
}

export function listFiles(ctx: Ctx) {
  const taskId = Number(ctx.params.taskId)
  return db.files.filter(f => f.taskId === taskId).map(toFileResponse)
}

export function uploadFile(_ctx: Ctx): never {
  badRequest('В демо загрузка файлов недоступна')
}

export function deleteFile(ctx: Ctx) {
  const idx = db.files.findIndex(x => x.id === Number(ctx.params.fileId))
  if (idx === -1) notFound('Файл не найден')
  db.files.splice(idx, 1)
  return undefined
}
