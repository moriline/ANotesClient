import type { Ctx } from '../demoHttp'
import { db } from '../store'
import { badRequest, conflict, expectedVersion, nextId, notFound, nowMs, toInt } from '../util'
import type { DbWikiFile, DbWikiPage } from '../seed'

function toTreeNode(p: DbWikiPage) {
  return { id: p.id, parentId: p.parentId, title: p.title, position: p.position, summary: p.summary, summaryInferred: false }
}

function wikiFileUrl(f: DbWikiFile): string {
  return `/api/wiki/files/${f.storedName}`
}

function toWikiFileResponse(f: DbWikiFile) {
  return {
    id: f.id,
    pageId: f.pageId,
    storedName: f.storedName,
    originalName: f.originalName,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    isImage: f.isImage,
    url: wikiFileUrl(f),
    uploadedBy: f.uploadedByUserId,
    uploadedByName: db.users.find(u => u.id === f.uploadedByUserId)?.displayName ?? `Пользователь #${f.uploadedByUserId}`,
    uploadedAt: f.createdAt
  }
}

export function listWikiFiles(ctx: Ctx) {
  const pageId = Number(ctx.params.pageId)
  return db.wikiFiles.filter(f => f.pageId === pageId).map(toWikiFileResponse)
}

// В демо нет настоящего хранилища файлов — как и у файлов задачи (tasks.ts),
// загрузка вежливо отклоняется вместо притворного успеха без содержимого.
export function uploadWikiFile(_ctx: Ctx): never {
  badRequest('В демо загрузка файлов недоступна')
}

export function deleteWikiFile(ctx: Ctx) {
  const id = Number(ctx.params.fileId)
  const file = db.wikiFiles.find(f => f.id === id)
  if (!file) notFound('Файл не найден')
  const force = ctx.query.get('force') === 'true'
  const page = db.wikiPages.find(p => p.id === file.pageId)
  const usedInText = !!page && page.content.includes(wikiFileUrl(file))
  if (usedInText && !force) conflict('Файл используется в тексте страницы')
  db.wikiFiles = db.wikiFiles.filter(f => f.id !== id)
  return undefined
}

function toPageResponse(p: DbWikiPage) {
  return {
    id: p.id, projectId: p.projectId, parentId: p.parentId, title: p.title, summary: p.summary,
    content: p.content, position: p.position, createdBy: p.createdBy, updatedBy: p.updatedBy,
    createdAt: p.createdAt, updatedAt: p.updatedAt, version: p.version
  }
}

export function wikiTree(ctx: Ctx) {
  const projectId = Number(ctx.params.projectId)
  return db.wikiPages.filter(p => p.projectId === projectId).sort((a, b) => a.position - b.position).map(toTreeNode)
}

export function createPage(ctx: Ctx) {
  const projectId = Number(ctx.params.projectId)
  const body = ctx.body ?? {}
  if (!body.title) badRequest('Заголовок обязателен')
  if (!body.summary || !body.summary.trim()) badRequest('Краткое описание обязательно')
  const now = nowMs()
  const siblings = db.wikiPages.filter(p => p.projectId === projectId && p.parentId === (body.parentId ?? null))
  const page: DbWikiPage = {
    id: nextId(), projectId, parentId: body.parentId ?? null, title: body.title, summary: body.summary,
    content: body.content ?? '', position: siblings.length + 1, createdBy: db.currentUserId,
    updatedBy: db.currentUserId, createdAt: now, updatedAt: now, version: 1
  }
  db.wikiPages.push(page)
  return undefined
}

export function getPage(ctx: Ctx) {
  const p = db.wikiPages.find(x => x.id === Number(ctx.params.pageId))
  if (!p) notFound('Страница не найдена')
  return toPageResponse(p)
}

export function updatePage(ctx: Ctx) {
  const p = db.wikiPages.find(x => x.id === Number(ctx.params.pageId))
  if (!p) notFound('Страница не найдена')
  const expected = expectedVersion(ctx.headers)
  if (expected != null && expected !== p.version) conflict('Страницу успели изменить')

  db.wikiRevisions.push({
    id: nextId(), pageId: p.id, title: p.title, content: p.content,
    authorId: p.updatedBy, authorName: db.users.find(u => u.id === p.updatedBy)?.displayName ?? null,
    comment: ctx.body?.comment ?? null, createdAt: p.updatedAt
  })

  const body = ctx.body ?? {}
  if (body.title !== undefined) p.title = body.title
  if (body.summary) p.summary = body.summary // пустая строка = «не менять» (контракт)
  if (body.content !== undefined) p.content = body.content
  p.updatedBy = db.currentUserId
  p.updatedAt = nowMs()
  p.version += 1
  return toPageResponse(p)
}

export function deletePage(ctx: Ctx) {
  const id = Number(ctx.params.pageId)
  const p = db.wikiPages.find(x => x.id === id)
  if (!p) notFound('Страница не найдена')
  const cascade = ctx.query.get('cascade') === 'true'
  const children = db.wikiPages.filter(x => x.parentId === id)
  if (children.length && !cascade) conflict('У страницы есть дочерние — нужен cascade')
  if (cascade) db.wikiPages = db.wikiPages.filter(x => x.parentId !== id)
  db.wikiPages = db.wikiPages.filter(x => x.id !== id)
  db.wikiRevisions = db.wikiRevisions.filter(x => x.pageId !== id)
  return undefined
}

export function listRevisions(ctx: Ctx) {
  const pageId = Number(ctx.params.pageId)
  return db.wikiRevisions.filter(r => r.pageId === pageId).sort((a, b) => b.createdAt - a.createdAt)
    .map(r => ({ id: r.id, pageId: r.pageId, title: r.title, authorId: r.authorId, authorName: r.authorName, comment: r.comment, createdAt: r.createdAt }))
}

export function getRevision(ctx: Ctx) {
  const r = db.wikiRevisions.find(x => x.id === Number(ctx.params.revisionId))
  if (!r) notFound('Ревизия не найдена')
  return r
}

export function backlinks(ctx: Ctx) {
  const page = db.wikiPages.find(x => x.id === Number(ctx.params.pageId))
  if (!page) notFound('Страница не найдена')
  const needle = `[[${page.title.toLowerCase()}]]`
  return db.wikiPages
    .filter(p => p.id !== page.id && p.content.toLowerCase().includes(needle))
    .map(p => ({ pageId: p.id, projectId: p.projectId, title: p.title }))
}

export function taskWiki(ctx: Ctx) {
  const taskId = Number(ctx.params.taskId)
  const re = new RegExp(`#${taskId}(?!\\d)`)
  return db.wikiPages.filter(p => re.test(p.content)).map(p => ({ pageId: p.id, projectId: p.projectId, title: p.title }))
}

export function findWiki(ctx: Ctx) {
  const q = ctx.body ?? {}
  let list = db.wikiPages.slice()
  if (q.projectId != null) list = list.filter(p => p.projectId === q.projectId)
  if (q.titleSearch) list = list.filter(p => p.title.includes(q.titleSearch))
  if (q.contentSearch) {
    const needle = String(q.contentSearch).toLowerCase()
    list = list.filter(p =>
      p.title.toLowerCase().includes(needle) ||
      p.content.toLowerCase().includes(needle) ||
      (p.summary ?? '').toLowerCase().includes(needle)
    )
  }
  const total = list.length
  const limit = q.limit ?? toInt(ctx.query.get('limit') ?? undefined) ?? 20
  const offset = q.offset ?? 0
  return { pages: list.slice(offset, offset + limit).map(toPageResponse), total, limit, offset }
}
