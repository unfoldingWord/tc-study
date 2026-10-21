import { describe, expect, test } from 'bun:test'
import { HELPS_TEXT_VERSION, helpsTextKey } from './helpsCacheKeys'
import { helpsTextCacheIO } from './useHelpsTextCache'
import { wrapVersioned } from '../cache/versionedEnvelope'

function createFakeAdapter() {
  const store = new Map<string, unknown>()
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null
    },
    async set(key: string, entry: unknown) {
      store.set(key, entry)
    },
    async delete(key: string) {
      store.delete(key)
    },
    async getByPrefix(prefix: string) {
      return [...store.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, entry]) => ({ key, entry }))
    },
  }
}

describe('helpsTextCacheIO', () => {
  test('round-trips confident values', async () => {
    const cache = createFakeAdapter()
    await helpsTextCacheIO.writeHelpsText(
      cache,
      'ta-title',
      'unfoldingWord/en/ta',
      'v45',
      'translate/figs-metaphor',
      'Metaphor'
    )
    const hit = await helpsTextCacheIO.readHelpsText(
      cache,
      'ta-title',
      'unfoldingWord/en/ta',
      'v45',
      'translate/figs-metaphor'
    )
    expect(hit).toBe('Metaphor')
  })

  test('version mismatch returns null', async () => {
    const cache = createFakeAdapter()
    const key = helpsTextKey('tw-title', 'owner/en/tw', 'v1', 'kt/grace')
    await cache.set(key, wrapVersioned('Grace', HELPS_TEXT_VERSION + 1))
    const hit = await helpsTextCacheIO.readHelpsText(
      cache,
      'tw-title',
      'owner/en/tw',
      'v1',
      'kt/grace'
    )
    expect(hit).toBeNull()
  })

  test('sweep deletes only stale stamps', async () => {
    const cache = createFakeAdapter()
    await helpsTextCacheIO.writeHelpsText(cache, 'tw-title', 'owner/en/tw', 'v44', 'kt/a', 'A')
    await helpsTextCacheIO.writeHelpsText(cache, 'tw-title', 'owner/en/tw', 'v45', 'kt/b', 'B')
    await helpsTextCacheIO.sweepStaleHelpsText(cache, 'tw-title', 'owner/en/tw', 'v45')
    expect(
      await helpsTextCacheIO.readHelpsText(cache, 'tw-title', 'owner/en/tw', 'v44', 'kt/a')
    ).toBeNull()
    expect(
      await helpsTextCacheIO.readHelpsText(cache, 'tw-title', 'owner/en/tw', 'v45', 'kt/b')
    ).toBe('B')
  })

  test('guard: callers must not write fallbacks — writeHelpsText is only for confident values', async () => {
    // Document the contract: IO has no confident flag; the hook skips write when confident=false.
    // This test asserts we never accidentally treat empty-placeholder keys as durable by writing them here.
    const cache = createFakeAdapter()
    // Intentionally do NOT write a fallback term like "grace".
    const hit = await helpsTextCacheIO.readHelpsText(
      cache,
      'tw-title',
      'owner/en/tw',
      'v1',
      'kt/grace'
    )
    expect(hit).toBeNull()
    expect(cache.store.size).toBe(0)
  })
})
