// Вычисляемые поля, которые в реальном API считает сервер (прогресс эпиков,
// состояния вех и дорожной карты) — здесь пересчитываются на лету из db.tasks
// при каждом чтении, а не хранятся в сиде. Так демо остаётся корректным после
// любой правки (галочка на чекбоксе, перенос задачи между вехами и т.п.),
// вместо того чтобы держать вручную согласованные счётчики.
import type { DbMilestone, DbTask, DemoDb } from './seed'
import { DAY } from './seed'
import type {
  MilestoneResponse,
  MilestoneState,
  RoadmapItem,
  RoadmapState,
  TaskResponse
} from '@/types/domain'

export function isStatusClosed(db: DemoDb, statusId: number | null): boolean {
  if (statusId == null) return false
  return db.statuses.find(s => s.id === statusId)?.isClosed ?? false
}

export function childrenOf(db: DemoDb, epicId: number): DbTask[] {
  return db.tasks.filter(t => t.parentId === epicId && t.taskType === 'TASK')
}

export function toTaskResponse(db: DemoDb, t: DbTask): TaskResponse {
  const isEpic = t.taskType === 'EPIC'
  const parent = t.parentId != null ? db.tasks.find(x => x.id === t.parentId) : undefined
  const milestone = t.milestoneId != null ? db.milestones.find(m => m.id === t.milestoneId) : undefined
  const kids = isEpic ? childrenOf(db, t.id) : []
  const childDone = isEpic ? kids.filter(k => isStatusClosed(db, k.statusId)).length : null

  return {
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description,
    summary: t.summary,
    creatorUserId: t.creatorUserId,
    assignedUserId: isEpic ? null : t.assignedUserId,
    statusId: isEpic ? null : t.statusId,
    dueDate: t.dueDate,
    startDate: t.startDate,
    estimatedHours: isEpic ? null : t.estimatedHours,
    tags: t.tags,
    isArchived: t.isArchived,
    createdAt: new Date(t.createdAt).toISOString(),
    updatedAt: new Date(t.updatedAt).toISOString(),
    version: t.version,
    taskType: t.taskType,
    parentId: isEpic ? null : t.parentId,
    parentTitle: isEpic ? null : (parent?.title ?? null),
    childTotal: isEpic ? kids.length : null,
    childDone,
    epicClosed: isEpic ? (kids.length > 0 && childDone === kids.length) : null,
    milestoneId: isEpic ? null : t.milestoneId,
    milestoneTitle: isEpic ? null : (milestone?.title ?? null),
    milestoneDueDate: isEpic ? null : (milestone?.dueDate ?? null)
  }
}

export function milestoneCounts(db: DemoDb, m: DbMilestone) {
  const tasks = db.tasks.filter(t => t.milestoneId === m.id)
  const taskTotal = tasks.length
  const taskDone = tasks.filter(t => isStatusClosed(db, t.statusId)).length
  const now = Date.now()
  const taskOverdue = tasks.filter(t => !isStatusClosed(db, t.statusId) && t.dueDate != null && t.dueDate < now).length
  return { taskTotal, taskDone, taskOverdue }
}

export function milestoneState(dueDate: number, taskTotal: number, taskDone: number, closed: boolean): MilestoneState {
  if (closed) return 'CLOSED'
  if (taskTotal > 0 && taskDone === taskTotal) return 'READY'
  const now = Date.now()
  if (now > dueDate) return 'LATE'
  if (taskDone === 0) return 'PLANNED'
  const daysUntil = Math.ceil((dueDate - now) / DAY)
  const open = taskTotal - taskDone
  if (daysUntil < open) return 'AT_RISK'
  return 'IN_PROGRESS'
}

export function toMilestoneResponse(db: DemoDb, m: DbMilestone): MilestoneResponse {
  const { taskTotal, taskDone, taskOverdue } = milestoneCounts(db, m)
  return {
    id: m.id,
    projectId: m.projectId,
    title: m.title,
    description: m.description,
    dueDate: m.dueDate,
    state: milestoneState(m.dueDate, taskTotal, taskDone, m.closed),
    taskTotal,
    taskDone,
    taskOverdue,
    closedAt: m.closedAt,
    closedByName: m.closedByName,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    version: m.version
  }
}

export function epicRoadmapItem(db: DemoDb, epic: DbTask): RoadmapItem {
  const kids = childrenOf(db, epic.id)
  const childDone = kids.filter(k => isStatusClosed(db, k.statusId)).length
  const now = Date.now()

  let startDate = epic.startDate
  let dueDate = epic.dueDate
  let datesInferred = false
  if (startDate == null || dueDate == null) {
    const starts = kids.map(k => k.startDate ?? k.createdAt).filter((x): x is number => x != null)
    const dues = kids.map(k => k.dueDate).filter((x): x is number => x != null)
    if (starts.length || dues.length) {
      datesInferred = true
      startDate = startDate ?? (starts.length ? Math.min(...starts) : null)
      dueDate = dueDate ?? (dues.length ? Math.max(...dues) : null)
    }
  }

  const childOverdue = kids.filter(k => !isStatusClosed(db, k.statusId) && k.dueDate != null && k.dueDate < now).length
  const spentSeconds = kids.reduce((sum, k) => sum + db.timeEntries.filter(e => e.taskId === k.id).reduce((s, e) => s + e.seconds, 0), 0)

  let state: RoadmapState
  if (kids.length > 0 && childDone === kids.length) state = 'DONE'
  else if (dueDate != null && now > dueDate && childDone < kids.length) state = 'OVERDUE'
  else if (childDone === 0) state = 'NOT_STARTED'
  else if (dueDate != null) {
    const daysUntil = Math.ceil((dueDate - now) / DAY)
    const open = kids.length - childDone
    state = daysUntil < open ? 'AT_RISK' : 'IN_PROGRESS'
  } else {
    state = 'IN_PROGRESS'
  }

  return { id: epic.id, title: epic.title, startDate, dueDate, datesInferred, childTotal: kids.length, childDone, childOverdue, state, spentSeconds }
}
