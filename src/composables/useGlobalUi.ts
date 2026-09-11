import { ref } from 'vue'

export const commandPaletteOpen = ref(false)
export const createTaskModalOpen = ref(false)
export const focusSearchSignal = ref(0)
/** Увеличивается при любом изменении задач, чтобы открытые списки могли перезагрузиться. */
export const tasksVersion = ref(0)

export function bumpTasksVersion() {
  tasksVersion.value++
}

export function useGlobalUi() {
  return { commandPaletteOpen, createTaskModalOpen, focusSearchSignal, tasksVersion }
}
