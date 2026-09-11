import { http } from './http'
import type { ProjectMemberRequest, ProjectMemberResponse, ProjectMemberRoleRequest } from '@/types/domain'

export function listProjectMembers(projectId: number) {
  return http.get<ProjectMemberResponse[]>(`/projects/${projectId}/members`)
}

export function addProjectMember(projectId: number, payload: ProjectMemberRequest) {
  return http.post<void>(`/projects/${projectId}/members`, payload)
}

export function updateProjectMemberRole(projectId: number, userId: number, payload: ProjectMemberRoleRequest) {
  return http.put<ProjectMemberResponse>(`/projects/${projectId}/members/${userId}`, payload)
}

export function removeProjectMember(projectId: number, userId: number) {
  return http.delete<void>(`/projects/${projectId}/members/${userId}`)
}
