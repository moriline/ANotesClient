<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MentionTextarea from '@/components/common/MentionTextarea.vue'
import type { MentionUser } from '@/utils/mentions'
import {
  DRAFT_FILE_SCHEME,
  clearTextDraft,
  deleteDraftFile,
  draftFileMarkdown,
  listDraftFiles,
  putDraftFile,
  readTextDraft,
  writeTextDraft,
  type DraftFile
} from '@/utils/drafts'

const props = withDefaults(defineProps<{
  modelValue: string
  multiline?: boolean
  placeholder?: string
  confirmLabel?: string
  /** Если передан и multiline — редактор с автодополнением упоминаний. */
  mentionMembers?: MentionUser[]
  /**
   * Ключ черновика (todo «Сохранение таски», как в Trello). Пока идёт правка,
   * текст пишется в localStorage по мере ввода — переживает и перезагрузку, и
   * закрытие вкладки. При возврате на страницу поле само открывается в режиме
   * правки с восстановленным текстом; видит его только этот пользователь в этом
   * браузере, всем остальным он станет виден после «Сохранить».
   */
  draftKey?: string
  /**
   * Загрузка файла на сервер → URL для markdown-ссылки. Если задан (и есть
   * draftKey), в редакторе появляется «Прикрепить файл»: файл кладётся в
   * черновик (IndexedDB), а на сервер уходит только по «Сохранить» — вместе с
   * текстом, ссылка в тексте подменяется на настоящую.
   */
  uploadFile?: (file: File) => Promise<string>
  /**
   * Сохранение. Может быть async; вернул false — значит не сохранилось:
   * редактор остаётся открытым, черновик не стирается.
   */
  onSave?: (value: string) => unknown
}>(), {
  multiline: false,
  placeholder: 'Без значения',
  confirmLabel: 'Сохранить'
})

const editing = ref(false)
const draft = ref(props.modelValue)
// Значение с сервера на момент начала правки: если за это время его поменял
// кто-то другой, «Сохранить» перезапишет — предупреждаем заранее.
const base = ref(props.modelValue)
const saving = ref(false)
const focusOnOpen = ref(true)
/** Момент, от которого восстановлен черновик (для подписи), иначе null. */
const restoredAt = ref<number | null>(null)
/** Черновик есть, но редактор свёрнут (Esc) — показываем плашку. */
const parkedDraft = ref<{ value: string; at: number } | null>(null)
const pendingFiles = ref<DraftFile[]>([])

watch(() => props.modelValue, (v) => { if (!editing.value) draft.value = v })

const changedElsewhere = computed(() => editing.value && !!props.draftKey && base.value !== props.modelValue)
const canAttach = computed(() => !!props.uploadFile && !!props.draftKey && props.multiline)

// --- Черновик -------------------------------------------------------------
let draftTimer: ReturnType<typeof setTimeout> | undefined

function hasUnsaved(): boolean {
  return draft.value !== props.modelValue || pendingFiles.value.length > 0
}

function writeStoredDraft() {
  clearTimeout(draftTimer)
  if (!props.draftKey || !editing.value) return
  if (hasUnsaved()) writeTextDraft(props.draftKey, draft.value, base.value)
  else clearTextDraft(props.draftKey)
}

async function clearStoredDraft() {
  clearTimeout(draftTimer)
  parkedDraft.value = null
  restoredAt.value = null
  if (!props.draftKey) return
  clearTextDraft(props.draftKey)
  const files = pendingFiles.value.length ? pendingFiles.value : await listDraftFiles(props.draftKey)
  pendingFiles.value = []
  await Promise.all(files.map(f => deleteDraftFile(f.id)))
}

