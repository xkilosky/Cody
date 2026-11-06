/**
 * BYOK key storage.
 *
 * Keys live in `localStorage`, on this device, under their own prefix — never in
 * the project, never in a ZIP, never in the JSON export, never in a backup.
 * (Project data is in IndexedDB; the key store is deliberately somewhere else so
 * "export everything" cannot leak a key by accident.)
 *
 * This is a browser app with no server: whatever is typed here is sent only to
 * the provider the user chose. The UI says so, plainly, next to the field.
 */
import type { ProviderId } from './providers'

const KEY_STORE = 'cody:ai:keys:v1'
const MASK = '••••••••'

type KeyMap = Partial<Record<ProviderId, string>>

function read(): KeyMap {
  try {
    const raw = localStorage.getItem(KEY_STORE)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: KeyMap = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) out[id as ProviderId] = value.trim()
    }
    return out
  } catch {
    return {}
  }
}

function write(map: KeyMap) {
  try {
    localStorage.setItem(KEY_STORE, JSON.stringify(map))
  } catch {
    /* private mode / quota — the key just does not persist */
  }
}

export function getKeys(): KeyMap {
  return read()
}

export function getKey(id: ProviderId): string {
  return read()[id] ?? ''
}

export function setKey(id: ProviderId, value: string) {
  const map = read()
  const trimmed = value.trim()
  if (trimmed) map[id] = trimmed
  else delete map[id]
  write(map)
}

export function clearKeys() {
  write({})
}

export function hasAnyKey(): boolean {
  return Object.keys(read()).length > 0
}

export function configuredProviders(): ProviderId[] {
  return Object.keys(read()) as ProviderId[]
}

/** `sk-or-v1-…9f3a` — enough to recognise a key, not enough to lose it. */
export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 10) return `${MASK}`
  return `${key.slice(0, 6)}…${key.slice(-4)}`
}

export const MASKED_KEY = MASK
