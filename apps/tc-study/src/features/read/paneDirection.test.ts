import { describe, expect, test } from 'bun:test'
import { resolveHelpsViewerDirection, resolvePaneDirection } from './paneDirection'

describe('resolvePaneDirection', () => {
  test('RTL text language is rtl even when list is empty (known codes)', () => {
    expect(resolvePaneDirection({ languageCode: 'ar', availableLanguages: [] })).toBe('rtl')
  })

  test('LTR helps language is ltr', () => {
    expect(
      resolvePaneDirection({
        languageCode: 'en',
        availableLanguages: [{ code: 'en', direction: 'ltr' }],
      })
    ).toBe('ltr')
  })

  test('list direction wins for a language not in the known-RTL set', () => {
    expect(
      resolvePaneDirection({
        languageCode: 'fa-AF',
        availableLanguages: [{ code: 'fa-AF', direction: 'rtl' }],
      })
    ).toBe('rtl')
  })

  test('missing language defaults to ltr (no global document dir)', () => {
    expect(resolvePaneDirection({ languageCode: null, availableLanguages: [] })).toBe('ltr')
  })

  test('RTL/LTR combinations are independent per pane', () => {
    const langs = [
      { code: 'ar', direction: 'rtl' as const },
      { code: 'en', direction: 'ltr' as const },
    ]
    expect(resolvePaneDirection({ languageCode: 'ar', availableLanguages: langs })).toBe('rtl')
    expect(resolvePaneDirection({ languageCode: 'en', availableLanguages: langs })).toBe('ltr')
  })

  test('inverse mixed panes: LTR text + RTL helps', () => {
    const langs = [
      { code: 'en', direction: 'ltr' as const },
      { code: 'ar', direction: 'rtl' as const },
    ]
    const textPane = resolvePaneDirection({ languageCode: 'en', availableLanguages: langs })
    const helpsPane = resolvePaneDirection({ languageCode: 'ar', availableLanguages: langs })
    expect(textPane).toBe('ltr')
    expect(helpsPane).toBe('rtl')
  })
})

describe('resolveHelpsViewerDirection', () => {
  test('Arabic text + English helps → ltr helps UI (ignores target scripture)', () => {
    expect(
      resolveHelpsViewerDirection({
        resourceDirection: 'ltr',
        targetScriptureDirection: 'rtl',
      })
    ).toBe('ltr')
  })

  test('English text + Arabic helps → rtl helps UI', () => {
    expect(
      resolveHelpsViewerDirection({
        resourceDirection: 'rtl',
        targetScriptureDirection: 'ltr',
      })
    ).toBe('rtl')
  })

  test('falls back to helps resource when scripture dir is missing', () => {
    expect(
      resolveHelpsViewerDirection({
        resourceDirection: 'rtl',
        targetScriptureDirection: null,
      })
    ).toBe('rtl')
  })
})

describe('OBS text vs OBS helps direction (issue #24)', () => {
  const langs = [
    { code: 'ar', direction: 'rtl' as const },
    { code: 'en', direction: 'ltr' as const },
  ]

  test('RTL OBS text + LTR English helps stay independent', () => {
    const obsText = resolvePaneDirection({ languageCode: 'ar', availableLanguages: langs })
    const obsHelps = resolveHelpsViewerDirection({
      resourceDirection: resolvePaneDirection({ languageCode: 'en', availableLanguages: langs }),
      targetScriptureDirection: obsText,
    })
    expect(obsText).toBe('rtl')
    expect(obsHelps).toBe('ltr')
  })

  test('LTR OBS text + RTL helps stay independent', () => {
    const obsText = resolvePaneDirection({ languageCode: 'en', availableLanguages: langs })
    const obsHelps = resolveHelpsViewerDirection({
      resourceDirection: resolvePaneDirection({ languageCode: 'ar', availableLanguages: langs }),
      targetScriptureDirection: obsText,
    })
    expect(obsText).toBe('ltr')
    expect(obsHelps).toBe('rtl')
  })

  test('OBS catalog metadata dir wins over an empty language list', () => {
    expect(
      resolvePaneDirection({
        languageCode: 'fa-AF',
        availableLanguages: [],
        catalogDirection: 'rtl',
      })
    ).toBe('rtl')
  })

  test('OBS catalog metadata dir is used when language code is missing', () => {
    expect(
      resolvePaneDirection({
        languageCode: null,
        availableLanguages: [],
        catalogDirection: 'rtl',
      })
    ).toBe('rtl')
  })
})
