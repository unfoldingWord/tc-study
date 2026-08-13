import type { Page } from '@playwright/test'

type CatalogEntry = Record<string, unknown>
type CachePut = { key: string; entry: unknown }

/**
 * Seed IndexedDB before app scripts run (Playwright awaits async init scripts).
 * DB names match CatalogContext / packageStore.
 */
export async function seedIndexedDb(
  page: Page,
  opts: {
    catalogEntries?: CatalogEntry[]
    cacheEntries?: CachePut[]
  }
): Promise<void> {
  await page.addInitScript(
    async ({ catalogEntries, cacheEntries }) => {
      const openDb = (name: string, storeName: string, keyPath: string, version = 1) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(name, version)
          req.onerror = () => reject(req.error)
          req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(storeName)) {
              const store = db.createObjectStore(storeName, { keyPath })
              if (storeName === 'catalog-entries') {
                store.createIndex('server', 'metadata.server', { unique: false })
                store.createIndex('owner', 'metadata.owner', { unique: false })
                store.createIndex('language', 'metadata.language', { unique: false })
                store.createIndex('resourceId', 'metadata.resourceId', { unique: false })
                store.createIndex('subject', 'metadata.subject', { unique: false })
              }
              if (storeName === 'cache-entries') {
                store.createIndex('expiresAt', 'entry.expiresAt', { unique: false })
              }
            }
          }
          req.onsuccess = () => resolve(req.result)
        })

      const putAll = (db: IDBDatabase, storeName: string, rows: unknown[]) =>
        new Promise<void>((resolve, reject) => {
          if (rows.length === 0) {
            db.close()
            resolve()
            return
          }
          const tx = db.transaction(storeName, 'readwrite')
          const store = tx.objectStore(storeName)
          for (const row of rows) store.put(row)
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        })

      if (catalogEntries?.length) {
        const db = await openDb('tc-study-catalog', 'catalog-entries', 'key')
        await putAll(
          db,
          'catalog-entries',
          catalogEntries.map((metadata) => ({
            key: String(metadata.resourceKey || metadata.key),
            metadata,
          }))
        )
      }
      if (cacheEntries?.length) {
        const db = await openDb('tc-study-cache', 'cache-entries', 'key')
        await putAll(db, 'cache-entries', cacheEntries)
      }
    },
    {
      catalogEntries: opts.catalogEntries ?? [],
      cacheEntries: opts.cacheEntries ?? [],
    }
  )
}

/** Seed catalog only (Journey 5 create-collection resource list). */
export async function seedCatalogResources(page: Page, catalogEntries: CatalogEntry[]): Promise<void> {
  await seedIndexedDb(page, { catalogEntries })
}
