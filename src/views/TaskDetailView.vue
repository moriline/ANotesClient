<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import NotFoundView from '@/views/NotFoundView.vue'
import MarkdownView from '@/components/common/MarkdownView.vue'
import InlineEdit from '@/components/common/InlineEdit.vue'
import RelativeTime from '@/components/common/RelativeTime.vue'
import AgentBadge from '@/components/common/AgentBadge.vue'
import MentionTextarea from '@/components/common/MentionTextarea.vue'
import EditorHint from '@/components/common/EditorHint.vue'
import HelpLink from '@/components/common/HelpLink.vue'
import StatusBadge from '@/components/task/StatusBadge.vue'
import TagList from '@/components/task/TagList.vue'
import EpicProgress from '@/components/task/EpicProgress.vue'
import EpicTaskList from '@/components/task/EpicTaskList.vue'
import ProjectFormModal from '@/components/project/ProjectFormModal.vue'
import { useDictionariesStore } from '@/stores/dictionaries'
import { useAuthStore } from '@/stores/auth'
import { useConfirm } from '@/composables/useConfirm'
import { bumpTasksVersion } from '@/composables/useGlobalUi'
import { getTask, updateTask, deleteTask, createTask, setTaskParent, convertTask } from '@/api/tasks'
import { setTaskMilestone } from '@/api/milestones'
import { isEpic as isEpicTask } from '@/utils/taskType'
import { listTaskComments, createComment, updateComment, deleteComment } from '@/api/comments'
import { listTaskActivity } from '@/api/activity'
import { listTaskFiles, uploadTaskFile, deleteFile, downloadFile, fetchFileObjectUrl, fetchFileText } from '@/api/files'
import { getTaskSummary, updateTaskSummary } from '@/api/taskSummary'
import { getTaskTotalSeconds, listTimeEntries, logTime, deleteTimeEntry } from '@/api/timeEntries'
import { getTaskWikiPages } from '@/api/wiki'
import { ApiError } from '@/api/http'
import { formatDate, formatDuration, initials } from '@/utils/format'
import { resolveMentions, type MentionUser } from '@/utils/mentions'
import type { ActivityResponse, CommentResponse, FileResponse, TaskResponse, TaskUpdateRequest, TimeEntry, WikiBacklinkResponse } from '@/types/domain'

const props = defineProps<{ projectId: string; taskId: string }>()
const router = useRouter()
const dictionaries = useDictionariesStore()
const auth = useAuthStore()
const toast = useToast()
const { confirm } = useConfirm()

const projectIdNum = computed(() => Number(props.projectId))
const taskIdNum = computed(() => Number(props.taskId))

const task = ref<TaskResponse | null>(null)
const loading = ref(true)
const notFound = ref(false)

// Вид сущности — единственная развилка (parent_task.md §5.1). У эпика нет
// исполнителя/статуса/списания времени; вместо них блок прогресса и список задач.
const isEpic = computed(() => isEpicTask(task.value))

const comments = ref<CommentResponse[]>([])
const newComment = ref('')
const postingComment = ref(false)
const editingCommentId = ref<number | null>(null)
const editingCommentText = ref('')

const activity = ref<ActivityResponse[]>([])
// «Скрыть действия агента» (ai.md §3.4) — агент, обновляющий резюме после каждого
// комментария, быстро забивает ленту.
const hideAgentActivity = ref(false)
const visibleActivity = computed(() =>
  hideAgentActivity.value ? activity.value.filter(a => a.actorType !== 'AGENT') : activity.value
)
const agentActivityCount = computed(() => activity.value.filter(a => a.actorType === 'AGENT').length)
const files = ref<FileResponse[]>([])
const wikiPages = ref<WikiBacklinkResponse[]>([])
const loadingComments = ref(true)
const loadingFiles = ref(true)
const loadingTime = ref(true)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
// id файла → object-URL картинки-превью (файлы отдаются только с токеном,
// поэтому <img src> напрямую не работает). URL'ы освобождаются при смене
// задачи, обновлении списка и размонтировании.
const imagePreviews = reactive<Record<number, string>>({})
const preview = ref<
  | { kind: 'image'; name: string; url: string }
  | { kind: 'text'; name: string; text: string }
  | null
>(null)
const previewLoadingId = ref<number | null>(null)

const summaryText = ref('')
const summaryUpdatedAt = ref<string | null>(null)
const savingSummary = ref(false)

function todayInput(): string {
  return new Date().toISOString().slice(0, 10)
}

const totalSeconds = ref(0)
const timeEntries = ref<TimeEntry[]>([])
const logDate = ref(todayInput())
const logHours = ref<number | null>(0)
const logMinutes = ref<number | null>(0)
const logDescription = ref('')
const loggingTime = ref(false)

// Модель сохранения (task_edit_2.md): пикеры — статус, исполнитель, срок, дата
// начала, оценка, теги — пишутся на сервер СРАЗУ при выборе. Выбор в
// USelectMenu уже принятое решение, подтверждать его кнопкой внизу экрана
// незачем. Название и описание правятся ЯВНО (кнопка «Готово» в InlineEdit),
// а их незакоммиченный текст переживает уход со страницы через черновик в
// sessionStorage (draft-key у InlineEdit) — не через диалоги и beforeunload.
const savingField = ref<string | null>(null)

// Немедленное сохранение поля(-ей). Оптимистично, с откатом при ошибке.
// X-Expected-Version по-прежнему по всей задаче — при 409 остаётся диалог
// «записать поверх / перезагрузить» (полевой конфликт — это серверная работа,
// пп. 3–5 из task_edit_2.md).
//
// Запросы сериализуются: правки идут в очередь и уходят по одному, чтобы
// быстрые последовательные изменения (сначала статус, потом исполнитель) не
// ловили ложный 409 из-за гонки версий между собой.
let saveQueue: Promise<unknown> = Promise.resolve()
function saveField(patch: TaskUpdateRequest): Promise<void> {
  const run = () => doSaveField(patch)
  const next = saveQueue.then(run, run)
  saveQueue = next.catch(() => {})
  return next
}

