/**
 * Parts staging: where downloaded part files wait, verified, until they are applied. A part is named by its
 * sha256, so staging refuses to keep bytes that do not hash to the name they come with.
 */

import { sha256Hex } from './partFile'

/** Bytes by key. IndexedDBByteStore (cache-adapter-indexeddb) satisfies it, as does `memoryByteStore()`. */
export type ByteStore = {
  put(key: string, bytes: Uint8Array): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  has(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  list(): Promise<Array<{ key: string; size: number; at: string }>>
}

export interface PartsStaging {
  put(sha: string, bytes: Uint8Array): Promise<void>
  get(sha: string): Promise<Uint8Array | null>
  has(sha: string): Promise<boolean>
  delete(sha: string): Promise<void>
  list(): Promise<Array<{ sha: string; size: number; at: string }>>
}

export function stagingFrom(store: ByteStore): PartsStaging {
  return {
    async put(sha, bytes) {
      // Our own copy first: the caller may change its array while the hash is computed, and what is hashed must be
      // exactly what is stored.
      const own = new Uint8Array(bytes)
      const actual = await sha256Hex(own)
      if (actual !== sha) throw new Error(`Part bytes hash to ${actual}, not to ${sha} (names are lowercase hex); not staged`)
      await store.put(sha, own)
    },
    get: (sha) => store.get(sha),
    has: (sha) => store.has(sha),
    delete: (sha) => store.delete(sha),
    async list() {
      return (await store.list()).map(({ key, size, at }) => ({ sha: key, size, at }))
    },
  }
}

/** A byte store in memory, for tests and for apps without IndexedDB. */
export function memoryByteStore(): ByteStore {
  const entries = new Map<string, { bytes: Uint8Array; at: string }>()
  return {
    async put(key, bytes) {
      entries.set(key, { bytes: new Uint8Array(bytes), at: new Date().toISOString() })
    },
    async get(key) {
      const entry = entries.get(key)
      return entry ? new Uint8Array(entry.bytes) : null
    },
    async has(key) {
      return entries.has(key)
    },
    async delete(key) {
      entries.delete(key)
    },
    async list() {
      return [...entries].map(([key, { bytes, at }]) => ({ key, size: bytes.byteLength, at }))
    },
  }
}
