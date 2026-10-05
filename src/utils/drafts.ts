import { useAuthStore } from '@/stores/auth'
import { decodeJwtPayload } from '@/utils/jwt'

/**
 * Черновики несохранённого ввода (todo «Сохранение таски», по образцу Trello):
 * всё, что набрано в поле задачи, но ещё не отправлено кнопкой «Сохранить»,
 * пишется по мере ввода В ЭТОМ БРАУЗЕРЕ и переживает перезагрузку и закрытие
 * вкладки. Другие пользователи черновик не видят — на сервер он уходит только
 * по «Сохранить».
 *
 * Текст — в localStorage (sessionStorage не переживает закрытие вкладки),
 * прикреплённые к черновику файлы — в IndexedDB (localStorage не держит Blob).
 * Это не кэш доменных данных, а ввод пользователя, которого на сервере ещё нет,
 * поэтому правилу спеки «никакого localStorage для доменных данных» не
 * противоречит. Ключ включает пользователя: под другим логином в том же
 * браузере чужие черновики не всплывут.
 */

const PREFIX = 'taskmind.draft.'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface TextDraft {
  value: string
  /** Значение с сервера на момент начала правки — чтобы заметить чужое изменение. */
  base: string
  at: number
}

function owner(): string {
  const auth = useAuthStore()
  const claims = decodeJwtPayload(auth.token)
  const sub = claims?.sub ?? claims?.upn
  if (typeof sub === 'string' || typeof sub === 'number') return String(sub)
  return auth.profile ? String(auth.profile.id) : 'anon'
}

/** Полный ключ хранилища: префикс + пользователь + ключ поля. */
export function draftStorageKey(key: string): string {
  return `${PREFIX}${owner()}.${key}`
}

let pruned = false
function pruneOld() {
  if (pruned) return
  pruned = true
  try {
    const now = Date.now()
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PREFIX)) continue
      try {
        const d = JSON.parse(localStorage.getItem(k) || 'null') as TextDraft | null
        if (!d || typeof d.at !== 'number' || now - d.at > TTL_MS) localStorage.removeItem(k)
      } catch {
        localStorage.removeItem(k)
      }
    }
  } catch {
    // хранилище недоступно — молча
  }
}

export function readTextDraft(key: string): TextDraft | null {
  pruneOld()
  try {
    const raw = localStorage.getItem(draftStorageKey(key))
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<TextDraft>
    if (typeof d.value !== 'string') return null
    return { value: d.value, base: d.base ?? '', at: d.at ?? Date.now() }
  } catch {
    return null
  }
}

export function writeTextDraft(key: string, value: string, base: string) {
  try {
    localStorage.setItem(draftStorageKey(key), JSON.stringify({ value, base, at: Date.now() }))
  } catch {
    // приватный режим / переполнение — молча
  }
}

export function clearTextDraft(key: string) {
  try {
    localStorage.removeItem(draftStorageKey(key))
  } catch {
    // ignore
  }
}

// --- Файлы черновика (IndexedDB) -------------------------------------------

export interface DraftFile {
  id: string
  /** draftStorageKey(...) поля, к которому прикреплён файл. */
  owner: string
  name: string
  type: string
  size: number
  blob: Blob
  at: number
}

/** Схема ссылки на ещё не загруженный файл внутри текста черновика. */
export const DRAFT_FILE_SCHEME = 'draft-file:'

export function draftFileMarkdown(f: Pick<DraftFile, 'id' | 'name' | 'type'>): string {
  const ref = `${DRAFT_FILE_SCHEME}${f.id}`
  return f.type.startsWith('image/') ? `![${f.name}](${ref})` : `[${f.name}](${ref})`
}

const DB_NAME = 'taskmind-drafts'
const STORE = 'files'
let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('owner', 'owner')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbPromise.catch(() => { dbPromise = null })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(d => new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export async function putDraftFile(key: string, file: File): Promise<DraftFile> {
  const entry: DraftFile = {
    id: newId(),
    owner: draftStorageKey(key),
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    at: Date.now()
  }
  await tx('readwrite', s => s.put(entry))
  return entry
}

let filesPruned = false
async function pruneOldFiles() {
  if (filesPruned) return
  filesPruned = true
  const all = await tx<DraftFile[]>('readonly', s => s.getAll())
  const cutoff = Date.now() - TTL_MS
  await Promise.all(all.filter(f => f.at < cutoff).map(f => tx('readwrite', s => s.delete(f.id))))
}

export async function listDraftFiles(key: string): Promise<DraftFile[]> {
  try {
    await pruneOldFiles()
    const all = await tx<DraftFile[]>('readonly', s => s.index('owner').getAll(draftStorageKey(key)))
    return all.sort((a, b) => a.at - b.at)
  } catch {
    return []
  }
}

export async function deleteDraftFile(id: string): Promise<void> {
  try {
    await tx('readwrite', s => s.delete(id))
  } catch {
    // ignore
  }
}
