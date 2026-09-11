import { http } from './http'
import type { ActivityResponse } from '@/types/domain'

export function listProjectActivity(projectId: number, params: { limit?: number; offset?: number } = {}) {
  const search = new URLSearchParams()
  if (params.limit) search.set('limit', String(params.limit))
  if (params.offset) search.set('offset', String(params.offset))
  const qs = search.toString()
  return http.get<ActivityResponse[]>(`/projects/${projectId}/activity${qs ? `?${qs}` : ''}`)
}

export function listTaskActivity(taskId: number, params: { limit?: number; offset?: number } = {}) {
  const search = new URLSearchParams()
  if (params.limit) search.set('limit', String(params.limit))
  if (params.offset) search.set('offset', String(params.offset))
  const qs = search.toString()
  return http.get<ActivityResponse[]>(`/tasks/${taskId}/activity${qs ? `?${qs}` : ''}`)
}
