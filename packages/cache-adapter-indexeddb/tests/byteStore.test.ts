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

  test('list reads sizes and dates only, never the bytes, and follows puts and deletes', async () => {
    const store = new IndexedDBByteStore({ dbName: 'bytes-list-meta' })
    await store.put('a', new Uint8Array(3))
    await store.put('b', new Uint8Array(10))
    const firstAt = (await store.list()).find((e) => e.key === 'a')!.at
    await Bun.sleep(5)
    // Put again: the size and the date follow the new bytes.
    await store.put('a', new Uint8Array(5))
    await store.delete('b')
    await store.put('c', new Uint8Array(1))

    // Every value a store request hands back while list() runs (staged parts are megabytes each).
    const seen: unknown[] = []
    const proto = IDBObjectStore.prototype as unknown as Record<string, (...args: unknown[]) => IDBRequest>
    const originals = { get: proto.get, getAll: proto.getAll, openCursor: proto.openCursor }
    for (const [name, original] of Object.entries(originals)) {
      proto[name] = function (this: IDBObjectStore, ...args: unknown[]) {
        const request = original.apply(this, args)
        request.addEventListener('success', () => {
          const value = request.result as unknown
          seen.push(value && typeof value === 'object' && 'value' in value ? (value as { value: unknown }).value : value)
        })
        return request
      }
    }
    let list: Awaited<ReturnType<IndexedDBByteStore['list']>>
    try {
      list = await store.list()
    } finally {
      Object.assign(proto, originals)
    }

    const sorted = list.sort((x, y) => (x.key < y.key ? -1 : 1))
    expect(sorted.map((e) => [e.key, e.size])).toEqual([['a', 5], ['c', 1]])
    for (const e of sorted) expect(new Date(e.at).toISOString()).toBe(e.at)
    expect(sorted[0].at > firstAt).toBe(true)
    const values = seen.flatMap((v) => (Array.isArray(v) ? v : [v]))
    expect(values.length).toBeGreaterThan(0)
    expect(values.filter((v) => v && typeof v === 'object' && 'bytes' in v)).toEqual([])
    // The bytes are still there for get.
    expect((await store.get('a'))!.byteLength).toBe(5)
    expect(await store.get('b')).toBeNull()
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
