import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { clearTextDraft, readTextDraft, writeTextDraft } from '@/utils/drafts'

/**
 * Черновик для простого поля ввода (новый комментарий, комментарий к учёту
 * времени): текст пишется в localStorage по мере ввода и подставляется обратно
 * при повторном открытии задачи / перезагрузке. `restored` — момент, от
 * которого восстановлен черновик (для подписи «Черновик от …»), иначе null.
 *
 * `key` — функция, а не строка: на той же странице можно перейти к другой
 * задаче (тот же компонент, другой id) — тогда старый черновик дописывается, а
 * новый подтягивается.
 */
export function usePersistentDraft(key: () => string | null, model: Ref<string>) {
  const restored = ref<number | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let currentKey: string | null = null

  function flush() {
    clearTimeout(timer)
    if (!currentKey) return
    if (model.value.trim()) writeTextDraft(currentKey, model.value, '')
    else clearTextDraft(currentKey)
  }

  function load(k: string | null) {
    currentKey = k
    restored.value = null
    if (!k) return
    const d = readTextDraft(k)
    if (d?.value.trim()) {
      model.value = d.value
      restored.value = d.at
    }
  }

  watch(key, (k, prev) => {
    if (k === prev) return
    flush()
    model.value = ''
    load(k)
  })

  watch(model, () => {
    if (!model.value.trim()) restored.value = null
    clearTimeout(timer)
    timer = setTimeout(flush, 400)
  })

  onMounted(() => {
    load(key())
    window.addEventListener('pagehide', flush)
  })
  onBeforeUnmount(() => {
    flush()
    window.removeEventListener('pagehide', flush)
  })

  /** После успешной отправки: поле пустое, черновик стёрт. */
  function clear() {
    clearTimeout(timer)
    restored.value = null
    if (currentKey) clearTextDraft(currentKey)
  }

  return { restored, clear, flush }
}
