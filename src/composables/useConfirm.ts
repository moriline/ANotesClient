import { reactive } from 'vue'

interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface ConfirmState extends Required<ConfirmOptions> {
  open: boolean
  resolve?: (value: boolean) => void
}

export const confirmState = reactive<ConfirmState>({
  open: false,
  title: '',
  description: '',
  confirmLabel: 'Удалить',
  cancelLabel: 'Отмена',
  danger: true
})

export function useConfirm() {
  function confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise(resolve => {
      confirmState.open = true
      confirmState.title = options.title
      confirmState.description = options.description ?? ''
      confirmState.confirmLabel = options.confirmLabel ?? 'Удалить'
      confirmState.cancelLabel = options.cancelLabel ?? 'Отмена'
      confirmState.danger = options.danger ?? true
      confirmState.resolve = resolve
    })
  }
  return { confirm }
}

export function resolveConfirm(value: boolean) {
  confirmState.open = false
  confirmState.resolve?.(value)
  confirmState.resolve = undefined
}
