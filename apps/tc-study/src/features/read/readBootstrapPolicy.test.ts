import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  languageCodeFromReadPathname,
  readUrlWriteBackAction,
  resolveReadLanguageFromUrlOrCache,
  resumeBareReadNavigation,
  shouldApplyDeepLinkTail,
  shouldDeferLanguageCatalogLoad,
  shouldPushReadLanguageUrl,
  shouldWriteBackReadUrl,
} from './readBootstrapPolicy'

describe('readBootstrapPolicy', () => {
  test('parses :lang from /read/{lang}/obs/... and ignores bare /read', () => {
    expect(languageCodeFromReadPathname('/read/tr/obs/ref/1.1')).toBe('tr')
    expect(languageCodeFromReadPathname('/read/ha/bible/ref/tit%201:1')).toBe('ha')
    expect(languageCodeFromReadPathname('/read')).toBeNull()
    expect(languageCodeFromReadPathname('/read/')).toBeNull()
    expect(languageCodeFromReadPathname('/read-v1/tr/obs/ref/1.1')).toBeNull()
  })

  test('defers catalog load when URL has no language (await remount)', () => {
    expect(shouldDeferLanguageCatalogLoad(null)).toBe(true)
    expect(shouldDeferLanguageCatalogLoad(undefined)).toBe(true)
    expect(shouldDeferLanguageCatalogLoad('')).toBe(true)
    expect(shouldDeferLanguageCatalogLoad('en')).toBe(false)
  })

  test('write-back skipped without language or while deep-link suppress is on', () => {
    expect(
      shouldWriteBackReadUrl({
        currentLanguageCode: null,
        suppressUrlSync: false,
      })
    ).toBe(false)
    expect(
      shouldWriteBackReadUrl({
        currentLanguageCode: 'en',
        suppressUrlSync: true,
      })
    ).toBe(false)
    expect(
      shouldWriteBackReadUrl({
        currentLanguageCode: 'en',
        suppressUrlSync: false,
      })
    ).toBe(true)
  })

  test('explicit /read/{lang}/… wins over cache; bare /read uses cache', () => {
    expect(
      resolveReadLanguageFromUrlOrCache({
        pathname: '/read/tr/obs/ref/1.1',
        cachedLanguage: 'eng',
      })
    ).toEqual({ language: 'tr', source: 'url' })
    expect(
      resolveReadLanguageFromUrlOrCache({
        pathname: '/read',
        cachedLanguage: 'eng',
      })
    ).toEqual({ language: 'eng', source: 'cache' })
    expect(
      resolveReadLanguageFromUrlOrCache({
        pathname: '/read/',
        cachedLanguage: null,
      })
    ).toEqual({ language: null, source: null })
  })

  test('cached language must not replace a different URL language', () => {
    expect(
      shouldWriteBackReadUrl({
        currentLanguageCode: 'eng',
        suppressUrlSync: false,
        pathname: '/read/tr/obs/ref/1.1',
      })
    ).toBe(false)
    expect(
      shouldWriteBackReadUrl({
        currentLanguageCode: 'eng',
        suppressUrlSync: false,
        pathname: '/read',
      })
    ).toBe(true)
    expect(
      shouldWriteBackReadUrl({
        currentLanguageCode: 'tr',
        suppressUrlSync: false,
        pathname: '/read/tr/obs/ref/1.1',
        deepLinkPending: true,
      })
    ).toBe(false)
  })

  test('do not push language URL when the path already has that lang', () => {
    expect(shouldPushReadLanguageUrl('/read/tr/obs/ref/1.1', 'tr')).toBe(false)
    expect(shouldPushReadLanguageUrl('/read', 'tr')).toBe(true)
    expect(shouldPushReadLanguageUrl('/read/eng/bible/ref/tit%201%3A1', 'tr')).toBe(true)
  })

  test('cached eng + visit /read/tr/obs/ref/1.1 does not rewrite language', () => {
    const pathname = '/read/tr/obs/ref/1.1'
    const cachedNav = {
      scope: 'scripture' as const,
      mode: 'verse' as const,
      ref: { book: 'tit', chapter: 1, verse: 1 },
      passageSet: null,
      section1Based: null,
    }
    expect(
      readUrlWriteBackAction({
        pathname,
        language: 'eng',
        suppressUrlSync: false,
        deepLinkPending: true,
        ...cachedNav,
      })
    ).toBeNull()
    expect(
      readUrlWriteBackAction({
        pathname,
        language: 'eng',
        suppressUrlSync: false,
        deepLinkPending: false,
        ...cachedNav,
      })
    ).toBeNull()
    expect(
      readUrlWriteBackAction({
        pathname,
        language: 'tr',
        suppressUrlSync: false,
        deepLinkPending: false,
        scope: 'obs',
        mode: 'verse',
        ref: { book: 'obs', chapter: 1, verse: 1 },
        passageSet: null,
        section1Based: null,
      })
    ).toBeNull()
  })

  test('cached bible session on /read replaces to canonical path', () => {
    const session = {
      language: 'en',
      mode: 'bible' as const,
      book: 'tit',
      chapter: 1,
      verse: 1,
    }
    expect(resumeBareReadNavigation('/read', session)).toEqual({
      replace: '/read/en/bible/ref/tit%201%3A1',
    })
    expect(resumeBareReadNavigation('/read/', session)).toEqual({
      replace: '/read/en/bible/ref/tit%201%3A1',
    })
    expect(resumeBareReadNavigation('/read', null)).toBeNull()
    expect(resumeBareReadNavigation('/read/en/bible/ref/tit%201%3A1', session)).toBeNull()
    expect(
      readUrlWriteBackAction({
        pathname: '/read',
        language: 'eng',
        suppressUrlSync: false,
        scope: 'scripture',
        mode: 'verse',
        ref: { book: 'tit', chapter: 1, verse: 1 },
        passageSet: null,
        section1Based: null,
      })
    ).toEqual({ replace: '/read/eng/bible/ref/tit%201%3A1' })
  })

  test('useReadUrlSync replaces from write-back action (no bare-/read block)', () => {
    const src = readFileSync(join(import.meta.dir, 'useReadUrlSync.ts'), 'utf8')
    expect(src).toContain('readUrlWriteBackAction')
    expect(src).toContain('deepLinkPending')
    expect(src).toContain('navigate(action.replace, { replace: true })')
    expect(src).not.toContain('requireLanguageInUrl')
  })

  test('deep-link tail applies only when language ready and not already applied', () => {
    expect(
      shouldApplyDeepLinkTail({
        hasReadRouteTail: true,
        currentLanguageCode: 'en',
        isLoadingResources: false,
        alreadyApplied: false,
      })
    ).toBe(true)
    expect(
      shouldApplyDeepLinkTail({
        hasReadRouteTail: true,
        currentLanguageCode: 'en',
        isLoadingResources: true,
        alreadyApplied: false,
      })
    ).toBe(false)
    expect(
      shouldApplyDeepLinkTail({
        hasReadRouteTail: true,
        currentLanguageCode: 'en',
        isLoadingResources: false,
        alreadyApplied: true,
      })
    ).toBe(false)
  })
})
