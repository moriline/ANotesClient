// Типы соответствуют схемам components/schemas в openapi5.yaml. Не добавлять
// поля, которых нет в контракте — бэкенд их не примет и не вернёт.

export type Visibility = 'PUBLIC' | 'INTERNAL' | 'SYSTEM'
export type BlockType = 'MESSAGE' | 'DECISION' | 'QUESTION' | 'PROPOSAL'
// Вид сущности задачи (parent_task.md). EPIC — контейнер: без исполнителя,
// без своего статуса, без списания времени; статус выводится из дочерних задач.
// TASK — обычная задача, родителем может быть только EPIC того же проекта.
export type TaskType = 'TASK' | 'EPIC'
// Кто выполнил действие: человек или ИИ-агент от его имени (ai.md §3.4).
// Сервер всегда отдаёт значение (DEFAULT 'HUMAN'), но старые ответы могут его
// не содержать — поэтому поля actorType ниже помечены необязательными.
export type ActorType = 'HUMAN' | 'AGENT'

// --- Auth ---------------------------------------------------------------

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface AuthResponse {
  token: string
  username: string
  roles: string[]
}

// --- Users ----------------------------------------------------------------

export interface UserProfile {
  id: number
  username: string
  email: string
  displayName: string
  avatarUrl: string | null
}

