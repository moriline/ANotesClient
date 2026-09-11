import { http } from './http'
import type { ProjectAppearanceResponse, ProjectRequest, ProjectResponse, ProjectUpdateRequest } from '@/types/domain'

export function listProjects() {
  return http.get<ProjectResponse[]>('/projects')
}

export function getProject(id: number) {
  return http.get<ProjectResponse>(`/projects/${id}`)
}

export function createProject(payload: ProjectRequest) {
  return http.post<void>('/projects', payload)
}

export function updateProject(id: number, payload: ProjectUpdateRequest) {
  return http.patch<ProjectResponse>(`/projects/${id}`, payload)
}

export function deleteProject(id: number) {
  return http.delete<void>(`/projects/${id}`)
}

export function getProjectTags(id: number) {
  return http.get<string[]>(`/projects/${id}/tags`)
}

export function getProjectAppearance() {
  return http.get<ProjectAppearanceResponse>('/projects/appearance')
}
