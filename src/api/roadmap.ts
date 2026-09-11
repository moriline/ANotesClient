import { http } from './http'
import type { RoadmapResponse } from '@/types/domain'

// GET /api/projects/{projectId}/roadmap — временная шкала эпиков проекта одним
// запросом (roadmap.md §3). from/to (ГГГГ-ММ-ДД) задают только край шкалы, эпики
// не фильтруют; без них сервер берёт мин/макс по эпикам ± неделя. 403 — не
// участник проекта; 400 — эпиков в проекте больше серверного предела.
export function getRoadmap(projectId: number, params: { from?: string; to?: string } = {}) {
  const search = new URLSearchParams()
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  const qs = search.toString()
  return http.get<RoadmapResponse>(`/projects/${projectId}/roadmap${qs ? `?${qs}` : ''}`)
}
