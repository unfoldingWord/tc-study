import { describe, expect, test } from 'bun:test'
import { dirFromResource, resolveNavigationBarRtl } from './resolveNavigationBarRtl'

describe('resolveNavigationBarRtl', () => {
  test('English gateway scripture stays LTR even when UHB is loaded/anchor', () => {
    const english = {
      language: 'en',
      languageCode: 'en',
      languageDirection: 'ltr' as const,
      subject: 'Aligned Bible',
    }
    const uhb = {
      language: 'hbo',
      languageCode: 'hbo',
      languageDirection: 'rtl' as const,
      subject: 'Hebrew Old Testament',
    }

    expect(
      resolveNavigationBarRtl({
        anchorResource: uhb,
        bookTitleSource: english,
        availableLanguages: [
          { code: 'en', direction: 'ltr' },
          { code: 'hbo', direction: 'rtl' },
        ],
      })
    ).toBe(false)

    // OL alone must not force RTL chrome for gateway sessions
    expect(dirFromResource(uhb, [{ code: 'hbo', direction: 'rtl' }])).toBeNull()
  })

  test('Arabic gateway scripture is RTL', () => {
    expect(
      resolveNavigationBarRtl({
        anchorResource: {
          language: 'ar',
          languageCode: 'ar',
          languageDirection: 'rtl',
          subject: 'Bible',
        },
        bookTitleSource: null,
        availableLanguages: [{ code: 'ar', direction: 'rtl' }],
      })
    ).toBe(true)
  })

  test('English list direction wins when resource direction missing', () => {
    expect(
      resolveNavigationBarRtl({
        anchorResource: { language: 'en', languageCode: 'en', subject: 'Bible' },
        bookTitleSource: null,
        availableLanguages: [{ code: 'en', direction: 'ltr' }],
      })
    ).toBe(false)
  })

  test('nav follows text language, not helps / conflicting bookTitleSource', () => {
    const langs = [
      { code: 'ar', direction: 'rtl' as const },
      { code: 'en', direction: 'ltr' as const },
    ]
    const englishHelps = {
      language: 'en',
      languageCode: 'en',
      languageDirection: 'ltr' as const,
      subject: 'TSV Translation Notes',
    }
    const arabicHelps = {
      language: 'ar',
      languageCode: 'ar',
      languageDirection: 'rtl' as const,
      subject: 'TSV Translation Notes',
    }

    expect(
      resolveNavigationBarRtl({
        textLanguageCode: 'ar',
        bookTitleSource: englishHelps,
        anchorResource: englishHelps,
        availableLanguages: langs,
      })
    ).toBe(true)

    expect(
      resolveNavigationBarRtl({
        textLanguageCode: 'en',
        bookTitleSource: arabicHelps,
        anchorResource: arabicHelps,
        availableLanguages: langs,
      })
    ).toBe(false)
  })

  test('known RTL text code is rtl even when the language list is empty', () => {
    expect(
      resolveNavigationBarRtl({
        textLanguageCode: 'ar',
        bookTitleSource: null,
        availableLanguages: [],
      })
    ).toBe(true)
  })

  test('wrongly cached English rtl in language list is still honored on that resource only', () => {
    // If Door43/list marks en as rtl, resource.languageDirection ltr must win.
    expect(
      resolveNavigationBarRtl({
        anchorResource: {
          language: 'en',
          languageCode: 'en',
          languageDirection: 'ltr',
          subject: 'Bible',
        },
        bookTitleSource: null,
        availableLanguages: [{ code: 'en', direction: 'rtl' }],
      })
    ).toBe(false)
  })
})
