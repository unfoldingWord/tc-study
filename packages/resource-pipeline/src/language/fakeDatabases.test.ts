import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { closeAndDelete } from './fakeDatabases'

const names = async () => (await indexedDB.databases()).map((d) => d.name)

test('the build stores are closed and deleted, so their rows no longer take memory', async () => {
  const cache = new IndexedDBCacheAdapter({ dbName: 'drop-cache', storeName: 'cache-entries', version: 1 })
  const catalog = new IndexedDBCatalogAdapter({ dbName: 'drop-catalog', storeName: 'catalog-entries', version: 1 })
  await cache.set('a', { data: 1 } as never)
  await catalog.set('o/l/r', { resourceKey: 'o/l/r' } as never)
  expect(await names()).toEqual(expect.arrayContaining(['drop-cache', 'drop-catalog']))

  await closeAndDelete([cache, catalog], ['drop-cache', 'drop-catalog'])

  expect(await names()).not.toContain('drop-cache')
  expect(await names()).not.toContain('drop-catalog')
  // Opened again, the store is empty: the rows went with the database.
  const again = new IndexedDBCacheAdapter({ dbName: 'drop-cache', storeName: 'cache-entries', version: 1 })
  expect(await again.get('a')).toBeNull()
  await closeAndDelete([again], ['drop-cache'])
})

test('a connection left open does not hang the run: it says so and goes on', async () => {
  const open = new IndexedDBCacheAdapter({ dbName: 'drop-held', storeName: 'cache-entries', version: 1 })
  await open.set('a', { data: 1 } as never)
  // Another connection that never closes, as a forgotten reader would hold it.
  await new Promise<void>((resolve) => {
    const req = indexedDB.open('drop-held')
    req.onsuccess = () => {
      req.result.onversionchange = null
      resolve()
    }
  })
  const lines: string[] = []

  await closeAndDelete([open], ['drop-held'], (line) => lines.push(line))

  expect(lines.join('\n')).toContain('drop-held')
})
