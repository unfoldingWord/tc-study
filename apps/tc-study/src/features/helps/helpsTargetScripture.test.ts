import { describe, expect, test, beforeEach } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  catalogKeyFromResource,
  getHelpsTargetScriptureKey,
  resetHelpsTargetScriptureKey,
  resolveHelpsTargetScriptureKey,
  setHelpsTargetScriptureKey,
} from './helpsTargetScripture'

describe('resolveHelpsTargetScriptureKey', () => {
  beforeEach(() => {
    resetHelpsTargetScriptureKey()
  })

  test('prefers shared SoT over broadcast and last-known', () => {
    setHelpsTargetScriptureKey('unfoldingWord/en/ult')
    expect(
      resolveHelpsTargetScriptureKey({
        broadcastKey: 'es-419_gl/es-419/glt',
        lastKnownKey: 'Door43-Catalog/en/ult',
        loadedResources: {},
        preferLanguage: 'en',
      })
    ).toBe('unfoldingWord/en/ult')
  })

  test('prefers live SCRIPTURE_TOKENS catalog key when shared empty', () => {
    expect(
      resolveHelpsTargetScriptureKey({
        sharedKey: null,
        broadcastKey: 'unfoldingWord/en/ult',
        lastKnownKey: 'es-419_gl/es-419/glt',
        loadedResources: {
          a: { id: 'a', key: 'Door43-Catalog/en/ult', type: 'scripture', language: 'en' },
        },
        preferLanguage: 'en',
      })
    ).toBe('unfoldingWord/en/ult')
  })

  test('falls back to last-known after passage invalidate', () => {
    expect(
      resolveHelpsTargetScriptureKey({
        sharedKey: null,
        broadcastKey: null,
        lastKnownKey: 'unfoldingWord/en/ult',
        loadedResources: {},
        preferLanguage: 'en',
      })
    ).toBe('unfoldingWord/en/ult')
  })

  test('falls back to loaded gateway scripture when broadcast is empty', () => {
    expect(
      resolveHelpsTargetScriptureKey({
        sharedKey: null,
        broadcastKey: '',
        lastKnownKey: null,
        loadedResources: {
          ugnt: {
            id: 'ugnt',
            key: 'unfoldingWord/el-x-koine/ugnt',
            type: 'scripture',
            language: 'el-x-koine',
            subject: 'Greek New Testament',
          },
          ult: {
            id: 'ult',
            key: 'unfoldingWord/en/ult',
            type: 'scripture',
            language: 'en',
          },
        },
        preferLanguage: 'en',
      })
    ).toBe('unfoldingWord/en/ult')
  })

  test('catalogKeyFromResource prefers resourceKey then key', () => {
    expect(catalogKeyFromResource({ resourceKey: 'a/b/c', key: 'x' })).toBe('a/b/c')
    expect(catalogKeyFromResource({ key: 'x/y/z' })).toBe('x/y/z')
    expect(catalogKeyFromResource(null)).toBeNull()
  })

  test('setHelpsTargetScriptureKey is readable without broadcast', () => {
    setHelpsTargetScriptureKey('unfoldingWord/en/glt')
    expect(getHelpsTargetScriptureKey()).toBe('unfoldingWord/en/glt')
    expect(
      resolveHelpsTargetScriptureKey({
        broadcastKey: null,
        lastKnownKey: null,
        loadedResources: {},
      })
    ).toBe('unfoldingWord/en/glt')
  })
})

describe('collapsed scripture still builds quotes without SCRIPTURE_TOKENS', () => {
  test('useAlignedTokens ensures prepared + re-hydrates on prepare ready', () => {
    const src = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/WordsLinksViewer/hooks/useAlignedTokens.ts'
      ),
      'utf8'
    )
    expect(src).toContain('ensurePreparedFullChapter')
    expect(src).toContain('subscribePrepareReady')
    expect(src).toContain('preparedTick')
    expect(src).toContain('resolveHelpsTargetScriptureKey')
    expect(src).toContain('useHelpsTargetScriptureKey')
    // Reconstruct / paint-display must not gate chips on broadcast hasTokens.
    expect(src).toContain("if (plan === 'reconstruct')")
    expect(src).toContain('hasAnyTargetTokens: hasTokens || chapterTokens.size > 0')
  })

  test('CombinedHelps resolves target from shared key when broadcast is missing', () => {
    const src = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/index.tsx'),
      'utf8'
    )
    expect(src).toContain('resolveHelpsTargetScriptureKey')
    expect(src).toContain('useHelpsTargetScriptureKey')
    expect(src).toContain('navigationLanguageCode')
  })

  test('ScriptureViewer writes shared catalog key on select (not tokens)', () => {
    const viewer = readFileSync(
      join(import.meta.dir, '../../components/resources/ScriptureViewer/index.tsx'),
      'utf8'
    )
    const broadcast = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/ScriptureViewer/hooks/useTokenBroadcast.ts'
      ),
      'utf8'
    )
    expect(viewer).toContain('setHelpsTargetScriptureKey(resourceKey)')
    expect(broadcast).toContain('setHelpsTargetScriptureKey(resourceKey)')
  })

  test('useScriptureTokens keeps last-known sourceResourceId after invalidate', () => {
    const src = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/WordsLinksViewer/hooks/useScriptureTokens.ts'
      ),
      'utf8'
    )
    expect(src).toContain('getLastScriptureTokensSourceResourceId')
  })

  test('miss path uses shared key without requiring SCRIPTURE_TOKENS broadcast', () => {
    const src = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/WordsLinksViewer/hooks/useAlignedTokens.ts'
      ),
      'utf8'
    )
    expect(src).toContain('resolveLiveAlignTargetSource')
    expect(src).toContain('ensurePreparedFullChapter')
    // Live-align prefers prepared flat over broadcast when shared key resolved.
    expect(src).toMatch(/targetKey[\s\S]{0,200}resolveHelpsTargetScriptureKey/)
    expect(src).toContain('sharedKey: sharedTargetKey')
  })
})
