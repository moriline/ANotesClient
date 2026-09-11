<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import HelpLink from '@/components/common/HelpLink.vue'
import WikiMarkdown from '@/components/wiki/WikiMarkdown.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { useConfirm } from '@/composables/useConfirm'
import { createWikiPage, getWikiPage, updateWikiPage } from '@/api/wiki'
import type { WikiPageUpdateRequest } from '@/types/domain'
import { ApiError } from '@/api/http'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{ projectId: string; pageId?: string }>()

const route = useRoute()
const router = useRouter()
const dictionaries = useDictionariesStore()
const toast = useToast()
const { confirm } = useConfirm()

const pid = computed(() => Number(props.projectId))
const pageIdNum = computed(() => {
  const n = Number(props.pageId)
  return props.pageId && Number.isInteger(n) ? n : undefined
})
const mode = computed<'create' | 'edit'>(() => (pageIdNum.value ? 'edit' : 'create'))

const form = reactive({
  title: typeof route.query.title === 'string' ? route.query.title : '',
  summary: '',
  content: '',
  comment: ''
})
const parentId = ref<number | undefined>(
  typeof route.query.parent === 'string' && Number.isInteger(Number(route.query.parent))
    ? Number(route.query.parent)
    : undefined
)

const original = reactive({ title: '', summary: '', content: '', comment: '' })
const loadedVersion = ref<number | null>(null)
const loadedParentId = ref<number | null>(null)
// Правка: у страницы не было своего описания (создана до появления поля) —
// показываем мягкую подсказку добавить, не блокируя сохранение.
const loadedSummaryMissing = ref(false)

const loading = ref(mode.value === 'edit')
const loadError = ref<string | null>(null)
const saving = ref(false)
const savedJustNow = ref(false)
const showPreview = ref(false)

const project = computed(() => dictionaries.projectById.get(pid.value))
const tree = computed(() => dictionaries.wikiTreeByProject[pid.value] ?? [])
const pageIndex = computed(() => {
  const map = new Map<string, number>()
  for (const n of tree.value) map.set(n.title.toLowerCase(), n.id)
  return map
})
const parentOptions = computed(() => [
  { label: '— Корневая страница —', value: undefined as number | undefined },
  ...tree.value
    .filter(n => n.parentId == null && n.id !== pageIdNum.value)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(n => ({ label: n.title, value: n.id as number | undefined }))
])
const loadedParentTitle = computed(() =>
  loadedParentId.value ? tree.value.find(n => n.id === loadedParentId.value)?.title ?? `#${loadedParentId.value}` : null
)

const titleTrimmed = computed(() => form.title.trim())
const summaryTrimmed = computed(() => form.summary.trim())
// Описание обязательно только при создании (сервер требует его на POST, но не
// на PUT). При правке пустое поле = «не трогать прежнее описание».
const summaryOk = computed(() =>
  mode.value === 'edit'
    ? summaryTrimmed.value.length <= 500
    : summaryTrimmed.value.length >= 1 && summaryTrimmed.value.length <= 500
)
const canSave = computed(() =>
  titleTrimmed.value.length > 0 && titleTrimmed.value.length <= 200 &&
  summaryOk.value && form.content.trim().length > 0
)
const isDirty = computed(() =>
  form.title !== original.title || form.summary !== original.summary ||
  form.content !== original.content || form.comment !== original.comment
)

