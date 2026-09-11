import { http } from './http'
import type {
  MilestoneRequest,
  MilestoneResponse,
  MilestoneUpdateRequest,
  TaskResponse
} from '@/types/domain'

// Модуль вех (plan.md §4). Веха — точка на оси времени: собирает задачи из
// разных эпиков по общему сроку. Прогресс и state считает сервер.

export type MilestoneStateFilter = 'open' | 'closed' | 'all'

// GET /api/projects/{projectId}/milestones?state= — вехи проекта по возрастанию
// срока, с прогрессом (один запрос на весь список) и вычисленным state.
export function listProjectMilestones(projectId: number, state: MilestoneStateFilter = 'all') {
  return http.get<MilestoneResponse[]>(`/projects/${projectId}/milestones?state=${state}`)
}

// POST /api/projects/{projectId}/milestones — ответ без тела. dueDate обязателен
// (epoch-ms). Дубль названия в проекте — 409.
export function createMilestone(projectId: number, payload: MilestoneRequest) {
  return http.post<void>(`/projects/${projectId}/milestones`, payload)
}

export function getMilestone(id: number) {
  return http.get<MilestoneResponse>(`/milestones/${id}`)
}

// expectedVersion → заголовок X-Expected-Version (оптимистическая блокировка,
// как у задач и вики). При расхождении — 409.
export function updateMilestone(id: number, payload: MilestoneUpdateRequest, expectedVersion?: number) {
  const headers: Record<string, string> = {}
  if (expectedVersion != null) headers['X-Expected-Version'] = String(expectedVersion)
  return http.put<MilestoneResponse>(`/milestones/${id}`, payload, { headers })
}

// DELETE /api/milestones/{id}. Задач нет — 204. Задачи есть без policy — 409 с
// их числом. tasks=detach — обнулить milestoneId; tasks=move&to={id} — перенести
// в другую открытую веху того же проекта. Задачи НЕ удаляются ни при каком варианте.
export function deleteMilestone(id: number, opts: { tasks?: 'detach' | 'move'; to?: number } = {}) {
  const search = new URLSearchParams()
  if (opts.tasks) search.set('tasks', opts.tasks)
  if (opts.to != null) search.set('to', String(opts.to))
  const qs = search.toString()
  return http.delete<void>(`/milestones/${id}${qs ? `?${qs}` : ''}`)
}

// PUT /api/milestones/{id}/close — закрытие с незавершёнными задачами разрешено
// (пишется в журнал отдельным типом). Повторное закрытие — 400.
export function closeMilestone(id: number) {
  return http.put<MilestoneResponse>(`/milestones/${id}/close`)
}

// PUT /api/milestones/{id}/reopen — открыть заново. Повторное открытие — 400.
export function reopenMilestone(id: number) {
  return http.put<MilestoneResponse>(`/milestones/${id}/reopen`)
}

// GET /api/milestones/{id}/tasks — задачи вехи. У каждой parentId — из какого
// эпика (веха собирает работу из разных направлений, plan.md §5.3).
export function listMilestoneTasks(id: number) {
  return http.get<TaskResponse[]>(`/milestones/${id}/tasks`)
}

// PUT /api/tasks/{taskId}/milestone — привязать/перенести/отвязать задачу от
// вехи. null (или пустое тело) отвязывает. Веха должна быть открытой и в том же
// проекте (400); эпик к вехе привязать нельзя (400). В ответе milestoneReady.
export function setTaskMilestone(taskId: number, milestoneId: number | null) {
  return http.put<TaskResponse>(`/tasks/${taskId}/milestone`, { milestoneId })
}
