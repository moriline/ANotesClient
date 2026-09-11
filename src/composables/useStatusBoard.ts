import { computed, type Ref } from 'vue'
import { isEpic } from '@/utils/taskType'
import type { ProjectStatusResponse, TaskResponse } from '@/types/domain'

// Доска задач по статусам (status_view.md). Третий режим списка задач рядом с
// плоской таблицей и группировкой по эпикам: колонки — статусы проекта в порядке
// statusOrder, карточки — задачи в колонке своего statusId.
//
// Целиком на клиенте, серверных изменений не требует (status_view.md §7): и
// колонки (GET /api/project-statuses/project/{id}), и карточки (POST /api/find
// постранично, как режим «по эпикам») сервер уже отдаёт.

// id служебной колонки «Без статуса». Отрицательный — не столкнётся с реальным.
export const NO_STATUS_COLUMN_ID = -1

// Закрывающая колонка через полгода — тысяча карточек, которые никто не листает
// (status_view.md §3.1). Показываем верхушку по дате изменения, а счётчик пишем
// честно: «50 из 347».
const CLOSED_COLUMN_LIMIT = 50

export interface BoardColumn {
  status: ProjectStatusResponse
  cards: TaskResponse[]
  /** Всего задач в колонке; у закрывающей может быть больше, чем в cards. */
  total: number
  /** Служебная колонка «Без статуса»: карточку можно унести, принести — нельзя. */
  synthetic: boolean
}

function byDueAsc(a: TaskResponse, b: TaskResponse) {
  // По сроку, по возрастанию; задачи без срока — в конец колонки (status_view.md §4).
  const da = a.dueDate ?? Number.POSITIVE_INFINITY
  const db = b.dueDate ?? Number.POSITIVE_INFINITY
  return da - db || a.id - b.id
}

function byUpdatedDesc(a: TaskResponse, b: TaskResponse) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id - a.id
}

export function useStatusBoard(
  statuses: Ref<ProjectStatusResponse[]>,
  cards: Ref<TaskResponse[]>
) {
  return computed<BoardColumn[]>(() => {
    // Эпик — контейнер, а не работа: у него statusId === null и на доске ему
    // не место (status_view.md §3.2). Его начинка видна карточками дочерних задач.
    const tasks = cards.value.filter(t => !isEpic(t))
    const visible = statuses.value.filter(s => !s.isHidden)

    const columns: BoardColumn[] = visible.map(status => {
      const own = tasks.filter(t => t.statusId === status.id)
      if (status.isClosed) {
        const sorted = [...own].sort(byUpdatedDesc)
        return {
          status,
          cards: sorted.slice(0, CLOSED_COLUMN_LIMIT),
          total: sorted.length,
          synthetic: false
        }
      }
      return { status, cards: [...own].sort(byDueAsc), total: own.length, synthetic: false }
    })

    // statusId === null — задачи из проектов, заведённых до статусов по умолчанию.
    // Молча выпасть из доски они не должны (status_view.md §5): служебная колонка
    // в самом конце, из неё карточку можно перетащить в нормальный статус.
    const orphans = tasks.filter(t => t.statusId == null)
    if (orphans.length) {
      columns.push({
        status: {
          id: NO_STATUS_COLUMN_ID,
          projectId: visible[0]?.projectId ?? 0,
          statusName: 'Без статуса',
          statusColor: null,
          statusOrder: Number.MAX_SAFE_INTEGER,
          isDefault: false,
          isClosed: false,
          isHidden: false
        },
        cards: [...orphans].sort(byDueAsc),
        total: orphans.length,
        synthetic: true
      })
    }

    return columns
  })
}
