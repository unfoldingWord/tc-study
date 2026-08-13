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
