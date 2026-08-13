import { describe, expect, test } from 'bun:test'
import { shouldReopenCollapsedPanel } from './readPanelReopen'

describe('shouldReopenCollapsedPanel', () => {
  test('token from visible panel reopens collapsed target', () => {
    expect(
      shouldReopenCollapsedPanel({
        layout: 'two',
        collapsedPanelId: 'panel-2',
        sourcePanelId: 'panel-1',
        signalType: 'token-click',
      })
    ).toBe(true)
    expect(
      shouldReopenCollapsedPanel({
        layout: 'two',
        collapsedPanelId: 'panel-1',
        sourcePanelId: 'panel-2',
        signalType: 'entry-link-click',
      })
    ).toBe(true)
  })

  test('local-only events and one-panel layout do not reopen', () => {
    expect(
      shouldReopenCollapsedPanel({
        layout: 'two',
        collapsedPanelId: 'panel-2',
        sourcePanelId: 'panel-1',
        signalType: 'scroll-sync',
      })
    ).toBe(false)
    expect(
      shouldReopenCollapsedPanel({
        layout: 'two',
        collapsedPanelId: 'panel-2',
        sourcePanelId: 'panel-2',
        signalType: 'token-click',
      })
    ).toBe(false)
    expect(
      shouldReopenCollapsedPanel({
        layout: 'one',
        collapsedPanelId: 'panel-2',
        sourcePanelId: 'panel-1',
        signalType: 'token-click',
      })
    ).toBe(false)
  })
})
