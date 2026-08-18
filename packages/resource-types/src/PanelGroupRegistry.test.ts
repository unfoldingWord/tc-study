import { describe, expect, test } from 'bun:test'
import { definePanelGroup } from './panelGroup'
import { PanelGroupRegistry } from './PanelGroupRegistry'

describe('PanelGroupRegistry', () => {
  test('registers scripture and obs groups', () => {
    const registry = new PanelGroupRegistry()
    registry.register(definePanelGroup({ id: 'scripture', displayName: 'Scripture' }))
    registry.register(definePanelGroup({ id: 'obs', displayName: 'Open Bible Stories' }))
    expect(registry.get('scripture')?.displayName).toBe('Scripture')
    expect(registry.getAll().map((g) => g.id)).toEqual(['scripture', 'obs'])
  })

  test('rejects duplicate group ids', () => {
    const registry = new PanelGroupRegistry()
    registry.register({ id: 'scripture', displayName: 'Scripture' })
    expect(() => registry.register({ id: 'scripture', displayName: 'Again' })).toThrow(
      /already registered/
    )
  })
})
