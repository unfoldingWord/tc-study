/**
 * CombinedHelps empty-state copy (issue #24 — never a blank pane without
 * explanation). Successful load, no rows: this language lacks this passage,
 * not a crash. Mode/language change only on explicit tap (same rule as #25).
 */

import { getBookTitleStatic } from '../../utils/bookNames'
import { DEFAULT_HELPS_LANGUAGE_CODE } from '../read/defaultHelpsLanguage'
import {
  languageEnglishCopyDisplayName,
  listedLanguageByCode,
  type LanguageListNameFields,
} from '../read/languageListDisplayName'

export type HelpsEmptyKind = 'no-sources' | 'no-passage'

/** Why CombinedHelpsList is empty — `null` means spinner, errors, or a populated list. */
export type HelpsListEmptyReason = HelpsEmptyKind | 'filter-miss' | null

/** Single copy table — swap here for localization. */
export const HELPS_EMPTY_COPY = {
  noPassage: (languageName: string, passage: string) =>
    `${languageName} doesn't have helps for ${passage} yet.`,
  noSources: (languageName: string) =>
    `${languageName} doesn't have translation helps yet.`,
  switchToDefaultHelps: (defaultName: string) => `Use ${defaultName} helps`,
  chooseHelpsLanguage: 'Choose helps language',
} as const

export interface HelpsEmptyView {
  kind: HelpsEmptyKind
  message: string
  actionLabel: string | null
  /** Compact visible action (e.g. `English`); full sentence lives in `actionLabel`. */
  actionShortLabel: string | null
  defaultHelpsLanguageCode: string | null
}

function primaryLang(code: string): string {
  return String(code || '')
    .trim()
    .split(/[-_/]/)[0]!
    .toLowerCase()
}

/** Book + chapter for empty copy (`exo`, 1 → `Exodus 1`). */
export function formatHelpsPassageLabel(bookCode?: string, chapter?: number | string): string {
  const code = (bookCode || '').trim()
  if (!code) return 'this passage'
  const book = getBookTitleStatic(code) || code.toUpperCase()
  if (chapter === undefined || chapter === null || chapter === '') return book
  return `${book} ${chapter}`
}

/**
 * Successful empty vs filter miss vs still loading. Load errors stay `null`
 * so the list can show `tnError`/`twlError` without claiming the language lacks the book.
 */
export function resolveHelpsListEmptyReason(options: {
  noSources: boolean
  loading: boolean
  depsOk: boolean
  mergedEmpty: boolean
  hasLoadError: boolean
  hasActiveFilter: boolean
}): HelpsListEmptyReason {
  // Loading wins — never paint the empty well while TN/TWL or catalog is in flight.
  if (options.loading) return null
  if (options.noSources) return 'no-sources'
  if (!options.mergedEmpty) return null
  if (options.hasLoadError) return null
  if (options.hasActiveFilter) return 'filter-miss'
  return 'no-passage'
}

/** Filter-miss uses the same explained empty as no-passage (not a crash sentence). */
export function explainedHelpsEmptyKind(reason: HelpsListEmptyReason): HelpsEmptyKind | null {
  if (reason === 'no-sources') return 'no-sources'
  if (reason === 'no-passage' || reason === 'filter-miss') return 'no-passage'
  return null
}

/** Language segment from `owner/lang/id` — keep region (`es-419`), do not collapse to `es`. */
export function fullHelpsLangFromResourceKey(key: string | undefined): string {
  if (!key || !key.includes('/')) return ''
  return (key.split('/')[1] || '').trim()
}

/**
 * Same-family codes: keep the more specific tag (`es-419` over collapsed `es`).
 * Different languages: keep `preferred`.
 */
function preferSpecificLanguageCode(preferred: string, alternate: string): string {
  const a = preferred.trim()
  const b = alternate.trim()
  if (!a) return b
  if (!b) return a
  if (primaryLang(a) === primaryLang(b) && b.length > a.length) return b
  return a
}

/**
 * Helps language for English empty copy: selected picker code, then TN/TWL key
 * language, then CombinedHelps resource language. Never collapse `es-419` → `es`.
 */
export function resolveHelpsLanguageCodeForCopy(options: {
  selectedCode?: string | null
  keyLanguage?: string | null
  resourceLanguage?: string | null
}): string {
  const selected = options.selectedCode?.trim() || ''
  const fromKey = options.keyLanguage?.trim() || ''
  const fromResource = options.resourceLanguage?.trim() || ''
  if (selected) return preferSpecificLanguageCode(selected, fromKey || fromResource)
  if (fromKey) return preferSpecificLanguageCode(fromKey, fromResource)
  return fromResource
}

function listedFieldsForCode(
  code: string,
  listed?: string | LanguageListNameFields
): LanguageListNameFields | undefined {
  if (typeof listed === 'string') {
    return { anglicizedName: listed, name: listed }
  }
  const listedCode = listed?.code?.trim() || ''
  const want = code.trim()
  if (listedCode && want && listedCode.toLowerCase() !== want.toLowerCase()) {
    return undefined
  }
  return listed
}

/** Display name for English copy: anglicized (+ native in parentheses when it differs). */
export function helpsLanguageDisplayName(
  code: string,
  listed?: string | LanguageListNameFields
): string {
  const fields = listedFieldsForCode(code, listed)
  const fromList = languageEnglishCopyDisplayName(fields, '')
  if (fromList) return fromList
  const lang = primaryLang(code)
  if (lang === 'en') return 'English'
  return code.trim() || lang
}

/** Anglicized empty-copy name from the same list the picker uses (exact code). */
export function helpsLanguageNameFromList(
  code: string,
  languages: readonly LanguageListNameFields[] | undefined
): string {
  return helpsLanguageDisplayName(code, listedLanguageByCode(languages, code))
}

export function resolveHelpsEmptyView(options: {
  kind: HelpsEmptyKind
  languageCode: string
  languageName: string | LanguageListNameFields
  passageLabel: string
  defaultHelpsLanguageCode?: string
  defaultHelpsLanguageName?: string | LanguageListNameFields
}): HelpsEmptyView {
  const name = helpsLanguageDisplayName(options.languageCode, options.languageName)
  const defaultCode = (options.defaultHelpsLanguageCode?.trim() || DEFAULT_HELPS_LANGUAGE_CODE).trim()
  const alreadyOnDefault = primaryLang(options.languageCode) === primaryLang(defaultCode)
  const defaultName = helpsLanguageDisplayName(defaultCode, options.defaultHelpsLanguageName)
  const actionLabel = alreadyOnDefault ? null : HELPS_EMPTY_COPY.switchToDefaultHelps(defaultName)
  const actionShortLabel = alreadyOnDefault ? null : defaultName

  if (options.kind === 'no-sources') {
    return {
      kind: 'no-sources',
      message: HELPS_EMPTY_COPY.noSources(name),
      actionLabel,
      actionShortLabel,
      defaultHelpsLanguageCode: alreadyOnDefault ? null : defaultCode,
    }
  }

  const passage = options.passageLabel.trim() || 'this passage'
  return {
    kind: 'no-passage',
    message: HELPS_EMPTY_COPY.noPassage(name, passage),
    actionLabel,
    actionShortLabel,
    defaultHelpsLanguageCode: alreadyOnDefault ? null : defaultCode,
  }
}