// --- Черновик в sessionStorage (wiki.md §7.1) ----------------------------
const draftKey = computed(() => `wiki-draft:${props.projectId}:${props.pageId ?? 'new'}`)
type Draft = { title: string; summary: string; content: string; comment: string; at: number }
const pendingDraft = ref<Draft | null>(null)
let draftTimer: ReturnType<typeof setTimeout> | undefined

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey.value)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<Draft>
    return { title: d.title ?? '', summary: d.summary ?? '', content: d.content ?? '', comment: d.comment ?? '', at: d.at ?? 0 }
  } catch {
    return null
  }
}
function writeDraft() {
  try {
    sessionStorage.setItem(draftKey.value, JSON.stringify({ ...form, at: Date.now() }))
  } catch { /* приватный режим и т.п. — молча */ }
}
function clearDraft() {
  try { sessionStorage.removeItem(draftKey.value) } catch { /* ignore */ }
}
function restoreDraft() {
  if (!pendingDraft.value) return
  form.title = pendingDraft.value.title
  form.summary = pendingDraft.value.summary
  form.content = pendingDraft.value.content
  form.comment = pendingDraft.value.comment
  pendingDraft.value = null
}
function dismissDraft() {
  pendingDraft.value = null
  clearDraft()
}

watch(() => [form.title, form.summary, form.content, form.comment], () => {
  if (!isDirty.value) return
  clearTimeout(draftTimer)
  draftTimer = setTimeout(writeDraft, 1500)
})

// --- Загрузка ----------------------------------------------------------
function snapshot() {
  original.title = form.title
  original.summary = form.summary
  original.content = form.content
  original.comment = form.comment
}

async function load() {
  dictionaries.loadProjects().catch(() => {})
  dictionaries.loadWikiTree(pid.value).catch(() => {})

  if (mode.value === 'create') {
    snapshot()
    const d = readDraft()
    if (d && (d.title || d.summary || d.content)) pendingDraft.value = d
    return
  }

  loading.value = true
  loadError.value = null
  try {
    const p = await getWikiPage(pageIdNum.value!)
    form.title = p.title
    form.summary = p.summary ?? ''
    form.content = p.content
    form.comment = ''
    loadedVersion.value = p.version
    loadedParentId.value = p.parentId
    loadedSummaryMissing.value = p.summary == null
    snapshot()
    const d = readDraft()
    if (d && (d.title !== p.title || d.summary !== (p.summary ?? '') || d.content !== p.content)) pendingDraft.value = d
  } catch (e) {
    loadError.value = e instanceof ApiError && (e.status === 404 || e.status === 403)
      ? 'Страница не найдена или недоступна.'
      : 'Не удалось загрузить страницу.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => clearTimeout(draftTimer))

// --- Сохранение ------------------------------------------------------
function goToPage(id: number) {
  savedJustNow.value = true
  router.replace(`/projects/${pid.value}/wiki/${id}`)
}

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  try {
    if (mode.value === 'create') await doCreate()
    else await doUpdate()
  } finally {
    saving.value = false
  }
}

async function doCreate() {
  try {
    await createWikiPage(pid.value, {
      parentId: parentId.value ?? undefined,
      title: titleTrimmed.value,
      summary: summaryTrimmed.value,
      content: form.content,
      comment: form.comment.trim() || undefined
    })
    clearDraft()
    const nodes = await dictionaries.loadWikiTree(pid.value, true)
    const created = nodes.find(n => n.title.toLowerCase() === titleTrimmed.value.toLowerCase())
    toast.add({ title: 'Страница создана', color: 'primary' })
    if (created) goToPage(created.id)
    else { savedJustNow.value = true; router.replace(`/projects/${pid.value}/wiki`) }
  } catch (e) {
    toast.add({ title: 'Не удалось создать страницу', description: describe(e), color: 'error' })
  }
}

async function doUpdate() {
  const id = pageIdNum.value!
  const payload: WikiPageUpdateRequest = {
    title: titleTrimmed.value,
    // Пустую строку слать нельзя (400). Пусто → ключ не отправляем: сервер
    // трактует отсутствие поля как «описание не менять».
    summary: summaryTrimmed.value || undefined,
    content: form.content,
    comment: form.comment.trim() || undefined
  }
  try {
    const updated = await updateWikiPage(id, payload, loadedVersion.value ?? undefined)
    await applySaved(id, updated.version)
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      const overwrite = await confirm({
        title: 'Страницу изменил другой пользователь',
        description: 'Пока вы редактировали, страницу обновил кто-то ещё. Перезагрузить актуальную версию или перезаписать её вашим текстом?',
        confirmLabel: 'Перезаписать',
        cancelLabel: 'Перезагрузить',
        danger: true
      })
      if (overwrite) {
        try {
          const fresh = await getWikiPage(id)
          const updated = await updateWikiPage(id, payload, fresh.version)
          await applySaved(id, updated.version)
        } catch (err) {
          toast.add({ title: 'Не удалось перезаписать', description: describe(err), color: 'error' })
        }
      } else {
        await reloadFromServer()
      }
      return
    }
    toast.add({ title: 'Не удалось сохранить', description: describe(e), color: 'error' })
  }
}

