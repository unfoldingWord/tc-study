import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EmptyPanelState } from './EmptyPanelState'

const HELPS_CTA = 'Select a language to load resources'

describe('EmptyPanelState', () => {
  test('message is a clickable CTA when onMessageClick is provided', () => {
    const html = renderToStaticMarkup(
      createElement(EmptyPanelState, {
        panelId: 'panel-2',
        message: HELPS_CTA,
        onMessageClick: () => {},
      })
    )
    expect(html).toContain('<button')
    expect(html).toContain(HELPS_CTA)
    expect(html).toContain(`aria-label="${HELPS_CTA}"`)
    expect(html).toContain(`title="${HELPS_CTA}"`)
  })

  test('message stays a non-button paragraph without onMessageClick', () => {
    const html = renderToStaticMarkup(
      createElement(EmptyPanelState, {
        panelId: 'panel-1',
        message: HELPS_CTA,
      })
    )
    expect(html).not.toContain('<button')
    expect(html).toContain(HELPS_CTA)
  })

  test('labeled action is a compact button with title and aria-label', () => {
    const action = 'Switch to Stories'
    const html = renderToStaticMarkup(
      createElement(EmptyPanelState, {
        panelId: 'panel-1',
        message: "Bhojpuri doesn't have a Bible yet, but it has Open Bible Stories.",
        actionLabel: action,
        onAction: () => {},
      })
    )
    expect(html).toContain(action)
    expect(html).toContain(`aria-label="${action}"`)
    expect(html).toContain(`title="${action}"`)
    expect(html).toMatch(/Bhojpuri doesn(?:'|&#x27;)t have a Bible yet/)
    expect(html).not.toContain('Select a language to load resources')
  })

  test('action button does not turn the message into the helps CTA', () => {
    const html = renderToStaticMarkup(
      createElement(EmptyPanelState, {
        panelId: 'panel-1',
        message: 'Neither content',
        actionLabel: 'Switch to Bible',
        onAction: () => {},
        onMessageClick: () => {},
      })
    )
    expect(html).toContain('Neither content')
    expect(html).toContain('Switch to Bible')
    expect(html).not.toContain('hover:text-fg')
  })
})
