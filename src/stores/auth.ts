import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { login as loginRequest, register as registerRequest } from '@/api/auth'
import { http } from '@/api/http'
import { router } from '@/router'
import type { LoginRequest, RegisterRequest, UserProfile } from '@/types/domain'

const TOKEN_KEY = 'taskmind.token'
const ROLES_KEY = 'taskmind.roles'
// Второй JWT для того же пользователя — доступ ИИ-агента (см. ai.md §1.3).
// Это учётные данные, а не доменные данные, поэтому localStorage правилу спеки
// не противоречит — как и основной токен выше.
const AGENT_TOKEN_KEY = 'taskmind.agentToken'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const roles = ref<string[]>(JSON.parse(localStorage.getItem(ROLES_KEY) || '[]'))
  const agentToken = ref<string | null>(localStorage.getItem(AGENT_TOKEN_KEY))
  const profile = ref<UserProfile | null>(null)
  const bootstrapped = ref(false)

  const isAuthenticated = computed(() => !!token.value)
  // AuthResponse.roles — единственный источник: сервер строит один список ролей
  // и кладёт его И в JWT (claim groups), И в тело ответа логина (AuthService).
  // Раньше тело приходило пустым для админов — костыль с разбором claim'ов JWT
  // убран после серверного фикса.
  const isAdmin = computed(() => roles.value.some(r => r.toUpperCase().includes('ADMIN')))

  function setSession(auth: { token: string; roles?: string[] }) {
    token.value = auth.token
    roles.value = auth.roles ?? []
    localStorage.setItem(TOKEN_KEY, auth.token)
    localStorage.setItem(ROLES_KEY, JSON.stringify(roles.value))
  }

  function clearSession() {
    token.value = null
    roles.value = []
    profile.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(ROLES_KEY)
    clearAgentToken()
  }

  function setAgentToken(value: string) {
    agentToken.value = value
    localStorage.setItem(AGENT_TOKEN_KEY, value)
  }

  // Забывает токен только в этом браузере: на сервере рефреша/отзыва нет,
  // выпущенный токен живёт до истечения срока (ai.md §1.3).
  function clearAgentToken() {
    agentToken.value = null
    localStorage.removeItem(AGENT_TOKEN_KEY)
  }

  async function login(payload: LoginRequest) {
    const auth = await loginRequest(payload)
    setSession(auth)
    await fetchProfile()
  }

  async function register(payload: RegisterRequest) {
    const auth = await registerRequest(payload)
    setSession(auth)
    await fetchProfile()
  }

  async function fetchProfile() {
    profile.value = await http.get<UserProfile>('/users/me')
  }

  async function bootstrap() {
    if (bootstrapped.value) return
    bootstrapped.value = true
    if (!token.value) return
    try {
      await fetchProfile()
    } catch {
      clearSession()
    }
  }

  function logout() {
    clearSession()
    router.push('/login')
  }

  function handleUnauthorized() {
    if (!token.value) return
    clearSession()
    router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
  }

  return {
    token,
    roles,
    agentToken,
    profile,
    isAuthenticated,
    isAdmin,
    login,
    register,
    logout,
    fetchProfile,
    bootstrap,
    handleUnauthorized,
    setAgentToken,
    clearAgentToken
  }
})
