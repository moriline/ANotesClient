import { http } from './http'
import type { CommentRequest, CommentResponse, CommentSearchRequest, CommentSearchResponse } from '@/types/domain'

export function listTaskComments(taskId: number) {
  return http.get<CommentResponse[]>(`/tasks/${taskId}/comments`)
}

// Без taskId — по всем задачам всех доступных вызывающему проектов.
export function findComments(payload: CommentSearchRequest) {
  return http.post<CommentSearchResponse>('/comments/find', payload)
}

export function createComment(taskId: number, payload: CommentRequest) {
  return http.post<void>(`/tasks/${taskId}/comments`, payload)
}

export function updateComment(commentId: number, payload: CommentRequest) {
  return http.put<CommentResponse>(`/comments/${commentId}`, payload)
}

export function deleteComment(commentId: number) {
  return http.delete<void>(`/comments/${commentId}`)
}
