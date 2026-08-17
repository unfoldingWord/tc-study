import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resumeBareReadNavigation,
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
  })

  test('useReadUrlSync replaces from write-back action (no bare-/read block)', () => {
    const src = readFileSync(join(import.meta.dir, 'useReadUrlSync.ts'), 'utf8')
    expect(src).toContain('readUrlWriteBackAction')
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
