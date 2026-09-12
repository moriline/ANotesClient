// Маршрутизатор демо-транспорта (client_pages.md §3.3). Единственная точка
// входа — demoHttp(); её из http.ts дёргают вместо настоящего fetch, когда
// VITE_DEMO=true. Компоненты, сторы и src/api/*.ts (кроме http.ts) об этом
// не знают — они как обычно зовут http.get/post/put/patch/delete.
import { ApiError } from '../http'
import { delay, matchRoute } from './util'

import * as auth from './handlers/auth'
import * as users from './handlers/users'
import * as projects from './handlers/projects'
import * as tasks from './handlers/tasks'
import * as milestones from './handlers/milestones'
import * as roadmap from './handlers/roadmap'
import * as wiki from './handlers/wiki'
import * as notifications from './handlers/notifications'
import * as reports from './handlers/reports'

export interface Ctx {
  params: Record<string, string>
  query: URLSearchParams
  body: any
  headers: Record<string, string>
}

type Handler = (ctx: Ctx) => unknown

const routes: Array<[string, string, Handler]> = [
  // --- auth ---------------------------------------------------------------
  ['POST', '/auth/login', auth.login],
  ['POST', '/auth/register', auth.register],
  ['POST', '/auth/agent-token', auth.agentToken],

  // --- users / admin / roles -----------------------------------------------
  ['GET', '/users', users.listUsers],
  ['GET', '/users/me', users.getMe],
  ['PUT', '/users/me', users.updateMe],
  ['PUT', '/users/me/password', users.changePassword],
  ['GET', '/admin/users', users.adminUsers],
  ['DELETE', '/admin/users/:id', users.deleteAdminUser],
  ['PUT', '/admin/users/:id/status', users.setAdminUserStatus],
  ['GET', '/roles', users.listRoles],

  // --- projects (static-before-dynamic: /projects/appearance) --------------
  ['GET', '/projects', projects.listProjects],
  ['POST', '/projects', projects.createProject],
  ['GET', '/projects/appearance', projects.appearance],
  ['GET', '/projects/:id', projects.getProject],
  ['PATCH', '/projects/:id', projects.patchProject],
  ['DELETE', '/projects/:id', projects.deleteProject],
  ['GET', '/projects/:id/tags', projects.projectTags],

  ['GET', '/project-statuses/project/:projectId', projects.listStatuses],
  ['POST', '/project-statuses', projects.createStatus],
  ['PUT', '/project-statuses/:statusId', projects.updateStatus],

  ['GET', '/projects/:projectId/members', projects.listMembers],
  ['POST', '/projects/:projectId/members', projects.addMember],
  ['PUT', '/projects/:projectId/members/:userId', projects.updateMemberRole],
  ['DELETE', '/projects/:projectId/members/:userId', projects.removeMember],

  ['POST', '/permissions/check', projects.checkPermissions],

  // --- tasks ----------------------------------------------------------------
  ['POST', '/find', tasks.findTasks],
  ['GET', '/projects/:projectId/tasks', tasks.listProjectTasks],
  ['GET', '/projects/:projectId/tasks/:taskId', tasks.getTask],
  ['POST', '/projects/:projectId/tasks', tasks.createTask],
  ['PATCH', '/projects/:projectId/tasks/:taskId', tasks.patchTask],
  ['DELETE', '/projects/:projectId/tasks/:taskId', tasks.deleteTask],
  ['PUT', '/tasks/:taskId/parent', tasks.setTaskParent],
  ['PUT', '/tasks/:taskId/convert', tasks.convertTask],
  ['GET', '/epics/:epicId/tasks', tasks.epicTasks],
  ['GET', '/projects/:projectId/epics', tasks.projectEpics],

  ['GET', '/tasks/:taskId/comments', tasks.listComments],
  ['POST', '/tasks/:taskId/comments', tasks.createComment],
  ['PUT', '/comments/:commentId', tasks.updateComment],
  ['DELETE', '/comments/:commentId', tasks.deleteComment],

  ['GET', '/tasks/:taskId/summary', tasks.getSummary],
  ['PUT', '/tasks/:taskId/summary', tasks.putSummary],

  ['GET', '/tasks/:taskId/time', tasks.timeTotal],
  ['GET', '/tasks/:taskId/time/entries', tasks.listTimeEntries],
  ['POST', '/tasks/:taskId/time', tasks.createTimeEntry],
  ['DELETE', '/tasks/:taskId/time/entries/:entryId', tasks.deleteTimeEntry],

  ['GET', '/projects/:projectId/activity', tasks.projectActivity],
  ['GET', '/tasks/:taskId/activity', tasks.taskActivity],

  ['GET', '/files/tasks/:taskId', tasks.listFiles],
  ['POST', '/files/projects/:projectId/tasks/:taskId', tasks.uploadFile],
  ['DELETE', '/files/:fileId', tasks.deleteFile],

  // --- milestones -------------------------------------------------------------
  ['GET', '/projects/:projectId/milestones', milestones.listMilestones],
  ['POST', '/projects/:projectId/milestones', milestones.createMilestone],
  ['GET', '/milestones/:id', milestones.getMilestone],
  ['PUT', '/milestones/:id', milestones.updateMilestone],
  ['DELETE', '/milestones/:id', milestones.deleteMilestone],
  ['PUT', '/milestones/:id/close', milestones.closeMilestone],
  ['PUT', '/milestones/:id/reopen', milestones.reopenMilestone],
  ['GET', '/milestones/:id/tasks', milestones.milestoneTasks],
  ['PUT', '/tasks/:taskId/milestone', milestones.setTaskMilestone],

  // --- roadmap ------------------------------------------------------------
  ['GET', '/projects/:projectId/roadmap', roadmap.getRoadmap],

  // --- wiki -----------------------------------------------------------------
  ['GET', '/projects/:projectId/wiki', wiki.wikiTree],
  ['POST', '/projects/:projectId/wiki', wiki.createPage],
  ['POST', '/wiki/find', wiki.findWiki],
  ['GET', '/wiki/revisions/:revisionId', wiki.getRevision],
  ['GET', '/wiki/:pageId', wiki.getPage],
  ['PUT', '/wiki/:pageId', wiki.updatePage],
  ['DELETE', '/wiki/:pageId', wiki.deletePage],
  ['GET', '/wiki/:pageId/revisions', wiki.listRevisions],
  ['GET', '/wiki/:pageId/backlinks', wiki.backlinks],
  ['GET', '/tasks/:taskId/wiki', wiki.taskWiki],
  ['GET', '/wiki/:pageId/files', wiki.listWikiFiles],
  ['POST', '/wiki/:pageId/files', wiki.uploadWikiFile],
  ['DELETE', '/wiki/files/:fileId', wiki.deleteWikiFile],

  // --- notifications ----------------------------------------------------------
  ['GET', '/notifications', notifications.listNotifications],
  ['GET', '/notifications/count', notifications.unreadCount],
  ['PUT', '/notifications/:id/read', notifications.markRead],
  ['PUT', '/notifications/read-all', notifications.markAllRead],
  ['GET', '/notifications/settings', notifications.getSettings],
  ['PUT', '/notifications/settings/:type', notifications.putSettings],

  // --- reports ------------------------------------------------------------
  ['GET', '/reports/time', reports.userTimeReport],
  ['GET', '/reports/time/project/:projectId', reports.projectTimeReport]
]

export async function demoHttp<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const [cleanPath, qs] = path.split('?')

  let body: any
  if (init.body != null) {
    body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined // FormData (загрузка файлов) сюда не доходит осмысленно — обработчик её игнорирует
  }

  for (const [m, pattern, handler] of routes) {
    if (m !== method) continue
    const params = matchRoute(pattern, cleanPath!)
    if (!params) continue

    await delay(method === 'GET' ? 120 : 200, method === 'GET' ? 300 : 400)

    try {
      const result = handler({
        params,
        query: new URLSearchParams(qs ?? ''),
        body,
        headers: (init.headers ?? {}) as Record<string, string>
      })
      return result as T
    } catch (e) {
      if (e instanceof ApiError) throw e
      throw new ApiError(500, e instanceof Error ? e.message : 'Ошибка демо-транспорта')
    }
  }

  throw new ApiError(501, `Демо: ручка ${method} ${cleanPath} не реализована`)
}
