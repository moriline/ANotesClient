import { computed, type Ref } from 'vue'
import { isEpic } from '@/utils/taskType'
import type { TaskResponse } from '@/types/domain'

// Группировка списка задач по эпикам (tasks_view.md §5). Целиком на клиенте —
// данных в POST /api/find (parentId, parentTitle, taskType) хватает, прогресс
// и заголовки эпиков берём из GET /api/projects/{id}/epics.
//
// Отличия от tasks_view.md — следствие контракта API (openapi5.yaml):
//   • буквенного ключа (parentKey / EPIC-12) нет — показываем #id;
//   • дочерняя задача не несёт прогресс родителя — источник childTotal/childDone
//     только сам эпик, поэтому эпики передаём вторым аргументом.

export const ORPHAN_GROUP_ID = -1

export interface EpicGroup {
  /** id эпика либо ORPHAN_GROUP_ID для группы «Без эпика». */
  id: number
  /** Сам эпик (из справочника или выдачи); null — «Без эпика». */
  epic: TaskResponse | null
  title: string
  tasks: TaskResponse[]
  /** Сколько задач эпика в текущей выдаче (после фильтров). */
  visibleCount: number
  /** childTotal эпика; если неизвестен — равен visibleCount. */
  totalCount: number
  doneCount: number
  closed: boolean
  dueDate: number | null
  /** true — часть задач эпика отфильтрована/не в выдаче (visibleCount < totalCount). */
  partial: boolean
}

export function useEpicGrouping(
  tasks: Ref<TaskResponse[]>,
  epics: Ref<TaskResponse[]>
) {
  return computed<EpicGroup[]>(() => {
    // Авторитетный источник заголовка и прогресса — справочник эпиков проекта.
    // В самой выдаче эпики тоже могут быть (фильтр по виду) — сливаем.
    const epicById = new Map<number, TaskResponse>()
    for (const e of epics.value) epicById.set(e.id, e)
    for (const t of tasks.value) if (isEpic(t)) epicById.set(t.id, t)

    const byEpic = new Map<number, TaskResponse[]>()
    const orphans: TaskResponse[] = []
    for (const t of tasks.value) {
      if (isEpic(t)) continue
      if (t.parentId == null) {
        orphans.push(t)
        continue
      }
      const bucket = byEpic.get(t.parentId)
      if (bucket) bucket.push(t)
      else byEpic.set(t.parentId, [t])
    }

    const groups: EpicGroup[] = []

    const makeGroup = (id: number, epic: TaskResponse | null, list: TaskResponse[]): EpicGroup => {
      const known = epic?.childTotal != null
      const totalCount = known ? epic!.childTotal! : list.length
      return {
        id,
        epic,
        title: epic?.title ?? list[0]?.parentTitle ?? `Эпик #${id}`,
        tasks: list,
        visibleCount: list.length,
        totalCount,
        doneCount: epic?.childDone ?? 0,
        closed: epic?.epicClosed ?? false,
        dueDate: epic?.dueDate ?? null,
        partial: known && list.length < totalCount
      }
    }

    // 1) эпики, чьи задачи есть в выдаче
    for (const [epicId, list] of byEpic) {
      groups.push(makeGroup(epicId, epicById.get(epicId) ?? null, list))
    }
    // 2) эпики без задач в выдаче. Настоящий пустой эпик (childTotal === 0)
    //    показываем — иначе кажется, что он удалился. Эпик, у которого задачи
    //    есть, но все отсеяны фильтром, — прячем (tasks_view.md §2.2).
    for (const [epicId, epic] of epicById) {
      if (byEpic.has(epicId)) continue
      if ((epic.childTotal ?? 0) > 0) continue
      groups.push(makeGroup(epicId, epic, []))
    }

    groups.sort((a, b) => a.title.localeCompare(b.title, 'ru'))

    if (orphans.length) {
      groups.push({
        id: ORPHAN_GROUP_ID,
        epic: null,
        title: 'Без эпика',
        tasks: orphans,
        visibleCount: orphans.length,
        totalCount: orphans.length,
        doneCount: 0,
        closed: false,
        dueDate: null,
        partial: false
      })
    }
    return groups
  })
}
