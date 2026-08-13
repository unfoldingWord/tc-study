import { describe, expect, test } from 'bun:test'
import { DEFAULT_HELPS_LANGUAGE_CODE } from '../read/defaultHelpsLanguage'
import { door43ToListNameFields } from '../read/languageListDisplayName'
import {
  HELPS_EMPTY_COPY,
  explainedHelpsEmptyKind,
  formatHelpsPassageLabel,
  helpsLanguageDisplayName,
  resolveHelpsEmptyView,
  resolveHelpsListEmptyReason,
} from './helpsEmptyCopy'

/** Door43 list/languages: `ln` (autonym) vs `ang` (English display name). */
const ES_DOOR43 = { code: 'es', name: 'español', anglicized_name: 'Spanish' } as const
const ES_LISTED = {
  code: ES_DOOR43.code,
  ...door43ToListNameFields(ES_DOOR43),
} as const

describe('resolveHelpsEmptyView', () => {
  test('Spanish + Galatians 1 uses catalog anglicized_name, not the autonym', () => {
    const view = resolveHelpsEmptyView({
      kind: 'no-passage',
      languageCode: 'es',
      languageName: ES_LISTED,
      passageLabel: formatHelpsPassageLabel('gal', 1),
    })
    expect(view.kind).toBe('no-passage')
    expect(view.message).toBe(HELPS_EMPTY_COPY.noPassage('Spanish', 'Galatians 1'))
    expect(view.message).toContain('Spanish')
    expect(view.message).not.toContain('español')
    expect(view.message).toContain('Galatians')
    expect(view.actionLabel).toBe(HELPS_EMPTY_COPY.useDefaultHelps('English'))
    expect(view.actionShortLabel).toBe('English')
    expect(view.defaultHelpsLanguageCode).toBe(DEFAULT_HELPS_LANGUAGE_CODE)
    expect(view.defaultHelpsLanguageCode).toBe('en')
  })

  test('falls back to language code when the name is blank', () => {
    const view = resolveHelpsEmptyView({
      kind: 'no-passage',
      languageCode: 'es',
      languageName: '  ',
      passageLabel: 'Exodus 1',
    })
    expect(view.message).toBe(HELPS_EMPTY_COPY.noPassage('es', 'Exodus 1'))
    expect(view.message).toContain('es')
    expect(view.message).toContain('Exodus')
  })

  test('no TN/TWL sources is distinct from missing this passage', () => {
    const view = resolveHelpsEmptyView({
      kind: 'no-sources',
      languageCode: 'es',
      languageName: ES_LISTED,
      passageLabel: 'Exodus 1',
    })
    expect(view.kind).toBe('no-sources')
    expect(view.message).toBe(HELPS_EMPTY_COPY.noSources('Spanish'))
    expect(view.message).not.toContain('Exodus')
    expect(view.actionLabel).toBe(HELPS_EMPTY_COPY.useDefaultHelps('English'))
    expect(view.actionShortLabel).toBe('English')
  })

  test('already on default helps language: no Use-English action (no auto-switch)', () => {
    const view = resolveHelpsEmptyView({
      kind: 'no-passage',
      languageCode: 'en',
      languageName: 'English',
      passageLabel: 'Exodus 1',
    })
    expect(view.actionLabel).toBeNull()
    expect(view.actionShortLabel).toBeNull()
    expect(view.defaultHelpsLanguageCode).toBeNull()
    expect(view.message).toContain('English')
    expect(view.message).toContain('Exodus')
  })

  test('English display name is used for the default action without a listed name', () => {
    expect(helpsLanguageDisplayName('en')).toBe('English')
    expect(helpsLanguageDisplayName('es')).toBe('es')
    expect(helpsLanguageDisplayName('es', ES_LISTED)).toBe('Spanish')
    expect(helpsLanguageDisplayName('es', { name: 'español' })).toBe('Español')
  })

  test('formatHelpsPassageLabel names Exodus 1 from book + chapter', () => {
    expect(formatHelpsPassageLabel('exo', 1)).toBe('Exodus 1')
  })
})

describe('resolveHelpsListEmptyReason', () => {
  test('Spanish sources with no Exodus rows is no-passage, not a load failure', () => {
    expect(
      resolveHelpsListEmptyReason({
        noSources: false,
        loading: false,
        depsOk: true,
        mergedEmpty: true,
        hasLoadError: false,
        hasActiveFilter: false,
      })
    ).toBe('no-passage')
  })

  test('no TN/TWL sources is distinct from missing this passage', () => {
    expect(
      resolveHelpsListEmptyReason({
        noSources: true,
        loading: false,
        depsOk: true,
        mergedEmpty: true,
        hasLoadError: false,
        hasActiveFilter: false,
      })
    ).toBe('no-sources')
  })

  test('English + Exodus with notes is not empty', () => {
    expect(
      resolveHelpsListEmptyReason({
        noSources: false,
        loading: false,
        depsOk: true,
        mergedEmpty: false,
        hasLoadError: false,
        hasActiveFilter: false,
      })
    ).toBeNull()
  })

  test('load error and filter miss do not claim the language lacks the book', () => {
    expect(
      resolveHelpsListEmptyReason({
        noSources: false,
        loading: false,
        depsOk: true,
        mergedEmpty: true,
        hasLoadError: true,
        hasActiveFilter: false,
      })
    ).toBeNull()
    expect(
      resolveHelpsListEmptyReason({
        noSources: false,
        loading: false,
        depsOk: true,
        mergedEmpty: true,
        hasLoadError: false,
        hasActiveFilter: true,
      })
    ).toBe('filter-miss')
  })
})

describe('explainedHelpsEmptyKind', () => {
  test('filter-miss uses the no-passage explained empty, not a crash sentence', () => {
    expect(explainedHelpsEmptyKind('filter-miss')).toBe('no-passage')
    expect(explainedHelpsEmptyKind('no-passage')).toBe('no-passage')
    expect(explainedHelpsEmptyKind('no-sources')).toBe('no-sources')
    expect(explainedHelpsEmptyKind(null)).toBeNull()
  })
})
