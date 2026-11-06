import { ClientError } from '../errors'
import { isStoreId, type BlobStore, type InstalledState } from './types'

function check(id: string): void {
  if (!isStoreId(id)) throw new ClientError('E_ARG', 'segment id must be 64 lowercase hex')
}

function storeError(e: unknown): ClientError {
  if (e instanceof ClientError) return e
  const err = new ClientError('E_STORE', e instanceof Error ? e.message : String(e))
  ;(err as { cause?: unknown }).cause = e
  return err
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export async function indexedDbStore(
  o: { name?: string; indexedDB?: IDBFactory } = {},
): Promise<BlobStore> {
  const factory = o.indexedDB ?? globalThis.indexedDB
  if (!factory) throw new ClientError('E_STORE', 'indexedDB is not available')
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = factory.open(o.name ?? 'tc-language-packs', 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('seg')
      r.result.createObjectStore('state')
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  }).catch((e) => {
    throw storeError(e)
  })

  /** One transaction per call; resolves when the transaction completes. */
  function run<T>(
    mode: IDBTransactionMode,
    fn: (seg: IDBObjectStore, state: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      try {
        const tx = db.transaction(['seg', 'state'], mode)
        const r = fn(tx.objectStore('seg'), tx.objectStore('state'))
        tx.oncomplete = () => resolve(r.result)
        tx.onerror = () => reject(tx.error ?? r.error)
        tx.onabort = () => reject(tx.error)
      } catch (e) {
        reject(e)
      }
    }).catch((e) => {
      throw storeError(e)
    })
  }

  return {
    async has(id) {
      return (await run('readonly', (s) => s.count(id))) > 0
    },
    async get(id) {
      const v = await run<unknown>('readonly', (s) => s.get(id))
      return v === undefined ? undefined : new Uint8Array(v as ArrayBuffer | Uint8Array)
    },
    async put(id, bytes) {
      check(id)
      await run('readwrite', (s) => s.put(bytes.slice(), id))
    },
    async delete(id) {
      check(id)
      await run('readwrite', (s) => s.delete(id))
    },
    async ids() {
      return (await run('readonly', (s) => s.getAllKeys())).map(String)
    },
    async getState() {
      const v = await run<unknown>('readonly', (_s, st) => st.get('state'))
      return v === undefined ? undefined : (v as InstalledState)
    },
    async setState(state) {
      await run('readwrite', (_s, st) => st.put(structuredClone(state), 'state'))
    },
  }
}
