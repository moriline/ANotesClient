import { http } from './http'
import type {
  WikiBacklinkResponse,
  WikiFindRequest,
  WikiFindResponse,
  WikiPageRequest,
  WikiPageResponse,
  WikiPageUpdateRequest,
  WikiRevisionDetailResponse,
  WikiRevisionResponse,
  WikiTreeNodeResponse
} from '@/types/domain'

// GET /api/projects/{projectId}/wiki — всё дерево проекта разом, без content
// (панель навигации собирает иерархию на клиенте, см. wiki.md §4.2).
export function getWikiTree(projectId: number) {
  return http.get<WikiTreeNodeResponse[]>(`/projects/${projectId}/wiki`)
}

// POST /api/projects/{projectId}/wiki — ответ без тела. id новой страницы
// узнаём, перечитав дерево (заголовок уникален в пределах проекта).
export function createWikiPage(projectId: number, payload: WikiPageRequest) {
  return http.post<void>(`/projects/${projectId}/wiki`, payload)
}

export function getWikiPage(pageId: number) {
  return http.get<WikiPageResponse>(`/wiki/${pageId}`)
}

// expectedVersion → заголовок X-Expected-Version (оптимистическая блокировка,
// механика как у задач). В отличие от задач шлём его всегда: у вики один
// клиент и молчаливая перезапись чужого текста здесь дороже (wiki.md §2.2).
// Несовпадение версии — сервер отвечает 409.
export function updateWikiPage(pageId: number, payload: WikiPageUpdateRequest, expectedVersion?: number) {
  const headers: Record<string, string> = {}
  if (expectedVersion != null) headers['X-Expected-Version'] = String(expectedVersion)
  return http.put<WikiPageResponse>(`/wiki/${pageId}`, payload, { headers })
}

// cascade=true — удалить страницу вместе с дочерними. Без него, если у страницы
// есть дети, сервер отвечает 409 (wiki.md §4.3) — тогда спрашиваем подтверждение
// и повторяем с cascade.
export function deleteWikiPage(pageId: number, cascade = false) {
  return http.delete<void>(`/wiki/${pageId}${cascade ? '?cascade=true' : ''}`)
}

export function getWikiRevisions(pageId: number) {
  return http.get<WikiRevisionResponse[]>(`/wiki/${pageId}/revisions`)
}

export function getWikiRevision(revisionId: number) {
  return http.get<WikiRevisionDetailResponse>(`/wiki/revisions/${revisionId}`)
}

// Кто ссылается на страницу — блок «Упоминается в» внизу страницы.
export function getWikiBacklinks(pageId: number) {
  return http.get<WikiBacklinkResponse[]>(`/wiki/${pageId}/backlinks`)
}

// Страницы базы знаний, упоминающие задачу — карточка «Документация» на задаче.
export function getTaskWikiPages(taskId: number) {
  return http.get<WikiBacklinkResponse[]>(`/tasks/${taskId}/wiki`)
}

// POST /api/wiki/find — поиск по образцу /api/find. contentSearch ищет по
// заголовку, содержимому и краткому описанию (titleSearch — только по заголовку).
export function findWikiPages(payload: WikiFindRequest) {
  return http.post<WikiFindResponse>('/wiki/find', payload)
}
