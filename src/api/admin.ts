import { http } from './http'
import type { AdminUserResponse, AdminUserStatusRequest } from '@/types/domain'

export function listAdminUsers() {
  return http.get<AdminUserResponse[]>('/admin/users')
}

export function deleteAdminUser(id: number) {
  return http.delete<void>(`/admin/users/${id}`)
}

export function setAdminUserStatus(id: number, payload: AdminUserStatusRequest) {
  return http.put<AdminUserResponse>(`/admin/users/${id}/status`, payload)
}
