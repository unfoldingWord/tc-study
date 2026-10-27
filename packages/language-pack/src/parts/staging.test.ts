import { describe, expect, test } from 'bun:test'
import { sha256Hex } from './partFile'
import { memoryByteStore, stagingFrom } from './staging'

const bytes = new Uint8Array([10, 20, 30, 40])

describe('parts staging', () => {
  test('put refuses bytes whose sha256 is not their name', async () => {
    const store = memoryByteStore()
    const staging = stagingFrom(store)
    await expect(staging.put('0'.repeat(64), bytes)).rejects.toThrow()
    expect(await store.list()).toEqual([])
    expect(await staging.has('0'.repeat(64))).toBe(false)
  })

  test('put then get returns the same bytes', async () => {
    const staging = stagingFrom(memoryByteStore())
    const sha = await sha256Hex(bytes)
    await staging.put(sha, bytes)
    expect(await staging.has(sha)).toBe(true)
    expect(Array.from((await staging.get(sha))!)).toEqual([10, 20, 30, 40])
    expect(await staging.get('f'.repeat(64))).toBeNull()
  })

  test('list names entries by sha and delete removes them', async () => {
    const staging = stagingFrom(memoryByteStore())
    const sha = await sha256Hex(bytes)
    await staging.put(sha, bytes)
    const list = await staging.list()
    expect(list.map((e) => [e.sha, e.size])).toEqual([[sha, 4]])
    expect(new Date(list[0].at).toISOString()).toBe(list[0].at)
    await staging.delete(sha)
    expect(await staging.list()).toEqual([])
  })

  test('the memory store keeps its own copy of what was put', async () => {
    const store = memoryByteStore()
    const mine = new Uint8Array([1, 2])
    await store.put('k', mine)
    mine[0] = 9
    expect(Array.from((await store.get('k'))!)).toEqual([1, 2])
  })
})
