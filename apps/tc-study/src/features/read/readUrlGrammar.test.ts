import { describe, expect, test } from 'bun:test'
import { applyPanelLanguage, DEFAULT_READ_PANEL_MODELS } from './readPanelModel'
import {
  isReservedReadToken,
  parseReadUrl,
  readUrlLangsFromPanels,
  serializeReadUrl,
} from './readUrlGrammar'

describe('readUrlGrammar', () => {
  test('bible / obs / helps / ref / story are never languages', () => {
    for (const token of ['bible', 'obs', 'helps', 'ref', 'story', 'chapter', 'section', 'passage']) {
      expect(isReservedReadToken(token)).toBe(true)
    }
    expect(parseReadUrl('/read/bible/ref/tit%201:1').langs).toEqual([])
    expect(parseReadUrl('/read/bible/ref/tit%201:1').resourceType).toBe('bible')
    expect(parseReadUrl('/read/en/bible/ref/tit%201:1').langs).toEqual(['en'])
    expect(parseReadUrl('/read/en/obs/story/1').langs).toEqual(['en'])
  })

  test('one vs two langs is unambiguous', () => {
    expect(parseReadUrl('/read/en/bible/ref/tit%201:1')).toEqual({
      langs: ['en'],
      resourceType: 'bible',
      navType: 'ref',
      navRef: 'tit 1:1',
      isBare: false,
    })
    expect(parseReadUrl('/read/en/fr/bible/ref/tit%201:1')).toEqual({
      langs: ['en', 'fr'],
      resourceType: 'bible',
      navType: 'ref',
      navRef: 'tit 1:1',
      isBare: false,
    })
    expect(parseReadUrl('/read/fr/obs/story/1')).toEqual({
      langs: ['fr'],
      resourceType: 'obs',
      navType: 'story',
      navRef: '1',
      isBare: false,
    })
  })

  test('eng canonicalizes to Door43 en', () => {
    expect(parseReadUrl('/read/eng/bible/ref/tit%201:1').langs).toEqual(['en'])
    expect(parseReadUrl('/read/eng/fr/obs/ref/1.1').langs).toEqual(['en', 'fr'])
    expect(
      serializeReadUrl({
        langs: ['eng'],
        tail: { resourceType: 'bible', navType: 'ref', navRef: 'tit 1:1' },
      })
    ).toBe('/read/en/bible/ref/tit%201%3A1')
  })

  test('bare /read and lang-only paths', () => {
    expect(parseReadUrl('/read')).toEqual({ langs: [], isBare: true })
    expect(parseReadUrl('/read/')).toEqual({ langs: [], isBare: true })
    expect(parseReadUrl('/read/en').langs).toEqual(['en'])
    expect(parseReadUrl('/read/en/fr').langs).toEqual(['en', 'fr'])
    expect(parseReadUrl('/read-v1/en/bible/ref/tit%201:1').langs).toEqual([])
  })

  test('serialize one or two langs', () => {
    const tail = { resourceType: 'bible' as const, navType: 'ref', navRef: 'tit 1:1' }
    expect(serializeReadUrl({ langs: ['en'], tail })).toBe('/read/en/bible/ref/tit%201%3A1')
    expect(serializeReadUrl({ langs: ['en', 'fr'], tail })).toBe('/read/en/fr/bible/ref/tit%201%3A1')
  })

  test('scripture panes own URL langs; helps-only is omitted', () => {
    expect(
      readUrlLangsFromPanels({
        'panel-1': { mode: 'scripture', languageCode: 'en' },
        'panel-2': { mode: 'helps', languageCode: 'fr' },
      })
    ).toEqual(['en'])
    expect(
      readUrlLangsFromPanels({
        'panel-1': { mode: 'scripture', languageCode: 'en' },
        'panel-2': { mode: 'scripture', languageCode: 'fr' },
      })
    ).toEqual(['en', 'fr'])
    expect(
      readUrlLangsFromPanels({
        'panel-1': { mode: 'scripture', languageCode: 'en' },
        'panel-2': { mode: 'scripture', languageCode: 'en' },
      })
    ).toEqual(['en'])
    const seeded = applyPanelLanguage(DEFAULT_READ_PANEL_MODELS, 'panel-1', 'ha')
    expect(readUrlLangsFromPanels(seeded)).toEqual(['ha'])
  })
})
