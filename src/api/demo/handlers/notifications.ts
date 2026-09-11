import type { Ctx } from '../demoHttp'
import { db } from '../store'
import { toInt } from '../util'

// client_pages.md §5.5 — опрос счётчика работает, но сам счётчик не растёт сам
// по себе (в сиде фиксированный набор непрочитанных); «прочитано» действительно
// уменьшает число, потому что оно каждый раз считается заново из db.

function toResponse(n: (typeof db.notifications)[number]) {
  return {
    id: n.id, type: n.type, taskId: n.taskId, commentId: n.commentId, actorId: n.actorId,
    actorUsername: n.actorUsername, text: n.text, read: n.read, createdAt: new Date(n.createdAt).toISOString()
  }
}

export function listNotifications(ctx: Ctx) {
  const unreadOnly = ctx.query.get('unread') === 'true'
  const limit = toInt(ctx.query.get('limit') ?? undefined) ?? 20
  let list = db.notifications.filter(n => n.userId === db.currentUserId)
  if (unreadOnly) list = list.filter(n => !n.read)
  return list.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(toResponse)
}

export function unreadCount(_ctx: Ctx) {
  return { unread: db.notifications.filter(n => n.userId === db.currentUserId && !n.read).length }
}

export function markRead(ctx: Ctx) {
  const n = db.notifications.find(x => x.id === Number(ctx.params.id) && x.userId === db.currentUserId)
  if (n) n.read = true
  return undefined
}

export function markAllRead(_ctx: Ctx) {
  db.notifications.filter(n => n.userId === db.currentUserId).forEach(n => { n.read = true })
  return undefined
}

export function getSettings(_ctx: Ctx) {
  return db.notificationSettings
}

export function putSettings(ctx: Ctx) {
  const type = ctx.params.type
  const inApp = !!ctx.body?.inApp
  const existing = db.notificationSettings.find(s => s.type === type)
  if (existing) existing.inApp = inApp
  else db.notificationSettings.push({ type, inApp })
  return db.notificationSettings
}
