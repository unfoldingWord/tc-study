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
  LanguagePickerRow,
  TEXT_LANGUAGE_BADGE_LABELS,
  textLanguageAvailabilityBadges,
} from './LanguagePickerRow'

const HELPS_ONLY: ListedLanguage['availability'] = {
  bible: false,
  obs: false,
  bibleHelps: true,
  obsHelps: true,
}

function lang(
  availability: ListedLanguage['availability'] | undefined,
  extras: Partial<ListedLanguage> = {}
): ListedLanguage {
  return {
    code: extras.code ?? 'en',
    name: extras.name ?? 'English',
    source: extras.source ?? 'door43',
    availability: availability ?? emptyLanguageAvailability(),
    ...extras,
  }
}

describe('textLanguageAvailabilityBadges', () => {
  test('bible-only', () => {
    expect(
      textLanguageAvailabilityBadges({
        bible: true,
        obs: false,
        bibleHelps: false,
        obsHelps: false,
      })
    ).toEqual([{ kind: 'bible', label: TEXT_LANGUAGE_BADGE_LABELS.bible }])
  })

  test('obs-only', () => {
    expect(
      textLanguageAvailabilityBadges({
        bible: false,
        obs: true,
        bibleHelps: false,
        obsHelps: false,
      })
    ).toEqual([{ kind: 'obs', label: TEXT_LANGUAGE_BADGE_LABELS.obs }])
  })

  test('both Bible and OBS', () => {
    expect(
      textLanguageAvailabilityBadges({
        bible: true,
        obs: true,
        bibleHelps: true,
        obsHelps: true,
      })
    ).toEqual([
      { kind: 'bible', label: TEXT_LANGUAGE_BADGE_LABELS.bible },
      { kind: 'obs', label: TEXT_LANGUAGE_BADGE_LABELS.obs },
    ])
  })

  test('neither degrades to no badges (empty flags)', () => {
    expect(textLanguageAvailabilityBadges(emptyLanguageAvailability())).toEqual([])
  })

  test('neither degrades to no badges (missing availability)', () => {
    expect(textLanguageAvailabilityBadges(undefined)).toEqual([])
    expect(textLanguageAvailabilityBadges(null)).toEqual([])
  })

  test('helps flags alone do not produce badges', () => {
    expect(textLanguageAvailabilityBadges(HELPS_ONLY)).toEqual([])
  })
})

