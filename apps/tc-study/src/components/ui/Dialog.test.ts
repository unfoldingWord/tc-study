import { describe, expect, mock, test } from 'bun:test'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Dialog, DialogFrame } from './Dialog'

type FrameProps = Parameters<typeof DialogFrame>[0]

function frameProps(overrides: Partial<FrameProps> = {}): FrameProps {
  return {
    titleId: 'dlg-title',
    title: 'Clear cache',
    closeLabel: 'Close dialog',
    onClose: () => {},
    children: 'Body',
    ...overrides,
  }
}

function renderFrame(overrides: Partial<FrameProps> = {}): string {
  return renderToStaticMarkup(createElement(DialogFrame, frameProps(overrides)))
}

describe('Dialog', () => {
  test('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      createElement(Dialog, { open: false, onClose: () => {}, title: 'T', closeLabel: 'Close', children: 'Body' })
    )
    expect(html).toBe('')
  })
})

describe('DialogFrame', () => {
  test('is a modal dialog named by its title', () => {
    const html = renderFrame()
    const panel = html.match(/<div[^>]*role="dialog"[^>]*>/)?.[0] ?? ''
    expect(panel).toContain('aria-modal="true"')
    expect(panel).toContain('aria-labelledby="dlg-title"')
    expect(html).toMatch(/<h2[^>]*id="dlg-title"[^>]*>Clear cache<\/h2>/)
  })

  test('has tC4 modal shape over the overlay scrim', () => {
    const html = renderFrame()
    expect(html).toMatch(/^<div[^>]*class="[^"]*bg-overlay/)
    const panel = html.match(/<div[^>]*role="dialog"[^>]*>/)?.[0] ?? ''
    for (const cls of ['rounded-2xl', 'bg-elevated', 'shadow-xl', 'max-w-[520px]']) {
      expect(panel).toContain(cls)
    }
    const title = html.match(/<h2[^>]*>/)?.[0] ?? ''
    for (const cls of ['text-xl', 'font-extrabold', 'text-helps-fg']) {
      expect(title).toContain(cls)
    }
  })

  test('the close button is an IconButton named by closeLabel', () => {
    const html = renderFrame()
    expect(html).toMatch(/<button[^>]*aria-label="Close dialog"[^>]*title="Close dialog"/)
  })

  test('renders the body, and the footer only when given', () => {
    expect(renderFrame()).toContain('>Body<')
    expect(renderFrame()).not.toContain('Footer')
    expect(renderFrame({ footer: 'Footer' })).toContain('>Footer<')
  })

  test('Escape calls onClose, other keys do not', () => {
    const onClose = mock(() => {})
    const scrim = DialogFrame(frameProps({ onClose })) as ReactElement<{
      onKeyDown(e: { key: string; stopPropagation(): void }): void
    }>
    scrim.props.onKeyDown({ key: 'Enter', stopPropagation: () => {} })
    expect(onClose).not.toHaveBeenCalled()
    scrim.props.onKeyDown({ key: 'Escape', stopPropagation: () => {} })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('a press on the scrim calls onClose, a press inside the panel does not', () => {
    const onClose = mock(() => {})
    const scrim = DialogFrame(frameProps({ onClose })) as ReactElement<{
      onClick(e: { target: unknown; currentTarget: unknown }): void
    }>
    const scrimNode = {}
    scrim.props.onClick({ target: {}, currentTarget: scrimNode })
    expect(onClose).not.toHaveBeenCalled()
    scrim.props.onClick({ target: scrimNode, currentTarget: scrimNode })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
