/**
 * IndexedDB Storage Adapter
 *
 * Browser-based persistent storage using IndexedDB.
 * Book-organized resources (scripture, TN, TQ) are stored as one manifest + one record per chapter
 * to avoid large single-entry size limits on mobile. TA, TW, and other keys are stored as single records.
 */

import type { CacheEntry } from '@bt-synergy/resource-cache'
import {
  canSplitBookEntry,
  isBookOrganizedKey,
  isChunkedManifest,
  reassembleBookEntry,
  splitBookEntry,
  toLogicalKey,
  isChapterSubKey,
} from './bookChunkedStorage'

export interface IndexedDBStorageOptions {
  dbName?: string
  storeName?: string
  version?: number
}

export type RawRead = { keys: string[]; prefixes: string[] }
/** `rows`: key to the stored entry (absent keys are missing); `prefixKeys`: prefix to the keys that start with it. */
export type RawFound = { rows: Map<string, unknown>; prefixKeys: Map<string, string[]> }
export type RawWrite = { puts: Array<{ key: string; entry: unknown }>; deletes: string[] }

/**
 * IndexedDB adapter for web browsers. Book-organized resources (scripture, TN, TQ) are stored as manifest + chapter entries.
 * API-compatible with CacheStorageAdapter (get/set/has/delete/keys/size/count etc.).
 */
export class IndexedDBCacheAdapter {
  private dbName: string
  private storeName: string
  private version: number
  private db: IDBDatabase | null = null

