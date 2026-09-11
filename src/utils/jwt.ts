/**
 * Разбор payload JWT на клиенте — только для отображения (срок действия, группы).
 * Подпись здесь НЕ проверяется, это делает бэкенд; ничему из результата нельзя
 * доверять как факту. base64url без padding, отсюда возня с `-`/`_` и `=`.
 */
export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Момент истечения токена (`exp` → epoch-ms) или null, если клейма нет. */
export function jwtExpiresAt(token: string | null | undefined): number | null {
  const exp = decodeJwtPayload(token)?.exp
  return typeof exp === 'number' ? exp * 1000 : null
}
