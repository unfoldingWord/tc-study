import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyLanguageAvailability } from '../features/read/languageAvailability'
import type { ListedLanguage } from '../features/read/languagesCache'
import {
  LANGUAGE_PICKER_CURRENT_CARD_CLASS,
  LANGUAGE_PICKER_OTHER_CARD_CLASS,
} from './LanguagePickerRow'
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
        catalogLanguages: [
          lang({
            code: 'en',
            name: 'English',
            source: 'catalog',
            availability: { bible: true, obs: false, bibleHelps: false, obsHelps: false },
          }),
        ],
        onlineLanguages: [
          lang({
            code: 'es',
            name: 'Spanish',
            source: 'door43',
            availability: { bible: false, obs: true, bibleHelps: false, obsHelps: false },
          }),
        ],
        onSelect: () => {},
      })
    )
    expect(html).toContain('role="separator"')
    expect(html).toContain('bg-border-subtle')
    expect(html).toContain('w-3 h-3 text-fg-muted')
    expect(html).toContain('English')
    expect(html).toContain('en')
    expect(html).toContain('Spanish')
    expect(html).toContain('es')
    expect(html).toContain('aria-label="Bible"')
    expect(html).toContain('aria-label="OBS"')
    expect(html).not.toContain('Cached')
    expect(html).not.toContain('Online languages')
    expect(html).not.toContain('M3 5V19A9 3 0 0 0 21 19V5')
    expect(html).not.toContain('w-3 h-3 text-accent"')
  })

  test('p1 es-419 / p2 mr marks this pane strong and sibling soft', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePickerGrid, {
        catalogLanguages: [
          lang({ code: 'es-419', name: 'español Latin America', source: 'catalog' }),
          lang({ code: 'mr', name: 'मराठी', source: 'catalog' }),
        ],
        onlineLanguages: [],
        onSelect: () => {},
        currentLanguageCode: 'es-419',
        otherLanguageCode: 'mr',
      })
    )
    expect(html).toContain(LANGUAGE_PICKER_CURRENT_CARD_CLASS)
    expect(html).toContain(LANGUAGE_PICKER_OTHER_CARD_CLASS)
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('aria-pressed="true"')
  })

  test('same language both panes is one strong card', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePickerGrid, {
        catalogLanguages: [
          lang({ code: 'es-419', name: 'español Latin America', source: 'catalog' }),
          lang({ code: 'mr', name: 'मराठी', source: 'catalog' }),
        ],
        onlineLanguages: [],
        onSelect: () => {},
        currentLanguageCode: 'es-419',
        otherLanguageCode: 'es-419',
      })
    )
    expect(html).toContain(LANGUAGE_PICKER_CURRENT_CARD_CLASS)
    expect(html).not.toContain(LANGUAGE_PICKER_OTHER_CARD_CLASS)
    expect(html).not.toContain('aria-pressed')
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
