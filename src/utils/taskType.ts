import type { TaskResponse, TaskType } from '@/types/domain'

// Единственная развилка кода клиента по виду сущности (parent_task.md §5.1).
// Всё остальное — условный рендер по этому признаку; отдельной страницы у
// эпика нет, маршрут общий (/tasks/:projectId/:taskId).
export function isEpic(t: Pick<TaskResponse, 'taskType'> | null | undefined): boolean {
  return t?.taskType === 'EPIC'
}

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  TASK: 'Задача',
  EPIC: 'Эпик'
}
