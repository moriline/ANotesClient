<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MentionTextarea from '@/components/common/MentionTextarea.vue'
import type { MentionUser } from '@/utils/mentions'

const props = withDefaults(defineProps<{
  modelValue: string
  multiline?: boolean
  placeholder?: string
  confirmLabel?: string
  /** Если передан и multiline — редактор с автодополнением упоминаний. */
  mentionMembers?: MentionUser[]
  /**
   * Ключ в sessionStorage для черновика (task_edit_2.md). Пока идёт правка,
   * несохранённый текст пишется туда раз в секунду; при возврате на страницу
   * появляется строка «Есть несохранённый черновик — Восстановить / Отбросить».
   * Без диалогов и beforeunload.
   */
  draftKey?: string
}>(), {
  multiline: false,
  placeholder: 'Без значения',
  confirmLabel: 'Сохранить'
})

const emit = defineEmits<{ save: [value: string] }>()

const editing = ref(false)
const draft = ref(props.modelValue)

watch(() => props.modelValue, (v) => { if (!editing.value) draft.value = v })

// --- Черновик в sessionStorage --------------------------------------------
const storedDraft = ref<{ value: string; at: number } | null>(null)
let draftTimer: ReturnType<typeof setTimeout> | undefined

function readStoredDraft(): { value: string; at: number } | null {
  if (!props.draftKey) return null
  try {
    const raw = sessionStorage.getItem(props.draftKey)
    return raw ? JSON.parse(raw) as { value: string; at: number } : null
  } catch {
    return null
  }
}
function writeStoredDraft() {
  if (!props.draftKey) return
  try {
    sessionStorage.setItem(props.draftKey, JSON.stringify({ value: draft.value, at: Date.now() }))
  } catch {
    // приватный режим / переполнение — молча
  }
}
function clearStoredDraft() {
  storedDraft.value = null
  if (!props.draftKey) return
  try {
    sessionStorage.removeItem(props.draftKey)
  } catch {
    // ignore
  }
}

onMounted(() => {
  const d = readStoredDraft()
  if (d && d.value !== props.modelValue) storedDraft.value = d
})
onBeforeUnmount(() => {
  clearTimeout(draftTimer)
  // уход со страницы посреди правки — дописываем черновик, чтобы не потерять
  if (editing.value && props.draftKey && draft.value !== props.modelValue) writeStoredDraft()
})

watch(draft, () => {
  if (!editing.value || !props.draftKey) return
  clearTimeout(draftTimer)
  draftTimer = setTimeout(writeStoredDraft, 1000)
})

function start() {
  draft.value = props.modelValue
  editing.value = true
}

function restoreDraft() {
  if (!storedDraft.value) return
  draft.value = storedDraft.value.value
  storedDraft.value = null
  editing.value = true
}

function cancel() {
  editing.value = false
  draft.value = props.modelValue
  clearTimeout(draftTimer)
  clearStoredDraft()
}

function save() {
  editing.value = false
  clearTimeout(draftTimer)
  clearStoredDraft()
  if (draft.value !== props.modelValue) emit('save', draft.value)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    cancel()
  } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    save()
  } else if (e.key === 'Enter' && !props.multiline) {
    save()
  }
}

function draftTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div v-if="!editing">
    <div
      v-if="storedDraft"
      class="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs"
    >
      <span class="text-muted">Несохранённый черновик от {{ draftTime(storedDraft.at) }}</span>
      <button type="button" class="font-medium text-primary hover:underline" @click="restoreDraft">
        Восстановить
      </button>
      <button type="button" class="text-muted hover:text-highlighted" @click="clearStoredDraft">
        Отбросить
      </button>
    </div>
    <div class="-mx-1 cursor-text rounded-md px-1 hover:bg-elevated/60" @click="start">
      <slot :value="modelValue">
        <span :class="!modelValue && 'italic text-muted'">{{ modelValue || placeholder }}</span>
      </slot>
    </div>
  </div>
  <div v-else class="flex flex-col gap-2" @keydown="onKeydown">
    <MentionTextarea
      v-if="multiline && mentionMembers"
      v-model="draft"
      :members="mentionMembers"
      :rows="4"
      autofocus
    />
    <UTextarea v-else-if="multiline" v-model="draft" autofocus :rows="4" class="w-full" />
    <UInput v-else v-model="draft" autofocus class="w-full" />
    <div class="flex gap-2">
      <UButton size="xs" color="primary" @click="save">{{ confirmLabel }}</UButton>
      <UButton size="xs" variant="outline" color="primary" @click="cancel">Отмена</UButton>
    </div>
  </div>
</template>
