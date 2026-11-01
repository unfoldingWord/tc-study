import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { OCEAN_BAR_FOCUS_RING, OCEAN_BAR_SECTION_SHORTCUT } from '../styles/oceanBarChrome'
import Layout from './Layout'

function renderLayout(pathname: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [pathname] },
      createElement(
        Routes,
        null,
        createElement(
          Route,
          { path: '/*', element: createElement(Layout) },
          createElement(Route, { path: '*', element: null })
        )
      )
    )
  )
}

/** Bar shortcut link for the active section (not the flyout menu). */
function sectionShortcutClass(html: string, navLabel: string): string {
  const pattern = new RegExp(
    `<a[^>]*aria-label="${navLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*class="([^"]*)"`,
    'i'
  )
  const match = html.match(pattern)
  if (!match) {
    throw new Error(`No section shortcut NavLink with aria-label="${navLabel}"`)
  }
  return match[1]
}

describe('Layout Ocean bar', () => {
  test('section shortcut NavLink class includes every OCEAN_BAR_SECTION_SHORTCUT token', () => {
    const html = renderLayout('/home')
    const className = sectionShortcutClass(html, 'Home')
    for (const token of OCEAN_BAR_SECTION_SHORTCUT.split(/\s+/).filter(Boolean)) {
      expect(className).toContain(token)
    }
    for (const token of OCEAN_BAR_FOCUS_RING.split(/\s+/).filter(Boolean)) {
      expect(className).toContain(token)
    }
    expect(className).toContain('shadow-accent-fill-fg/80')
  })
})
