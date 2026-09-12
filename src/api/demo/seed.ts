// Демо-данные (client_pages.md §4). Правило №1: даты — сдвигом от «сегодня»,
// никогда абсолютные, иначе через месяц дорожная карта и вехи станут сплошь
// просроченными. Производные поля (childTotal/taskDone/roadmap state и т.п.)
// сюда НЕ кладём — их на лету считают handlers из db.tasks, как считает сервер.

export const DAY = 86_400_000
const now = Date.now()
export const d = (offsetDays: number) => now + offsetDays * DAY

export interface DbUser {
  id: number
  username: string
  displayName: string
  email: string
  avatarUrl: string | null
  isAdmin: boolean
  isActive: boolean
  createdAt: number
}

export interface DbProject {
  id: number
  name: string
  description: string | null
  ownerUserId: number
  color: string | null
  icon: string | null
  tags: string[]
  isActive: boolean
  createdAt: number
  updatedAt: number
}

export interface DbStatus {
  id: number
  projectId: number
  statusName: string
  statusColor: string | null
  statusOrder: number
  isDefault: boolean
  isClosed: boolean
  isHidden: boolean
}

export interface DbMember {
  id: number
  projectId: number
  userId: number
  roleId: number
  joinedAt: number
}

export interface DbRole {
  id: number
  name: string
  description: string | null
  permissions: string[]
}

export interface DbTask {
  id: number
  projectId: number
  title: string
  description: string | null
  summary: string | null
  creatorUserId: number
  assignedUserId: number | null
  statusId: number | null
  dueDate: number | null
  startDate: number | null
  estimatedHours: number | null
  tags: string[]
  isArchived: boolean
  createdAt: number
  updatedAt: number
  version: number
  taskType: 'TASK' | 'EPIC'
  parentId: number | null
  milestoneId: number | null
}

export interface DbComment {
  id: number
  taskId: number
  userId: number
  content: string
  visibility: 'PUBLIC' | 'INTERNAL' | 'SYSTEM'
  actorType: 'HUMAN' | 'AGENT'
  createdAt: number
  isEdited: boolean
  updatedAt: number | null
}

export interface DbTimeEntry {
  id: number
  taskId: number
  userId: number
  seconds: number
  description: string | null
  startTime: number | null
  createdAt: number
}

export interface DbActivity {
  id: number
  projectId: number | null
  taskId: number | null
  userId: number
  username: string
  actionType: string
  details: Record<string, unknown>
  visibility: 'PUBLIC' | 'INTERNAL' | 'SYSTEM'
  actorType: 'HUMAN' | 'AGENT'
  actorSession: string | null
  createdAt: number
}

export interface DbFile {
  id: number
  taskId: number
  projectId: number
  fileName: string
  fileOriginalName: string
  fileSize: number
  mimeType: string
  fileUrl: string
  uploadedByUserId: number
  createdAt: number
}

export interface DbWikiFile {
  id: number
  pageId: number
  storedName: string
  originalName: string
  mimeType: string
  sizeBytes: number
  isImage: boolean
  uploadedByUserId: number
  createdAt: string
}

export interface DbMilestone {
  id: number
  projectId: number
  title: string
  description: string | null
  dueDate: number
  closed: boolean
  closedAt: number | null
  closedByName: string | null
  createdAt: number
  updatedAt: number
  version: number
}

export interface DbWikiPage {
  id: number
  projectId: number
  parentId: number | null
  title: string
  summary: string | null
  content: string
  position: number
  createdBy: number
  updatedBy: number
  createdAt: number
  updatedAt: number
  version: number
}

export interface DbWikiRevision {
  id: number
  pageId: number
  title: string
  content: string
  authorId: number
  authorName: string | null
  comment: string | null
  createdAt: number
}

export interface DbNotification {
  id: number
  userId: number
  type: string
  taskId: number | null
  commentId: number | null
  actorId: number | null
  actorUsername: string | null
  text: string
  read: boolean
  createdAt: number
}

