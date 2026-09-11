import { http } from './http'
import type {
  NotificationResponse,
  NotificationSettingRequest,
  NotificationSettingResponse,
  UnreadCountResponse
} from '@/types/domain'

// Уведомления «без почты» — notifications.md §1–2. Всё in-app: лента колокольчика
// и опрос счётчика. Web Push и Telegram на сервере не реализованы.

export function listNotifications(params: { unread?: boolean; limit?: number } = {}) {
  const search = new URLSearchParams()
  if (params.unread) search.set('unread', 'true')
  if (params.limit) search.set('limit', String(params.limit))
  const qs = search.toString()
  return http.get<NotificationResponse[]>(`/notifications${qs ? `?${qs}` : ''}`)
}

/** Одно число для значка на колокольчике — один индексированный запрос. */
export function getUnreadCount() {
  return http.get<UnreadCountResponse>('/notifications/count')
}

export function markNotificationRead(id: number) {
  return http.put<void>(`/notifications/${id}/read`)
}

export function markAllNotificationsRead() {
  return http.put<void>('/notifications/read-all')
}

export function getNotificationSettings() {
  return http.get<NotificationSettingResponse[]>('/notifications/settings')
}

/** Возвращает полный обновлённый список настроек. */
export function updateNotificationSetting(type: string, payload: NotificationSettingRequest) {
  return http.put<NotificationSettingResponse[]>(`/notifications/settings/${type}`, payload)
}
