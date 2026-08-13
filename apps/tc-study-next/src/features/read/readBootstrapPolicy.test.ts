import { describe, expect, test } from 'bun:test'
import {
  shouldApplyDeepLinkTail,
  shouldDeferLanguageCatalogLoad,
  shouldWriteBackReadUrl,
} from './readBootstrapPolicy'

describe('readBootstrapPolicy', () => {
  test('defers catalog load when URL has no language (await remount)', () => {
    expect(shouldDeferLanguageCatalogLoad(null)).toBe(true)
    expect(shouldDeferLanguageCatalogLoad(undefined)).toBe(true)
    expect(shouldDeferLanguageCatalogLoad('')).toBe(true)
    expect(shouldDeferLanguageCatalogLoad('en')).toBe(false)
  })

  test('write-back skipped for bare /read or while deep-link suppress is on', () => {
    expect(
      shouldWriteBackReadUrl({
        requireLanguageInUrl: true,
        currentLanguageCode: null,
        suppressUrlSync: false,
      })
    ).toBe(false)
    expect(
      shouldWriteBackReadUrl({
        requireLanguageInUrl: false,
        currentLanguageCode: 'en',
        suppressUrlSync: true,
      })
    ).toBe(false)
    expect(
      shouldWriteBackReadUrl({
        requireLanguageInUrl: false,
        currentLanguageCode: 'en',
        suppressUrlSync: false,
      })
    ).toBe(true)
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
