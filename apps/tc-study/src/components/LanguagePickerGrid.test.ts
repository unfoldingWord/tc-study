import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyLanguageAvailability } from '../features/read/languageAvailability'
import type { ListedLanguage } from '../features/read/languagesCache'
import { LanguagePickerGrid } from './LanguagePickerGrid'

function lang(extras: Partial<ListedLanguage> = {}): ListedLanguage {
  return {
    code: extras.code ?? 'en',
    name: extras.name ?? 'English',
    source: extras.source ?? 'door43',
    availability: extras.availability ?? emptyLanguageAvailability(),
    ...extras,
  }
}

describe('LanguagePickerGrid', () => {
  test('uses a 2–3 column card grid with stack gap', () => {
    const src = readFileSync(join(import.meta.dir, 'LanguagePickerGrid.tsx'), 'utf8')
    expect(src).toContain('grid grid-cols-2 md:grid-cols-3 gap-stack')
    expect(src).toContain('LanguagePickerRow')
    expect(src).not.toContain('space-y-4')
    expect(src).not.toContain('<p>')
  })

  test('empty search is icon-only', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePickerGrid, {
        catalogLanguages: [],
        onlineLanguages: [],
        onSelect: () => {},
      })
    )
    expect(html).toContain('aria-label="No matching languages"')
    expect(html).not.toContain('<p>')
    expect(html).not.toContain('<p ')
  })

  test('both groups get a hairline + wifi split, not a section title', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePickerGrid, {
        catalogLanguages: [lang({ code: 'en', name: 'English', source: 'catalog' })],
        onlineLanguages: [lang({ code: 'es', name: 'Spanish', source: 'door43' })],
        onSelect: () => {},
      })
    )
    expect(html).toContain('role="separator"')
    expect(html).toContain('bg-border-subtle')
    expect(html).toContain('English')
    expect(html).toContain('Spanish')
    expect(html).not.toContain('Cached')
    expect(html).not.toContain('Online languages')
  })

  test('single group has no separator', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePickerGrid, {
        catalogLanguages: [lang({ code: 'en', name: 'English', source: 'catalog' })],
        onlineLanguages: [],
        onSelect: () => {},
      })
    )
    expect(html).not.toContain('role="separator"')
    expect(html).toContain('English')
  })
})
