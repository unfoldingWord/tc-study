/**
 * CombinedHelps empty-state copy (issue #24 — never a blank pane without
 * explanation). Successful load, no rows: this language lacks this passage,
 * not a crash. Mode/language change only on explicit tap (same rule as #25).
 */

import { getBookTitleStatic } from '../../utils/bookNames'
import { DEFAULT_HELPS_LANGUAGE_CODE } from '../read/defaultHelpsLanguage'
import {
  languageAnglicizedDisplayName,
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
  useDefaultHelps: (defaultName: string) => `Use ${defaultName} helps`,
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
  if (options.noSources) return 'no-sources'
  if (!options.depsOk || options.loading) return null
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

/** Display name for copy: anglicized/English name, then native `name`, then `en` → English, else the code. */
export function helpsLanguageDisplayName(
  code: string,
  listed?: string | LanguageListNameFields
): string {
  const fields: LanguageListNameFields | undefined =
    typeof listed === 'string'
      ? { anglicizedName: listed, name: listed }
      : listed
  const fromList = languageAnglicizedDisplayName(fields, '')
  if (fromList) return fromList
  const lang = primaryLang(code)
  if (lang === 'en') return 'English'
  return code.trim() || lang
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
  const actionLabel = alreadyOnDefault ? null : HELPS_EMPTY_COPY.useDefaultHelps(defaultName)
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
