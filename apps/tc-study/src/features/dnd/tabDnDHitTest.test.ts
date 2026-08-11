import { describe, expect, test } from 'bun:test'
import { commitTabDrop, resolveDropFromHit } from './tabDnDHitTest'

describe('tabDnDHitTest', () => {
  test('resolveDropFromHit maps tab and droppable hits', () => {
    expect(
      resolveDropFromHit(
        { tabKey: 'org/en/ult', tabPanel: 'panel-2', droppablePanel: 'panel-2' },
        ['a'],
        ['org/en/ult', 'org/en/ust'],
        'a'
      )
    ).toEqual({ targetPanelId: 'panel-2', dropIndex: 0 })

    expect(
      resolveDropFromHit(
        { tabKey: null, tabPanel: null, droppablePanel: 'panel-2' },
        ['a'],
        ['b'],
        'a'
      )
    ).toEqual({ targetPanelId: 'panel-2', dropIndex: 1 })
  })

  test('resolveDropFromHit returns null outside drop surfaces', () => {
    expect(
      resolveDropFromHit(
        { tabKey: null, tabPanel: null, droppablePanel: null },
        ['a'],
        ['b'],
        'a'
      )
    ).toBeNull()
  })

  test('commitTabDrop reorders within panel and moves across', () => {
    const reorders: Array<[string, string, number]> = []
    const moves: Array<[string, string, string, number | undefined]> = []

    expect(
      commitTabDrop({
        activeKey: 'a',
        sourcePanelId: 'panel-1',
        target: { targetPanelId: 'panel-1', dropIndex: 1 },
        panel1Keys: ['a', 'b'],
        panel2Keys: [],
        onReorder: (k, p, i) => reorders.push([k, p, i]),
        onMove: (k, f, t, i) => moves.push([k, f, t, i]),
      })
    ).toBe(true)
    expect(reorders).toEqual([['a', 'panel-1', 1]])

    expect(
      commitTabDrop({
        activeKey: 'a',
        sourcePanelId: 'panel-1',
        target: { targetPanelId: 'panel-2', dropIndex: 0 },
        panel1Keys: ['a'],
        panel2Keys: ['b'],
        onReorder: (k, p, i) => reorders.push([k, p, i]),
        onMove: (k, f, t, i) => moves.push([k, f, t, i]),
      })
    ).toBe(true)
    expect(moves).toEqual([['a', 'panel-1', 'panel-2', 0]])
  })

  test('commitTabDrop no-ops when index unchanged', () => {
    let called = false
    expect(
      commitTabDrop({
        activeKey: 'a',
        sourcePanelId: 'panel-1',
        target: { targetPanelId: 'panel-1', dropIndex: 0 },
        panel1Keys: ['a', 'b'],
        panel2Keys: [],
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
