import { http } from './http'
import type {
  ProjectStatusRequest,
  ProjectStatusResponse,
  ProjectStatusUpdateRequest
} from '@/types/domain'

export function listProjectStatuses(projectId: number) {
  return http.get<ProjectStatusResponse[]>(`/project-statuses/project/${projectId}`)
}

export function createProjectStatus(payload: ProjectStatusRequest) {
  return http.post<void>('/project-statuses', payload)
}

export function updateProjectStatus(statusId: number, payload: ProjectStatusUpdateRequest) {
  return http.put<ProjectStatusResponse>(`/project-statuses/${statusId}`, payload)
}
