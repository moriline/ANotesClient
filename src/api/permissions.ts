import { http } from './http'
import type { PermissionCheckRequest } from '@/types/domain'

export function checkPermission(payload: PermissionCheckRequest) {
  return http.post<Record<string, boolean>>('/permissions/check', payload)
}