async function doSaveField(patch: TaskUpdateRequest, force = false) {
  if (!task.value) return
  const before = task.value
  task.value = { ...before, ...patch } as TaskResponse
  savingField.value = Object.keys(patch)[0] ?? null
  try {
    task.value = await updateTask(
      projectIdNum.value,
      taskIdNum.value,
      patch,
      force ? undefined : before.version
    )
    bumpTasksVersion()
    loadActivity()
  } catch (e) {
    task.value = before
    if (!force && e instanceof ApiError && e.status === 409) {
      if (await askOverwriteOnConflict()) await doSaveField(patch, true)
      else await reloadTask()
      return
    }
    toast.add({ title: 'Не удалось сохранить', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    savingField.value = null
  }
}

async function saveTitle(v: string) {
  const title = v.trim()
  if (!title) {
    toast.add({ title: 'Название не может быть пустым', color: 'error' })
    return
  }
  if (title === task.value?.title) return
  await saveField({ title })
}

async function saveDescription(v: string) {
  if (v === (task.value?.description ?? '')) return
  await saveField({ description: v })
}

const project = computed(() => dictionaries.projectById.get(projectIdNum.value))
const projectEditOpen = ref(false)

const creatorName = computed(() => {
  if (!task.value) return ''
  const u = dictionaries.userById.get(task.value.creatorUserId)
  return u?.displayName || u?.username || `#${task.value.creatorUserId}`
})

// Словарь тегов принадлежит проекту (ProjectResponse.tags) и правится
// только на странице проекта. Здесь задача лишь ВЫБИРАЕТ из него —
// снятие галочки меняет task.tags, но не трогает список тегов проекта.
// В варианты добавляем и уже назначенные задаче теги (на случай, если
// тег убрали из проекта, а на задаче он ещё остался — чтобы его было
// видно и можно было снять).
const tagOptions = computed(() => {
  const set = new Set<string>(project.value?.tags ?? [])
  for (const t of task.value?.tags ?? []) set.add(t)
  return [...set].sort((a, b) => a.localeCompare(b))
})
const statuses = computed(() => dictionaries.statusesByProject[projectIdNum.value] ?? [])
const statusItems = computed(() => statuses.value.map(s => ({ label: s.statusName, value: s.id })))
const userItems = computed(() => dictionaries.users.map(u => ({ label: u.displayName || u.username, value: u.id })))

// Селектор «Эпик» на странице обычной задачи (parent_task.md §5.4, обратный
// путь). 0 — «Без эпика» (parentId у задачи — number). Список эпиков проекта
// кэшируется в словаре.
const NO_EPIC = 0
const projectEpics = computed(() => dictionaries.epicsByProject[projectIdNum.value] ?? [])
const epicItems = computed(() => [
  { label: 'Без эпика', value: NO_EPIC },
  ...projectEpics.value
    .filter(e => e.id !== taskIdNum.value)
    .map(e => ({ label: e.title, value: e.id }))
])
const changingParent = ref(false)

// Селектор «Веха» (plan.md §5.4) — под селектором эпика. Ось, ортогональная
// эпику: веха отвечает «к какому сроку». 0 — «Без вехи». В списке только
// открытые вехи (+ текущая, даже если её закрыли — чтобы было видно и снимаемо).
const NO_MILESTONE = 0
const projectMilestones = computed(() => dictionaries.milestonesByProject[projectIdNum.value] ?? [])
const milestoneItems = computed(() => {
  const open = projectMilestones.value.filter(m => m.state !== 'CLOSED')
  const cur = task.value?.milestoneId
  const items = [{ label: 'Без вехи', value: NO_MILESTONE }]
  for (const m of open) items.push({ label: `${m.title} · ${formatDate(m.dueDate)}`, value: m.id })
  if (cur && !open.some(m => m.id === cur)) {
    items.push({ label: `${task.value?.milestoneTitle ?? `Веха #${cur}`} (закрыта)`, value: cur })
  }
  return items
})
const changingMilestone = ref(false)
const dueAfterMilestone = computed(() =>
  !!task.value?.dueDate && !!task.value?.milestoneDueDate && task.value.dueDate > task.value.milestoneDueDate
)

async function changeMilestone(value: number) {
  if (!task.value) return
  const milestoneId = value === NO_MILESTONE ? null : value
  if (milestoneId === (task.value.milestoneId ?? null)) return
  changingMilestone.value = true
  try {
    const updated = await setTaskMilestone(taskIdNum.value, milestoneId)
    task.value = updated
    bumpTasksVersion()
    dictionaries.loadMilestones(projectIdNum.value, true).catch(() => {})
    await loadActivity()
    if (updated.milestoneReady) {
      toast.add({ title: 'Все задачи вехи выполнены — её можно закрыть', color: 'primary' })
    } else {
      toast.add({ title: milestoneId ? 'Задача привязана к вехе' : 'Задача откреплена от вехи', color: 'primary' })
    }
  } catch (e) {
    toast.add({ title: 'Не удалось изменить веху', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    changingMilestone.value = false
  }
}

async function changeParent(value: number) {
  if (!task.value) return
  const parentId = value === NO_EPIC ? null : value
  if (parentId === (task.value.parentId ?? null)) return
  changingParent.value = true
  try {
    task.value = await setTaskParent(taskIdNum.value, parentId)
    bumpTasksVersion()
    dictionaries.loadEpics(projectIdNum.value, true).catch(() => {})
    await loadActivity()
    toast.add({ title: parentId ? 'Задача привязана к эпику' : 'Задача откреплена от эпика', color: 'primary' })
  } catch (e) {
    toast.add({ title: 'Не удалось изменить эпик', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    changingParent.value = false
  }
}

// Пересчёт прогресса эпика после правки дочерней задачи из списка — числа
// childDone/childTotal считает сервер, локально их не восстанавливаем.
async function refreshEpicProgress() {
  if (!task.value) return
  try {
    task.value = await getTask(projectIdNum.value, taskIdNum.value)
    dictionaries.loadEpics(projectIdNum.value, true).catch(() => {})
  } catch { /* не критично */ }
}

async function convertType() {
  if (!task.value) return
  const to = isEpic.value ? 'TASK' : 'EPIC'
  const ok = await confirm({
    title: to === 'EPIC' ? 'Преобразовать задачу в эпик?' : 'Преобразовать эпик в задачу?',
    description: to === 'EPIC'
      ? 'Исполнитель и статус будут сняты — эпик станет контейнером для задач, время на него не списывается. Задача не должна входить в эпик и иметь списанное время.'
      : 'Эпик станет обычной задачей со своим статусом и исполнителем. Внутри не должно остаться задач.',
    confirmLabel: 'Преобразовать',
    danger: false
  })
  if (!ok) return
  try {
    task.value = await convertTask(taskIdNum.value, to)
    bumpTasksVersion()
    dictionaries.loadEpics(projectIdNum.value, true).catch(() => {})
    await Promise.all([loadActivity(), loadTime()])
    toast.add({ title: 'Вид задачи изменён', color: 'primary' })
  } catch (e) {
    toast.add({ title: 'Не удалось преобразовать', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

// Упоминания (@username) в комментариях и описании. Кандидаты — участники
// проекта: упоминать того, кто не видит задачу, бессмысленно (по ссылке 403),
// плюс это утечка всего каталога сотрудников в автодополнение. По @username
// сервер создаёт уведомление MENTION (notifications.md §7). Аватар берём из
// словаря пользователей — ProjectMemberResponse его не отдаёт.
const mentionUsers = computed<MentionUser[]>(() =>
  (dictionaries.membersByProject[projectIdNum.value] ?? []).map(m => ({
    id: m.userId,
    username: m.username,
    name: m.displayName || m.username,
    avatarUrl: dictionaries.userById.get(m.userId)?.avatarUrl ?? null
  }))
)
const mentionedInDraft = computed(() => resolveMentions(newComment.value, mentionUsers.value))

async function load() {
  loading.value = true
  notFound.value = false
  task.value = null
  comments.value = []
  activity.value = []
  files.value = []
  clearImagePreviews()
  preview.value = null
  wikiPages.value = []
  timeEntries.value = []
  summaryText.value = ''
  summaryUpdatedAt.value = null
  totalSeconds.value = 0

  try {
    task.value = await getTask(projectIdNum.value, taskIdNum.value)
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
      notFound.value = true
    } else {
      toast.add({ title: 'Не удалось загрузить задачу', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
    }
    loading.value = false
    return
  }

  // Задача получена — показываем страницу сразу. Справочники и вторичные
  // секции (комментарии, активность, файлы, резюме, учёт времени)
  // догружаются в фоне и наполняются по мере готовности, не задерживая
  // отрисовку самой задачи и не блокируя друг друга при ошибке.
  loading.value = false

  dictionaries.loadStatuses(projectIdNum.value).catch(() => {})
  dictionaries.loadUsers().catch(() => {})
  dictionaries.loadProjects().catch(() => {})
  dictionaries.loadMembers(projectIdNum.value).catch(() => {})
  dictionaries.loadEpics(projectIdNum.value).catch(() => {})
  dictionaries.loadMilestones(projectIdNum.value).catch(() => {})
  loadComments()
  loadActivity()
  loadFiles()
  loadSummary()
  loadTime()
  loadWikiDocs()
}

async function loadWikiDocs() {
  try {
    wikiPages.value = await getTaskWikiPages(taskIdNum.value)
  } catch {
    /* «Документация» не критична — молча пропускаем */
  }
}

async function loadComments() {
  loadingComments.value = true
  try {
    comments.value = await listTaskComments(taskIdNum.value)
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить комментарии', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loadingComments.value = false
  }
}

async function loadActivity() {
  try {
    activity.value = await listTaskActivity(taskIdNum.value, { limit: 50 })
  } catch {
    /* активность не критична — молча пропускаем */
  }
}

async function loadFiles() {
  loadingFiles.value = true
  try {
    files.value = await listTaskFiles(taskIdNum.value)
    await syncImagePreviews()
  } catch (e) {
    toast.add({ title: 'Не удалось загрузить файлы', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loadingFiles.value = false
  }
}

const TEXT_PREVIEW_LIMIT = 1_000_000 // ~1 МБ — дальше режем, чтобы не подвесить вкладку

function isImage(file: FileResponse): boolean {
  return file.mimeType?.startsWith('image/')
    || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(file.fileOriginalName)
}

function isTextFile(file: FileResponse): boolean {
  const mt = file.mimeType || ''
  if (mt.startsWith('text/')) return true
  if (/^application\/(json|xml|x-yaml|yaml|javascript|sql)$/i.test(mt)) return true
  return /\.(txt|md|markdown|csv|tsv|log|json|xml|ya?ml|toml|ini|conf|cfg|css|scss|less|html?|js|jsx|ts|tsx|vue|java|kt|py|rb|go|rs|c|h|cpp|cs|sh|bat|ps1|sql|properties|gradle|env|gitignore)$/i.test(file.fileOriginalName)
}

// Подтягивает превью для новых картинок и освобождает URL'ы исчезнувших файлов.
async function syncImagePreviews() {
  const present = new Set(files.value.map(f => f.id))
  for (const key of Object.keys(imagePreviews)) {
    const id = Number(key)
    if (!present.has(id)) {
      const url = imagePreviews[id]
      if (url) URL.revokeObjectURL(url)
      delete imagePreviews[id]
    }
  }
  await Promise.all(files.value.map(async (f) => {
    if (!isImage(f) || imagePreviews[f.id]) return
    try {
      imagePreviews[f.id] = await fetchFileObjectUrl(f.fileName)
    } catch {
      /* превью не критично — покажем иконку */
    }
  }))
}

function clearImagePreviews() {
  for (const key of Object.keys(imagePreviews)) {
    const id = Number(key)
    const url = imagePreviews[id]
    if (url) URL.revokeObjectURL(url)
    delete imagePreviews[id]
  }
}

function openImagePreview(file: FileResponse) {
  const url = imagePreviews[file.id]
  if (url) preview.value = { kind: 'image', url, name: file.fileOriginalName }
}

async function openTextPreview(file: FileResponse) {
  if (file.fileSize && file.fileSize > 5_000_000) {
    toast.add({ title: 'Файл слишком большой для просмотра', description: 'Скачайте его целиком.', color: 'warning' })
    return
  }
  previewLoadingId.value = file.id
  try {
    let text = await fetchFileText(file.fileName)
    if (text.length > TEXT_PREVIEW_LIMIT) {
      text = text.slice(0, TEXT_PREVIEW_LIMIT) + '\n\n…файл обрезан для просмотра — скачайте целиком'
    }
    preview.value = { kind: 'text', name: file.fileOriginalName, text }
  } catch {
    toast.add({ title: 'Не удалось открыть файл', color: 'error' })
  } finally {
    previewLoadingId.value = null
  }
}

function onPreviewOpenChange(value: boolean) {
  if (!value) preview.value = null
}

async function loadSummary() {
  try {
    const res = await getTaskSummary(taskIdNum.value)
    summaryText.value = res.summary ?? ''
    summaryUpdatedAt.value = res.updatedAt
  } catch {
    summaryText.value = ''
  }
}

async function loadTime() {
  loadingTime.value = true
  try {
    // У эпика «Списано» = сумма по дочерним задачам (её отдаёт та же ручка),
    // а собственных записей времени нет — их и не запрашиваем.
    const wantEntries = task.value?.taskType !== 'EPIC'
    const [total, entries] = await Promise.allSettled([
      getTaskTotalSeconds(taskIdNum.value),
      wantEntries ? listTimeEntries(taskIdNum.value) : Promise.resolve([] as TimeEntry[])
    ])
    totalSeconds.value = total.status === 'fulfilled' ? total.value : 0
    timeEntries.value = (entries.status === 'fulfilled' ? entries.value : [])
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.startTime ?? a.createdAt).getTime()
        const tb = new Date(b.startTime ?? b.createdAt).getTime()
        return tb - ta
      })
  } finally {
    loadingTime.value = false
  }
}

async function removeTimeEntry(entry: TimeEntry) {
  const ok = await confirm({
    title: 'Удалить запись времени?',
    description: `${formatDuration(entry.seconds)}${entry.description ? ` — ${entry.description}` : ''}`,
    danger: true
  })
  if (!ok) return
  try {
    await deleteTimeEntry(taskIdNum.value, entry.id)
    await Promise.all([loadTime(), loadActivity()])
    toast.add({ title: 'Запись удалена', color: 'primary' })
  } catch (e) {
    toast.add({ title: 'Не удалось удалить запись', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

function userLabel(userId: number): string {
  const u = dictionaries.userById.get(userId)
  return u?.displayName || u?.username || `Пользователь #${userId}`
}

onMounted(() => {
  load()
})
onUnmounted(() => {
  clearImagePreviews()
})
watch(() => [props.projectId, props.taskId], load)

// Охранника ухода и beforeunload больше нет: незакоммиченный текст названия /
// описания хранит черновик InlineEdit в sessionStorage (task_edit_2.md),
// остальные поля уходят на сервер сразу.

// 409 = задачу изменили конкурентно. Версия сравнивается по всей задаче, из-за
// чего часть 409 ложные (правили разные поля) — полевой конфликт делается на
// сервере (task_edit_2.md пп. 3–5). Пока: перезаписать это поле или перезагрузить.
function askOverwriteOnConflict() {
  return confirm({
    title: 'Задачу изменил другой пользователь',
    description: 'Пока открыта эта страница, задачу обновил кто-то ещё. Записать ваше изменение поверх или перезагрузить актуальную версию?',
    confirmLabel: 'Записать поверх',
    cancelLabel: 'Перезагрузить',
    danger: true
  })
}

async function reloadTask() {
  try {
    task.value = await getTask(projectIdNum.value, taskIdNum.value)
    await loadActivity()
    toast.add({ title: 'Загружена актуальная версия задачи', color: 'primary' })
  } catch (e) {
    toast.add({ title: 'Не удалось перезагрузить задачу', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

function msToDateInput(ms: number | null | undefined): string {
  if (!ms) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

function onDueDateChange(e: Event) {
  const value = (e.target as HTMLInputElement).value
  saveField({ dueDate: value ? new Date(`${value}T00:00:00`).getTime() : null })
}

function onStartDateChange(e: Event) {
  const value = (e.target as HTMLInputElement).value
  saveField({ startDate: value ? new Date(`${value}T00:00:00`).getTime() : null })
}

async function toggleArchived() {
  if (!task.value) return
  await saveField({ isArchived: !task.value.isArchived })
}

async function duplicateTask() {
  if (!task.value) return
  try {
    await createTask(projectIdNum.value, {
      title: `${task.value.title} (копия)`,
      description: task.value.description ?? undefined,
      tags: task.value.tags.length ? [...task.value.tags] : undefined
    })
    toast.add({ title: 'Задача продублирована', color: 'primary' })
    bumpTasksVersion()
    router.push('/tasks')
  } catch (e) {
    toast.add({ title: 'Не удалось продублировать', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

function copyLink() {
  navigator.clipboard?.writeText(window.location.href)
  toast.add({ title: 'Ссылка скопирована', color: 'primary' })
}

const epicDeleteOpen = ref(false)
const epicDeleting = ref(false)

async function removeTask() {
  if (!task.value) return
  // Эпик с задачами внутри — осознанный выбор: открепить или удалить вместе
  // (parent_task.md §3.7). Показываем отдельный диалог с числом задач.
  if (isEpic.value && (task.value.childTotal ?? 0) > 0) {
    epicDeleteOpen.value = true
    return
  }
  const ok = await confirm({
    title: isEpic.value ? `Удалить эпик «${task.value.title}»?` : `Удалить задачу «${task.value.title}»?`,
    description: isEpic.value
      ? 'Эпик будет удалён. Это действие нельзя отменить.'
      : 'Задача и все комментарии к ней будут удалены. Это действие нельзя отменить.'
  })
  if (!ok) return
  await doDelete()
}

async function doDelete(children?: 'detach' | 'delete') {
  if (!task.value) return
  epicDeleting.value = true
  try {
    await deleteTask(projectIdNum.value, taskIdNum.value, children)
    epicDeleteOpen.value = false
    toast.add({ title: isEpic.value ? 'Эпик удалён' : 'Задача удалена', color: 'primary' })
    bumpTasksVersion()
    dictionaries.loadEpics(projectIdNum.value, true).catch(() => {})
    router.push('/tasks')
  } catch (e) {
    toast.add({ title: 'Не удалось удалить', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    epicDeleting.value = false
  }
}

async function submitComment() {
  const content = newComment.value.trim()
  if (!content) return
  postingComment.value = true
  try {
    await createComment(taskIdNum.value, { content })
    newComment.value = ''
    await loadComments()
  } catch (e) {
    toast.add({ title: 'Не удалось отправить комментарий', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    postingComment.value = false
  }
}

function startEditComment(comment: CommentResponse) {
  editingCommentId.value = comment.id
  editingCommentText.value = comment.content
}

async function saveEditComment(comment: CommentResponse) {
  try {
    await updateComment(comment.id, { content: editingCommentText.value, visibility: comment.visibility })
    editingCommentId.value = null
    await loadComments()
  } catch (e) {
    toast.add({ title: 'Не удалось сохранить комментарий', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

async function removeComment(comment: CommentResponse) {
  const ok = await confirm({ title: 'Удалить комментарий?' })
  if (!ok) return
  try {
    await deleteComment(comment.id)
    await loadComments()
  } catch (e) {
    toast.add({ title: 'Не удалось удалить комментарий', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

function triggerUpload() {
  fileInput.value?.click()
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    await uploadTaskFile(projectIdNum.value, taskIdNum.value, file)
    await loadFiles()
    toast.add({ title: 'Файл загружен', color: 'primary' })
  } catch (err) {
    toast.add({ title: 'Не удалось загрузить файл', description: err instanceof ApiError ? err.message : undefined, color: 'error' })
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function removeFile(file: FileResponse) {
  const ok = await confirm({ title: `Удалить файл «${file.fileOriginalName}»?` })
  if (!ok) return
  try {
    await deleteFile(file.id)
    await loadFiles()
  } catch (e) {
    toast.add({ title: 'Не удалось удалить файл', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  }
}

function download(file: FileResponse) {
  downloadFile(file.fileName, file.fileOriginalName).catch(() => {
    toast.add({ title: 'Не удалось скачать файл', color: 'error' })
  })
}

async function saveSummary() {
  savingSummary.value = true
  try {
    const res = await updateTaskSummary(taskIdNum.value, { summary: summaryText.value })
    summaryUpdatedAt.value = res.updatedAt
    toast.add({ title: 'Резюме сохранено', color: 'primary' })
  } catch (e) {
    toast.add({ title: 'Не удалось сохранить резюме', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    savingSummary.value = false
  }
}

async function submitTimeLog() {
  const seconds = Math.round((logHours.value || 0) * 3600 + (logMinutes.value || 0) * 60)
  if (seconds <= 0) {
    toast.add({ title: 'Укажите затраченное время', color: 'error' })
    return
  }
  loggingTime.value = true
  try {
    const startTime = logDate.value ? new Date(`${logDate.value}T00:00:00`).getTime() : undefined
    await logTime(taskIdNum.value, {
      seconds,
      description: logDescription.value.trim() || undefined,
      startTime
    })
    logHours.value = 0
    logMinutes.value = 0
    logDescription.value = ''
    logDate.value = todayInput()
    await Promise.all([loadTime(), loadActivity()])
    toast.add({ title: 'Время записано', color: 'primary' })
  } catch (e) {
    toast.add({ title: 'Не удалось записать время', description: e instanceof ApiError ? e.message : undefined, color: 'error' })
  } finally {
    loggingTime.value = false
  }
}

function humanizeAction(type: string): string {
  return type.replaceAll('_', ' ').toLowerCase()
}
</script>

<template>
  <div v-if="notFound">
    <NotFoundView title="Задача не найдена" />
  </div>
  <div v-else class="mx-auto w-[95%] px-6 py-6">
    <button class="mb-4 flex items-center gap-1 text-sm text-muted hover:text-highlighted" @click="router.back()">
      <UIcon name="i-lucide-arrow-left" class="size-4" />
      Назад к списку
    </button>

    <template v-if="loading || !task">
      <div class="flex flex-col gap-3">
        <USkeleton class="h-6 w-1/3" />
        <USkeleton class="h-32 w-full" />
      </div>
    </template>

    <template v-else>
      <div class="mb-4 flex items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2 font-mono text-[13px] text-muted">
          <span v-if="isEpic" class="flex items-center gap-1 font-sans font-medium text-primary">
            <UIcon name="i-lucide-package" class="size-3.5" />
            Эпик
          </span>
          <span>#{{ task.id }}</span>
          <span>·</span>
          <span>{{ project?.name ?? `Проект #${projectIdNum}` }}</span>
          <template v-if="task.parentId">
            <span>·</span>
            <RouterLink
              :to="`/tasks/${projectIdNum}/${task.parentId}`"
              class="flex items-center gap-1 font-sans hover:text-primary"
            >
              <UIcon name="i-lucide-package" class="size-3.5" />
              {{ task.parentTitle || `Эпик #${task.parentId}` }}
            </RouterLink>
          </template>
          <UBadge v-if="task.isArchived" variant="subtle" color="neutral">В архиве</UBadge>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <HelpLink
            :topic="isEpic ? 'epics' : 'tasks'"
            :label="isEpic ? 'Справка: эпики' : 'Справка: задачи'"
          />
          <UDropdownMenu
            :items="[[
              { label: 'Дублировать', icon: 'i-lucide-copy', onSelect: duplicateTask },
              { label: 'Копировать ссылку', icon: 'i-lucide-link', onSelect: copyLink },
              { label: task.isArchived ? 'Восстановить из архива' : 'Архивировать', icon: 'i-lucide-archive', onSelect: toggleArchived },
              { label: isEpic ? 'Преобразовать в задачу' : 'Преобразовать в эпик', icon: 'i-lucide-repeat', onSelect: convertType }
            ], [
              { label: isEpic ? 'Удалить эпик' : 'Удалить задачу', icon: 'i-lucide-trash-2', color: 'error', onSelect: removeTask }
            ]]"
          >
            <UButton icon="i-lucide-ellipsis" variant="outline" color="primary" />
          </UDropdownMenu>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <div class="min-w-0">
          <InlineEdit
            :key="`title-${task.id}`"
            :model-value="task.title"
            confirm-label="Готово"
            @save="saveTitle"
          >
            <template #default="{ value }">
              <h1 class="text-xl font-semibold leading-7">{{ value || 'Без названия' }}</h1>
            </template>
          </InlineEdit>

          <div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>Автор: <span class="text-default">{{ creatorName }}</span></span>
            <span>Создана {{ formatDate(task.createdAt) }}</span>
          </div>

          <TagList
            v-if="task.tags.length"
            :tags="task.tags"
            :max="20"
            class="mt-2"
            @select="(tag) => router.push({ path: '/tasks', query: { tag } })"
          />

          <div class="mt-6">
            <div class="mb-2 flex items-center gap-1.5">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">Описание</p>
              <EditorHint submit-label="сохранить" />
            </div>
            <InlineEdit
              :key="`desc-${task.id}`"
              :model-value="task.description ?? ''"
              multiline
              placeholder="Добавьте описание…"
              confirm-label="Готово"
              :mention-members="mentionUsers"
              :draft-key="`taskmind.taskDraft.desc.${task.id}`"
              @save="saveDescription"
            >
              <template #default="{ value }">
                <MarkdownView :source="value" :mentions="mentionUsers" />
              </template>
            </InlineEdit>
          </div>

          <div v-if="isEpic" class="mt-8 border-t border-default pt-6">
            <EpicTaskList
              :epic-id="task.id"
              :project-id="projectIdNum"
              :epic-title="task.title"
              @changed="refreshEpicProgress"
            />
          </div>

          <div class="mt-8 border-t border-default pt-6">
            <p class="mb-3 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted">
              Резюме (AI)
              <HelpLink
                topic="summary"
                label="Справка: резюме задачи"
                hint="Короткое изложение задачи в 2–4 предложения: о чём она и где затык. Заполняете вы вручную или ИИ-агент по запросу. Сохранение перезаписывает текст целиком."
              />
            </p>
            <UTextarea v-model="summaryText" :rows="3" class="w-full" placeholder="Краткое резюме задачи" />
            <div class="mt-2 flex items-center justify-between">
              <RelativeTime v-if="summaryUpdatedAt" :value="summaryUpdatedAt" class="text-xs text-muted" />
              <span v-else />
              <UButton size="xs" color="primary" :loading="savingSummary" @click="saveSummary">Сохранить</UButton>
            </div>
          </div>

          <div class="mt-8 border-t border-default pt-6">
            <p class="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Файлы</p>
            <div class="flex flex-col gap-2">
              <div v-for="file in files" :key="file.id" class="flex items-center justify-between gap-2 rounded-md border border-default px-3 py-2 text-sm">
                <div class="flex min-w-0 items-center gap-2.5">
                  <button
                    v-if="imagePreviews[file.id]"
                    type="button"
                    class="size-10 shrink-0 overflow-hidden rounded border border-default transition hover:opacity-80"
                    title="Открыть превью"
                    @click="openImagePreview(file)"
                  >
                    <img :src="imagePreviews[file.id]" :alt="file.fileOriginalName" class="size-full object-cover">
                  </button>
                  <UIcon
                    v-else
                    :name="isImage(file) ? 'i-lucide-image' : isTextFile(file) ? 'i-lucide-file-text' : 'i-lucide-paperclip'"
                    class="size-4 shrink-0 text-muted"
                  />
                  <span class="truncate">{{ file.fileOriginalName }}</span>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <UButton
                    v-if="isTextFile(file)"
                    icon="i-lucide-eye"
                    variant="outline"
                    color="primary"
                    size="xs"
                    title="Просмотр"
                    :loading="previewLoadingId === file.id"
                    @click="openTextPreview(file)"
                  />
                  <UButton icon="i-lucide-download" variant="outline" color="primary" size="xs" @click="download(file)" />
                  <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="removeFile(file)" />
                </div>
              </div>
              <p v-if="files.length === 0 && !loadingFiles" class="text-sm text-muted">Файлов пока нет</p>
              <input ref="fileInput" type="file" class="hidden" @change="onFileSelected">
              <UButton icon="i-lucide-upload" variant="outline" color="primary" class="self-start" :loading="uploading" @click="triggerUpload">
                Загрузить файл
              </UButton>
            </div>
          </div>

          <div class="mt-8 border-t border-default pt-6">
            <div class="mb-3 flex items-center gap-1.5">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">Комментарии ({{ comments.length }})</p>
              <EditorHint />
            </div>
            <div class="flex flex-col gap-4">
              <div v-for="comment in comments" :key="comment.id" class="flex gap-3">
                <UAvatar :text="initials(dictionaries.userById.get(comment.userId)?.displayName)" size="sm" />
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 text-sm">
                    <span class="font-medium">{{ dictionaries.userById.get(comment.userId)?.displayName || dictionaries.userById.get(comment.userId)?.username || `Пользователь #${comment.userId}` }}</span>
                    <AgentBadge v-if="comment.actorType === 'AGENT'" />
                    <RelativeTime :value="comment.createdAt" class="text-xs text-muted" />
                    <span v-if="comment.isEdited" class="text-xs text-muted">(изменено)</span>
                  </div>
                  <div v-if="editingCommentId === comment.id" class="mt-1 flex flex-col gap-2">
                    <MentionTextarea
                      v-model="editingCommentText"
                      :members="mentionUsers"
                      :rows="3"
                      @submit="saveEditComment(comment)"
                    />
                    <div class="flex gap-2">
                      <UButton size="xs" color="primary" @click="saveEditComment(comment)">Сохранить</UButton>
                      <UButton size="xs" variant="outline" color="primary" @click="editingCommentId = null">Отмена</UButton>
                    </div>
                  </div>
                  <MarkdownView v-else :source="comment.content" class="mt-1" :mentions="mentionUsers" />
                  <div v-if="editingCommentId !== comment.id && comment.userId === auth.profile?.id" class="mt-1 flex gap-3 text-xs text-muted">
                    <button class="hover:text-highlighted" @click="startEditComment(comment)">Изменить</button>
                    <button class="hover:text-error" @click="removeComment(comment)">Удалить</button>
                  </div>
                </div>
              </div>
              <div v-if="loadingComments && comments.length === 0" class="flex flex-col gap-2">
                <USkeleton class="h-4 w-1/4" />
                <USkeleton class="h-4 w-3/4" />
              </div>
              <p v-else-if="comments.length === 0" class="text-sm text-muted">Пока нет комментариев</p>
            </div>

            <div class="mt-4 flex gap-3">
              <UAvatar :text="initials(auth.profile?.displayName)" size="sm" />
              <div class="flex-1">
                <MentionTextarea
                  v-model="newComment"
                  :members="mentionUsers"
                  :rows="2"
                  placeholder="Написать комментарий… (@ — упомянуть, ⌘/Ctrl+Enter — отправить)"
                  @submit="submitComment"
                />
                <div class="mt-2 flex items-center gap-3">
                  <UButton size="sm" color="primary" :loading="postingComment" @click="submitComment">
                    Отправить
                  </UButton>
                  <span v-if="mentionedInDraft.length" class="text-xs text-muted">
                    Упомянуты: {{ mentionedInDraft.map(u => u.name).join(', ') }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="flex flex-col gap-4">
          <UCard>
            <div class="flex flex-col gap-4">
              <!-- Эпик: прогресс вместо статуса и исполнителя (parent_task.md §5.2) -->
              <EpicProgress
                v-if="isEpic"
                :done="task.childDone"
                :total="task.childTotal"
                :closed="task.epicClosed"
              />

              <template v-else>
                <UFormField label="Статус">
                  <USelectMenu
                    :model-value="task.statusId ?? undefined"
                    :items="statusItems"
                    value-key="value"
                    placeholder="Без статуса"
                    :loading="savingField === 'statusId'"
                    class="w-full"
                    @update:model-value="(v: number) => saveField({ statusId: v ?? null })"
                  />
                </UFormField>
                <UFormField label="Исполнитель">
                  <USelectMenu
                    :model-value="task.assignedUserId ?? undefined"
                    :items="userItems"
                    value-key="value"
                    placeholder="Не назначен"
                    :loading="savingField === 'assignedUserId'"
                    class="w-full"
                    @update:model-value="(v: number) => saveField({ assignedUserId: v ?? null })"
                  />
                </UFormField>
                <UFormField v-if="epicItems.length > 1 || task.parentId" label="Эпик">
                  <template #label>
                    <span class="inline-flex items-center gap-1">
                      Эпик
                      <HelpLink
                        topic="epics"
                        hint="Эпик — направление работы, объединяющее задачи («Уведомления», «Переезд на новую БД»). У эпика нет исполнителя и своего статуса, прогресс считается по вложенным задачам."
                      />
                    </span>
                  </template>
                  <USelectMenu
                    :model-value="task.parentId ?? 0"
                    :items="epicItems"
                    value-key="value"
                    :loading="changingParent"
                    class="w-full"
                    @update:model-value="(v: number) => changeParent(v)"
                  />
                </UFormField>
                <UFormField v-if="milestoneItems.length > 1 || task.milestoneId" label="Веха">
                  <template #label>
                    <span class="inline-flex items-center gap-1">
                      Веха
                      <HelpLink
                        topic="milestones"
                        hint="Веха — контрольная точка по сроку (релиз, демо, дедлайн). Собирает задачи из разных эпиков «к одной дате». У задачи не больше одной вехи."
                      />
                    </span>
                  </template>
                  <USelectMenu
                    :model-value="task.milestoneId ?? 0"
                    :items="milestoneItems"
                    value-key="value"
                    :loading="changingMilestone"
                    class="w-full"
                    @update:model-value="(v: number) => changeMilestone(v)"
                  />
                  <p v-if="dueAfterMilestone" class="mt-1 text-xs text-warning">
                    Срок задачи позже срока вехи
                  </p>
                </UFormField>
              </template>

              <UFormField label="Срок">
                <template #label>
                  <span class="inline-flex items-center gap-1">
                    Срок
                    <HelpLink
                      topic="task-fields"
                      hash="due"
                      hint="Срок — дата, к которой задачу нужно закрыть. Незакрытая задача с истёкшим сроком считается просроченной, в том числе в счётчике вехи."
                    />
                  </span>
                </template>
                <input
                  type="date"
                  class="w-full rounded-md border border-default bg-default px-2.5 py-1.5 text-sm"
                  :value="msToDateInput(task.dueDate)"
                  @change="onDueDateChange"
                >
              </UFormField>
              <UFormField label="Дата начала">
                <input
                  type="date"
                  class="w-full rounded-md border border-default bg-default px-2.5 py-1.5 text-sm"
                  :value="msToDateInput(task.startDate)"
                  @change="onStartDateChange"
                >
              </UFormField>
              <UFormField v-if="!isEpic" label="Оценка, ч">
                <template #label>
                  <span class="inline-flex items-center gap-1">
                    Оценка, ч
                    <HelpLink
                      topic="task-fields"
                      hash="estimate"
                      hint="Оценка трудоёмкости в часах. Справочное поле — в прогресс вех и расчёт их состояний не входит (там считаются задачи по штукам)."
                    />
                  </span>
                </template>
                <UInput
                  type="number"
                  step="0.5"
                  :model-value="task.estimatedHours ?? undefined"
                  :loading="savingField === 'estimatedHours'"
                  class="w-full"
                  @change="(e: Event) => { const v = (e.target as HTMLInputElement).value; saveField({ estimatedHours: v === '' ? null : (Number(v) || null) }) }"
                />
              </UFormField>
              <UFormField label="Теги">
                <template v-if="project" #hint>
                  <button
                    type="button"
                    class="text-xs text-muted hover:text-highlighted"
                    @click="projectEditOpen = true"
                  >
                    Теги проекта
                  </button>
                </template>
                <USelectMenu
                  v-if="tagOptions.length"
                  :model-value="task.tags"
                  :items="tagOptions"
                  multiple
                  placeholder="Выберите теги"
                  :loading="savingField === 'tags'"
                  class="w-full"
                  @update:model-value="(v: string[]) => saveField({ tags: v })"
                />
                <p v-else class="text-xs text-muted">
                  У проекта пока нет тегов. Задать их можно на странице проекта.
                </p>
              </UFormField>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <p class="inline-flex items-center gap-1 text-sm font-medium">
                  {{ isEpic ? 'Списано' : 'Учёт времени' }}
                  <HelpLink
                    topic="time-tracking"
                    label="Справка: учёт времени"
                    :hint="isEpic
                      ? 'На эпик время не списывается — здесь сумма по вложенным задачам. Записи ведутся у самих задач.'
                      : 'Списанное на задачу время: список записей, добавление и удаление. Сумма — в заголовке карточки.'"
                  />
                </p>
                <span class="font-mono text-sm">{{ loadingTime ? '…' : formatDuration(totalSeconds) }}</span>
              </div>
            </template>

            <p v-if="isEpic" class="text-xs text-muted">
              Сумма по задачам эпика. На эпик время не списывается — записи ведутся у задач внутри.
            </p>

            <div v-else class="flex flex-col gap-3">
              <UFormField label="Дата">
                <input
                  v-model="logDate"
                  type="date"
                  class="w-full rounded-md border border-default bg-default px-2.5 py-1.5 text-sm"
                >
              </UFormField>
              <div class="flex gap-2">
                <UFormField label="Часы" class="flex-1">
                  <UInputNumber v-model="logHours" :min="0" :step="1" class="w-full" />
                </UFormField>
                <UFormField label="Минуты" class="flex-1">
                  <UInputNumber v-model="logMinutes" :min="0" :max="59" :step="5" class="w-full" />
                </UFormField>
              </div>
              <UFormField label="Комментарий">
                <UInput v-model="logDescription" placeholder="Что делали" class="w-full" />
              </UFormField>
              <UButton block color="primary" :loading="loggingTime" @click="submitTimeLog">
                Добавить запись
              </UButton>

              <div v-if="loadingTime && !timeEntries.length" class="flex flex-col gap-2 border-t border-default pt-3">
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-4 w-2/3" />
              </div>
              <div
                v-else-if="timeEntries.length"
                class="mt-1 flex max-h-72 flex-col divide-y divide-default overflow-y-auto border-t border-default"
              >
                <div v-for="entry in timeEntries" :key="entry.id" class="flex items-start gap-2 py-2">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 text-sm">
                      <span class="font-mono font-medium">{{ formatDuration(entry.seconds) }}</span>
                      <span class="text-xs text-muted">{{ formatDate(entry.startTime ?? entry.createdAt) }}</span>
                    </div>
                    <p class="text-xs text-muted">{{ userLabel(entry.userId) }}</p>
                    <p v-if="entry.description" class="mt-0.5 break-words text-xs">{{ entry.description }}</p>
                  </div>
                  <UButton
                    v-if="entry.userId === auth.profile?.id || auth.isAdmin"
                    icon="i-lucide-trash-2"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    class="shrink-0"
                    @click="removeTimeEntry(entry)"
                  />
                </div>
              </div>
              <p v-else class="border-t border-default pt-3 text-xs text-muted">Записей пока нет</p>
            </div>
          </UCard>

          <UCard>
            <div class="flex flex-col gap-2 text-sm">
              <div class="flex justify-between">
                <span class="text-muted">Изменена</span>
                <RelativeTime :value="task.updatedAt" />
              </div>
              <div v-if="isEpic" class="flex justify-between">
                <span class="text-muted">Прогресс</span>
                <EpicProgress compact :done="task.childDone" :total="task.childTotal" :closed="task.epicClosed" />
              </div>
              <div v-else class="flex justify-between">
                <span class="text-muted">Статус</span>
                <StatusBadge :status="dictionaries.statusFor(projectIdNum, task.statusId)" />
              </div>
            </div>
          </UCard>

          <UCard v-if="wikiPages.length">
            <template #header>
              <p class="text-sm font-medium">Документация ({{ wikiPages.length }})</p>
            </template>
            <div class="flex flex-col gap-1.5 text-sm">
              <RouterLink
                v-for="doc in wikiPages"
                :key="doc.pageId"
                :to="`/projects/${doc.projectId}/wiki/${doc.pageId}`"
                class="flex items-center gap-2 text-default hover:text-primary"
              >
                <UIcon name="i-lucide-file-text" class="size-4 shrink-0 text-muted" />
                <span class="truncate">{{ doc.title }}</span>
              </RouterLink>
            </div>
          </UCard>

          <UCard v-if="activity.length">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-medium">Активность ({{ visibleActivity.length }})</p>
                <USwitch
                  v-if="agentActivityCount"
                  v-model="hideAgentActivity"
                  label="Скрыть действия агента"
                  size="xs"
                />
              </div>
            </template>
            <div class="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1 text-sm">
              <div v-for="a in visibleActivity" :key="a.id" class="flex items-start justify-between gap-2">
                <span class="text-muted">
                  {{ a.username }} {{ humanizeAction(a.actionType) }}
                  <AgentBadge v-if="a.actorType === 'AGENT'" class="ml-1 align-middle" />
                </span>
                <RelativeTime :value="a.createdAt" class="shrink-0 text-xs text-muted" />
              </div>
              <p v-if="!visibleActivity.length" class="text-xs text-muted">Действия агента скрыты</p>
            </div>
          </UCard>
        </aside>
      </div>

      <ProjectFormModal v-if="project" v-model:open="projectEditOpen" :project="project" />

      <UModal
        :open="epicDeleteOpen"
        title="Удалить эпик"
        :ui="{ content: 'max-w-md' }"
        @update:open="(v: boolean) => { epicDeleteOpen = v }"
      >
        <template #body>
          <p class="text-sm">
            В эпике «{{ task?.title }}» {{ task?.childTotal }} задач(и). Что с ними сделать?
          </p>
          <ul class="mt-3 flex flex-col gap-2 text-sm text-muted">
            <li><span class="font-medium text-default">Открепить</span> — задачи останутся в проекте без эпика.</li>
            <li><span class="font-medium text-default">Удалить вместе с задачами</span> — задачи и их комментарии тоже будут удалены.</li>
          </ul>
        </template>
        <template #footer>
          <div class="flex w-full flex-wrap justify-end gap-2">
            <UButton variant="outline" color="primary" :disabled="epicDeleting" @click="epicDeleteOpen = false">
              Отмена
            </UButton>
            <UButton variant="soft" color="neutral" :loading="epicDeleting" @click="doDelete('detach')">
              Открепить задачи
            </UButton>
            <UButton color="error" :loading="epicDeleting" @click="doDelete('delete')">
              Удалить вместе с задачами
            </UButton>
          </div>
        </template>
      </UModal>

      <UModal
        :open="!!preview"
        :title="preview?.name"
        :ui="{ content: 'max-w-3xl' }"
        @update:open="onPreviewOpenChange"
      >
        <template #body>
          <img
            v-if="preview?.kind === 'image'"
            :src="preview.url"
            :alt="preview.name"
            class="mx-auto max-h-[75vh] w-auto rounded-md object-contain"
          >
          <pre
            v-else-if="preview?.kind === 'text'"
            class="max-h-[70vh] overflow-auto whitespace-pre rounded-md bg-elevated p-3 font-mono text-xs leading-5 text-default"
          >{{ preview.text }}</pre>
        </template>
      </UModal>
    </template>
  </div>
</template>
