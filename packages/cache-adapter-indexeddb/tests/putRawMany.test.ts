/**
 * putRawMany / hasRawKeys: rows read with getByPrefix on one device are written as they are on another (a language
 * pack), and the adapter reads them back as if it had written them itself.
 */

import 'fake-indexeddb/auto'
import { describe, expect, test } from 'bun:test'

import { IndexedDBCacheAdapter } from '../src/indexeddb'

const book = {
  content: { book: 'tit', chapters: { 1: { verses: ['uno'] }, 2: { verses: ['dos'] } } },
  timestamp: 1,
  version: 1,
}

describe('IndexedDBCacheAdapter.putRawMany', () => {
  test('rows copied from one store into another read back the same, chapter chunks included', async () => {
    const here = new IndexedDBCacheAdapter({ dbName: 'raw-here' })
    await here.setMany([{ key: 'tn:u/es/tn:tit', entry: book as never }, { key: 'resource:u/es/tn', entry: { content: { ok: true } } as never }])
    const raw = [...(await here.getByPrefix('tn:u/es/tn:')), ...(await here.getByPrefix('resource:u/es/tn'))]

    const there = new IndexedDBCacheAdapter({ dbName: 'raw-there' })
    await there.putRawMany(raw)
    expect((await there.getByPrefix('tn:u/es/tn:')).map((r) => r.key).sort()).toEqual(
      (await here.getByPrefix('tn:u/es/tn:')).map((r) => r.key).sort(),
    )
    expect(await there.get('tn:u/es/tn:tit')).toEqual(await here.get('tn:u/es/tn:tit'))
    expect(await there.get('resource:u/es/tn')).toEqual(await here.get('resource:u/es/tn'))
  })

  test('hasRawKeys says which raw keys the store has, chunks counted as keys of their own', async () => {
    const store = new IndexedDBCacheAdapter({ dbName: 'raw-keys' })
    await store.putRawMany([{ key: 'tn:u/es/tn:tit:1', entry: { content: 'uno' } as never }])
    expect(await store.hasRawKeys(['tn:u/es/tn:tit:1', 'tn:u/es/tn:tit:2'])).toEqual(new Set(['tn:u/es/tn:tit:1']))
    expect(await store.hasRawKeys([])).toEqual(new Set())
  })
})
