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

  test('/read/en/bible is one lang, not en+bible', () => {
    expect(parseReadUrl('/read/en/bible')).toEqual({
      langs: ['en'],
      resourceType: 'bible',
      navType: undefined,
      navRef: undefined,
      isBare: false,
    })
    expect(parseReadUrl('/read/en/bible/ref/tit%201:1').langs).toEqual(['en'])
    expect(parseReadUrl('/read/en/bible/ref/tit%201:1').resourceType).toBe('bible')
  })

  test('plus-separated pair: en+fr and es-419+fr', () => {
    expect(parseReadUrl('/read/en+fr/bible/ref/tit%201:1')).toEqual({
      langs: ['en', 'fr'],
      resourceType: 'bible',
      navType: 'ref',
      navRef: 'tit 1:1',
      isBare: false,
    })
    expect(parseReadUrl('/read/es-419+fr/obs/story/1')).toEqual({
      langs: ['es-419', 'fr'],
      resourceType: 'obs',
      navType: 'story',
      navRef: '1',
      isBare: false,
    })
    const tail = { resourceType: 'bible' as const, navType: 'ref', navRef: 'tit 1:1' }
    expect(serializeReadUrl({ langs: ['en', 'fr'], tail })).toBe('/read/en+fr/bible/ref/tit%201%3A1')
    expect(
      serializeReadUrl({
        langs: ['es-419', 'fr'],
        tail: { resourceType: 'obs', navType: 'story', navRef: '1' },
      })
    ).toBe('/read/es-419+fr/obs/story/1')
  })

  test('legacy /read/en/fr/bible is a parse alias; serialize writes plus', () => {
    expect(parseReadUrl('/read/en/fr/bible/ref/tit%201:1')).toEqual({
      langs: ['en', 'fr'],
      resourceType: 'bible',
      navType: 'ref',
      navRef: 'tit 1:1',
      isBare: false,
    })
    expect(parseReadUrl('/read/en/fr').langs).toEqual(['en', 'fr'])
    expect(
      serializeReadUrl({
        langs: ['en', 'fr'],
        tail: { resourceType: 'bible', navType: 'ref', navRef: 'tit 1:1' },
      })
    ).toBe('/read/en+fr/bible/ref/tit%201%3A1')
  })

  test('one lang serialize and parse', () => {
    expect(parseReadUrl('/read/en/bible/ref/tit%201:1')).toEqual({
      langs: ['en'],
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
    const tail = { resourceType: 'bible' as const, navType: 'ref', navRef: 'tit 1:1' }
    expect(serializeReadUrl({ langs: ['en'], tail })).toBe('/read/en/bible/ref/tit%201%3A1')
    expect(serializeReadUrl({ langs: ['en', 'en'], tail })).toBe('/read/en/bible/ref/tit%201%3A1')
  })

  test('eng canonicalizes to Door43 en', () => {
    expect(parseReadUrl('/read/eng/bible/ref/tit%201:1').langs).toEqual(['en'])
    expect(parseReadUrl('/read/eng+fr/obs/ref/1.1').langs).toEqual(['en', 'fr'])
    expect(parseReadUrl('/read/en+en/bible/ref/tit%201:1').langs).toEqual(['en'])
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
    expect(parseReadUrl('/read/en+fr').langs).toEqual(['en', 'fr'])
    expect(parseReadUrl('/read-v1/en/bible/ref/tit%201:1').langs).toEqual([])
  })

  test('both panel languageCodes serialize; helps lang is not omitted', () => {
    expect(
      readUrlLangsFromPanels({
        'panel-1': { mode: 'scripture', languageCode: 'en' },
        'panel-2': { mode: 'helps', languageCode: 'fr' },
      })
    ).toEqual(['en', 'fr'])
    expect(
      readUrlLangsFromPanels({
        'panel-1': { mode: 'scripture', languageCode: 'es-419' },
        'panel-2': { mode: 'helps', languageCode: 'en' },
      })
    ).toEqual(['es-419', 'en'])
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
    expect(
      readUrlLangsFromPanels({
        'panel-1': { mode: 'scripture', languageCode: 'es-419' },
        'panel-2': { mode: 'helps', languageCode: 'es-419' },
      })
    ).toEqual(['es-419'])
    const seeded = applyPanelLanguage(DEFAULT_READ_PANEL_MODELS, 'panel-1', 'ha')
    expect(readUrlLangsFromPanels(seeded)).toEqual(['ha'])
  })

  test('in-app scripture pick keeps a set helps lang in the path', () => {
    expect(
      readUrlLangsFromPanels({
        'panel-1': { mode: 'scripture', languageCode: 'fr' },
        'panel-2': { mode: 'helps', languageCode: 'en' },
      })
    ).toEqual(['fr', 'en'])
    expect(
      serializeReadUrl({
        langs: ['fr', 'en'],
        tail: { resourceType: 'obs', navType: 'story', navRef: '8' },
      })
    ).toBe('/read/fr+en/obs/story/8')
  })

  test('helps pick serializes both pane langs (fr + en → fr+en)', () => {
    const before = {
      'panel-1': { mode: 'scripture' as const, languageCode: 'fr' },
      'panel-2': { mode: 'helps' as const, languageCode: 'id' },
    }
    expect(readUrlLangsFromPanels(before)).toEqual(['fr', 'id'])
    const after = applyPanelLanguage(before, 'panel-2', 'en')
    expect(after['panel-1'].languageCode).toBe('fr')
    expect(readUrlLangsFromPanels(after)).toEqual(['fr', 'en'])
    expect(
      serializeReadUrl({
        langs: readUrlLangsFromPanels(after),
        tail: { resourceType: 'obs', navType: 'story', navRef: '8' },
      })
    ).toBe('/read/fr+en/obs/story/8')
  })
})