export interface UpdateProfileRequest {
  displayName?: string
  email?: string
  avatarUrl?: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface UserSummary {
  id: number
  username: string
  displayName: string
  avatarUrl: string | null
}

export interface AdminUserResponse {
  id: number
  username: string
  email: string
  displayName: string
  avatarUrl: string | null
  isActive: boolean
  isAdmin: boolean
  createdAt: number
  updatedAt: number
}

export interface AdminUserStatusRequest {
  isActive: boolean
}

// --- Projects ---------------------------------------------------------------

export interface ProjectResponse {
  id: number
  name: string
  description: string | null
  ownerUserId: number
  color: string | null
  icon: string | null
  tags: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectRequest {
  name: string
  description?: string
  color?: string
  icon?: string
  tags?: string[]
}

export interface ProjectUpdateRequest {
  name?: string
  description?: string
  color?: string
  icon?: string
  tags?: string[]
}

export interface ProjectAppearanceResponse {
  colors: string[]
  icons: string[]
}

export interface ProjectStatusResponse {
  id: number
  projectId: number
  statusName: string
  statusColor: string | null
  statusOrder: number
  isDefault: boolean
  isClosed: boolean
  isHidden: boolean
}

export interface ProjectStatusRequest {
  projectId: number
  statusName: string
  statusColor?: string
  statusOrder?: number
  isDefault?: boolean
  isClosed?: boolean
}

// PUT /api/project-statuses/{statusId} — нет projectId и isDefault, зато есть isHidden.
export interface ProjectStatusUpdateRequest {
  statusName?: string
  statusColor?: string
  statusOrder?: number
  isClosed?: boolean
  isHidden?: boolean
}

export interface ProjectMemberResponse {
  id: number
  projectId: number
  userId: number
  username: string
  displayName: string
  roleId: number
  roleName: string
  joinedAt: number
}

export interface ProjectMemberRequest {
  userId: number
  roleId: number
}

export interface ProjectMemberRoleRequest {
  roleId: number
}

export interface RoleResponse {
  id: number
  name: string
  description: string | null
  permissions: string[]
}

// --- Tasks ---------------------------------------------------------------

export interface TaskResponse {
  id: number
  projectId: number
  title: string
  description: string | null
  summary: string | null
  creatorUserId: number
  // У эпика всегда null — исполнителя и статуса у него нет (parent_task.md §1).
  assignedUserId: number | null
  statusId: number | null
  dueDate: number | null
  startDate: number | null
  estimatedHours: number | null
  tags: string[]
  isArchived: boolean
  createdAt: string
  updatedAt: string
  // Оптимистическая блокировка: значение шлётся обратно в PATCH через
  // заголовок X-Expected-Version (см. src/api/tasks.ts).
  version: number
  // --- Эпики (parent_task.md §3.2) ---
  taskType: TaskType
  // Только у TASK: id и заголовок родительского эпика (parentKey в API нет —
  // у задач нет буквенного ключа).
  parentId: number | null
  parentTitle: string | null
  // Только у EPIC: прогресс по дочерним задачам. childDone считается по флагу
  // isClosed их статусов; epicClosed = все задачи закрыты и их больше нуля.
  childTotal: number | null
  childDone: number | null
  epicClosed: boolean | null
  // --- Вехи (plan.md §4.1) ---
  // Веха задачи — «к какому сроку». Ось, ортогональная эпику: у задачи может
  // быть и эпик, и веха. У эпика milestoneId всегда null (веха собирает задачи).
  milestoneId: number | null
  milestoneTitle: string | null
  milestoneDueDate: number | null
  // true — этой правкой все задачи вехи стали закрыты, а веха ещё открыта:
  // повод предложить её закрыть (plan.md §4.6). Сервер шлёт только в ответе на
  // PUT /api/tasks/{id}/milestone и PATCH, закрывший последнюю задачу.
  milestoneReady?: boolean
}

export interface TaskRequest {
  title: string
  description?: string
  tags?: string[]
  // Не задан — сервер создаёт TASK. EPIC нельзя создать с parentId/assignee/status.
  taskType?: TaskType
  parentId?: number
  // Веха того же проекта, открытая. Только у TASK (plan.md §4.1).
  milestoneId?: number
}

// PUT /api/tasks/{taskId}/milestone — привязать/перенести/отвязать задачу от
// вехи. milestoneId отсутствует или null → отвязать. Как и у эпика, в PATCH
// этого поля нет — ручка отдельная (plan.md §7). Веха должна быть открытой и
// в том же проекте (400); эпик к вехе привязать нельзя (400).
export interface TaskMilestoneRequest {
  milestoneId?: number | null
}

// PUT /api/tasks/{taskId}/parent — привязать/перенести/отвязать задачу от эпика.
// parentId отсутствует или null → отвязать. В PATCH этого поля нет: сервер не
// отличает присланный null от отсутствующего, поэтому ручка отдельная.
export interface TaskParentRequest {
  parentId?: number | null
}

// PUT /api/tasks/{taskId}/convert — сменить вид. TASK→EPIC снимает исполнителя
// и статус (400, если есть родитель или списано время); EPIC→TASK — 400, если
// внутри есть задачи.
export interface TaskConvertRequest {
  to: TaskType
}

export interface TaskUpdateRequest {
  title?: string
  description?: string
  tags?: string[]
  assignedUserId?: number | null
  statusId?: number | null
  dueDate?: number | null
  startDate?: number | null
  estimatedHours?: number | null
  isArchived?: boolean
}

export interface FindTasksRequest {
  projectId?: number
  titleSearch?: string
  contentSearch?: string
  assignedUserId?: number
  assignedToMe?: boolean
  statusId?: number
  // EPIC | TASK — не задан, возвращаются оба вида. parentId — задачи одного эпика.
  taskType?: TaskType
  parentId?: number
  // milestoneId — задачи одной вехи; noMilestone: true — задачи без вехи.
  milestoneId?: number
  noMilestone?: boolean
  isArchived?: boolean
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface ResponseWrapper {
  tasks: TaskResponse[]
  total: number
  limit: number
  offset: number
}

// --- Comments / discussion ------------------------------------------------

export interface CommentRequest {
  content: string
  visibility?: Visibility
}

export interface CommentResponse {
  id: number
  taskId: number
  userId: number
  content: string
  visibility: Visibility
  actorType?: ActorType
  createdAt: string
  isEdited: boolean
  updatedAt: string | null
}

export interface DiscussionBlockRequest {
  id?: string
  parentId?: string | null
  author?: string
  type?: BlockType
  content: string
}

export interface DiscussionBlockResponse {
  id: string
  parentId: string | null
  author: string
  type: BlockType
  content: string
  level: number
  createdAt: string
}

// --- Summary / activity -----------------------------------------------------

export interface TaskSummaryRequest {
  summary: string
}

export interface TaskSummaryResponse {
  taskId: number
  summary: string
  updatedAt: string
}

export interface ActivityResponse {
  id: number
  projectId: number | null
  taskId: number | null
  userId: number
  username: string
  actionType: string
  details: Record<string, unknown>
  visibility: Visibility
  actorType?: ActorType
  // jti агентского токена — все действия одной сессии агента (ai.md §3.4).
  actorSession?: string | null
  createdAt: string
}

// --- Files ---------------------------------------------------------------

export interface FileResponse {
  id: number
  taskId: number
  projectId: number
  fileName: string
  fileOriginalName: string
  fileSize: number
  mimeType: string
  fileUrl: string
  uploadedByUserId: number
  createdAt: string
}

// --- Time tracking ---------------------------------------------------------

export interface TimeEntry {
  id: number
  taskId: number
  userId: number
  seconds: number
  description: string | null
  startTime: string | null
  createdAt: string
}

export interface TimeEntryRequest {
  seconds: number
  description?: string
  startTime?: number
}

export interface ProjectTimeLine {
  projectId: number
  projectName: string
  totalSeconds: number
  totalHours: number
  entryCount: number
}

export interface TimeReportResponse {
  userId: number
  username: string
  year: number
  month: number
  from: number
  to: number
  totalSeconds: number
  totalHours: number
  entryCount: number
  byProject: ProjectTimeLine[]
}

export interface UserTimeLine {
  userId: number
  username: string
  displayName: string
  totalSeconds: number
  totalHours: number
  entryCount: number
}

// GET /api/reports/time/project/{projectId} — сводка по времени команды на проект.
export interface ProjectTimeReportResponse {
  projectId: number
  projectName: string
  year: number
  month: number
  from: number
  to: number
  totalSeconds: number
  totalHours: number
  entryCount: number
  byUser: UserTimeLine[]
}

// --- Wiki ----------------------------------------------------------------
// Модуль базы знаний. Спека — wiki.md в корне репозитория; при расхождении
// побеждает контракт (openapi5.yaml). Отличия от wiki.md, учтённые здесь:
// ссылки на задачи — по числовому id (#123), а не TSK-123; в WikiBacklinkResponse
// нет taskId/taskKey — это всегда «страницы, которые ссылаются на X».

// GET /api/projects/{projectId}/wiki — плоский список узлов дерева, без content.
export interface WikiTreeNodeResponse {
  id: number
  parentId: number | null
  title: string
  position: number
  // Краткое описание для панели навигации. Своё описание страницы
  // (summaryInferred: false) либо автопревью из начала content
  // (summaryInferred: true); null — контент оказался одной разметкой.
  summary: string | null
  summaryInferred: boolean
}

export interface WikiPageResponse {
  id: number
  projectId: number
  parentId: number | null
  title: string
  // Одно предложение «о чём страница». null у страниц, созданных до того,
  // как поле появилось. GET автопревью сюда НЕ подставляет — только дерево.
  summary: string | null
  content: string
  position: number
  createdBy: number
  updatedBy: number
  createdAt: number
  updatedAt: number
  // Оптимистическая блокировка: значение уходит обратно в PUT через заголовок
  // X-Expected-Version (см. src/api/wiki.ts).
  version: number
}

export interface WikiPageRequest {
  parentId?: number | null
  title: string
  // Обязателен при создании: 1..500 символов, не пробелы (иначе 400).
  summary: string
  content: string
  comment?: string
}

export interface WikiPageUpdateRequest {
  title?: string
  // null / отсутствует = не трогать. Строка 1..500. Пустой строкой очистить
  // нельзя (400) — поэтому клиент шлёт описание, только когда оно заполнено.
  summary?: string | null
  content?: string
  comment?: string
}

export interface WikiRevisionResponse {
  id: number
  pageId: number
  title: string
  authorId: number
  authorName: string | null
  comment: string | null
  createdAt: number
}

export interface WikiRevisionDetailResponse {
  id: number
  pageId: number
  title: string
  content: string
  authorId: number
  authorName: string | null
  comment: string | null
  createdAt: number
}

// GET /api/wiki/{id}/backlinks и GET /api/tasks/{taskId}/wiki — страницы,
// которые ссылаются на страницу / упоминают задачу.
export interface WikiBacklinkResponse {
  pageId: number
  projectId: number
  title: string
}

export interface WikiFindRequest {
  projectId?: number
  titleSearch?: string
  contentSearch?: string
  limit?: number
  offset?: number
}

export interface WikiFindResponse {
  pages: WikiPageResponse[]
  total: number
  limit: number
  offset: number
}

// --- Roadmap -----------------------------------------------------------
// Временная шкала эпиков проекта (roadmap.md). Одна полоса — один эпик, от
// startDate до dueDate, заливка по childDone/childTotal. Всё считает сервер:
// GET /api/projects/{projectId}/roadmap. Отличия от roadmap.md, учтённые здесь:
// даты — epoch-ms (не LocalDate); поля key в RoadmapItem нет.

export type RoadmapState = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'AT_RISK' | 'OVERDUE'

export interface RoadmapItem {
  id: number
  title: string
  // Effective-даты: свои у эпика либо выведенные по задачам (MIN start/created,
  // MAX due) — тогда datesInferred: true. null только у элементов undated.
  startDate: number | null
  dueDate: number | null
  datesInferred: boolean
  childTotal: number
  childDone: number
  // Незакрытые дочерние задачи с истёкшим сроком — ради этого дорожную карту и смотрят.
  childOverdue: number
  state: RoadmapState
  // Сумма списанного времени по задачам эпика (на эпик время не списывают).
  spentSeconds: number
}

export interface RoadmapResponse {
  // Края шкалы, epoch-ms. Без from/to сервер берёт мин/макс по эпикам ± неделя.
  rangeFrom: number
  rangeTo: number
  // Эпики с датами, отсортированы по effective startDate.
  items: RoadmapItem[]
  // Эпики без дат вообще — показываются списком под шкалой, не прячутся.
  undated: RoadmapItem[]
}

// --- Milestones -------------------------------------------------------------
// Веха — точка на оси времени (релиз, демо, срок), а не отрезок как эпик
// (plan.md §1). Спека — plan.md. Даты — epoch-ms (BIGINT), не LocalDate, как
// везде в API. Состояние вычисляется сервером из состава + флага OPEN/CLOSED.

export type MilestoneState =
  | 'PLANNED'      // работа не начата
  | 'IN_PROGRESS'  // идёт по плану
  | 'READY'        // все задачи готовы, веха ещё открыта — ждёт закрытия
  | 'AT_RISK'      // не успеваем по темпу
  | 'LATE'         // срок прошёл, работа осталась
  | 'CLOSED'       // закрыта человеком

// GET /api/projects/{projectId}/milestones, GET /api/milestones/{id}.
export interface MilestoneResponse {
  id: number
  projectId: number
  title: string
  description: string | null
  // epoch-ms, обязателен: веха без даты бессмысленна (plan.md §2).
  dueDate: number
  state: MilestoneState
  taskTotal: number
  taskDone: number
  // Задачи вехи с истёкшим собственным сроком (plan.md §4.2).
  taskOverdue: number
  closedAt: number | null
  closedByName: string | null
  createdAt: number
  updatedAt: number
  // Оптимистическая блокировка: уходит обратно в PUT через X-Expected-Version.
  version: number
}

// POST /api/projects/{projectId}/milestones — ответ без тела (id новой вехи
// узнаём, перечитав список; заголовок уникален в пределах проекта).
export interface MilestoneRequest {
  title: string
  description?: string
  dueDate: number
}

// PUT /api/milestones/{id} — частичная правка. Поле отсутствует/null — не трогать.
// state не меняется — для этого /close и /reopen.
export interface MilestoneUpdateRequest {
  title?: string
  description?: string
  dueDate?: number
}

// --- Permissions -----------------------------------------------------------

export interface PermissionCheckRequest {
  userId?: number
  projectId?: number
  action?: string
}

// --- Notifications ------------------------------------------------------
// Колокольчик в шапке (notifications.md §1). Серверная часть готова: одна
// таблица + шесть ручек /api/notifications. Web Push / Telegram / SSE не
// реализованы — здесь только in-app лента и опрос счётчика.

export type NotificationType = 'MENTION' | 'ASSIGNED' | 'COMMENT' | 'STATUS_CHANGED' | 'DUE_SOON'

export interface NotificationResponse {
  id: number
  // Строкой, а не NotificationType: сервер может завести новый тип раньше клиента.
  type: string
  // taskId есть почти всегда; actor отсутствует у системных (DUE_SOON).
  taskId: number | null
  commentId: number | null
  actorId: number | null
  actorUsername: string | null
  // Готовый текст, собранный при создании уведомления (payload).
  text: string
  read: boolean
  createdAt: string
}

export interface UnreadCountResponse {
  unread: number
}

export interface NotificationSettingResponse {
  type: string
  inApp: boolean
}

export interface NotificationSettingRequest {
  inApp: boolean
}

// --- Pagination helper (клиентский, не из API) ------------------------------

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
