import { http } from './http'
import type {
  FindTasksRequest,
  ResponseWrapper,
  TaskRequest,
  TaskResponse,
  TaskType,
  TaskUpdateRequest
} from '@/types/domain'

export function findTasks(payload: FindTasksRequest) {
  return http.post<ResponseWrapper>('/find', payload)
}

export function listProjectTasks(projectId: number) {
  return http.get<TaskResponse[]>(`/projects/${projectId}/tasks`)
}

export function getTask(projectId: number, taskId: number) {
  return http.get<TaskResponse>(`/projects/${projectId}/tasks/${taskId}`)
}

export function createTask(projectId: number, payload: TaskRequest) {
  return http.post<void>(`/projects/${projectId}/tasks`, payload)
}

// expectedVersion — из TaskResponse.version. Если передан, бэкенд вернёт 409,
// когда задачу успели изменить (оптимистическая блокировка). Не передаём —
// сохранение без проверки версии (принудительная перезапись).
export function updateTask(
  projectId: number,
  taskId: number,
  payload: TaskUpdateRequest,
  expectedVersion?: number
) {
  const headers: Record<string, string> = {}
  if (expectedVersion != null) headers['X-Expected-Version'] = String(expectedVersion)
  return http.patch<TaskResponse>(`/projects/${projectId}/tasks/${taskId}`, payload, { headers })
}

// children — только для эпиков с задачами внутри: 'detach' обнуляет их parentId,
// 'delete' удаляет вместе с ними. Без параметра эпик с задачами даёт 409.
export function deleteTask(projectId: number, taskId: number, children?: 'detach' | 'delete') {
  const q = children ? `?children=${children}` : ''
  return http.delete<void>(`/projects/${projectId}/tasks/${taskId}${q}`)
}

// --- Эпики (parent_task.md §4) ---

// PUT /api/tasks/{taskId}/parent — привязать задачу к эпику того же проекта;
// null отвязывает. Родителем может быть только эпик (иначе 400).
export function setTaskParent(taskId: number, parentId: number | null) {
  return http.put<TaskResponse>(`/tasks/${taskId}/parent`, { parentId })
}

// PUT /api/tasks/{taskId}/convert — сменить вид задачи (400 с понятным текстом
// при нарушении инвариантов — см. TaskConvertRequest).
export function convertTask(taskId: number, to: TaskType) {
  return http.put<TaskResponse>(`/tasks/${taskId}/convert`, { to })
}

// GET /api/epics/{epicId}/tasks — дочерние задачи эпика в порядке создания.
export function listEpicTasks(epicId: number) {
  return http.get<TaskResponse[]>(`/epics/${epicId}/tasks`)
}

// GET /api/projects/{projectId}/epics — эпики проекта с прогрессом
// (childTotal / childDone / epicClosed), один запрос на всю страницу.
export function listProjectEpics(projectId: number) {
  return http.get<TaskResponse[]>(`/projects/${projectId}/epics`)
}
