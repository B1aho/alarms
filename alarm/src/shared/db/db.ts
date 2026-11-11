import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { z } from 'zod'

/**
 * One IndexedDB database per browser profile. Browser profiles live inside the
 * OS user's home folder, so every OS user automatically gets isolated data.
 */

export interface StoredSound {
  id: string
  name: string
  type: string
  size: number
  addedAt: number
  blob: Blob
}

type Row = { id: string } & Record<string, unknown>

interface AppDB extends DBSchema {
  alarms: { key: string; value: Row }
  sounds: { key: string; value: StoredSound }
  kv: { key: string; value: unknown }
}

const DB_NAME = 'alarm'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null

export function getDB(): Promise<IDBPDatabase<AppDB>> {
  dbPromise ??= openDB<AppDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('alarms', { keyPath: 'id' })
        db.createObjectStore('sounds', { keyPath: 'id' })
        db.createObjectStore('kv')
      }
      // v2: sleep tracking was removed.
      const raw = db as unknown as IDBDatabase
      if (raw.objectStoreNames.contains('sleepSessions')) raw.deleteObjectStore('sleepSessions')
    },
  })
  return dbPromise
}

export type CollectionName = 'alarms'

export interface Collection<T extends { id: string }> {
  getAll(): Promise<T[]>
  put(item: T): Promise<void>
  remove(id: string): Promise<void>
}

/** A zod-validated object store. Rows that fail validation are skipped, never crash the app. */
export function createCollection<T extends { id: string }>(name: CollectionName, schema: z.ZodType<T>): Collection<T> {
  return {
    async getAll() {
      const rows = await (await getDB()).getAll(name)
      return rows.flatMap((row) => {
        const parsed = schema.safeParse(row)
        if (parsed.success) return [parsed.data]
        console.warn(`[db] dropped invalid ${name} row`, row, parsed.error)
        return []
      })
    },
    async put(item) {
      await (await getDB()).put(name, schema.parse(item) as Row)
    },
    async remove(id) {
      await (await getDB()).delete(name, id)
    },
  }
}

export interface KvEntry<T> {
  get(): Promise<T>
  set(value: T): Promise<void>
}

export function createKvEntry<T>(key: string, schema: z.ZodType<T>, fallback: () => T): KvEntry<T> {
  return {
    async get() {
      const raw = await (await getDB()).get('kv', key)
      if (raw === undefined) return fallback()
      const parsed = schema.safeParse(raw)
      return parsed.success ? parsed.data : fallback()
    },
    async set(value) {
      await (await getDB()).put('kv', value, key)
    },
  }
}

export const soundsTable = {
  async list(): Promise<StoredSound[]> {
    return (await getDB()).getAll('sounds')
  },
  async get(id: string): Promise<StoredSound | undefined> {
    return (await getDB()).get('sounds', id)
  },
  async put(sound: StoredSound): Promise<void> {
    await (await getDB()).put('sounds', sound)
  },
  async remove(id: string): Promise<void> {
    await (await getDB()).delete('sounds', id)
  },
}
