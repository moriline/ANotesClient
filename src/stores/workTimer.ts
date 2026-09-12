import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'

// Таймер работы — чисто клиентская механика (без сервера и API): секундомер
// идёт в браузере, в API попадает только итог через уже существующий
// POST /api/tasks/{id}/time (logTime), как при ручном логировании. Состояние
// живёт в localStorage, а не только в памяти — обновление страницы или переход
// между разделами не должны сбрасывать идущий отсчёт.
const STORAGE_KEY = 'taskmind.workTimer'

interface StoredTimer {
  taskId: number
  projectId: number
  taskTitle: string
  // Секунды, накопленные до текущего отрезка (между стартом/паузами).
  accumulatedSeconds: number
  // Когда начался текущий отрезок — null, если на паузе.
  runningSince: number | null
  // Момент самого первого запуска — не сбрасывается паузой/возобновлением,
  // уходит в TimeEntryRequest.startTime при логировании.
  startedAt: number
}

function load(): StoredTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as StoredTimer : null
  } catch {
    return null
  }
}

function persist(value: StoredTimer | null) {
  if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  else localStorage.removeItem(STORAGE_KEY)
}

export interface TimerTaskRef {
  id: number
  projectId: number
  title: string
}

export const useWorkTimerStore = defineStore('workTimer', () => {
  const active = ref<StoredTimer | null>(load())
  // Тикает раз в секунду, пока таймер запущен, чтобы elapsedSeconds обновлялся
  // в интерфейсе — сам по себе не хранится и не персистится.
  const tick = ref(0)
  let intervalId: ReturnType<typeof setInterval> | undefined

  // Модалка «записать/сбросить» при остановке или переключении на другую
  // задачу, пока эта работает — единственный экран, куда стор ведёт UI.
  const logModalOpen = ref(false)
  const pendingStart = ref<TimerTaskRef | null>(null)

  function ensureTicking() {
    if (intervalId || !active.value?.runningSince) return
    intervalId = setInterval(() => { tick.value++ }, 1000)
  }
  function stopTicking() {
    clearInterval(intervalId)
    intervalId = undefined
  }
  ensureTicking()
  onScopeDispose(stopTicking)

  const elapsedSeconds = computed(() => {
    void tick.value
    if (!active.value) return 0
    const running = active.value.runningSince ? (Date.now() - active.value.runningSince) / 1000 : 0
    return active.value.accumulatedSeconds + running
  })
  const isRunning = computed(() => !!active.value?.runningSince)

  function doStart(task: TimerTaskRef) {
    const now = Date.now()
    active.value = {
      taskId: task.id,
      projectId: task.projectId,
      taskTitle: task.title,
      accumulatedSeconds: 0,
      runningSince: now,
      startedAt: now
    }
    persist(active.value)
    ensureTicking()
  }

  function pause() {
    if (!active.value?.runningSince) return
    active.value.accumulatedSeconds += (Date.now() - active.value.runningSince) / 1000
    active.value.runningSince = null
    persist(active.value)
    stopTicking()
  }

  function resume() {
    if (!active.value || active.value.runningSince) return
    active.value.runningSince = Date.now()
    persist(active.value)
    ensureTicking()
  }

  function clear() {
    active.value = null
    persist(null)
    stopTicking()
  }

  // Запустить таймер по задаче. Если уже идёт таймер по ДРУГОЙ задаче — не
  // подменяем его тихо (потеряли бы отсчёт), а сначала замораживаем и просим
  // записать/сбросить через модалку; новый таймер стартует после этого.
  function requestStart(task: TimerTaskRef) {
    if (!active.value) { doStart(task); return }
    if (active.value.taskId === task.id) { resume(); return }
    pause()
    pendingStart.value = task
    logModalOpen.value = true
  }

  function requestStop() {
    if (!active.value) return
    pause()
    pendingStart.value = null
    logModalOpen.value = true
  }

  // Вызывается модалкой после того, как текущий таймер записан или сброшен.
  function resolveModal() {
    logModalOpen.value = false
    if (pendingStart.value) {
      const next = pendingStart.value
      pendingStart.value = null
      doStart(next)
    }
  }

  // Отмена в модалке: закрыть, ничего не логировать и не запускать — старый
  // таймер остаётся как есть (на паузе, если это было переключение).
  function cancelModal() {
    logModalOpen.value = false
    pendingStart.value = null
  }

  return {
    active,
    elapsedSeconds,
    isRunning,
    logModalOpen,
    pendingStart,
    requestStart,
    requestStop,
    pause,
    resume,
    clear,
    resolveModal,
    cancelModal
  }
})
