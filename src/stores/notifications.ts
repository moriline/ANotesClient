import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '@/api/notifications'
import { findTasks } from '@/api/tasks'
import { useAuthStore } from '@/stores/auth'
import type { NotificationResponse } from '@/types/domain'

// Опрос счётчика — вариант по умолчанию из notifications.md §2: один
// индексированный запрос раз в 45 с, плюс мгновенное обновление при возврате
// во вкладку (иначе после переключения окна счётчик отстаёт на 45 с).
const POLL_MS = 45_000
const LIST_LIMIT = 20

export const useNotificationsStore = defineStore('notifications', () => {
  const unread = ref(0)
  const items = ref<NotificationResponse[]>([])
  const loadingList = ref(false)
  // taskId → projectId: у NotificationResponse projectId нет, а маршрут задачи
  // требует оба. Резолвим одним POST /api/find (ручки «задача по id» в API нет).
  const taskProjectById = ref<Map<number, number>>(new Map())

  let timer: ReturnType<typeof setInterval> | null = null
  let started = false

  async function refreshCount() {
    const auth = useAuthStore()
    if (!auth.isAuthenticated) return
    try {
      unread.value = (await getUnreadCount()).unread
    } catch {
      /* счётчик не критичен — молчим */
    }
  }

  async function loadList() {
    const auth = useAuthStore()
    if (!auth.isAuthenticated) return
    loadingList.value = true
    try {
      items.value = await listNotifications({ limit: LIST_LIMIT })
      await resolveTaskProjects()
    } catch {
      /* оставляем прежний список */
    } finally {
      loadingList.value = false
    }
  }

  async function resolveTaskProjects() {
    const need = items.value.some(n => n.taskId != null && !taskProjectById.value.has(n.taskId))
    if (!need) return
    try {
      const res = await findTasks({ limit: 200 })
      const next = new Map(taskProjectById.value)
      for (const t of res.tasks ?? []) {
        if (t.id != null && t.projectId != null) next.set(t.id, t.projectId)
      }
      taskProjectById.value = next
    } catch {
      /* без резолва строка просто не откроет задачу */
    }
  }

  function projectForTask(taskId: number | null): number | undefined {
    return taskId == null ? undefined : taskProjectById.value.get(taskId)
  }

  async function markRead(id: number) {
    const target = items.value.find(n => n.id === id)
    if (target && !target.read) {
      target.read = true
      unread.value = Math.max(0, unread.value - 1)
    }
    try {
      await markNotificationRead(id)
    } catch {
      refreshCount()
    }
  }

  async function markAllRead() {
    for (const n of items.value) n.read = true
    unread.value = 0
    try {
      await markAllNotificationsRead()
    } catch {
      refreshCount()
    }
  }

  function start() {
    if (started) return
    started = true
    refreshCount()
    timer = setInterval(refreshCount, POLL_MS)
    document.addEventListener('visibilitychange', onVisibility)
  }

  function stop() {
    started = false
    if (timer) { clearInterval(timer); timer = null }
    document.removeEventListener('visibilitychange', onVisibility)
  }

  function onVisibility() {
    if (!document.hidden) refreshCount()
  }

  function reset() {
    unread.value = 0
    items.value = []
    taskProjectById.value = new Map()
  }

  const hasUnread = computed(() => unread.value > 0)

  return {
    unread,
    items,
    loadingList,
    hasUnread,
    refreshCount,
    loadList,
    projectForTask,
    markRead,
    markAllRead,
    start,
    stop,
    reset
  }
})