onMounted(async () => {
  window.addEventListener('pagehide', writeStoredDraft)
  if (!props.draftKey) return
  const d = readTextDraft(props.draftKey)
  const files = canAttach.value ? await listDraftFiles(props.draftKey) : []
  if ((d && d.value !== props.modelValue) || files.length) {
    // Восстанавливаем сразу в режиме правки — пользователь видит свой текст
    // там же, где его оставил, без лишнего «Восстановить».
    draft.value = d?.value ?? props.modelValue
    base.value = d?.base ?? props.modelValue
    pendingFiles.value = files
    restoredAt.value = d?.at ?? files[0]?.at ?? Date.now()
    focusOnOpen.value = false
    editing.value = true
  } else if (d) {
    clearTextDraft(props.draftKey)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', writeStoredDraft)
  writeStoredDraft()
})

watch(draft, () => {
  if (!editing.value || !props.draftKey) return
  clearTimeout(draftTimer)
  draftTimer = setTimeout(writeStoredDraft, 400)
})

function start() {
  draft.value = props.modelValue
  base.value = props.modelValue
  focusOnOpen.value = true
  editing.value = true
}

function resumeDraft() {
  if (!parkedDraft.value) return
  draft.value = parkedDraft.value.value
  restoredAt.value = parkedDraft.value.at
  parkedDraft.value = null
  focusOnOpen.value = true
  editing.value = true
}

/** «Отмена» — явный отказ: черновик и прикреплённые к нему файлы стираются. */
function cancel() {
  editing.value = false
  draft.value = props.modelValue
  void clearStoredDraft()
}

/** Esc — только свернуть: черновик остаётся, над полем плашка «Продолжить». */
function collapse() {
  if (!props.draftKey || !hasUnsaved()) return cancel()
  writeStoredDraft()
  parkedDraft.value = { value: draft.value, at: Date.now() }
  editing.value = false
}

async function save() {
  if (saving.value) return
  if (!hasUnsaved()) {
    editing.value = false
    void clearStoredDraft()
    return
  }
  saving.value = true
  try {
    // Файлы черновика — на сервер по одному; после каждого ссылка в тексте
    // сразу подменяется на настоящую и черновик дописывается, так что при
    // сбое посередине уже загруженное повторно не уйдёт.
    for (const f of [...pendingFiles.value]) {
      const token = `${DRAFT_FILE_SCHEME}${f.id}`
      if (draft.value.includes(token) && props.uploadFile) {
        const url = await props.uploadFile(new File([f.blob], f.name, { type: f.type }))
        draft.value = draft.value.split(token).join(url)
        writeStoredDraft()
      }
      await deleteDraftFile(f.id)
      pendingFiles.value = pendingFiles.value.filter(p => p.id !== f.id)
    }
    const value = draft.value
    if (value !== props.modelValue) {
      const ok = await props.onSave?.(value)
      if (ok === false) return
    }
    editing.value = false
    void clearStoredDraft()
  } catch {
    // ошибку загрузки показывает uploadFile; редактор и черновик остаются
  } finally {
    saving.value = false
  }
}

// --- Файлы черновика ------------------------------------------------------
const fileInput = ref<HTMLInputElement | null>(null)

async function attach(files: Iterable<File>) {
  if (!props.draftKey) return
  for (const file of files) {
    const entry = await putDraftFile(props.draftKey, file)
    pendingFiles.value = [...pendingFiles.value, entry]
    const md = draftFileMarkdown(entry)
    draft.value = draft.value && !draft.value.endsWith('\n') ? `${draft.value}\n${md}` : `${draft.value}${md}`
  }
  writeStoredDraft()
}

async function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) await attach([...input.files])
  input.value = ''
}

function onPaste(e: ClipboardEvent) {
  if (!canAttach.value) return
  const files = [...(e.clipboardData?.files ?? [])]
  if (!files.length) return
  e.preventDefault()
  void attach(files)
}

function onDrop(e: DragEvent) {
  if (!canAttach.value) return
  const files = [...(e.dataTransfer?.files ?? [])]
  if (!files.length) return
  e.preventDefault()
  void attach(files)
}

