import { describe, expect, test } from 'bun:test'
import { loadedResourcesMembershipKey } from './loadedResourcesMembershipKey'

describe('loadedResourcesMembershipKey', () => {
  test('ignores catalogedAt so CombinedHelps synthesize does not remount', () => {
    const a = {
      '__combined-helps__': {
        type: 'combined-helps',
        helpsTnResourceKey: 'u/en/tn',
        helpsTwlResourceKey: 'u/en/twl',
        catalogedAt: '2026-01-01T00:00:00.000Z',
      },
      'u/en/ult': { type: 'scripture', contentMetadata: { ingredients: [] } },
    }
    const b = {
      ...a,
      '__combined-helps__': {
        ...a['__combined-helps__'],
        catalogedAt: '2026-08-18T00:00:00.000Z',
      },
    }
    expect(loadedResourcesMembershipKey(a)).toBe(loadedResourcesMembershipKey(b))
  })

  test('ingredient hydrate produces a new key so book filters refresh', () => {
    const before = {
      'u/hbo/uhb': { type: 'scripture' },
    }
    const after = {
      'u/hbo/uhb': {
        type: 'scripture',
        contentMetadata: { ingredients: [{ identifier: 'tit' }] },
      },
    }
    expect(loadedResourcesMembershipKey(before)).not.toBe(loadedResourcesMembershipKey(after))
  })

  test('binding or ingredient changes produce a new key', () => {
    const base = {
      '__combined-helps__': {
        type: 'combined-helps',
        helpsTnResourceKey: 'u/en/tn',
        helpsTwlResourceKey: 'u/en/twl',
      },
    }
    const rebound = {
      '__combined-helps__': {
        type: 'combined-helps',
        helpsTnResourceKey: 'u/es/tn',
        helpsTwlResourceKey: 'u/en/twl',
      },
    }
    expect(loadedResourcesMembershipKey(base)).not.toBe(loadedResourcesMembershipKey(rebound))
  })
})
