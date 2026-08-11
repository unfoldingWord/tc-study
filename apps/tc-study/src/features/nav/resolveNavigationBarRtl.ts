import type { ResourceInfo } from '../../contexts/types'
import { isRtlLanguageCode } from '../../utils/languageDirection'
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
 * Nav chrome RTL follows the gateway reading language (active scripture / anchor),
 * never “any loaded resource is RTL” (UHB would always poison English sessions).
 */
export function resolveNavigationBarRtl(options: {
  anchorResource?: RtlResourceLike | null
  bookTitleSource?: RtlResourceLike | null
  availableLanguages: RtlLanguageListEntry[]
}): boolean {
  const { anchorResource, bookTitleSource, availableLanguages } = options

  // Prefer last-active / title scripture (usually gateway) over OL anchor races.
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
