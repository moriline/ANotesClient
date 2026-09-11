import { onMounted, onUnmounted } from 'vue'
import { router } from '@/router'
import { commandPaletteOpen, createTaskModalOpen, focusSearchSignal } from './useGlobalUi'

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function useShortcuts() {
  function handler(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey
    if (meta && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      commandPaletteOpen.value = !commandPaletteOpen.value
      return
    }
    if (e.key === 'Escape' && commandPaletteOpen.value) {
      commandPaletteOpen.value = false
      return
    }
    if (isTypingTarget(e.target)) return
    // Не перехватываем комбинации с Ctrl/Cmd/Alt — иначе Ctrl+C (копирование)
    // открывал бы модалку новой задачи и блокировал буфер обмена.
    if (meta || e.altKey) return
    if (e.key === 'c') {
      e.preventDefault()
      createTaskModalOpen.value = true
    } else if (e.key === '/') {
      e.preventDefault()
      focusSearchSignal.value++
    } else if (e.key === '?') {
      // Shift+/ — открыть справку (не трогаем, если уже на ней).
      e.preventDefault()
      if (router.currentRoute.value.name !== 'help') router.push('/help')
    }
  }

  onMounted(() => window.addEventListener('keydown', handler))
  onUnmounted(() => window.removeEventListener('keydown', handler))
}
