import { http } from './http'
import type { DiscussionBlockRequest, DiscussionBlockResponse } from '@/types/domain'

export function listDiscussion(taskId: number) {
  return http.get<DiscussionBlockResponse[]>(`/tasks/${taskId}/discussion`)
}

export function replaceDiscussion(taskId: number, blocks: DiscussionBlockRequest[]) {
  return http.put<DiscussionBlockResponse[]>(`/tasks/${taskId}/discussion`, blocks)
}

export function addDiscussionBlock(taskId: number, payload: DiscussionBlockRequest) {
  return http.post<void>(`/tasks/${taskId}/discussion`, payload)
}
