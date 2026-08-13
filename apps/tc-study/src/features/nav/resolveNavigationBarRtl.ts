import type { ResourceInfo } from '../../contexts/types'
import { getLanguageDirection, isRtlLanguageCode } from '../../utils/languageDirection'
import { isOriginalLanguageResource } from '../../utils/resourceHelpers'

export type RtlLanguageListEntry = { code: string; direction?: string }

export type RtlResourceLike = Pick<
  ResourceInfo,
  'languageDirection' | 'language' | 'languageCode' | 'subject'
>

/**
 * Direction from a single resource. Returns null when unknown (caller continues).
 * Original-language scripture (UHB/UGNT) is ignored — it must not flip gateway nav RTL.
 */
export function dirFromResource(
  res: RtlResourceLike | null | undefined,
  availableLanguages: RtlLanguageListEntry[]
): boolean | null {
  if (!res) return null
  const lang = res.language ?? res.languageCode
  if (lang && isOriginalLanguageResource(lang, res.subject || '')) {
    return null
  }
  if (res.languageDirection === 'rtl') return true
  if (res.languageDirection === 'ltr') return false
  if (!lang) return null
  const listDir = availableLanguages.find((l) => l.code === lang)?.direction
  if (listDir === 'rtl' || listDir === 'ltr') return listDir === 'rtl'
  return isRtlLanguageCode(lang) ? true : null
}

/**
 * Nav chrome RTL follows the **text** language (Read URL / gateway scripture),
 * never the helps pane and never “any loaded resource is RTL” (UHB would
 * poison English sessions; Arabic helps must not flip an English header).
 */
export function resolveNavigationBarRtl(options: {
  anchorResource?: RtlResourceLike | null
  bookTitleSource?: RtlResourceLike | null
  availableLanguages: RtlLanguageListEntry[]
  /** Read text-pane language (URL). When set, wins over resource metadata. */
  textLanguageCode?: string | null
}): boolean {
  const { anchorResource, bookTitleSource, availableLanguages, textLanguageCode } = options

  const textCode = textLanguageCode?.trim() || ''
  if (textCode && !isOriginalLanguageResource(textCode, '')) {
    const listDir = availableLanguages.find((l) => l.code === textCode)?.direction
    const normalized = listDir === 'rtl' || listDir === 'ltr' ? listDir : null
    return getLanguageDirection(normalized, null, textCode) === 'rtl'
  }

  // Studio / no URL lang: last-active / title scripture over OL anchor races.
  for (const res of [bookTitleSource, anchorResource]) {
    const dir = dirFromResource(res, availableLanguages)
    if (dir === true) return true
    if (dir === false) return false
  }

  const lang =
    bookTitleSource?.language ??
    bookTitleSource?.languageCode ??
    anchorResource?.language ??
    anchorResource?.languageCode
  if (!lang || isOriginalLanguageResource(lang, '')) return false
  const listDir = availableLanguages.find((l) => l.code === lang)?.direction
  if (listDir === 'rtl' || listDir === 'ltr') return listDir === 'rtl'
  return isRtlLanguageCode(lang)
}
