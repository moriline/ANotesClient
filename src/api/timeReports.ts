import { http } from './http'
import type { ProjectTimeReportResponse, TimeReportResponse } from '@/types/domain'

// GET /api/reports/time — отчёт по одному пользователю (по умолчанию — по себе).
// Окно: year (по умолчанию текущий), month 1–12 (не задан → весь год).
export function getTimeReport(params: { month?: number; year?: number; userId?: number } = {}) {
  const search = new URLSearchParams()
  if (params.month) search.set('month', String(params.month))
  if (params.year) search.set('year', String(params.year))
  if (params.userId) search.set('userId', String(params.userId))
  const qs = search.toString()
  return http.get<TimeReportResponse>(`/reports/time${qs ? `?${qs}` : ''}`)
}

// GET /api/reports/time/project/{projectId} — сводка по времени всей команды
// на проект (byUser). Доступен любому участнику проекта; 403 — если не участник.
export function getProjectTimeReport(projectId: number, params: { month?: number; year?: number } = {}) {
  const search = new URLSearchParams()
  if (params.month) search.set('month', String(params.month))
  if (params.year) search.set('year', String(params.year))
  const qs = search.toString()
  return http.get<ProjectTimeReportResponse>(`/reports/time/project/${projectId}${qs ? `?${qs}` : ''}`)
}
