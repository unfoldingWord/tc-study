import { describe, expect, test } from 'bun:test'
import { linkedPanelsConfigMembershipKey } from './useReadLinkedPanelsConfig'

describe('linkedPanelsConfigMembershipKey', () => {
  const five = ['bsb', 'ult', 'ust', 't4t', 'ugnt']

  test('identical 5-resource membership has the same key (setConfig should not fire)', () => {
    const a = {
      resources: five.map((id) => ({ id })),
      panels: {
        'panel-1': { resourceIds: five, initialIndex: 0 },
        'panel-2': { resourceIds: five.map((id) => `${id}#2`), initialIndex: 1 },
      },
    }
    const b = {
      resources: five.map((id) => ({ id })),
      panels: {
        'panel-2': { resourceIds: five.map((id) => `${id}#2`), initialIndex: 1 },
        'panel-1': { resourceIds: [...five], initialIndex: 0 },
      },
    }
    expect(linkedPanelsConfigMembershipKey(a)).toBe(linkedPanelsConfigMembershipKey(b))
  })

  test('panel-2 instance ids stay distinct from panel-1 base ids', () => {
    const p1 = ['unfoldingWord/en/bsb', 'unfoldingWord/en/ult', 'unfoldingWord/en/ust']
    const p2 = ['unfoldingWord/en/bsb#2', 'unfoldingWord/en/ult#2', 'unfoldingWord/en/ust#2']
    const key = linkedPanelsConfigMembershipKey({
      resources: [...p1, ...p2].map((id) => ({ id })),
      panels: {
        'panel-1': { resourceIds: p1, initialIndex: 0 },
        'panel-2': { resourceIds: p2, initialIndex: 1 },
      },
    })
    expect(key).toContain('unfoldingWord/en/ust#2')
    expect(key).toContain('panel-2:unfoldingWord/en/bsb#2')
    expect(p1.filter((id) => p2.includes(id))).toEqual([])
  })

  test('tab index or membership change produces a new key', () => {
    const base = {
      resources: five.map((id) => ({ id })),
      panels: {
        'panel-1': { resourceIds: five, initialIndex: 0 },
        'panel-2': { resourceIds: five, initialIndex: 0 },
      },
    }
    const clickedUst = {
      ...base,
      panels: {
        ...base.panels,
        'panel-1': { resourceIds: five, initialIndex: 2 },
      },
    }
    expect(linkedPanelsConfigMembershipKey(base)).not.toBe(linkedPanelsConfigMembershipKey(clickedUst))
  })
})
