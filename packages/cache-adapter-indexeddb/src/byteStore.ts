/**
 * IndexedDB byte store: raw bytes by key, in a database of their own (one store per database name). The store is
 * created only when the database is new: a store missing from an existing database is not created, and the first use
 * fails with a NotFoundError naming it. It knows nothing about what the bytes are;
 * whoever puts them checks them (language-pack's parts staging checks the sha256 that names each one).
 */

export interface IndexedDBByteStoreOptions {
  dbName: string
  storeName?: string
}

type ByteRow = { key: string; bytes: Uint8Array; at: string }

export class IndexedDBByteStore {
  private dbName: string
  private storeName: string
  private db: Promise<IDBDatabase> | null = null

  constructor(options: IndexedDBByteStoreOptions) {
    this.dbName = options.dbName
    this.storeName = options.storeName || 'bytes'
  }

  private open(): Promise<IDBDatabase> {
    if (this.db) return this.db
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)
      request.onerror = () => reject(request.error)
      request.onupgradeneeded = () => request.result.createObjectStore(this.storeName, { keyPath: 'key' })
      request.onsuccess = () => {
        const db = request.result
        // A closed or superseded connection is dropped, so that the next call opens a fresh one.
        db.onclose = db.onversionchange = () => {
          db.close()
          if (this.db === opening) this.db = null
        }
        resolve(db)
      }
    })
    this.db = opening
    // A failed open must not be remembered: the next call tries again.
    opening.catch(() => {
      if (this.db === opening) this.db = null
    })
    return opening
  }

  private async run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(this.storeName, mode)
      const request = work(tx.objectStore(this.storeName))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error ?? request.error)
      tx.onabort = () => reject(tx.error ?? request.error)
    })
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const row: ByteRow = { key, bytes: new Uint8Array(bytes), at: new Date().toISOString() }
    await this.run('readwrite', (store) => store.put(row))
  }

  async get(key: string): Promise<Uint8Array | null> {
    const row = await this.run<ByteRow | undefined>('readonly', (store) => store.get(key))
    return row ? new Uint8Array(row.bytes) : null
  }

  async has(key: string): Promise<boolean> {
    const found = await this.run<IDBValidKey | undefined>('readonly', (store) => store.getKey(key))
    return found !== undefined
  }

  async delete(key: string): Promise<void> {
    await this.run('readwrite', (store) => store.delete(key))
  }

  async list(): Promise<Array<{ key: string; size: number; at: string }>> {
    const rows = await this.run<ByteRow[]>('readonly', (store) => store.getAll())
    return rows.map((row) => ({ key: row.key, size: row.bytes.byteLength, at: row.at }))
  }
}