describe('LanguagePickerRow', () => {
  test('bible-only row exposes Bible label, not OBS', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePickerRow, {
        lang: lang({
          bible: true,
          obs: false,
          bibleHelps: false,
          obsHelps: false,
        }),
        status: 'online',
      })
    )
    expect(html).toContain(`aria-label="${TEXT_LANGUAGE_BADGE_LABELS.bible}"`)
    expect(html).toContain(`title="${TEXT_LANGUAGE_BADGE_LABELS.bible}"`)
    expect(html).not.toContain(`aria-label="${TEXT_LANGUAGE_BADGE_LABELS.obs}"`)
    expect(html).toContain('English')
    expect(html).toContain('en')
    expect(html).toContain('border-border-subtle')
    expect(html).toContain('rounded-md')
    expect(html).toContain('text-sm font-semibold')
    expect(html).toContain('text-caption text-fg-muted')
  })

  test('obs-only row exposes OBS label, not Bible', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePickerRow, {
        lang: lang(
          { bible: false, obs: true, bibleHelps: false, obsHelps: false },
          { code: 'bho', name: 'Bhojpuri' }
        ),
        status: 'cached',
      })
    )
    expect(html).toContain(`aria-label="${TEXT_LANGUAGE_BADGE_LABELS.obs}"`)
    expect(html).toContain(`title="${TEXT_LANGUAGE_BADGE_LABELS.obs}"`)
    expect(html).not.toContain(`aria-label="${TEXT_LANGUAGE_BADGE_LABELS.bible}"`)
    expect(html).toContain('Bhojpuri')
  })

  test('Spanish row uses the autonym as the card title, not anglicized_name', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePickerRow, {
        lang: lang(emptyLanguageAvailability(), {
          code: 'es',
          name: 'español',
          anglicizedName: 'Spanish',
        }),
        status: 'online',
      })
    )
    expect(html).toContain('>Español<')
    expect(html).not.toMatch(/>Spanish</)
    expect(html).toContain('title="Español (Spanish)"')
    expect(html).toContain('aria-label="Español (Spanish)"')
    expect(html).toContain('es')
  })

  test('both badges when Bible and OBS are available', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePickerRow, {
        lang: lang({
          bible: true,
          obs: true,
          bibleHelps: false,
          obsHelps: false,
        }),
        status: 'online',
      })
    )
    expect(html).toContain(`aria-label="${TEXT_LANGUAGE_BADGE_LABELS.bible}"`)
    expect(html).toContain(`aria-label="${TEXT_LANGUAGE_BADGE_LABELS.obs}"`)
  })

  test('selected card uses accent border and soft fill', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePickerRow, {
        lang: lang(emptyLanguageAvailability()),
        status: 'online',
        selected: true,
      })
    )
    expect(html).toContain(LANGUAGE_PICKER_CURRENT_CARD_CLASS)
    expect(html).toContain('aria-current="true"')
  })

  test('this pane is strong current; other pane is softer', () => {
    const current = renderToStaticMarkup(
      createElement(LanguagePickerRow, {
        lang: lang(emptyLanguageAvailability(), {
          code: 'es-419',
          name: 'español Latin America',
          anglicizedName: 'Spanish Latin America',
        }),
        status: 'online',
        cardRole: 'current',
      })
    )
    const other = renderToStaticMarkup(
      createElement(LanguagePickerRow, {
        lang: lang(emptyLanguageAvailability(), {
          code: 'mr',
          name: 'मराठी',
        }),
        status: 'online',
        cardRole: 'other',
      })
    )
    expect(current).toContain(LANGUAGE_PICKER_CURRENT_CARD_CLASS)
    expect(current).toContain('aria-current="true"')
    expect(current).not.toContain('aria-pressed')
    expect(other).toContain(LANGUAGE_PICKER_OTHER_CARD_CLASS)
    expect(other).toContain('aria-pressed="true"')
    expect(other).not.toContain('aria-current')
    expect(other).toContain('title="मराठी"')
    expect(other).not.toContain(LANGUAGE_PICKER_CURRENT_CARD_CLASS)
  })

  test('neither degrades: row still renders, no Bible/OBS badges', () => {
    const html = renderToStaticMarkup(
      createElement(LanguagePickerRow, {
        lang: lang(emptyLanguageAvailability(), { code: 'sw', name: 'Swahili' }),
        status: 'online',
      })
    )
    expect(html).toContain('Swahili')
    expect(html).toContain('sw')
    expect(html).not.toContain(`aria-label="${TEXT_LANGUAGE_BADGE_LABELS.bible}"`)
    expect(html).not.toContain(`aria-label="${TEXT_LANGUAGE_BADGE_LABELS.obs}"`)
  })
})

describe('LanguagePicker list contract (issue #24 / #25)', () => {
  test('wires textKind through filterPickerLanguages; grid uses LanguagePickerRow', () => {
    const src = readFileSync(join(import.meta.dir, 'LanguagePicker.tsx'), 'utf8')
    const gridSrc = readFileSync(join(import.meta.dir, 'LanguagePickerGrid.tsx'), 'utf8')
    expect(src).toContain("listMode = 'text'")
    expect(src).toContain('textKind')
    expect(src).toContain('filterPickerLanguages')
    expect(src).toContain('LanguagePickerGrid')
    expect(src).toContain('LanguagePickerTextKindFilter')
    expect(src).not.toContain('space-y-4')
    expect(src).not.toMatch(/availability\.(bible|obs)/)
    expect(gridSrc).toContain('LanguagePickerRow')
    const loc = src.split(/\r?\n/).length
    expect(loc).toBeLessThanOrEqual(400)
  })
})
