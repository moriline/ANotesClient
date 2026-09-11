import { ApiError, http } from './http'
import type { AuthResponse, LoginRequest, RegisterRequest } from '@/types/domain'

export function login(payload: LoginRequest) {
  return http.post<AuthResponse>('/auth/login', payload, { auth: false })
}

// Регистрация также используется админом для заведения пользователей из UI
// (отдельного admin-эндпоинта создания пользователя в API нет). Вызов идёт с
// { auth: false }, а возвращённый токен нового пользователя не применяется —
// сессия администратора не затрагивается.
export function register(payload: RegisterRequest) {
  return http.post<AuthResponse>('/auth/register', payload, { auth: false })
}

// Второй JWT для того же пользователя (ai.md §1.3): группы USER+AGENT без ADMIN,
// срок 48 часов. Агент под ним читает и меняет задачи в проектах пользователя,
// но не удаляет и не управляет доступом. Отправляется обычным токеном; рефреша
// нет — по истечении дёргаем эту же ручку снова.
export function requestAgentToken() {
  return http.post<AuthResponse>('/auth/agent-token')
}

// Урезанная OpenAPI-спека для агента (9–10 операций) — «набор инструментов» для
// модели. Отдаётся под bearerAuth, поэтому просто открыть URL в браузере нельзя;
// забираем текст авторизованным запросом (передаём именно агентский токен) и
// отдаём как есть, для скачивания файлом. Не идёт через http-обёртку: нужен
// сырой текст, а не разобранный JSON, и 401 здесь не должен разлогинивать.
export async function fetchAgentOpenApi(bearer: string): Promise<string> {
  const res = await fetch('/api/agent/openapi.json', {
    headers: { Authorization: `Bearer ${bearer}` }
  })
  if (!res.ok) throw new ApiError(res.status, `Спецификация недоступна (${res.status})`)
  return res.text()
}
