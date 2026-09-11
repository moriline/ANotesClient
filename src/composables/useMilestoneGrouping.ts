import { computed, type Ref } from 'vue'
import { isEpic } from '@/utils/taskType'
import type { MilestoneResponse, TaskResponse } from '@/types/domain'

// Группировка списка задач по вехам (plan.md §5.6) — механизм тот же, что у
// группировки по эпикам, ключ группы другой (task.milestoneId). Заголовок и
// прогресс берём из GET /api/projects/{id}/milestones (сервер считает по составу),
// а не из самих задач: дочерняя задача несёт только milestoneId/milestoneTitle.
// Эпики в группировку не попадают — веха собирает задачи, не эпики.

export const NO_MILESTONE_GROUP_ID = -1

export interface MilestoneGroup {
  id: number
  milestone: MilestoneResponse | null
  title: string
  tasks: TaskResponse[]
  visibleCount: number
  totalCount: number
  doneCount: number
  overdueCount: number
  closed: boolean
  dueDate: number | null
  partial: boolean
}

export function useMilestoneGrouping(
  tasks: Ref<TaskResponse[]>,
  milestones: Ref<MilestoneResponse[]>
) {
  return computed<MilestoneGroup[]>(() => {
    const msById = new Map<number, MilestoneResponse>()
    for (const m of milestones.value) msById.set(m.id, m)

    const byMs = new Map<number, TaskResponse[]>()
    const orphans: TaskResponse[] = []
    for (const t of tasks.value) {
      if (isEpic(t)) continue
      if (t.milestoneId == null) {
        orphans.push(t)
        continue
      }
      const bucket = byMs.get(t.milestoneId)
      if (bucket) bucket.push(t)
      else byMs.set(t.milestoneId, [t])
    }

    const groups: MilestoneGroup[] = []

    const makeGroup = (id: number, ms: MilestoneResponse | null, list: TaskResponse[]): MilestoneGroup => {
      const known = ms != null
      const totalCount = known ? ms!.taskTotal : list.length
      return {
        id,
        milestone: ms,
        title: ms?.title ?? list[0]?.milestoneTitle ?? `Веха #${id}`,
        tasks: list,
        visibleCount: list.length,
        totalCount,
        doneCount: ms?.taskDone ?? 0,
        overdueCount: ms?.taskOverdue ?? 0,
        closed: ms?.state === 'CLOSED',
        dueDate: ms?.dueDate ?? null,
        partial: known && list.length < totalCount
      }
    }

    for (const [msId, list] of byMs) {
      groups.push(makeGroup(msId, msById.get(msId) ?? null, list))
    }
    // Вехи без задач в выдаче — показываем пустыми (иначе кажется, что исчезли).
    for (const [msId, ms] of msById) {
      if (byMs.has(msId)) continue
      groups.push(makeGroup(msId, ms, []))
    }

    // По возрастанию срока — вехи линейны по времени (plan.md §1).
    groups.sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity))

    if (orphans.length) {
      groups.push({
        id: NO_MILESTONE_GROUP_ID,
        milestone: null,
        title: 'Без вехи',
        tasks: orphans,
        visibleCount: orphans.length,
        totalCount: orphans.length,
        doneCount: 0,
        overdueCount: 0,
        closed: false,
        dueDate: null,
        partial: false
      })
    }
    return groups
  })
}
