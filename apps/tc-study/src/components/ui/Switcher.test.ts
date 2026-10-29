import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Switcher } from './Switcher'
import { nextSwitcherIndex } from './switcherKeys'
import { expectNoRawPalette } from './noRawPalette.test-helper'

describe('nextSwitcherIndex', () => {
  test('arrows move by one and wrap around', () => {
    expect(nextSwitcherIndex(0, 'ArrowRight', 3, 'ltr')).toBe(1)
    expect(nextSwitcherIndex(2, 'ArrowRight', 3, 'ltr')).toBe(0)
    expect(nextSwitcherIndex(1, 'ArrowLeft', 3, 'ltr')).toBe(0)
    expect(nextSwitcherIndex(0, 'ArrowLeft', 3, 'ltr')).toBe(2)
  })

  test('arrows swap in rtl', () => {
    expect(nextSwitcherIndex(0, 'ArrowRight', 3, 'rtl')).toBe(2)
    expect(nextSwitcherIndex(0, 'ArrowLeft', 3, 'rtl')).toBe(1)
  })

  test('Home and End go to the ends in either direction', () => {
    expect(nextSwitcherIndex(1, 'Home', 3, 'ltr')).toBe(0)
    expect(nextSwitcherIndex(0, 'End', 3, 'ltr')).toBe(2)
    expect(nextSwitcherIndex(1, 'Home', 3, 'rtl')).toBe(0)
    expect(nextSwitcherIndex(0, 'End', 3, 'rtl')).toBe(2)
  })

  test('any other key, or no items, returns null', () => {
    expect(nextSwitcherIndex(0, 'a', 3, 'ltr')).toBeNull()
    expect(nextSwitcherIndex(0, 'Enter', 3, 'ltr')).toBeNull()
    expect(nextSwitcherIndex(0, 'ArrowRight', 0, 'ltr')).toBeNull()
  })

  test('with no current tab (-1), forward enters at the first tab and back at the last', () => {
    expect(nextSwitcherIndex(-1, 'ArrowRight', 3, 'ltr')).toBe(0)
    expect(nextSwitcherIndex(-1, 'ArrowLeft', 3, 'ltr')).toBe(2)
    expect(nextSwitcherIndex(-1, 'ArrowLeft', 3, 'rtl')).toBe(0)
    expect(nextSwitcherIndex(-1, 'ArrowRight', 3, 'rtl')).toBe(2)
    expect(nextSwitcherIndex(-1, 'Home', 3, 'ltr')).toBe(0)
    expect(nextSwitcherIndex(-1, 'End', 3, 'ltr')).toBe(2)
  })
})

const ITEMS = [
  { value: 'read', label: 'Read' },
  { value: 'study', label: 'Study' },
  { value: 'notes', label: 'Notes' },
] as const

function render(indicator?: 'underline' | 'pill', value = 'study'): string {
  return renderToStaticMarkup(
    createElement(Switcher<string>, {
      items: [...ITEMS],
      value,
      onChange: () => {},
      label: 'View',
      indicator,
    })
  )
}

/** The opening tag of each tab, in order. */
function tabs(html: string): string[] {
  return html.match(/<button[^>]*>/g) ?? []
}

function classes(tag: string): string[] {
  return tag.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? []
}

describe('Switcher', () => {
  test('is a labelled tablist of tabs', () => {
    const html = render()
    expect(html).toMatch(/^<div[^>]*role="tablist"/)
    expect(html).toContain('aria-label="View"')
    expect(tabs(html)).toHaveLength(3)
    for (const tab of tabs(html)) {
      expect(tab).toContain('role="tab"')
      expect(tab).toContain('type="button"')
    }
    expect(html).toContain('>Study<')
  })

  test('only the selected tab is aria-selected and in the tab order', () => {
    const [read, study, notes] = tabs(render())
    expect(study).toContain('aria-selected="true"')
    expect(study).toContain('tabindex="0"')
    for (const other of [read, notes]) {
      expect(other).toContain('aria-selected="false"')
      expect(other).toContain('tabindex="-1"')
    }
    expect(render().match(/tabindex="0"/g)).toHaveLength(1)
  })

  test('a value missing from items keeps the first tab in the tab order, unselected', () => {
    const [read, study, notes] = tabs(render(undefined, 'gone'))
    expect(read).toContain('tabindex="0"')
    for (const other of [study, notes]) expect(other).toContain('tabindex="-1"')
    for (const tab of [read, study, notes]) expect(tab).toContain('aria-selected="false"')
  })

  test('underline (the default) marks the selected tab with a 2 px accent bar', () => {
    const html = render()
    const [read, study] = tabs(html).map(classes)
    expect(study).toEqual(expect.arrayContaining(['border-b-2', 'border-accent', 'text-fg']))
    expect(read).toContain('text-fg-secondary')
    expect(read).not.toContain('border-accent')
    expect(read).not.toContain('text-fg')
    expect(html).not.toContain('bg-muted')
  })

  test('pill is a segmented control with a raised selected segment', () => {
    const html = render('pill')
    expect(html).toMatch(/^<div[^>]*class="[^"]*items-center[^"]*rounded-full bg-muted p-1/)
    expect(html).toContain('pointer-coarse:p-1.5')
    const [read, study] = tabs(html).map(classes)
    expect(study).toEqual(expect.arrayContaining(['rounded-full', 'bg-surface', 'shadow-xs', 'text-fg']))
    expect(read).toContain('text-fg-secondary')
    expect(read).not.toContain('bg-surface')
    expect(html).not.toContain('border-accent')
  })

  test('underline and pill markup avoid raw palette classes', () => {
    expectNoRawPalette(render())
    expectNoRawPalette(render('pill'))
  })
})