export interface DbNotificationSetting {
  type: string
  inApp: boolean
}

export interface DemoDb {
  currentUserId: number
  users: DbUser[]
  projects: DbProject[]
  statuses: DbStatus[]
  members: DbMember[]
  roles: DbRole[]
  tasks: DbTask[]
  comments: DbComment[]
  timeEntries: DbTimeEntry[]
  activity: DbActivity[]
  files: DbFile[]
  wikiFiles: DbWikiFile[]
  milestones: DbMilestone[]
  wikiPages: DbWikiPage[]
  wikiRevisions: DbWikiRevision[]
  notifications: DbNotification[]
  notificationSettings: DbNotificationSetting[]
}

const PID_WEB = 1
const PID_SYNC = 2

// Статусы project 1 — полный набор из client_pages.md §4.2.
const S_BACKLOG = 101, S_TODO = 102, S_DOING = 103, S_REVIEW = 104, S_DONE = 105, S_CANCELLED = 106
// Статусы project 2 — другой набор, показывает, что статусы настраиваются.
const S2_NEW = 201, S2_DOING = 202, S2_DONE = 203

// Эпики — id из диапазона задач (в API эпик это TaskResponse.taskType==='EPIC').
const E_SYNC = 501, E_VUE = 502, E_NOTIF = 503, E_WIKI = 504, E_PDF = 505

let taskSeq = 600

function mkTask(t: Partial<DbTask> & Pick<DbTask, 'title' | 'projectId'>): DbTask {
  const id = t.id ?? taskSeq++
  return {
    id,
    projectId: t.projectId,
    title: t.title,
    description: t.description ?? null,
    summary: t.summary ?? null,
    creatorUserId: t.creatorUserId ?? 2,
    assignedUserId: t.assignedUserId ?? null,
    statusId: t.statusId ?? null,
    dueDate: t.dueDate ?? null,
    startDate: t.startDate ?? null,
    estimatedHours: t.estimatedHours ?? null,
    tags: t.tags ?? [],
    isArchived: t.isArchived ?? false,
    createdAt: t.createdAt ?? d(-30),
    updatedAt: t.updatedAt ?? d(-1),
    version: t.version ?? 1,
    taskType: t.taskType ?? 'TASK',
    parentId: t.parentId ?? null,
    milestoneId: t.milestoneId ?? null
  }
}

