import { describe, expect, test } from 'bun:test'
import { ClientError } from '../errors'
import { emptyState } from '../state'
import type { BlobStore } from './types'

const cat = { name: 'es-419', publisher: 'pub', revision: 1, id: 'a'.repeat(64), origin: 'published' as const }

const A = 'a'.repeat(64)
const B = 'b1' + 'c'.repeat(62)

export function storeContract(make: () => Promise<BlobStore>): void {
  describe('BlobStore contract', () => {
    test('put/get/has/delete/ids round trip', async () => {
      const s = await make()
      await s.put(A, new Uint8Array([1, 2, 3]))
      await s.put(B, new Uint8Array([4]))
      expect(await s.has(A)).toBe(true)
      expect(Array.from((await s.get(A))!)).toEqual([1, 2, 3])
      expect((await s.ids()).sort()).toEqual([A, B].sort())
      await s.delete(A)
      expect(await s.has(A)).toBe(false)
      expect(await s.ids()).toEqual([B])
    })
    test('get of an absent id is undefined', async () => {
      const s = await make()
      expect(await s.get(A)).toBeUndefined()
      expect(await s.has(A)).toBe(false)
    })
    test('bad ids throw E_ARG', async () => {
      const s = await make()
      for (const id of ['ABC', 'A'.repeat(64)]) {
        const e = await s.put(id, new Uint8Array([1])).catch((x) => x)
        expect(e).toBeInstanceOf(ClientError)
        expect(e.code).toBe('E_ARG')
        const d = await s.delete(id).catch((x) => x)
        expect(d.code).toBe('E_ARG')
      }
    })
    test('state round trip', async () => {
      const s = await make()
      expect(await s.getState()).toBeUndefined()
      await s.setState({ ...emptyState(), published: { one: cat } })
      await s.setState({ ...emptyState(), published: { two: cat } })
      expect(await s.getState()).toEqual({ ...emptyState(), published: { two: cat } })
    })
  })
}
