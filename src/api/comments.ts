import { http } from './http'
import type { CommentRequest, CommentResponse } from '@/types/domain'

export function listTaskComments(taskId: number) {
  return http.get<CommentResponse[]>(`/tasks/${taskId}/comments`)
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