export function buildSeed(): DemoDb {
  const users: DbUser[] = [
    { id: 1, username: 'anna', displayName: 'Анна Смирнова', email: 'anna@example.com', avatarUrl: null, isAdmin: false, isActive: true, createdAt: d(-400) },
    // isAdmin: false — демо-пользователь намеренно не администратор (§5.6),
    // /people должен показывать только каталог, а не таблицу управления.
    { id: 2, username: 'igor', displayName: 'Игорь Петров', email: 'igor@example.com', avatarUrl: null, isAdmin: false, isActive: true, createdAt: d(-400) },
    { id: 3, username: 'maria', displayName: 'Мария Кузнецова', email: 'maria@example.com', avatarUrl: null, isAdmin: false, isActive: true, createdAt: d(-300) },
    { id: 4, username: 'danila', displayName: 'Данила Орлов', email: 'danila@example.com', avatarUrl: null, isAdmin: false, isActive: true, createdAt: d(-200) }
  ]

  const roles: DbRole[] = [
    { id: 1, name: 'Владелец', description: 'Полный доступ к проекту', permissions: ['project:*'] },
    { id: 2, name: 'Участник', description: 'Работа с задачами и вики', permissions: ['tasks:write', 'wiki:write'] },
    { id: 3, name: 'Наблюдатель', description: 'Только чтение', permissions: ['read'] }
  ]

  const projects: DbProject[] = [
    { id: PID_WEB, name: 'Веб-клиент', description: 'Фронтенд менеджера задач: Vue 3 + Nuxt UI.', ownerUserId: 2, color: 'violet', icon: 'i-lucide-monitor', tags: ['frontend', 'vue', 'ui'], isActive: true, createdAt: d(-400), updatedAt: d(-1) },
    { id: PID_SYNC, name: 'Обмен данными', description: 'Синхронизация с внешними системами по REST.', ownerUserId: 2, color: 'blue', icon: 'i-lucide-arrow-left-right', tags: ['integration', 'backend'], isActive: true, createdAt: d(-200), updatedAt: d(-5) }
  ]

  const statuses: DbStatus[] = [
    { id: S_BACKLOG, projectId: PID_WEB, statusName: 'Бэклог', statusColor: '#9CA3AF', statusOrder: 1, isDefault: false, isClosed: false, isHidden: false },
    { id: S_TODO, projectId: PID_WEB, statusName: 'К работе', statusColor: '#9CA3AF', statusOrder: 2, isDefault: true, isClosed: false, isHidden: false },
    { id: S_DOING, projectId: PID_WEB, statusName: 'В работе', statusColor: '#22C55E', statusOrder: 3, isDefault: false, isClosed: false, isHidden: false },
    { id: S_REVIEW, projectId: PID_WEB, statusName: 'На ревью', statusColor: '#F59E0B', statusOrder: 4, isDefault: false, isClosed: false, isHidden: false },
    { id: S_DONE, projectId: PID_WEB, statusName: 'Готово', statusColor: '#22C55E', statusOrder: 5, isDefault: false, isClosed: true, isHidden: false },
    { id: S_CANCELLED, projectId: PID_WEB, statusName: 'Отменена', statusColor: '#9CA3AF', statusOrder: 6, isDefault: false, isClosed: true, isHidden: false },

    { id: S2_NEW, projectId: PID_SYNC, statusName: 'Новое', statusColor: '#9CA3AF', statusOrder: 1, isDefault: true, isClosed: false, isHidden: false },
    { id: S2_DOING, projectId: PID_SYNC, statusName: 'В процессе', statusColor: '#3B82F6', statusOrder: 2, isDefault: false, isClosed: false, isHidden: false },
    { id: S2_DONE, projectId: PID_SYNC, statusName: 'Сделано', statusColor: '#22C55E', statusOrder: 3, isDefault: false, isClosed: true, isHidden: false }
  ]

  const members: DbMember[] = [
    { id: 1, projectId: PID_WEB, userId: 1, roleId: 2, joinedAt: d(-390) },
    { id: 2, projectId: PID_WEB, userId: 2, roleId: 1, joinedAt: d(-400) },
    { id: 3, projectId: PID_WEB, userId: 3, roleId: 2, joinedAt: d(-200) },
    { id: 4, projectId: PID_WEB, userId: 4, roleId: 3, joinedAt: d(-100) },
    { id: 5, projectId: PID_SYNC, userId: 2, roleId: 1, joinedAt: d(-200) },
    { id: 6, projectId: PID_SYNC, userId: 3, roleId: 2, joinedAt: d(-150) }
  ]

  // --- Эпики -----------------------------------------------------------
  const epics: DbTask[] = [
    mkTask({ id: E_SYNC, projectId: PID_WEB, title: 'Переработка обмена сообщениями', taskType: 'EPIC', startDate: d(-25), dueDate: d(10), description: 'Переезд с long-polling на нормальный REST-контракт.' }),
    mkTask({ id: E_VUE, projectId: PID_WEB, title: 'Клиент на Vue', taskType: 'EPIC', startDate: d(-40), dueDate: d(3), description: 'Переписать интерфейс на Vue 3 + Nuxt UI.' }),
    mkTask({ id: E_NOTIF, projectId: PID_WEB, title: 'Уведомления', taskType: 'EPIC', startDate: d(5), dueDate: d(35), description: 'Колокольчик, типы событий, настройки по типу.' }),
    mkTask({ id: E_WIKI, projectId: PID_WEB, title: 'База знаний', taskType: 'EPIC', startDate: d(-60), dueDate: d(-5), description: 'Вики проекта: дерево, ссылки, версии.' }),
    // Без дат вообще — должен попасть в «Без сроков» на дорожной карте.
    mkTask({ id: E_PDF, projectId: PID_WEB, title: 'Экспорт в PDF', taskType: 'EPIC', description: 'Пока не запланирован, лежит в бэклоге направлений.' })
  ]

  // --- Обычные задачи ----------------------------------------------------
  const tasks: DbTask[] = [
    // Эпик «Переработка обмена сообщениями» — 5 задач, 3 закрыты.
    mkTask({ projectId: PID_WEB, parentId: E_SYNC, title: 'Описать новый формат манифеста', statusId: S_DONE, assignedUserId: 1, tags: ['api'] }),
    mkTask({ projectId: PID_WEB, parentId: E_SYNC, title: 'Валидация подписи манифеста', statusId: S_DONE, assignedUserId: 3, tags: ['api', 'security'] }),
    mkTask({ projectId: PID_WEB, parentId: E_SYNC, title: 'Ретраи при обрыве соединения', statusId: S_DONE, assignedUserId: 3 }),
    mkTask({ projectId: PID_WEB, parentId: E_SYNC, title: 'Метрики очереди отправки', statusId: S_DOING, assignedUserId: 2, dueDate: d(6) }),
    mkTask({ projectId: PID_WEB, parentId: E_SYNC, title: 'Обновить документацию по протоколу', statusId: S_TODO, assignedUserId: 1 }),

    // Эпик «Клиент на Vue» — 8 задач, 2 закрыты, AT_RISK.
    mkTask({ projectId: PID_WEB, parentId: E_VUE, title: 'Каркас на Vite + Nuxt UI', statusId: S_DONE, assignedUserId: 2 }),
    mkTask({ projectId: PID_WEB, parentId: E_VUE, title: 'Список задач: фильтры и поиск', statusId: S_DONE, assignedUserId: 2 }),
    mkTask({
      projectId: PID_WEB, parentId: E_VUE, title: 'Страница задачи: комментарии и упоминания',
      statusId: S_REVIEW, assignedUserId: 2, dueDate: d(2), estimatedHours: 6,
      summary: 'Комментарии и @-упоминания собраны, ждём код-ревью Марии. Осталось поправить автопрокрутку списка после отправки и завести тест на MENTION-уведомление.',
      description: 'Реализовать `MentionTextarea` с автодополнением по участникам проекта и рендер `@username` в комментариях и описании через `marked`.'
    }),
    mkTask({ projectId: PID_WEB, parentId: E_VUE, title: 'Доска по статусам с drag&drop', statusId: S_DOING, assignedUserId: 2, dueDate: d(4) }),
    mkTask({ projectId: PID_WEB, parentId: E_VUE, title: 'Дорожная карта эпиков', statusId: S_DOING, assignedUserId: 4, dueDate: d(1) }),
    // Просроченная — незакрытый статус, срок в прошлом.
    mkTask({ projectId: PID_WEB, parentId: E_VUE, title: 'Оптимистичная блокировка на форме задачи', statusId: S_REVIEW, assignedUserId: 2, dueDate: d(-3) }),
    mkTask({ projectId: PID_WEB, parentId: E_VUE, title: 'Тёмная тема', statusId: S_BACKLOG, assignedUserId: null }),
    mkTask({ projectId: PID_WEB, parentId: E_VUE, title: 'Виртуализация длинных списков', statusId: S_BACKLOG, assignedUserId: null }),

    // Эпик «Уведомления» — 5 задач, ещё не начаты (NOT_STARTED).
    mkTask({ projectId: PID_WEB, parentId: E_NOTIF, title: 'Таблица notification + миграция', statusId: S_TODO, assignedUserId: 3, dueDate: d(12) }),
    mkTask({ projectId: PID_WEB, parentId: E_NOTIF, title: 'Опрос счётчика непрочитанных', statusId: S_TODO, assignedUserId: 3 }),
    mkTask({ projectId: PID_WEB, parentId: E_NOTIF, title: 'Колокольчик в шапке', statusId: S_TODO, assignedUserId: 2 }),
    mkTask({ projectId: PID_WEB, parentId: E_NOTIF, title: 'Настройки по типу события', statusId: S_TODO, assignedUserId: 4 }),
    // Просроченная — вторая для проверки индикатора.
    mkTask({ projectId: PID_WEB, parentId: E_NOTIF, title: 'MENTION при упоминании в описании', statusId: S_TODO, assignedUserId: 2, dueDate: d(-1) }),

    // Эпик «База знаний» — 4 задачи, все закрыты (DONE).
    mkTask({ projectId: PID_WEB, parentId: E_WIKI, title: 'Дерево страниц на два уровня', statusId: S_DONE, assignedUserId: 1 }),
    mkTask({ projectId: PID_WEB, parentId: E_WIKI, title: 'Ссылки [[Заголовок]] и #123', statusId: S_DONE, assignedUserId: 1 }),
    mkTask({ projectId: PID_WEB, parentId: E_WIKI, title: 'История версий и построчный diff', statusId: S_DONE, assignedUserId: 3 }),
    mkTask({ projectId: PID_WEB, parentId: E_WIKI, title: 'Краткое описание страницы в дереве', statusId: S_DONE, assignedUserId: 1 }),

    // Эпик «Экспорт в PDF» — без дат у задач тоже (эпик остаётся «без сроков»).
    mkTask({ projectId: PID_WEB, parentId: E_PDF, title: 'Выбрать библиотеку рендера PDF', statusId: S_BACKLOG }),
    mkTask({ projectId: PID_WEB, parentId: E_PDF, title: 'Шаблон отчёта по спринту', statusId: S_BACKLOG }),
    mkTask({ projectId: PID_WEB, parentId: E_PDF, title: 'Кнопка экспорта на странице отчётов', statusId: S_BACKLOG }),

    // Без эпика (3–4 штуки) — наполняют группу «Без эпика».
    mkTask({ projectId: PID_WEB, title: 'Обновить иконки в шапке', statusId: S_TODO, assignedUserId: 4 }),
    mkTask({ projectId: PID_WEB, title: 'Починить залипание тултипа в Safari', statusId: S_DOING, assignedUserId: 1, dueDate: d(2) }),
    mkTask({ projectId: PID_WEB, title: 'Пересмотреть цвета статусов', statusId: S_BACKLOG }),
    // Главная витрина — 6 комментариев, 2 от агента; заполняется ниже отдельно.
    mkTask({
      id: 42, projectId: PID_WEB, title: 'Разобрать медленный POST /api/find на больших проектах',
      statusId: S_DOING, assignedUserId: 2, dueDate: d(5), estimatedHours: 4,
      description: 'На проекте с 4000+ задач `POST /api/find` с `contentSearch` укладывается в секунду только на первом вызове — дальше H2 не использует индекс. Разобраться и завести follow-up на бэкенд.',
      tags: ['perf', 'backend']
    }),

    // Проект «Обмен данными» — свой небольшой набор.
    mkTask({ projectId: PID_SYNC, title: 'Контракт вебхука на входящие события', statusId: S2_DOING, assignedUserId: 3, dueDate: d(7) }),
    mkTask({ projectId: PID_SYNC, title: 'Идемпотентность повторной доставки', statusId: S2_NEW, assignedUserId: 2 }),
    mkTask({ projectId: PID_SYNC, title: 'Логирование неудачных попыток', statusId: S2_DONE, assignedUserId: 3 })
  ]

  // --- Вехи ---------------------------------------------------------------
  const milestones: DbMilestone[] = [
    { id: 701, projectId: PID_WEB, title: 'Релиз 1.2', description: 'Уведомления, доска по статусам, тёмная тема.', dueDate: d(12), closed: false, closedAt: null, closedByName: null, createdAt: d(-20), updatedAt: d(-1), version: 1 },
    { id: 702, projectId: PID_WEB, title: 'Демо заказчику', description: 'Прогон основного сценария на живых данных.', dueDate: d(34), closed: false, closedAt: null, closedByName: null, createdAt: d(-10), updatedAt: d(-1), version: 1 },
    { id: 703, projectId: PID_WEB, title: 'Релиз 1.1', description: 'База знаний и дорожная карта.', dueDate: d(-8), closed: false, closedAt: null, closedByName: null, createdAt: d(-60), updatedAt: d(-9), version: 1 }
  ]

  // Разложить часть задач по вехам, не трогая параллельно эпик.
  const byTitle = (title: string) => tasks.find(t => t.title === title)
  const assignMilestone = (title: string, milestoneId: number) => {
    const t = byTitle(title)
    if (t) t.milestoneId = milestoneId
  }
  ;[
    'Метрики очереди отправки', 'Обновить документацию по протоколу',
    'Доска по статусам с drag&drop', 'Дорожная карта эпиков',
    'Оптимистичная блокировка на форме задачи', 'Обновить иконки в шапке',
    'Починить залипание тултипа в Safari', 'Пересмотреть цвета статусов'
  ].forEach(t => assignMilestone(t, 701))
  ;[
    'Страница задачи: комментарии и упоминания', 'Таблица notification + миграция',
    'Опрос счётчика непрочитанных', 'Колокольчик в шапке'
  ].forEach(t => assignMilestone(t, 702))
  ;[
    'Дерево страниц на два уровня', 'Ссылки [[Заголовок]] и #123',
    'История версий и построчный diff', 'Краткое описание страницы в дереве'
  ].forEach(t => assignMilestone(t, 703))

  // --- Комментарии — витрина «через агента» на задаче #42 -----------------
  const comments: DbComment[] = [
    { id: 901, taskId: 42, userId: 2, content: 'Похоже, дело в том, что `contentSearch` матчит `LOWER(title) LIKE` без функционального индекса — H2 делает full scan.', visibility: 'PUBLIC', actorType: 'HUMAN', createdAt: d(-2), isEdited: false, updatedAt: null },
    { id: 902, taskId: 42, userId: 4, content: 'Можем на время демо ограничить `limit` пожёстче со стороны клиента?', visibility: 'PUBLIC', actorType: 'HUMAN', createdAt: d(-2), isEdited: false, updatedAt: null },
    { id: 903, taskId: 42, userId: 2, content: 'Посмотрел план запроса: сканирует всю таблицу задач проекта. На 4000 строк это ~180мс, терпимо, но на 40000 будет секунда.', visibility: 'PUBLIC', actorType: 'AGENT', createdAt: d(-1), isEdited: false, updatedAt: null },
    { id: 904, taskId: 42, userId: 3, content: 'А функциональный индекс на `LOWER(title)` пробовали?', visibility: 'PUBLIC', actorType: 'HUMAN', createdAt: d(-1), isEdited: false, updatedAt: null },
    { id: 905, taskId: 42, userId: 2, content: 'Добавил `CREATE INDEX idx_task_title_lower ON task(LOWER(title))` в черновик миграции — локально ускорило запрос примерно в 6 раз. Резюме задачи обновил.', visibility: 'PUBLIC', actorType: 'AGENT', createdAt: d(-1), isEdited: false, updatedAt: null },
    { id: 906, taskId: 42, userId: 2, content: 'Отлично, беру миграцию в следующий релиз.', visibility: 'PUBLIC', actorType: 'HUMAN', createdAt: d(0), isEdited: false, updatedAt: null }
  ]
  const task42 = tasks.find(t => t.id === 42)!
  task42.summary = 'Нашли причину — full scan по `title` без функционального индекса; агент подготовил миграцию с индексом на `LOWER(title)`, ускорение ×6 на локальном прогоне. Миграция уйдёт в следующий релиз.'

  // --- Учёт времени (4–5 записей) ------------------------------------------
  const timeEntries: DbTimeEntry[] = [
    { id: 1001, taskId: 42, userId: 2, seconds: 5400, description: 'Разбор плана запроса', startTime: d(-2), createdAt: d(-2) },
    { id: 1002, taskId: 42, userId: 2, seconds: 3600, description: 'Черновик миграции с индексом', startTime: d(-1), createdAt: d(-1) },
    { id: 1003, taskId: byTitle('Страница задачи: комментарии и упоминания')!.id, userId: 2, seconds: 14400, description: 'MentionTextarea + рендер', startTime: d(-3), createdAt: d(-3) },
    { id: 1004, taskId: byTitle('Доска по статусам с drag&drop')!.id, userId: 2, seconds: 9000, description: 'Нативный drag между колонками', startTime: d(-2), createdAt: d(-2) },
    { id: 1005, taskId: byTitle('Контракт вебхука на входящие события')!.id, userId: 3, seconds: 7200, description: null, startTime: d(-4), createdAt: d(-4) }
  ]

  // --- Активность — по featured-задаче и паре других мутаций ---------------
  const activity: DbActivity[] = [
    { id: 1, projectId: null, taskId: 42, userId: 2, username: 'igor', actionType: 'COMMENT_ADDED', details: {}, visibility: 'PUBLIC', actorType: 'AGENT', actorSession: 'demo-agent-session-1', createdAt: d(-1) },
    { id: 2, projectId: null, taskId: 42, userId: 2, username: 'igor', actionType: 'SUMMARY_UPDATED', details: {}, visibility: 'PUBLIC', actorType: 'AGENT', actorSession: 'demo-agent-session-1', createdAt: d(-1) },
    { id: 3, projectId: null, taskId: 42, userId: 3, username: 'maria', actionType: 'COMMENT_ADDED', details: {}, visibility: 'PUBLIC', actorType: 'HUMAN', actorSession: null, createdAt: d(-1) }
  ]

  // --- Файлы (фиктивные, без скачивания) ------------------------------------
  const files: DbFile[] = [
    { id: 1101, taskId: 42, projectId: PID_WEB, fileName: 'query-plan.txt', fileOriginalName: 'query-plan.txt', fileSize: 4213, mimeType: 'text/plain', fileUrl: '#', uploadedByUserId: 2, createdAt: d(-2) },
    { id: 1102, taskId: 42, projectId: PID_WEB, fileName: 'index-benchmark.png', fileOriginalName: 'index-benchmark.png', fileSize: 128_400, mimeType: 'image/png', fileUrl: '#', uploadedByUserId: 2, createdAt: d(-1) }
  ]

  // Вложения вики (тоже фиктивные — storedName не отдаёт реальный файл, при
  // просмотре/скачивании покажется заглушка «Изображение недоступно», это
  // ожидаемо для статичного демо без хранилища).
  const wikiFiles: DbWikiFile[] = [
    { id: 1201, pageId: 801, storedName: 'demo-architecture.png', originalName: 'architecture.png', mimeType: 'image/png', sizeBytes: 214_600, isImage: true, uploadedByUserId: 2, createdAt: new Date(d(-3)).toISOString() }
  ]

  // --- Вики: 5 страниц, 2 вложенные, ссылки и ревизии -----------------------
  const wikiPages: DbWikiPage[] = [
    {
      id: 801, projectId: PID_WEB, parentId: null, title: 'Обзор проекта',
      summary: 'С чего начать: архитектура клиента и ссылки на остальные страницы.',
      content: '# Обзор\n\nФронтенд ANotes: Vue 3 + Nuxt UI. Формат манифеста обмена описан на странице [[Формат манифеста]]. Пример разбора см. в задаче #42.\n\nПлан по несуществующей теме — [[Черновик миграции]].',
      position: 1, createdBy: 2, updatedBy: 2, createdAt: d(-90), updatedAt: d(-3), version: 3
    },
    {
      id: 802, projectId: PID_WEB, parentId: 801, title: 'Формат манифеста',
      summary: 'Структура манифеста обмена сообщениями между сервисами.',
      content: '# Формат манифеста\n\n```json\n{\n  "version": 2,\n  "signature": "..."\n}\n```\n\nПодробности валидации — задача #42. Назад: [[Обзор проекта]].',
      position: 1, createdBy: 1, updatedBy: 3, createdAt: d(-80), updatedAt: d(-15), version: 4
    },
    {
      id: 803, projectId: PID_WEB, parentId: null, title: 'Соглашения по коду',
      summary: 'Стиль кода, именование, структура компонентов.',
      content: '# Соглашения\n\n- Composition API, `<script setup>`.\n- Явные импорты для всего, кроме Nuxt UI.\n- Семантические классы темы, не `bg-violet-500` напрямую.',
      position: 2, createdBy: 2, updatedBy: 2, createdAt: d(-70), updatedAt: d(-70), version: 1
    },
    {
      id: 804, projectId: PID_WEB, parentId: 801, title: 'Развёртывание',
      summary: null,
      content: 'Сборка через `npm run build`, деплой — статика за nginx.',
      position: 2, createdBy: 4, updatedBy: 4, createdAt: d(-30), updatedAt: d(-30), version: 1
    },
    {
      id: 805, projectId: PID_SYNC, parentId: null, title: 'Внешние интеграции',
      summary: 'Список систем, с которыми синхронизируемся, и их особенности.',
      content: '# Внешние интеграции\n\nСписок партнёрских API появится здесь по мере подключения.',
      position: 1, createdBy: 3, updatedBy: 3, createdAt: d(-40), updatedAt: d(-40), version: 1
    }
  ]

  const wikiRevisions: DbWikiRevision[] = [
    { id: 1, pageId: 802, title: 'Формат манифеста', content: '# Формат манифеста\n\nЧерновик без примера.', authorId: 1, authorName: 'Анна Смирнова', comment: 'Первый набросок', createdAt: d(-80) },
    { id: 2, pageId: 802, title: 'Формат манифеста', content: '# Формат манифеста\n\n```json\n{\n  "version": 1\n}\n```', authorId: 1, authorName: 'Анна Смирнова', comment: 'Добавил пример JSON', createdAt: d(-50) },
    { id: 3, pageId: 802, title: 'Формат манифеста', content: '# Формат манифеста\n\n```json\n{\n  "version": 2,\n  "signature": "..."\n}\n```\n\nПодробности валидации — задача #42.', authorId: 3, authorName: 'Мария Кузнецова', comment: 'version 2 + подпись', createdAt: d(-15) }
  ]

  // --- Уведомления (3 непрочитанных, разных типов) --------------------------
  const notifications: DbNotification[] = [
    { id: 1201, userId: 2, type: 'MENTION', taskId: 42, commentId: 905, actorId: 3, actorUsername: 'maria', text: 'Мария Кузнецова упомянула вас в задаче «Разобрать медленный POST /api/find на больших проектах»', read: false, createdAt: d(-1) },
    { id: 1202, userId: 2, type: 'STATUS_CHANGED', taskId: byTitle('Доска по статусам с drag&drop')!.id, commentId: null, actorId: 2, actorUsername: 'igor', text: 'Статус задачи «Доска по статусам с drag&drop» изменён на «В работе»', read: false, createdAt: d(-1) },
    { id: 1203, userId: 2, type: 'COMMENT', taskId: 42, commentId: 906, actorId: 2, actorUsername: 'igor', text: 'Новый комментарий в задаче «Разобрать медленный POST /api/find на больших проектах»', read: false, createdAt: d(0) }
  ]

  const notificationSettings: DbNotificationSetting[] = [
    { type: 'MENTION', inApp: true },
    { type: 'ASSIGNED', inApp: true },
    { type: 'COMMENT', inApp: true },
    { type: 'STATUS_CHANGED', inApp: true },
    { type: 'DUE_SOON', inApp: true }
  ]

  return {
    currentUserId: 2,
    users,
    projects,
    statuses,
    members,
    roles,
    tasks: [...epics, ...tasks],
    comments,
    timeEntries,
    activity,
    files,
    wikiFiles,
    milestones,
    wikiPages,
    wikiRevisions,
    notifications,
    notificationSettings
  }
}
