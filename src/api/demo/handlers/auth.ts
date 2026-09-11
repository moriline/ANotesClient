import type { Ctx } from '../demoHttp'
import { db } from '../store'
import { nowMs } from '../util'

// Вход в демо принимает любые логин/пароль (client_pages.md §5.1) — всегда
// «входим» одним и тем же демо-пользователем (db.currentUserId).

function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Правдоподобный, но никем не подписанный JWT — decodeJwtPayload его читает,
 * бэкенд, разумеется, нет (агентский токен и не должен быть рабочим, §5.4). */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  return `${header}.${body}.demo-signature`
}

function currentUser() {
  const user = db.users.find(u => u.id === db.currentUserId)!
  return user
}

export function login(_ctx: Ctx) {
  const user = currentUser()
  const roles = user.isAdmin ? ['USER', 'ADMIN'] : ['USER']
  const token = fakeJwt({ sub: String(user.id), username: user.username, groups: roles, iat: Math.floor(nowMs() / 1000) })
  return { token, username: user.username, roles }
}

export const register = login

export function agentToken(_ctx: Ctx) {
  const user = currentUser()
  const exp = Math.floor((nowMs() + 48 * 3600_000) / 1000)
  const token = fakeJwt({ sub: String(user.id), username: user.username, groups: ['USER', 'AGENT'], iat: Math.floor(nowMs() / 1000), exp })
  return { token, username: user.username, roles: ['USER', 'AGENT'] }
}
