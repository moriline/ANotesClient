import type { Ctx } from '../demoHttp'
import { db } from '../store'
import { epicRoadmapItem } from '../derive'
import { DAY } from '../seed'

export function getRoadmap(ctx: Ctx) {
  const projectId = Number(ctx.params.projectId)
  const epics = db.tasks.filter(t => t.projectId === projectId && t.taskType === 'EPIC')
  const all = epics.map(e => epicRoadmapItem(db, e))
  const items = all.filter(i => i.startDate != null && i.dueDate != null).sort((a, b) => (a.startDate ?? 0) - (b.startDate ?? 0))
  const undated = all.filter(i => i.startDate == null || i.dueDate == null)

  const fromParam = ctx.query.get('from')
  const toParam = ctx.query.get('to')
  let rangeFrom: number
  let rangeTo: number
  if (fromParam && toParam) {
    rangeFrom = Number(fromParam)
    rangeTo = Number(toParam)
  } else if (items.length) {
    rangeFrom = Math.min(...items.map(i => i.startDate!)) - 7 * DAY
    rangeTo = Math.max(...items.map(i => i.dueDate!)) + 7 * DAY
  } else {
    rangeFrom = Date.now() - 14 * DAY
    rangeTo = Date.now() + 30 * DAY
  }

  return { rangeFrom, rangeTo, items, undated }
}
