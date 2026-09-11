import type { Ctx } from '../demoHttp'
import { db } from '../store'
import { badRequest, nextId, notFound, nowMs } from '../util'
import type { DbStatus } from '../seed'

function toProjectResponse(p: (typeof db.projects)[number]) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    ownerUserId: p.ownerUserId,
    color: p.color,
    icon: p.icon,
    tags: p.tags,
    isActive: p.isActive,
    createdAt: new Date(p.createdAt).toISOString(),
    updatedAt: new Date(p.updatedAt).toISOString()
  }
}

export function listProjects(_ctx: Ctx) {
  return db.projects.map(toProjectResponse)
}

export function getProject(ctx: Ctx) {
  const p = db.projects.find(x => x.id === Number(ctx.params.id))
  if (!p) notFound('Проект не найден')
  return toProjectResponse(p)
}

export function createProject(ctx: Ctx) {
  const body = ctx.body ?? {}
  if (!body.name) badRequest('Название обязательно')
  const id = nextId()
  const now = nowMs()
  db.projects.push({
    id, name: body.name, description: body.description ?? null, ownerUserId: db.currentUserId,
    color: body.color ?? 'violet', icon: body.icon ?? 'i-lucide-folder', tags: body.tags ?? [],
    isActive: true, createdAt: now, updatedAt: now
  })
  db.statuses.push(
    { id: nextId(), projectId: id, statusName: 'Новое', statusColor: '#9CA3AF', statusOrder: 1, isDefault: true, isClosed: false, isHidden: false },
    { id: nextId(), projectId: id, statusName: 'Готово', statusColor: '#22C55E', statusOrder: 2, isDefault: false, isClosed: true, isHidden: false }
  )
  db.members.push({ id: nextId(), projectId: id, userId: db.currentUserId, roleId: 1, joinedAt: now })
  return undefined
}

export function patchProject(ctx: Ctx) {
  const p = db.projects.find(x => x.id === Number(ctx.params.id))
  if (!p) notFound('Проект не найден')
  const body = ctx.body ?? {}
  if (body.name !== undefined) p.name = body.name
  if (body.description !== undefined) p.description = body.description
  if (body.color !== undefined) p.color = body.color
  if (body.icon !== undefined) p.icon = body.icon
  if (body.tags !== undefined) p.tags = body.tags
  p.updatedAt = nowMs()
  return toProjectResponse(p)
}

export function deleteProject(ctx: Ctx) {
  const id = Number(ctx.params.id)
  const idx = db.projects.findIndex(x => x.id === id)
  if (idx === -1) notFound('Проект не найден')
  db.projects.splice(idx, 1)
  db.tasks = db.tasks.filter(t => t.projectId !== id)
  db.statuses = db.statuses.filter(s => s.projectId !== id)
  db.members = db.members.filter(m => m.projectId !== id)
  db.milestones = db.milestones.filter(m => m.projectId !== id)
  db.wikiPages = db.wikiPages.filter(w => w.projectId !== id)
  return undefined
}

export function projectTags(ctx: Ctx) {
  const p = db.projects.find(x => x.id === Number(ctx.params.id))
  if (!p) notFound('Проект не найден')
  return p.tags
}

export function appearance(_ctx: Ctx) {
  return {
    colors: ['violet', 'blue', 'green', 'amber', 'rose', 'cyan', 'fuchsia', 'neutral'],
    icons: ['i-lucide-folder', 'i-lucide-monitor', 'i-lucide-arrow-left-right', 'i-lucide-rocket', 'i-lucide-flask-conical', 'i-lucide-briefcase']
  }
}

// --- Статусы проекта -------------------------------------------------------

function toStatusResponse(s: DbStatus) {
  return { id: s.id, projectId: s.projectId, statusName: s.statusName, statusColor: s.statusColor, statusOrder: s.statusOrder, isDefault: s.isDefault, isClosed: s.isClosed, isHidden: s.isHidden }
}

export function listStatuses(ctx: Ctx) {
  const projectId = Number(ctx.params.projectId)
  return db.statuses.filter(s => s.projectId === projectId).sort((a, b) => a.statusOrder - b.statusOrder).map(toStatusResponse)
}

export function createStatus(ctx: Ctx) {
  const body = ctx.body ?? {}
  if (!body.projectId || !body.statusName) badRequest('projectId и statusName обязательны')
  const s: DbStatus = {
    id: nextId(), projectId: body.projectId, statusName: body.statusName, statusColor: body.statusColor ?? '#9CA3AF',
    statusOrder: body.statusOrder ?? (db.statuses.filter(x => x.projectId === body.projectId).length + 1),
    isDefault: !!body.isDefault, isClosed: !!body.isClosed, isHidden: false
  }
  db.statuses.push(s)
  return undefined
}

export function updateStatus(ctx: Ctx) {
  const s = db.statuses.find(x => x.id === Number(ctx.params.statusId))
  if (!s) notFound('Статус не найден')
  const body = ctx.body ?? {}
  if (body.statusName !== undefined) s.statusName = body.statusName
  if (body.statusColor !== undefined) s.statusColor = body.statusColor
  if (body.statusOrder !== undefined) s.statusOrder = body.statusOrder
  if (body.isClosed !== undefined) s.isClosed = body.isClosed
  if (body.isHidden !== undefined) s.isHidden = body.isHidden
  return toStatusResponse(s)
}

// --- Участники проекта -------------------------------------------------------

function toMemberResponse(m: (typeof db.members)[number]) {
  const user = db.users.find(u => u.id === m.userId)
  const role = db.roles.find(r => r.id === m.roleId)
  return { id: m.id, projectId: m.projectId, userId: m.userId, username: user?.username ?? '?', displayName: user?.displayName ?? '?', roleId: m.roleId, roleName: role?.name ?? '?', joinedAt: m.joinedAt }
}

export function listMembers(ctx: Ctx) {
  const projectId = Number(ctx.params.projectId)
  return db.members.filter(m => m.projectId === projectId).map(toMemberResponse)
}

export function addMember(ctx: Ctx) {
  const projectId = Number(ctx.params.projectId)
  const body = ctx.body ?? {}
  if (!body.userId || !body.roleId) badRequest('userId и roleId обязательны')
  if (db.members.some(m => m.projectId === projectId && m.userId === body.userId)) badRequest('Уже участник')
  db.members.push({ id: nextId(), projectId, userId: body.userId, roleId: body.roleId, joinedAt: nowMs() })
  return undefined
}

export function updateMemberRole(ctx: Ctx) {
  const m = db.members.find(x => x.projectId === Number(ctx.params.projectId) && x.userId === Number(ctx.params.userId))
  if (!m) notFound('Участник не найден')
  m.roleId = ctx.body?.roleId ?? m.roleId
  return toMemberResponse(m)
}

export function removeMember(ctx: Ctx) {
  const idx = db.members.findIndex(x => x.projectId === Number(ctx.params.projectId) && x.userId === Number(ctx.params.userId))
  if (idx === -1) notFound('Участник не найден')
  db.members.splice(idx, 1)
  return undefined
}

export function checkPermissions(ctx: Ctx) {
  const body = ctx.body ?? {}
  // Демо: одна учётка, ничего реально не разграничено — всегда «можно».
  return { [body.action ?? 'read']: true }
}
