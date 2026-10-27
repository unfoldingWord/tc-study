/**
 * transactRaw: read keys and key prefixes, decide synchronously, then put and delete, all in one readwrite
 * transaction, so that a reader never sees half of a unit of parts.
 */

import 'fake-indexeddb/auto'
import { describe, expect, test } from 'bun:test'

import { IndexedDBCacheAdapter } from '../src/indexeddb'

const row = (key: string, content: unknown) => ({ key, entry: { content, timestamp: 1 } as never })

async function seeded(dbName: string, rows: Array<{ key: string; entry: never }>) {
  const store = new IndexedDBCacheAdapter({ dbName })
  await store.putRawMany(rows)
  return store
}

describe('IndexedDBCacheAdapter.transactRaw', () => {
  test('reads keys and prefixes, then writes and deletes in one transaction', async () => {
    const store = await seeded('tx-basic', [
      row('parts-slot:a', 'slot a'),
      row('parts-slot:b', 'slot b'),
      row('other:z', 'z'),
    ])
    let seen: { rows: Map<string, unknown>; prefixKeys: Map<string, string[]> } | undefined

    await store.transactRaw({ keys: ['other:z', 'missing'], prefixes: ['parts-slot:'] }, (found) => {
      seen = found
      return { puts: [{ key: 'parts-slot:c', entry: { content: 'slot c', timestamp: 2 } }], deletes: ['parts-slot:a'] }
    })

    expect([...seen!.rows.keys()]).toEqual(['other:z'])
    expect(seen!.rows.get('other:z')).toEqual({ content: 'z', timestamp: 1 })
    expect(seen!.prefixKeys.get('parts-slot:')).toEqual(['parts-slot:a', 'parts-slot:b'])
    expect((await store.getByPrefix('')).map((r) => r.key)).toEqual(['other:z', 'parts-slot:b', 'parts-slot:c'])
    expect(await store.get('parts-slot:c')).toEqual({ content: 'slot c', timestamp: 2 })
  })

  test('a decide that throws leaves the store as it was', async () => {
    const store = await seeded('tx-throw', [row('a', 1), row('b', 2)])
    const boom = new Error('boom')

    await expect(
      store.transactRaw({ keys: ['a'], prefixes: [] }, () => {
        throw boom
      }),
    ).rejects.toBe(boom)

    expect((await store.getByPrefix('')).map((r) => r.key)).toEqual(['a', 'b'])
    // The adapter is still usable afterwards.
    await store.transactRaw({ keys: [], prefixes: [] }, () => ({ puts: [row('c', 3)], deletes: [] }))
    expect(await store.hasRawKeys(['c'])).toEqual(new Set(['c']))
  })

  test('deletes exactly the keys given, chunks included only when listed', async () => {
    const store = await seeded('tx-delete', [row('tn:x:tit', 'manifest'), row('tn:x:tit:1', 'chunk')])

    await store.transactRaw({ keys: [], prefixes: [] }, () => ({ puts: [], deletes: ['tn:x:tit'] }))
    expect((await store.getByPrefix('tn:x:')).map((r) => r.key)).toEqual(['tn:x:tit:1'])

    await store.transactRaw({ keys: [], prefixes: [] }, () => ({ puts: [], deletes: ['tn:x:tit:1'] }))
    expect(await store.getByPrefix('tn:x:')).toEqual([])
  })

  test('puts rows exactly as given', async () => {
    const store = new IndexedDBCacheAdapter({ dbName: 'tx-puts' })
    const bookShaped = {
      content: { book: 'tit', chapters: { 1: { verses: ['uno'] }, 2: { verses: ['dos'] } } },
      timestamp: 5,
      version: 1,
    }

    await store.transactRaw({ keys: [], prefixes: [] }, () => ({ puts: [{ key: 'tn:u/es/tn:tit', entry: bookShaped }], deletes: [] }))

    // Not split into a manifest plus chapter chunks: one row, as it came.
    expect((await store.getByPrefix('tn:u/es/tn:')).map((r) => r.key)).toEqual(['tn:u/es/tn:tit'])
    expect((await store.getByPrefix('tn:u/es/tn:'))[0].entry).toEqual(bookShaped as never)
  })

  test.each([
    ['empty reads', { keys: [], prefixes: [] }],
    ['non-empty reads', { keys: ['a'], prefixes: ['b'] }],
  ])('a write that fails midway leaves the store exactly as it was (%s)', async (_name, read) => {
    const store = await seeded(`tx-atomic-${_name.replace(' ', '-')}`, [row('a', 1), row('b', 2)])
    const before = await store.getByPrefix('')

    const failure = await store
      .transactRaw(read, () => ({
        puts: [row('c', 3), { key: 'd', entry: { content: () => 'a function cannot be cloned' } as never }],
        deletes: ['a'],
      }))
      .then(
        () => undefined,
        (error: unknown) => error as { name?: string },
      )

    expect(failure?.name).toBe('DataCloneError')
    expect(await store.getByPrefix('')).toEqual(before)
  })
})
