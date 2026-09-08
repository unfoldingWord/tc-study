import { describe, expect, test } from 'bun:test'
import {
  WARM_COVERAGE_KEY,
  clearRelationCoverage,
  isRelationCovered,
  markRelationCovered,
  prepareRelationId,
  readWarmCoverage,
} from './warmCoverage'

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
  }
}

describe('warmCoverage', () => {
  test('marks and checks relation coverage by stamp', async () => {
    const cache = createFakeAdapter()
    expect(await isRelationCovered(cache, 'quote:a|b|tit', 's1')).toBe(false)
    await markRelationCovered(cache, 'quote:a|b|tit', 's1', 3)
    expect(await isRelationCovered(cache, 'quote:a|b|tit', 's1')).toBe(true)
    expect(await isRelationCovered(cache, 'quote:a|b|tit', 's2')).toBe(false)
    expect(cache.store.has(WARM_COVERAGE_KEY)).toBe(true)
    const map = await readWarmCoverage(cache)
    expect(map['quote:a|b|tit']?.unitCount).toBe(3)
    await clearRelationCoverage(cache, 'quote:a|b|tit')
    expect(await isRelationCovered(cache, 'quote:a|b|tit', 's1')).toBe(false)
  })

  test('requires unitCount to cover the requested span', async () => {
    const cache = createFakeAdapter()
    await markRelationCovered(cache, 'quote:a|b|mat', 's1', 3)
    expect(await isRelationCovered(cache, 'quote:a|b|mat', 's1', 3)).toBe(true)
    expect(await isRelationCovered(cache, 'quote:a|b|mat', 's1', 28)).toBe(false)
    await markRelationCovered(cache, 'quote:a|b|mat', 's1', 10)
    expect((await readWarmCoverage(cache))['quote:a|b|mat']?.unitCount).toBe(10)
    expect(await isRelationCovered(cache, 'quote:a|b|mat', 's1', 28)).toBe(false)
    await markRelationCovered(cache, 'quote:a|b|mat', 's1', 28)
    expect(await isRelationCovered(cache, 'quote:a|b|mat', 's1', 28)).toBe(true)
  })

  test('prepareRelationId is book-scoped without chapter', () => {
    expect(
      prepareRelationId({ typeId: 'scripture', resourceKey: 'owner/en/ult', book: 'TIT' })
    ).toBe('prep:scripture:owner/en/ult:tit')
  })
})
