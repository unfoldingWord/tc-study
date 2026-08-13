import { describe, expect, test } from 'bun:test'
import { isScriptureTokensOwner } from './scriptureTokensOwnership'

describe('isScriptureTokensOwner', () => {
  test('lastActive wins over anchor', () => {
    expect(
      isScriptureTokensOwner({
        resourceId: 'ult',
        lastActiveScriptureResourceId: 'ult',
        anchorResourceId: 'ust',
      })
    ).toBe(true)
    expect(
      isScriptureTokensOwner({
        resourceId: 'ust',
        lastActiveScriptureResourceId: 'ult',
        anchorResourceId: 'ust',
      })
    ).toBe(false)
  })

  test('falls back to anchor when lastActive cleared', () => {
    expect(
      isScriptureTokensOwner({
        resourceId: 'ust',
        lastActiveScriptureResourceId: null,
        anchorResourceId: 'ust',
      })
    ).toBe(true)
    expect(
      isScriptureTokensOwner({
        resourceId: 'ult',
        lastActiveScriptureResourceId: null,
        anchorResourceId: 'ust',
      })
    ).toBe(false)
  })

  test('bootstrap denies all when neither lastActive nor anchor set', () => {
    expect(
      isScriptureTokensOwner({
        resourceId: 'ult',
        lastActiveScriptureResourceId: null,
        anchorResourceId: null,
      })
    ).toBe(false)
    expect(
      isScriptureTokensOwner({
        resourceId: 'ust',
        lastActiveScriptureResourceId: null,
        anchorResourceId: null,
      })
    ).toBe(false)
  })
})