  constructor(options: IndexedDBStorageOptions = {}) {
    this.dbName = options.dbName || 'resource-cache'
    this.storeName = options.storeName || 'cache-entries'
    this.version = options.version || 1
  }

  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve(request.result)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' })
          store.createIndex('expiresAt', 'entry.expiresAt', { unique: false })
        }
      }
    })
  }

  private async getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.initDB()
    const transaction = db.transaction(this.storeName, mode)
    return transaction.objectStore(this.storeName)
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    if (canSplitBookEntry(key, entry)) {
      const { manifestEntry, chapterEntries, alignmentEntries } = splitBookEntry(key, entry)
      const db = await this.initDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite')
        const store = tx.objectStore(this.storeName)
        store.put({ key, entry: manifestEntry })
        for (const { key: chKey, entry: chEntry } of chapterEntries) {
          store.put({ key: chKey, entry: chEntry })
        }
        if (alignmentEntries?.length) {
          for (const { key: aKey, entry: aEntry } of alignmentEntries) {
            store.put({ key: aKey, entry: aEntry })
          }
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }

    const store = await this.getStore('readwrite')
    return new Promise((resolve, reject) => {
      const request = store.put({ key, entry })
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async get(key: string): Promise<CacheEntry | null> {
    const store = await this.getStore('readonly')

    const result = await new Promise<{ key: string; entry: CacheEntry } | null>((resolve, reject) => {
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result ?? null)
    })

    if (!result) return null

    if (result.entry.expiresAt && new Date(result.entry.expiresAt) < new Date()) {
      await this.delete(key)
      return null
    }

    if (!isChunkedManifest(result.entry)) return result.entry

    const db = await this.initDB()
    const chapterRecords = await new Promise<Array<{ key: string; entry: CacheEntry }>>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const st = tx.objectStore(this.storeName)
      const range = IDBKeyRange.bound(key + ':', key + ':\uffff')
      const request = st.getAll(range)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const rows = request.result as Array<{ key: string; entry: CacheEntry }>
        resolve(rows ?? [])
      }
    })

    return reassembleBookEntry(key, result.entry, chapterRecords.map((r) => ({ key: r.key, entry: r.entry })))
  }
  
  /**
   * Return raw IndexedDB rows for keys in [prefix, prefix + '\uffff'].
   * Does not reassemble chunked manifests — caller decides how to interpret rows.
   */
  async getByPrefix(prefix: string): Promise<Array<{ key: string; entry: CacheEntry }>> {
    const db = await this.initDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const store = tx.objectStore(this.storeName)
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff')
      const request = store.getAll(range)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const rows = (request.result ?? []) as Array<{ key: string; entry: CacheEntry }>
        resolve(rows)
      }
    })
  }

  /**
   * Write rows exactly as given, chapter chunks and manifests included, without splitting anything again. For rows
   * that were read with `getByPrefix` somewhere else, e.g. from a language pack.
   */
  async putRawMany(rows: Array<{ key: string; entry: CacheEntry }>): Promise<void> {
    if (rows.length === 0) return
    const db = await this.initDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const store = tx.objectStore(this.storeName)
      for (const row of rows) store.put({ key: row.key, entry: row.entry })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  /**
   * Read keys and key prefixes, decide, then put and delete, all in one readwrite transaction: a reader sees none of
   * it or all of it. `decide` runs synchronously once every read is back (the transaction would commit if we waited
   * on anything else in between). Rows are put exactly as given and keys are deleted exactly as listed: no chunk
   * splitting or expansion. If `decide` throws, the transaction is aborted and the call rejects with that error.
   */
  async transactRaw(read: RawRead, decide: (found: RawFound) => RawWrite): Promise<void> {
    const db = await this.initDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const store = tx.objectStore(this.storeName)
      const found: RawFound = { rows: new Map(), prefixKeys: new Map() }
      let pending = read.keys.length + read.prefixes.length
      let failure: unknown

      const fail = (error: unknown) => {
        if (failure === undefined) failure = error
        try {
          tx.abort()
        } catch {
          // already finished or aborting
        }
      }

      const writeAll = () => {
        // Anything thrown here (decide, or a put that cannot be cloned) aborts the whole transaction and rejects with
        // that error: nothing of the unit is left behind.
        try {
          const write = decide(found)
          for (const { key, entry } of write.puts) store.put({ key, entry })
          for (const key of write.deletes) store.delete(key)
        } catch (error) {
          fail(error)
        }
      }

      const oneDone = () => {
        pending -= 1
        if (pending === 0) writeAll()
      }

      for (const key of read.keys) {
        const request = store.get(key)
        request.onsuccess = () => {
          const row = request.result as { key: string; entry: unknown } | undefined
          if (row !== undefined) found.rows.set(key, row.entry)
          oneDone()
        }
      }
      for (const prefix of read.prefixes) {
        const request = store.getAllKeys(IDBKeyRange.bound(prefix, prefix + '\uffff'))
        request.onsuccess = () => {
          found.prefixKeys.set(prefix, (request.result ?? []) as string[])
          oneDone()
        }
      }
      if (pending === 0) writeAll()

      tx.oncomplete = () => resolve()
      // A failed request or a full disk aborts the transaction; keep the error's name (e.g. QuotaExceededError).
      tx.onerror = (event) => {
        if (failure === undefined) failure = (event.target as IDBRequest | null)?.error ?? undefined
      }
      tx.onabort = () => reject(failure ?? tx.error ?? new DOMException('Transaction aborted', 'AbortError'))
    })
  }

  /** Which of these raw keys the store has, without reading their entries. */
  async hasRawKeys(keys: string[]): Promise<Set<string>> {
    const found = new Set<string>()
    if (keys.length === 0) return found
    const db = await this.initDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const store = tx.objectStore(this.storeName)
      for (const key of keys) {
        const request = store.getKey(key)
        request.onsuccess = () => {
          if (request.result !== undefined) found.add(key)
        }
      }
      tx.oncomplete = () => resolve(found)
      tx.onerror = () => reject(tx.error)
    })
  }

  async has(key: string): Promise<boolean> {
    const entry = await this.get(key)
    return entry !== null
  }
  
  async delete(key: string): Promise<void> {
    const db = await this.initDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const store = tx.objectStore(this.storeName)
      store.delete(key)
      if (isBookOrganizedKey(key)) {
        const range = IDBKeyRange.bound(key + ':', key + ':\uffff')
        const cursorRequest = store.openCursor(range)
        cursorRequest.onerror = () => reject(cursorRequest.error)
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (cursor) {
            cursor.delete()
            cursor.continue()
          }
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async setMany(items: Array<{ key: string; entry: CacheEntry }>): Promise<void> {
    if (items.length === 0) return
    const db = await this.initDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const store = tx.objectStore(this.storeName)
      for (const { key, entry } of items) {
        if (canSplitBookEntry(key, entry)) {
          const { manifestEntry, chapterEntries, alignmentEntries } = splitBookEntry(key, entry)
          store.put({ key, entry: manifestEntry })
          for (const { key: chKey, entry: chEntry } of chapterEntries) {
            store.put({ key: chKey, entry: chEntry })
          }
          if (alignmentEntries?.length) {
            for (const { key: aKey, entry: aEntry } of alignmentEntries) {
              store.put({ key: aKey, entry: aEntry })
            }
          }
        } else {
          store.put({ key, entry })
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  
  async getMany(keys: string[]): Promise<Map<string, CacheEntry>> {
    const results = new Map<string, CacheEntry>()
    const now = new Date()
    
    for (const key of keys) {
      const entry = await this.get(key)
      if (entry) {
        results.set(key, entry)
      }
    }
    
    return results
  }
  
  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.delete(key)
    }
  }
  
  async clear(): Promise<void> {
    const store = await this.getStore('readwrite')
    
    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
  
  async keys(): Promise<string[]> {
    const store = await this.getStore('readonly')
    const allKeys = await new Promise<string[]>((resolve, reject) => {
      const request = store.getAllKeys()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result as string[])
    })
    const logicalKeys = allKeys.map((k) => (isChapterSubKey(k) ? toLogicalKey(k) : k))
    return Array.from(new Set(logicalKeys))
  }
  
  async size(): Promise<number> {
    const store = await this.getStore('readonly')
    
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        let totalSize = 0
        for (const item of request.result) {
          const entry = item.entry
          if (entry.metadata?.size) {
            totalSize += entry.metadata.size
          }
        }
        resolve(totalSize)
      }
    })
  }
  
  async count(): Promise<number> {
    const logicalKeys = await this.keys()
    return logicalKeys.length
  }
  
  async prune(): Promise<number> {
    const logicalKeys = await this.keys()
    const now = new Date()
    let pruned = 0
    for (const key of logicalKeys) {
      const entry = await this.get(key)
      if (entry?.expiresAt && new Date(entry.expiresAt) < now) {
        await this.delete(key)
        pruned++
      }
    }
    return pruned
  }
  
  async optimize(): Promise<void> {
    // IndexedDB handles optimization automatically
    await this.prune()
  }
  
  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