async function applySaved(id: number, version: number) {
  loadedVersion.value = version
  snapshot()
  clearDraft()
  await dictionaries.loadWikiTree(pid.value, true)
  toast.add({ title: 'Изменения сохранены', color: 'primary' })
  goToPage(id)
}

async function reloadFromServer() {
  try {
    const p = await getWikiPage(pageIdNum.value!)
    form.title = p.title
    form.summary = p.summary ?? ''
    form.content = p.content
    loadedVersion.value = p.version
    loadedSummaryMissing.value = p.summary == null
    snapshot()
    clearDraft()
    toast.add({ title: 'Загружена актуальная версия', color: 'primary' })
  } catch (e) {
    toast.add({ title: 'Не удалось перезагрузить', description: describe(e), color: 'error' })
  }
}

function describe(e: unknown): string | undefined {
  return e instanceof ApiError ? e.message : undefined
}

function cancel() {
  if (mode.value === 'edit' && pageIdNum.value) router.push(`/projects/${pid.value}/wiki/${pageIdNum.value}`)
  else router.push(`/projects/${pid.value}/wiki`)
}

onBeforeRouteLeave(() => {
  if (savedJustNow.value || !isDirty.value) return true
  return confirm({
    title: 'Несохранённые изменения',
    description: 'Вы не сохранили страницу. Черновик останется в этой вкладке, но изменения не будут опубликованы. Уйти?',
    confirmLabel: 'Уйти',
    cancelLabel: 'Остаться',
    danger: true
  })
})
</script>

