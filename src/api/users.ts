import { http } from './http'
import type {
  ChangePasswordRequest,
  UpdateProfileRequest,
  UserProfile,
  UserSummary
} from '@/types/domain'

export function listUsers(params: { q?: string; limit?: number } = {}) {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.limit) search.set('limit', String(params.limit))
  const qs = search.toString()
  return http.get<UserSummary[]>(`/users${qs ? `?${qs}` : ''}`)
}

export function getMe() {
  return http.get<UserProfile>('/users/me')
}

export function updateMe(payload: UpdateProfileRequest) {
  return http.put<UserProfile>('/users/me', payload)
}

export function changePassword(payload: ChangePasswordRequest) {
  return http.put<void>('/users/me/password', payload)
}
