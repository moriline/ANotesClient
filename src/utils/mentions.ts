import type { TokenizerAndRendererExtension } from 'marked'

// Упоминания участников в тексте задачи (комментарии, описание).
//
// Формат токена — @username (без пробелов), как в notifications.md §7: сервер
// сканирует именно @username и по нему создаёт уведомление типа MENTION
// упомянутому. Автодополнение (MentionTextarea.vue) вставляет @username по
// выбору из списка; при отображении токен заменяется на «@Имя Фамилия».

export interface MentionUser {
  /** userId участника (ProjectMemberResponse.userId). */
  id: number
  /** username — то, что попадает в текст как @username. */
  username: string
  /** Отображаемое имя — показывается в списке и в отрендеренной плашке. */
  name: string
  /** ProjectMemberResponse аватар не отдаёт — берём из словаря пользователей. */
  avatarUrl?: string | null
}

// @username: начинается и заканчивается буквой/цифрой, внутри допустимы . _ -
// (так «@anna.» в конце предложения даёт username «anna», а не «anna.»).
const MENTION_TOKEN = /@([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)/g

/** username из всех токенов @… в тексте (в порядке появления, без повторов). */
export function extractMentionUsernames(text: string | null | undefined): string[] {
  if (!text) return []
  const out = new Set<string>()
  for (const m of text.matchAll(MENTION_TOKEN)) out.add(m[1]!)
  return [...out]
}

/**
 * Участники, реально упомянутые в тексте. Матч по username без учёта регистра —
 * учитываются только известные участники проекта (чужой @… — просто текст).
 */
export function resolveMentions(text: string | null | undefined, members: MentionUser[]): MentionUser[] {
  const byUsername = new Map(members.map(m => [m.username.toLowerCase(), m]))
  const seen = new Set<number>()
  const out: MentionUser[] = []
  for (const username of extractMentionUsernames(text)) {
    const u = byUsername.get(username.toLowerCase())
    if (u && !seen.has(u.id)) {
      seen.add(u.id)
      out.push(u)
    }
  }
  return out
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

/**
 * marked-расширение: @username → подсвеченная плашка «@Имя Фамилия», если такой
 * участник есть; иначе — просто текст «@username» (ссылаться некуда — маршрута
 * чужого профиля нет).
 */
export function mentionExtension(members: MentionUser[]): TokenizerAndRendererExtension {
  const byUsername = new Map(members.map(m => [m.username.toLowerCase(), m]))
  return {
    name: 'mention',
    level: 'inline',
    start(src) {
      const i = src.indexOf('@')
      return i === -1 ? undefined : i
    },
    tokenizer(src) {
      const m = /^@([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)/.exec(src)
      if (!m) return undefined
      return { type: 'mention', raw: m[0], text: m[1]! }
    },
    renderer(token) {
      const username = String(token.text)
      const user = byUsername.get(username.toLowerCase())
      return user
        ? `<span class="mention">@${escapeHtml(user.name)}</span>`
        : `@${escapeHtml(username)}`
    }
  }
}
