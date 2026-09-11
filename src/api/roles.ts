import { http } from './http'
import type { RoleResponse } from '@/types/domain'

export function listRoles() {
  return http.get<RoleResponse[]>('/roles')
}
