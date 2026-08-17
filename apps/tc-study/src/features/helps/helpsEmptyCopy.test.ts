import { describe, expect, test } from 'bun:test'
import { DEFAULT_HELPS_LANGUAGE_CODE } from '../read/defaultHelpsLanguage'
import { door43ToListNameFields } from '../read/languageListDisplayName'
import {
  HELPS_EMPTY_COPY,
  explainedHelpsEmptyKind,
  formatHelpsPassageLabel,
  fullHelpsLangFromResourceKey,
  helpsLanguageDisplayName,
  helpsLanguageNameFromList,
  resolveHelpsEmptyView,
  resolveHelpsLanguageCodeForCopy,
  resolveHelpsListEmptyReason,
  resolveHelpsPaneNoSourcesView,
} from './helpsEmptyCopy'

/** Door43 list/languages: `ln` (autonym) vs `ang` (English display name). */
const ES_DOOR43 = { code: 'es', name: 'español', anglicized_name: 'Spanish' } as const
const ES_LISTED = {
  code: ES_DOOR43.code,
  ...door43ToListNameFields(ES_DOOR43),
} as const

describe('resolveHelpsEmptyView', () => {
  test('Spanish + Galatians 1 uses catalog anglicized_name with native in parentheses', () => {
    const view = resolveHelpsEmptyView({
      kind: 'no-passage',
      languageCode: 'es',
      languageName: ES_LISTED,
      passageLabel: formatHelpsPassageLabel('gal', 1),
    })
    expect(view.kind).toBe('no-passage')
    expect(view.message).toBe(HELPS_EMPTY_COPY.noPassage('Spanish (Español)', 'Galatians 1'))
    expect(view.message).toContain('Spanish')
    expect(view.message).not.toContain('español')
    expect(view.message).toContain('Galatians')
    expect(view.actionLabel).toBe(HELPS_EMPTY_COPY.switchToDefaultHelps('English'))
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
    expect(view.message).toBe(HELPS_EMPTY_COPY.noSources('Spanish (Español)'))
    expect(view.message).not.toContain('Exodus')
    expect(view.actionLabel).toBe(HELPS_EMPTY_COPY.switchToDefaultHelps('English'))
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
    expect(view.message).not.toContain('(English)')
    expect(view.message).toContain('Exodus')
  })

  test('identical native and anglicized names do not duplicate in parentheses', () => {
    const view = resolveHelpsEmptyView({
      kind: 'no-passage',
      languageCode: 'en',
      languageName: { name: 'English', anglicizedName: 'English' },
      passageLabel: 'Exodus 1',
    })
    expect(view.message).toBe(HELPS_EMPTY_COPY.noPassage('English', 'Exodus 1'))
    expect(view.message).not.toContain('(English)')
  })

  test('English display name is used for the default action without a listed name', () => {
    expect(helpsLanguageDisplayName('en')).toBe('English')
    expect(helpsLanguageDisplayName('es')).toBe('es')
    expect(helpsLanguageDisplayName('es', ES_LISTED)).toBe('Spanish (Español)')
    expect(helpsLanguageDisplayName('es', { name: 'español' })).toBe('Español')
    expect(
      helpsLanguageDisplayName('en', { name: 'English', anglicizedName: 'English' })
    ).toBe('English')
    expect(
      helpsLanguageDisplayName('en', { name: 'English', anglicizedName: 'English' })
    ).not.toContain('(English)')
  })

  test('es-419 empty copy uses list anglicizedName with native in parentheses', () => {
    const es419 = {
      code: 'es-419',
      name: 'Español Latin America',
      anglicizedName: 'Latin American Spanish',
    } as const
    const view = resolveHelpsEmptyView({
      kind: 'no-passage',
      languageCode: 'es-419',
      languageName: es419,
      passageLabel: formatHelpsPassageLabel('jdg', 1),
    })
    expect(view.message).toBe(
      HELPS_EMPTY_COPY.noPassage(
        'Latin American Spanish (Español Latin America)',
        'Judges 1'
      )
    )
    expect(view.message).toContain('Latin American Spanish (Español Latin America)')
    expect(view.message).not.toBe(HELPS_EMPTY_COPY.noPassage('Spanish', 'Judges 1'))
  })

  test('es with anglicizedName Spanish still says Spanish', () => {
    const view = resolveHelpsEmptyView({
      kind: 'no-passage',
      languageCode: 'es',
      languageName: { code: 'es', anglicizedName: 'Spanish' },
      passageLabel: formatHelpsPassageLabel('jdg', 1),
    })
    expect(view.message).toBe(HELPS_EMPTY_COPY.noPassage('Spanish', 'Judges 1'))
  })

  test('es-419 never uses a different language’s Spanish list entry', () => {
    expect(helpsLanguageDisplayName('es-419', ES_LISTED)).toBe('es-419')
    expect(
      helpsLanguageDisplayName('es-419', {
        code: 'es-419',
        name: 'Español Latin America',
        anglicizedName: 'Latin American Spanish',
      })
    ).toBe('Latin American Spanish (Español Latin America)')
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

  test('empty list is not shown while loading (even with no sources yet)', () => {
    expect(
      resolveHelpsListEmptyReason({
        noSources: true,
        loading: true,
        depsOk: false,
        mergedEmpty: true,
        hasLoadError: false,
        hasActiveFilter: false,
      })
    ).toBeNull()
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

describe('resolveHelpsPaneNoSourcesView', () => {
  const trListed = {
    code: 'tr',
    name: 'Türkçe',
    anglicizedName: 'Turkish',
  } as const

  test('OBS language with empty helps catalog is no-sources, not spinner or select-language', () => {
    const view = resolveHelpsPaneNoSourcesView({
      mode: 'helps',
      languageCode: 'tr',
      isLoading: false,
      hasResource: false,
      languageName: trListed,
    })
    expect(view).not.toBeNull()
    expect(view!.kind).toBe('no-sources')
    expect(view!.message).toBe(HELPS_EMPTY_COPY.noSources('Turkish (Türkçe)'))
    expect(view!.message).not.toContain('Select a language')
    expect(view!.message).not.toContain('this passage')
    expect(view!.message).not.toContain('resource not found')
  })

  test('catalog still loading does not flash the no-sources empty', () => {
    expect(
      resolveHelpsPaneNoSourcesView({
        mode: 'helps',
        languageCode: 'tr',
        isLoading: true,
        hasResource: false,
        languageName: trListed,
      })
    ).toBeNull()
  })

  test('language unset stays on the select-language path', () => {
    expect(
      resolveHelpsPaneNoSourcesView({
        mode: 'helps',
        languageCode: null,
        isLoading: false,
        hasResource: false,
      })
    ).toBeNull()
  })

  test('CombinedHelps membership is not collapsed into no-sources', () => {
    expect(
      resolveHelpsPaneNoSourcesView({
        mode: 'helps',
        languageCode: 'tr',
        isLoading: false,
        hasResource: true,
        languageName: trListed,
      })
    ).toBeNull()
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

const ES_419_LISTED = {
  code: 'es-419',
  name: 'Español Latin America',
  anglicizedName: 'Latin American Spanish',
} as const

const PICKER_LIST = [ES_LISTED, ES_419_LISTED]

describe('resolveHelpsLanguageCodeForCopy', () => {
  test('keeps selected es-419 when CombinedHelps stored collapsed es', () => {
    expect(
      resolveHelpsLanguageCodeForCopy({
        selectedCode: 'es-419',
        keyLanguage: 'es-419',
        resourceLanguage: 'es',
      })
    ).toBe('es-419')
    expect(
      resolveHelpsLanguageCodeForCopy({
        selectedCode: 'es',
        keyLanguage: 'es-419',
        resourceLanguage: 'es',
      })
    ).toBe('es-419')
    expect(
      resolveHelpsLanguageCodeForCopy({
        selectedCode: null,
        keyLanguage: '',
        resourceLanguage: 'es',
      })
    ).toBe('es')
  })

  test('TN key language segment keeps es-419', () => {
    expect(fullHelpsLangFromResourceKey('es-419_gl/es-419/tn')).toBe('es-419')
    expect(fullHelpsLangFromResourceKey('unfoldingWord/es/tn')).toBe('es')
  })
})

describe('helpsLanguageNameFromList', () => {
  test('exact es-419 lookup does not take Spanish from es', () => {
    expect(helpsLanguageNameFromList('es-419', PICKER_LIST)).toBe(
      'Latin American Spanish (Español Latin America)'
    )
    expect(helpsLanguageNameFromList('es', PICKER_LIST)).toBe('Spanish (Español)')
    expect(helpsLanguageNameFromList('es', PICKER_LIST)).not.toContain('Latin American')
  })
})
