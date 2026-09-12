// Метаданные разделов справки. Лёгкий модуль без контента — его импортируют
// HelpLink / HelpNav, которые встроены по всему интерфейсу. Сам Markdown-контент
// (тяжёлый, ленивый) живёт в ./content.ts и подключается только из HelpView.

export interface HelpTopicMeta {
  id: string
  title: string
  /** Одна фраза для поповера HelpLink — «о чём этот раздел». */
  hint?: string
}

export interface HelpGroup {
  title: string
  topics: HelpTopicMeta[]
}

export const HELP_GROUPS: HelpGroup[] = [
  {
    title: 'Основное',
    topics: [
      { id: 'overview', title: 'Обзор', hint: 'Что такое проекты, задачи, эпики и вехи и куда идти за чем.' },
      { id: 'dashboard', title: 'Моя доска', hint: 'Мои задачи через все проекты сразу — по срочности, с фильтром по проекту и вехе.' },
      { id: 'tasks', title: 'Задачи', hint: 'Как устроена задача, статусы, архив, как сохраняются изменения.' },
      { id: 'task-fields', title: 'Поля задачи', hint: 'Разбор полей задачи: срок, оценка, теги, эпик, веха и остальные.' },
      { id: 'epics', title: 'Эпики', hint: 'Эпик как направление работы: прогресс, дочерние задачи, конвертация.' },
      { id: 'milestones', title: 'Вехи', hint: 'Веха как контрольная точка по сроку: состояния, закрытие, удаление.' }
    ]
  },
  {
    title: 'Планирование',
    topics: [
      { id: 'roadmap', title: 'Дорожная карта', hint: 'Шкала эпиков проекта: полосы, масштаб, вехи-ромбы.' },
      { id: 'task-list', title: 'Страница «Задачи»', hint: 'Фильтры, поиск и режимы отображения списка задач.' }
    ]
  },
  {
    title: 'Знания и общение',
    topics: [
      { id: 'wiki', title: 'База знаний', hint: 'Вики проекта: дерево, ссылки, редактор, история версий.' },
      { id: 'comments-mentions', title: 'Комментарии и упоминания', hint: 'Комментарии, упоминания @username, отметка «через агента».' },
      { id: 'summary', title: 'Резюме задачи', hint: 'Краткое изложение задачи в 2–4 предложения — заполняете вы или ИИ-агент.' },
      { id: 'markdown', title: 'Разметка Markdown', hint: 'Какая разметка поддерживается и где она отображается.' }
    ]
  },
  {
    title: 'Ещё',
    topics: [
      { id: 'reports', title: 'Отчёты по времени', hint: 'Отчёты по списанному времени: вкладки, период, ссылки.' },
      { id: 'notifications', title: 'Уведомления', hint: 'Колокольчик: какие события приходят и как их настроить.' },
      { id: 'time-tracking', title: 'Учёт времени', hint: 'Как ведётся списанное время у задач и эпиков.' },
      { id: 'agent', title: 'ИИ-агент', hint: 'Подключение внешнего ИИ-агента: токен, адреса, что ему доступно.' },
      { id: 'keyboard', title: 'Горячие клавиши', hint: 'Все горячие клавиши приложения.' },
      { id: 'account', title: 'Профиль и вход', hint: 'Профиль, смена пароля, настройки уведомлений.' }
    ]
  }
]

export const HELP_TOPICS: HelpTopicMeta[] = HELP_GROUPS.flatMap(g => g.topics)

export const DEFAULT_HELP_TOPIC = 'overview'

export function helpTitle(topic: string): string {
  return HELP_TOPICS.find(t => t.id === topic)?.title ?? 'Справка'
}

export function helpHint(topic: string): string {
  return HELP_TOPICS.find(t => t.id === topic)?.hint ?? 'Открыть соответствующий раздел справки.'
}

export function isHelpTopic(topic: string | undefined | null): topic is string {
  return !!topic && HELP_TOPICS.some(t => t.id === topic)
}
