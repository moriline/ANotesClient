import { http } from './http'
import type { TaskSummaryRequest, TaskSummaryResponse } from '@/types/domain'

export function getTaskSummary(taskId: number) {
  return http.get<TaskSummaryResponse>(`/tasks/${taskId}/summary`)
}

export function updateTaskSummary(taskId: number, payload: TaskSummaryRequest) {
  return http.put<TaskSummaryResponse>(`/tasks/${taskId}/summary`, payload)
}
