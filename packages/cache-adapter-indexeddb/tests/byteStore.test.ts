/**
 * IndexedDBByteStore: raw bytes by key, nothing else. Verification of what the bytes are lives with the caller.
 */

import 'fake-indexeddb/auto'
import { describe, expect, test } from 'bun:test'

import { IndexedDBByteStore } from '../src/byteStore'

describe('IndexedDBByteStore', () => {
  test('put then get returns the same bytes', async () => {
    const store = new IndexedDBByteStore({ dbName: 'bytes-round-trip' })
    await store.put('a', new Uint8Array([1, 2, 3, 255]))
    const back = await store.get('a')
    expect(back).toBeInstanceOf(Uint8Array)
    expect(Array.from(back!)).toEqual([1, 2, 3, 255])
    expect(await store.get('missing')).toBeNull()
  })

  test('a view into a larger buffer is stored and returned as just the view', async () => {
    const store = new IndexedDBByteStore({ dbName: 'bytes-subarray' })
    const big = new Uint8Array([9, 9, 1, 2, 3, 9])
    await store.put('v', big.subarray(2, 5))
    const back = await store.get('v')
    expect(Array.from(back!)).toEqual([1, 2, 3])
    expect(back!.byteOffset).toBe(0)
    expect((await store.list())[0].size).toBe(3)
  })

  test('has tells present from absent', async () => {
    const store = new IndexedDBByteStore({ dbName: 'bytes-has' })
    await store.put('a', new Uint8Array([1]))
    expect(await store.has('a')).toBe(true)
    expect(await store.has('b')).toBe(false)
  })

  test('list gives key, byte size and an ISO time for each entry', async () => {
    const store = new IndexedDBByteStore({ dbName: 'bytes-list' })
    await store.put('a', new Uint8Array(3))
    await store.put('b', new Uint8Array(10))
    const list = (await store.list()).sort((x, y) => (x.key < y.key ? -1 : 1))
    expect(list.map((e) => [e.key, e.size])).toEqual([['a', 3], ['b', 10]])
    for (const e of list) expect(new Date(e.at).toISOString()).toBe(e.at)
  })

  test('delete removes the entry and is quiet about absent keys', async () => {
    const store = new IndexedDBByteStore({ dbName: 'bytes-delete' })
    await store.put('a', new Uint8Array([1]))
    await store.delete('a')
    await store.delete('never-there')
    expect(await store.has('a')).toBe(false)
    expect(await store.list()).toEqual([])
  })

  test('a custom store name works and databases do not share entries', async () => {
    const one = new IndexedDBByteStore({ dbName: 'bytes-custom-one', storeName: 'staging' })
    const two = new IndexedDBByteStore({ dbName: 'bytes-custom-two', storeName: 'staging' })
    await one.put('a', new Uint8Array([1]))
    expect(await one.has('a')).toBe(true)
    expect(await two.has('a')).toBe(false)
  })
})
