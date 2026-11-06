import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Badge, type BadgeTone } from './Badge'
import { Card } from './Card'
import { SectionLabel } from './SectionLabel'
import { expectNoRawPalette } from './noRawPalette.test-helper'

describe('Badge', () => {
  const PAIRS: Record<BadgeTone, [string, string]> = {
    accent: ['bg-accent-soft', 'text-accent-fg'],
    valid: ['bg-valid-soft', 'text-valid-fg'],
    danger: ['bg-danger-soft', 'text-danger'],
    warning: ['bg-warning-soft', 'text-warning-fg'],
    neutral: ['bg-muted', 'text-fg-secondary'],
  }

  for (const [tone, [fill, text]] of Object.entries(PAIRS) as [BadgeTone, [string, string]][]) {
    test(`${tone} renders ${fill} with ${text}`, () => {
      const html = renderToStaticMarkup(createElement(Badge, { tone }, 'New'))
      expect(html).toContain(fill)
      expect(html).toContain(text)
      expect(html).toContain('>New<')
    })
  }

  test('defaults to the accent tone and tC4 badge type', () => {
    const html = renderToStaticMarkup(createElement(Badge, null, '3'))
    expect(html).toContain('bg-accent-soft')
    for (const cls of ['inline-flex', 'h-5', 'rounded-full', 'px-2', 'text-[10px]', 'font-extrabold', 'uppercase', 'tracking-[0.06em]']) {
      expect(html).toContain(cls)
    }
  })

  test('every tone avoids raw palette classes', () => {
    for (const tone of Object.keys(PAIRS) as BadgeTone[]) {
      expectNoRawPalette(renderToStaticMarkup(createElement(Badge, { tone }, 'x')))
    }
  })
})

describe('Card', () => {
  test('is a padded radius-16 surface with a 1 px border and the card shadow', () => {
    const html = renderToStaticMarkup(createElement(Card, null, 'x'))
    expect(html.startsWith('<div')).toBe(true)
    for (const cls of ['rounded-2xl', 'border', 'border-border', 'bg-surface', 'shadow-sm', 'p-6']) {
      expect(html).toContain(cls)
    }
  })

  test('renders as another element and drops its padding when asked', () => {
    const html = renderToStaticMarkup(createElement(Card, { as: 'section', padded: false, 'aria-label': 'Storage' }, 'x'))
    expect(html.startsWith('<section')).toBe(true)
    expect(html).toContain('aria-label="Storage"')
    expect(html).not.toContain('p-6')
  })

  test('a className is appended to the base classes', () => {
    const html = renderToStaticMarkup(createElement(Card, { className: 'space-y-4' }, 'x'))
    expect(html).toContain('space-y-4')
    expect(html).toContain('bg-surface')
  })

  test('markup avoids raw palette classes', () => {
    expectNoRawPalette(renderToStaticMarkup(createElement(Card, null, 'x')))
  })
})

describe('SectionLabel', () => {
  test('carries tC4 overline type in fg-muted', () => {
    const html = renderToStaticMarkup(createElement(SectionLabel, null, 'Storage'))
    for (const cls of ['text-[11px]', 'font-extrabold', 'uppercase', 'tracking-[0.13em]', 'text-fg-muted']) {
      expect(html).toContain(cls)
    }
    expect(html).toContain('>Storage<')
  })

  test('renders as a heading when asked', () => {
    const html = renderToStaticMarkup(createElement(SectionLabel, { as: 'h2' }, 'Storage'))
    expect(html.startsWith('<h2')).toBe(true)
  })

  test('markup avoids raw palette classes', () => {
    expectNoRawPalette(renderToStaticMarkup(createElement(SectionLabel, null, 'Storage')))
  })
})
