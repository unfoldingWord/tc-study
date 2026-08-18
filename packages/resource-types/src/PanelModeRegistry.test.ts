import { describe, expect, test } from 'bun:test'
import { definePanelMode } from './panelMode'
import { PanelModeRegistry } from './PanelModeRegistry'

describe('PanelModeRegistry', () => {
  test('scripture allows primary-text; helps allows helps', () => {
    const registry = new PanelModeRegistry()
    registry.register(
      definePanelMode({
        id: 'scripture',
        displayName: 'Scripture',
        allows: ['primary-text'],
      })
    )
    registry.register(
      definePanelMode({
        id: 'helps',
        displayName: 'Helps',
        allows: ['helps'],
      })
    )

    expect(registry.allows('scripture', 'primary-text')).toBe(true)
    expect(registry.allows('scripture', 'helps')).toBe(false)
    expect(registry.allows('helps', 'helps')).toBe(true)
    expect(registry.allows('helps', 'primary-text')).toBe(false)
    expect(registry.allowedEntryTypes('scripture')).toEqual(['primary-text'])
    expect(registry.getAll().map((m) => m.id)).toEqual(['scripture', 'helps'])
  })

  test('rejects duplicate mode ids', () => {
    const registry = new PanelModeRegistry()
    registry.register({ id: 'scripture', displayName: 'Scripture', allows: ['primary-text'] })
    expect(() =>
      registry.register({ id: 'scripture', displayName: 'Again', allows: ['primary-text'] })
    ).toThrow(/already registered/)
  })

  test('rejects empty allowlist', () => {
    expect(() => definePanelMode({ id: 'x', displayName: 'X', allows: [] })).toThrow(
      /at least one entry type/
    )
  })
})
