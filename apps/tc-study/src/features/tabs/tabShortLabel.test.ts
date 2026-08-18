import { afterAll, describe, expect, test } from 'bun:test'
import {
  bindCombinedHelpsCompositionsForTest,
  bindFakeCompositionForTest,
  FAKE_COMPOSITION_PERSIST_ID,
} from '../helps/testCompositionRegistry'
import { getResourceBadgeLabel, getTabShortLabel } from './tabShortLabel'

const unbindCompositions = bindCombinedHelpsCompositionsForTest()
afterAll(() => unbindCompositions())

describe('getTabShortLabel', () => {
  test('uppercases key segment when no abbreviation', () => {
    expect(
      getTabShortLabel({
        key: 'unfoldingWord/en/glt',
        title: 'Gateway Language Text',
      })
    ).toBe('GLT')
  })

  test('prefers DCS abbreviation over key segment', () => {
    expect(
      getTabShortLabel({
        key: 'es-419_gl/es-419/glt',
        title: 'Texto Puente Literal',
        abbreviation: 'tpl',
      })
    ).toBe('TPL')
  })

  test('composition persist ids use displayName (OBS Helps is not a generic Helps label)', () => {
    expect(
      getTabShortLabel({
        key: '__combined-helps__',
        type: 'combined-helps',
        title: 'Helps',
      })
    ).toBe('Helps')
    expect(
      getTabShortLabel({
        key: '__combined-helps-obs__',
        type: 'obs-combined-helps',
        title: 'OBS Helps',
      })
    ).toBe('OBS Helps')
  })

  test('fake composition persist id uses displayName without CombinedHelps-id checks', () => {
    const restore = bindFakeCompositionForTest()
    try {
      expect(
        getTabShortLabel({
          key: `${FAKE_COMPOSITION_PERSIST_ID}:panel-1`,
        })
      ).toBe('Fake Pair')
    } finally {
      restore()
    }
  })

  test('ignores blank abbreviation and falls back to key', () => {
    expect(
      getTabShortLabel({
        key: 'unfoldingWord/en/glt',
        abbreviation: '   ',
      })
    ).toBe('GLT')
  })
})

describe('getResourceBadgeLabel', () => {
  test('returns empty string when resource key is missing', () => {
    expect(getResourceBadgeLabel(null)).toBe('')
    expect(getResourceBadgeLabel(undefined)).toBe('')
    expect(getResourceBadgeLabel('')).toBe('')
  })

  test('uses key segment when AppStore/workspace resource has no abbreviation', () => {
    expect(
      getResourceBadgeLabel('es-419_gl/es-419/glt', {
        title: 'Texto Puente Literal',
      })
    ).toBe('GLT')
  })

  test('prefers DCS abbreviation from loaded ResourceInfo (glt → TPL)', () => {
    expect(
      getResourceBadgeLabel('es-419_gl/es-419/glt', {
        title: 'Texto Puente Literal',
        abbreviation: 'tpl',
      })
    ).toBe('TPL')
  })

  test('falls back to GST key segment for simplified text without abbrev', () => {
    expect(getResourceBadgeLabel('es-419_gl/es-419/gst')).toBe('GST')
  })
})
