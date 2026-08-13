import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyLanguageAvailability } from '../features/read/languageAvailability'
import type { ListedLanguage } from '../features/read/languagesCache'
import {
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
  test('wires listMode/helpsFlag through filterPickerLanguages; still uses LanguagePickerRow', () => {
    const src = readFileSync(join(import.meta.dir, 'LanguagePicker.tsx'), 'utf8')
    expect(src).toContain("listMode = 'text'")
    expect(src).toContain('helpsFlag')
    expect(src).toContain('filterPickerLanguages')
    expect(src).toContain('LanguagePickerRow')
    expect(src).not.toMatch(/availability\.(bible|obs)/)
    const loc = src.split(/\r?\n/).length
    expect(loc).toBeLessThanOrEqual(400)
  })
})