<template>
  <div>
    <PageHeader :title="mode === 'create' ? 'Новая страница' : 'Редактирование'" :subtitle="project?.name" :bordered="false">
      <template #actions>
        <HelpLink topic="wiki" hash="editor" label="Справка: редактор вики" />
      </template>
    </PageHeader>

    <div class="mx-auto w-[95%] px-6 pb-10">
      <EmptyState
        v-if="loadError"
        icon="i-lucide-file-question"
        title="Страница недоступна"
        :description="loadError"
      >
        <template #action>
          <UButton :to="`/projects/${pid}/wiki`" variant="outline" color="primary">К базе знаний</UButton>
        </template>
      </EmptyState>

      <div v-else-if="loading" class="flex flex-col gap-3">
        <USkeleton class="h-9 w-1/2" />
        <USkeleton class="h-72 w-full" />
      </div>

      <div v-else class="flex flex-col gap-4">
        <div
          v-if="pendingDraft"
          class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm"
        >
          <span>Найден несохранённый черновик от {{ formatDateTime(pendingDraft.at) }}.</span>
          <div class="flex gap-2">
            <UButton size="xs" color="warning" variant="soft" @click="restoreDraft">Восстановить</UButton>
            <UButton size="xs" variant="outline" color="primary" @click="dismissDraft">Отклонить</UButton>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted" for="wiki-title">Заголовок</label>
          <UInput
            id="wiki-title"
            v-model="form.title"
            size="lg"
            placeholder="Например, «Архитектура обмена»"
            :maxlength="200"
          />
          <p class="text-xs text-muted">
            Уникален в пределах проекта — по нему резолвятся ссылки <code>[[{{ form.title.trim() || 'Заголовок' }}]]</code>.
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between gap-2">
            <label class="text-xs font-medium text-muted" for="wiki-summary">
              Краткое описание<span v-if="mode === 'create'" class="text-error"> *</span>
            </label>
            <span class="text-xs tabular-nums" :class="form.summary.length > 500 ? 'text-error' : 'text-muted'">
              {{ form.summary.length }}/500
            </span>
          </div>
          <UTextarea
            id="wiki-summary"
            v-model="form.summary"
            autoresize
            :rows="2"
            :maxrows="4"
            :maxlength="500"
            placeholder="Одно предложение: как узлы синхронизируют состояние через манифест — формат, порядок, ошибки."
          />
          <p class="text-xs text-muted">
            Одно предложение о том, что на странице. Видно в дереве навигации и помогает ИИ-агенту найти нужную страницу.
          </p>
          <p
            v-if="mode === 'edit' && loadedSummaryMissing && !summaryTrimmed"
            class="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-default"
          >
            <UIcon name="i-lucide-info" class="mt-0.5 size-3.5 shrink-0 text-warning" />
            У страницы нет краткого описания — добавьте, чтобы её было легче найти в дереве и поиске. Сохранить можно и без него.
          </p>
        </div>

        <div v-if="mode === 'create'" class="flex flex-col gap-1.5 sm:max-w-sm">
          <label class="text-xs font-medium text-muted">Раздел</label>
          <USelectMenu
            v-model="parentId"
            :items="parentOptions"
            value-key="value"
            placeholder="— Корневая страница —"
          />
          <p class="text-xs text-muted">Вложенность — два уровня. Дочерние страницы нельзя сделать разделом.</p>
        </div>
        <div v-else class="text-xs text-muted">
          Раздел: <span class="text-default">{{ loadedParentTitle ?? 'корневая страница' }}</span> · переместить страницу по дереву нельзя.
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label class="text-xs font-medium text-muted" for="wiki-content">Содержимое</label>
            <UButton
              size="xs"
              variant="outline"
              color="primary"
              :icon="showPreview ? 'i-lucide-pencil' : 'i-lucide-eye'"
              @click="showPreview = !showPreview"
            >
              {{ showPreview ? 'Редактор' : 'Предпросмотр' }}
            </UButton>
          </div>
          <div class="grid gap-4" :class="showPreview ? 'lg:grid-cols-2' : ''">
            <UTextarea
              id="wiki-content"
              v-model="form.content"
              :rows="22"
              class="w-full font-mono text-sm"
              placeholder="Markdown. [[Заголовок]] — ссылка на страницу, #123 — на задачу."
            />
            <div v-if="showPreview" class="min-w-0 rounded-lg border border-default px-4 py-3">
              <WikiMarkdown :source="form.content" :project-id="pid" :page-index="pageIndex" />
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-1.5 sm:max-w-md">
          <label class="text-xs font-medium text-muted" for="wiki-comment">Комментарий к правке</label>
          <UInput id="wiki-comment" v-model="form.comment" placeholder="Что изменилось (необязательно)" :maxlength="300" />
        </div>

        <div class="sticky bottom-4 z-20 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default bg-elevated/95 px-4 py-3 shadow-lg backdrop-blur">
          <span class="text-sm text-muted">
            <template v-if="form.summary.length > 500">Краткое описание — не больше 500 символов</template>
            <template v-else-if="!canSave">
              {{ mode === 'create' ? 'Заголовок, краткое описание и содержимое обязательны' : 'Заголовок и содержимое обязательны' }}
            </template>
            <template v-else-if="isDirty">Есть несохранённые изменения</template>
            <template v-else>Изменений нет</template>
          </span>
          <div class="flex gap-2">
            <UButton variant="outline" color="primary" :disabled="saving" @click="cancel">Отмена</UButton>
            <UButton color="primary" :loading="saving" :disabled="!canSave || (mode === 'edit' && !isDirty)" @click="save">
              {{ mode === 'create' ? 'Создать страницу' : 'Сохранить' }}
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
