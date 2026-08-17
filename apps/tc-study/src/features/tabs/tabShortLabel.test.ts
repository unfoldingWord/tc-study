import { describe, expect, test } from 'bun:test'
import { getResourceBadgeLabel, getTabShortLabel } from './tabShortLabel'

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

  test('Combined Helps and OBS Helps share a fallback Helps short name (not shown on icon-only tabs)', () => {
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
    ).toBe('Helps')
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
