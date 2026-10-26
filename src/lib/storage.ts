import type { Project, ProjectMeta, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { projectMetaOf } from './utils'

const DB_NAME = 'cody-db'
const DB_VERSION = 1
const PROJECTS = 'projects'
const META = 'meta'

type MetaRecord = { key: string; value: unknown }

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      return resolve(null)
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
  return dbPromise
}

/* ---------- localStorage fallback ---------- */

function lsKey(key: string) {
  return `cody:${key}`
}

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(lsKey(key))
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(lsKey(key), JSON.stringify(value))
  } catch {
    /* quota */
  }
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, resolve: (value: T) => void) => void,
  fallback: () => T,
): Promise<T> {
  const db = await openDb()
  if (!db) return fallback()
  return new Promise<T>((resolve) => {
    let settled = false
    const done = (value: T) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    try {
      const tx = db.transaction(storeName, mode)
      const store = tx.objectStore(storeName)
      fn(store, done)
      tx.onerror = () => done(fallback())
      tx.onabort = () => done(fallback())
    } catch {
      done(fallback())
    }
  })
}

/* ---------- projects ---------- */

export async function listProjects(): Promise<ProjectMeta[]> {
  const stored = await withStore<Project[]>(
    PROJECTS,
    'readonly',
    (store, resolve) => {
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result as Project[]) ?? [])
      req.onerror = () => resolve([])
    },
    () => lsGet<Project[]>('projects') ?? [],
  )
  return stored
    .map(projectMetaOf)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadProject(id: string): Promise<Project | null> {
  return withStore<Project | null>(
    PROJECTS,
    'readonly',
    (store, resolve) => {
      const req = store.get(id)
      req.onsuccess = () => resolve((req.result as Project) ?? null)
      req.onerror = () => resolve(null)
    },
    () => (lsGet<Project[]>('projects') ?? []).find((p) => p.id === id) ?? null,
  )
}

export async function saveProject(project: Project): Promise<void> {
  const saved = await withStore<boolean>(
    PROJECTS,
    'readwrite',
    (store, resolve) => {
      const req = store.put(project)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    },
    () => false,
  )
  if (!saved) {
    const all = lsGet<Project[]>('projects') ?? []
    const next = all.filter((p) => p.id !== project.id)
    next.push(project)
    lsSet('projects', next)
  }
}

export async function deleteProject(id: string): Promise<void> {
  const ok = await withStore<boolean>(
    PROJECTS,
    'readwrite',
    (store, resolve) => {
      const req = store.delete(id)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    },
    () => false,
  )
  if (!ok) {
    lsSet(
      'projects',
      (lsGet<Project[]>('projects') ?? []).filter((p) => p.id !== id),
    )
  }
}

/* ---------- key/value ---------- */

export async function getValue<T>(key: string, fallback: T): Promise<T> {
  return withStore<T>(
    META,
    'readonly',
    (store, resolve) => {
      const req = store.get(key)
      req.onsuccess = () => {
        const record = req.result as MetaRecord | undefined
        resolve(record ? (record.value as T) : fallback)
      }
      req.onerror = () => resolve(fallback)
    },
    () => lsGet<T>(key) ?? fallback,
  )
}

export async function setValue(key: string, value: unknown): Promise<void> {
  const ok = await withStore<boolean>(
    META,
    'readwrite',
    (store, resolve) => {
      const req = store.put({ key, value })
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    },
    () => false,
  )
  if (!ok) lsSet(key, value)
}

export async function loadSettings(): Promise<Settings> {
  const stored = await getValue<Partial<Settings>>('settings', {})
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}

export function saveSettings(settings: Settings) {
  return setValue('settings', settings)
}
