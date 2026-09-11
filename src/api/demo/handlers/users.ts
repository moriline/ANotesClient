import type { Ctx } from '../demoHttp'
import { db } from '../store'
import { forbidden, toInt } from '../util'

function toSummary(u: (typeof db.users)[number]) {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl }
}

export function listUsers(ctx: Ctx) {
  const q = ctx.query.get('q')?.toLowerCase()
  const limit = toInt(ctx.query.get('limit') ?? undefined) ?? 50
  let users = db.users
  if (q) users = users.filter(u => u.displayName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
  return users.slice(0, limit).map(toSummary)
}

export function getMe(_ctx: Ctx) {
  const u = db.users.find(x => x.id === db.currentUserId)!
  return { id: u.id, username: u.username, email: u.email, displayName: u.displayName, avatarUrl: u.avatarUrl }
}

export function updateMe(ctx: Ctx) {
  const u = db.users.find(x => x.id === db.currentUserId)!
  const body = ctx.body ?? {}
  if (body.displayName !== undefined) u.displayName = body.displayName
  if (body.email !== undefined) u.email = body.email
  if (body.avatarUrl !== undefined) u.avatarUrl = body.avatarUrl
  return { id: u.id, username: u.username, email: u.email, displayName: u.displayName, avatarUrl: u.avatarUrl }
}

export function changePassword(_ctx: Ctx) {
  // Демо: пароля нет, менять нечего — просто подтверждаем.
  return undefined
}

// client_pages.md §5.6 — демо-пользователь не администратор, роут всегда 403,
// /people откатывается на каталог только для чтения, как в боевом приложении.
export function adminUsers(_ctx: Ctx): never {
  forbidden('Демо: администрирование недоступно')
}

export function deleteAdminUser(_ctx: Ctx): never {
  forbidden('Демо: администрирование недоступно')
}

export function setAdminUserStatus(_ctx: Ctx): never {
  forbidden('Демо: администрирование недоступно')
}

export function listRoles(_ctx: Ctx) {
  return db.roles
}
