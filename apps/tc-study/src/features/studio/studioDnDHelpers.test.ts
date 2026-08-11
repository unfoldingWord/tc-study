import { describe, expect, test } from 'bun:test'
import {
  getDragOverlayLabel,
  panelOwningKey,
  resolveCrossPanelHover,
} from './studioDnDHelpers'

describe('studioDnDHelpers', () => {
  test('panelOwningKey finds panel ownership', () => {
    expect(panelOwningKey('a', ['a'], ['b'])).toBe('panel-1')
    expect(panelOwningKey('b', ['a'], ['b'])).toBe('panel-2')
    expect(panelOwningKey('c', ['a'], ['b'])).toBeNull()
  })

  test('resolveCrossPanelHover maps droppable and tab targets', () => {
    expect(resolveCrossPanelHover('panel-1-droppable', ['a'], ['b'])).toEqual({
      targetPanelId: 'panel-1',
      dropIndex: 1,
    })
    expect(resolveCrossPanelHover('b', ['a'], ['b', 'c'])).toEqual({
      targetPanelId: 'panel-2',
      dropIndex: 0,
    })
    expect(resolveCrossPanelHover('missing', ['a'], ['b'])).toBeNull()
  })

  test('getDragOverlayLabel prefers key segment then title heuristics', () => {
    expect(getDragOverlayLabel('org/en/ult')).toBe('ULT')
    expect(getDragOverlayLabel('x', { title: 'Greek New Testament' })).toBe('X')
    expect(getDragOverlayLabel('', { title: 'Greek New Testament' })).toBe('UGNT')
    expect(getDragOverlayLabel('missing')).toBe('MISSING')
    expect(
      getDragOverlayLabel('es-419_gl/es-419/glt', {
        title: 'Texto Puente Literal',
        abbreviation: 'tpl',
      })
    ).toBe('TPL')
  })
})