async function removePending(f: DraftFile) {
  await deleteDraftFile(f.id)
  pendingFiles.value = pendingFiles.value.filter(p => p.id !== f.id)
  draft.value = draft.value.split(draftFileMarkdown(f)).join('')
  writeStoredDraft()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    collapse()
  } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    void save()
  } else if (e.key === 'Enter' && !props.multiline) {
    void save()
  }
}

function draftTime(ts: number): string {
  const d = new Date(ts)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fileSize(n: number): string {
  if (n < 1024) return `${n} Б`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`
  return `${(n / 1024 / 1024).toFixed(1)} МБ`
}
</script>

<template>
  <div v-if="!editing">
    <div
      v-if="parkedDraft"
      class="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs"
    >
      <span class="text-muted">Несохранённый черновик от {{ draftTime(parkedDraft.at) }} — виден только вам</span>
      <button type="button" class="font-medium text-primary hover:underline" @click="resumeDraft">
        Продолжить
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
  <div
    v-else
    class="flex flex-col gap-2"
    @keydown="onKeydown"
    @paste="onPaste"
    @dragover.prevent
    @drop="onDrop"
  >
    <div
      v-if="restoredAt"
      class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs"
    >
      <UIcon name="i-lucide-file-pen-line" class="size-3.5 text-warning" />
      <span class="text-muted">
        Восстановлен несохранённый черновик от {{ draftTime(restoredAt) }}. Его видите только вы —
        нажмите «{{ confirmLabel }}», чтобы он стал виден всем.
      </span>
    </div>
    <div
      v-if="changedElsewhere"
      class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-error/40 bg-error/10 px-2.5 py-1.5 text-xs"
    >
      <UIcon name="i-lucide-triangle-alert" class="size-3.5 text-error" />
      <span class="text-muted">Пока вы правили, это поле изменил кто-то другой. «{{ confirmLabel }}» перезапишет его вашим текстом.</span>
      <button type="button" class="font-medium text-primary hover:underline" @click="base = modelValue">
        Понятно
      </button>
    </div>
    <MentionTextarea
      v-if="multiline && mentionMembers"
      v-model="draft"
      :members="mentionMembers"
      :rows="8"
      :autofocus="focusOnOpen"
    />
    <UTextarea v-else-if="multiline" v-model="draft" :autofocus="focusOnOpen" :rows="4" class="w-full" />
    <UInput v-else v-model="draft" :autofocus="focusOnOpen" class="w-full" />
    <div v-if="pendingFiles.length" class="flex flex-col gap-1">
      <div
        v-for="f in pendingFiles"
        :key="f.id"
        class="flex items-center justify-between gap-2 rounded-md border border-dashed border-default px-2.5 py-1 text-xs"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          <UIcon :name="f.type.startsWith('image/') ? 'i-lucide-image' : 'i-lucide-paperclip'" class="size-3.5 shrink-0 text-muted" />
          <span class="truncate">{{ f.name }}</span>
          <span class="shrink-0 text-dimmed">{{ fileSize(f.size) }} · загрузится при сохранении</span>
        </span>
        <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" title="Убрать файл" @click="removePending(f)" />
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <UButton size="xs" color="primary" :loading="saving" @click="save">{{ confirmLabel }}</UButton>
      <UButton size="xs" variant="outline" color="primary" :disabled="saving" @click="cancel">Отмена</UButton>
      <template v-if="canAttach">
        <input ref="fileInput" type="file" multiple class="hidden" @change="onFilePicked">
        <UButton
          size="xs"
          icon="i-lucide-paperclip"
          variant="outline"
          color="primary"
          :disabled="saving"
          @click="fileInput?.click()"
        >
          Прикрепить файл
        </UButton>
      </template>
      <span v-if="draftKey" class="text-xs text-dimmed">Черновик сохраняется автоматически</span>
    </div>
  </div>
</template>
