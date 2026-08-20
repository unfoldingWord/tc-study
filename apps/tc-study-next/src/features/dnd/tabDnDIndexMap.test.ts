import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { commitTabDrop } from './tabDnDHitTest'

/**
 * Unlock 1: tabDnDIndexMap retired — commit uses one key space.
 * CombinedHelps no longer requires visible→raw mapping (TN/TWL stripped from panel keys).
 */
describe('tabDnD single key space (map retired)', () => {
  test('tabDnDIndexMap module is gone; hit-test does not import it', () => {
    const hitTest = readFileSync(join(import.meta.dir, 'tabDnDHitTest.ts'), 'utf8')
    expect(hitTest).not.toContain('tabDnDIndexMap')
    expect(hitTest).not.toContain('mapVisible')
  })

  test('commitTabDrop reorders in painted===store space (CombinedHelps + TQ)', () => {
    const keys = ['combined-helps', 'org/en/ult', 'org/en/tq']
    const reorders: Array<[string, string, number]> = []

    expect(
      commitTabDrop({
        activeKey: 'org/en/tq',
        sourcePanelId: 'panel-2',
        target: { targetPanelId: 'panel-2', dropIndex: 1 },
        panel1Keys: [],
        panel2Keys: keys,
        onReorder: (k, p, i) => reorders.push([k, p, i]),
        onMove: () => {
          throw new Error('unexpected move')
        },
      })
    ).toBe(true)
    expect(reorders).toEqual([['org/en/tq', 'panel-2', 1]])
  })

  test('commitTabDrop move insert uses painted index directly', () => {
    const moves: Array<[string, string, string, number | undefined]> = []

    expect(
      commitTabDrop({
        activeKey: 'org/en/ult',
        sourcePanelId: 'panel-1',
        target: { targetPanelId: 'panel-2', dropIndex: 1 },
        panel1Keys: ['org/en/ult'],
        panel2Keys: ['combined-helps', 'org/en/tq'],
        onReorder: () => {
          throw new Error('unexpected reorder')
        },
        onMove: (k, f, t, i) => moves.push([k, f, t, i]),
      })
    ).toBe(true)
    expect(moves).toEqual([['org/en/ult', 'panel-1', 'panel-2', 1]])
  })

  test('commitTabDrop no-ops when drop index equals active index', () => {
    let called = false
    expect(
      commitTabDrop({
        activeKey: 'org/en/ult',
        sourcePanelId: 'panel-2',
        target: { targetPanelId: 'panel-2', dropIndex: 1 },
        panel1Keys: [],
        panel2Keys: ['combined-helps', 'org/en/ult', 'org/en/tq'],
        onReorder: () => {
          called = true
        },
        onMove: () => {
          called = true
        },
      })
    ).toBe(false)
    expect(called).toBe(false)
  })
})
