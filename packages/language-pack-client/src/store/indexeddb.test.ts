import { expect, test } from 'bun:test'
import { IDBFactory } from 'fake-indexeddb'
import { storeContract } from './contract'
import { indexedDbStore } from './indexeddb'

storeContract(async () => indexedDbStore({ indexedDB: new IDBFactory() }))

test('a rejected write becomes E_STORE with the cause', async () => {
  const { IDBObjectStore: S } = await import('fake-indexeddb')
  const store = await indexedDbStore({ indexedDB: new IDBFactory() })
  const orig = S.prototype.put
  const dom = new DOMException('full', 'QuotaExceededError')
  S.prototype.put = () => {
    throw dom
  }
  try {
    const err = await store.put('a'.repeat(64), new Uint8Array([1])).catch((e) => e)
    expect(err.code).toBe('E_STORE')
    expect(err.cause).toBe(dom)
  } finally {
    S.prototype.put = orig
  }
})
