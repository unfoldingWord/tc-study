/**
 * getByPrefix contract: IDBKeyRange.bound(prefix, prefix + '\uffff') over raw rows.
 */

import { describe, expect, test } from 'bun:test'

import { IndexedDBCacheAdapter } from '../src/indexeddb'

/** Same string ordering as IDBKeyRange.bound(prefix, prefix + '\uffff'). */
function keysInPrefixRange(keys: string[], prefix: string): string[] {
  const upper = prefix + '\uffff'
  return keys.filter((k) => k >= prefix && k <= upper)
}

describe('IndexedDBCacheAdapter.getByPrefix', () => {
  test('exposes getByPrefix on the adapter', () => {
    const adapter = new IndexedDBCacheAdapter({ dbName: 'test-getByPrefix' })
    expect(typeof adapter.getByPrefix).toBe('function')
  })

  test('prefix range includes logical key and chapter sub-keys', () => {
    const keys = [
      'scripture-usj:u/en/ult:tit',
      'scripture-usj:u/en/ult:tit:0',
      'scripture-usj:u/en/ult:tit:1',
      'scripture-usj:u/en/ult:tit:1:alignments',
      'scripture-usj:u/en/ult:gen',
      'tn:u/en/tn:tit',
    ]
    const matched = keysInPrefixRange(keys, 'scripture-usj:u/en/ult:tit')
    expect(matched).toEqual([
      'scripture-usj:u/en/ult:tit',
      'scripture-usj:u/en/ult:tit:0',
      'scripture-usj:u/en/ult:tit:1',
      'scripture-usj:u/en/ult:tit:1:alignments',
    ])
    expect(matched).not.toContain('scripture-usj:u/en/ult:gen')
    expect(matched).not.toContain('tn:u/en/tn:tit')
  })
})
