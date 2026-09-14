import { http } from './http'
import type { TimeEntry, TimeEntryRequest, TimeEntrySearchRequest, TimeEntrySearchResponse } from '@/types/domain'

export function getTaskTotalSeconds(taskId: number) {
  return http.get<number>(`/tasks/${taskId}/time`)
}

export function listTimeEntries(taskId: number) {
  return http.get<TimeEntry[]>(`/tasks/${taskId}/time/entries`)
}

export function logTime(taskId: number, payload: TimeEntryRequest) {
  return http.post<TimeEntry>(`/tasks/${taskId}/time`, payload)
}

export function deleteTimeEntry(taskId: number, entryId: number) {
  return http.delete<void>(`/tasks/${taskId}/time/entries/${entryId}`)
}

// Без taskId — по всем задачам всех доступных вызывающему проектов.
export function findTimeEntries(payload: TimeEntrySearchRequest) {
  return http.post<TimeEntrySearchResponse>('/time-entries/find', payload)
}
