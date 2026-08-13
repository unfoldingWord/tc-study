import type { TranslatorSection } from '@bt-synergy/scripture-loader'
import type { BCVReference, BookInfo } from '../../contexts'
import type { ResourceInfo } from '../../contexts/types'
import { COMBINED_HELPS_IDS } from '../helps/combinedHelpsIds'
import { getStandardBookOrderIndex, getStandardVerseCount } from '../../lib/versification'
import { isOriginalLanguageResource } from '../../utils/resourceHelpers'

/** Section index for `ref` within `sections` (same rules as NavigationContext.setBookSections). */
export function findSectionIndexForRef(
  bookCode: string,
  ref: BCVReference,
  sections: TranslatorSection[]
): number {
  if (ref.book !== bookCode || ref.book === 'obs' || sections.length === 0) return -1
  return sections.findIndex((section) => {
    const refChapter = ref.chapter
    const refVerse = ref.verse
    if (refChapter < section.start.chapter) return false
    if (refChapter > section.end.chapter) return false
    if (refChapter === section.start.chapter && refChapter === section.end.chapter) {
      return refVerse >= section.start.verse && refVerse <= section.end.verse
    }
    if (refChapter === section.start.chapter) {
      return refVerse >= section.start.verse
    }
    if (refChapter === section.end.chapter) {
      return refVerse <= section.end.verse
    }
    return true
  })
}

function primaryLang(code: string | undefined | null): string {
  if (!code) return ''
  return String(code).trim().split(/[-_/]/)[0]!.toLowerCase()
}

function resourceMatchesPreferLang(
  r: { language?: string; languageCode?: string; key?: string; resourceKey?: string },
  preferLang: string
): boolean {
  const want = primaryLang(preferLang)
  if (!want) return true
  const meta = primaryLang(r.languageCode || r.language)
  if (meta && meta === want) return true
  const key = r.resourceKey ?? r.key ?? ''
  const keyLang = primaryLang(key.split('/')[1] || '')
  return keyLang === want
}

export function findObsCatalogKey(
  loadedResources: Record<
    string,
    { resourceKey?: string; key?: string; subject?: string; type?: unknown; language?: string; languageCode?: string }
  >,
  preferLanguage?: string
): string | null {
  let fallback: string | null = null
  const preferLang = preferLanguage?.trim()
  for (const r of Object.values(loadedResources)) {
    if (!r) continue
    const rk = r.resourceKey ?? r.key
    if (!rk || COMBINED_HELPS_IDS.has(rk)) continue

    const typeStr = String(r.type ?? '').toLowerCase().trim()
    if (typeStr === 'obs' || /open bible stories/i.test(r.subject ?? '')) {
      if (preferLang) {
        if (resourceMatchesPreferLang(r, preferLang)) return rk
        continue
      }
      if (!fallback) fallback = rk
    }
  }
  return fallback
}

/** Return all target-language scripture resources from the loaded-resources map.
 *  Original language resources (Greek/Hebrew) are excluded so their untranslated
 *  ingredient titles don't pollute the book name lookup.
 *  When `preferLanguage` is set, only that gateway language (primary segment) is kept
 *  so English leftovers after a Read language switch cannot own the book list. */
export function getScriptureResources(
  loaded: Record<string, ResourceInfo | undefined>,
  preferLanguage?: string
): ResourceInfo[] {
  const all = Object.values(loaded).filter((r): r is ResourceInfo => {
    if (!r) return false
    const isScripture =
      String(r.category).toLowerCase() === 'scripture' ||
      String(r.type).toLowerCase() === 'scripture'
    if (!isScripture) return false
    const lang = (r.language ?? r.languageCode ?? '').toLowerCase()
    const subject = r.subject ?? ''
    return !isOriginalLanguageResource(lang, subject)
  })
  if (!preferLanguage) return all
  return all.filter((r) => resourceMatchesPreferLang(r, preferLanguage))
}

/** Build navigation book list from scripture resource ingredients (same rules as ScriptureViewer useTOC). */
export function buildBookInfosFromIngredients(ingredients: Array<{ identifier?: string; title?: string }>): BookInfo[] {
  const bookCodes = new Set<string>()
  for (const ing of ingredients) {
    const identifier = ing.identifier
    if (!identifier) continue
    const normalizedId = identifier.toLowerCase()
    if (normalizedId.length >= 2 && normalizedId.length <= 4) {
      bookCodes.add(normalizedId)
    }
  }
  return Array.from(bookCodes)
    .map((code) => {
      const bookIngredients = ingredients.filter((ing) => ing.identifier?.toLowerCase() === code)
      const chapters = bookIngredients.length || 1
      const verses = getStandardVerseCount(code)
      const name = bookIngredients[0]?.title || code.toUpperCase()
      const primaryOrder = getStandardBookOrderIndex(code)
      return {
        code,
        name,
        chapters: verses?.length || chapters,
        verses,
        primaryOrder,
      }
    })
    .sort((a, b) => {
      if (a.primaryOrder !== b.primaryOrder) return a.primaryOrder - b.primaryOrder
      return a.code.localeCompare(b.code)
    })
    .map(({ primaryOrder: _p, ...book }) => book)
}
