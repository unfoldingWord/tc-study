/**
 * Per-language content availability for Read (Epic #21 / issue #22).
 *
 * Flags are derived from Door43 catalog subjects already used by
 * `loadReadLanguageCatalog` and compositions — not a new network API.
 *
 * This module is pure: callers pass registry-derived subject lists.
 * bibleHelps / obsHelps = union of composition `consumes` → plugin subjects
 * for compositions whose scope matches. TQ does not light flags unless a
 * composition consumes questions.
 */

export interface LanguageAvailabilityFlags {
  bible: boolean
  obs: boolean
  bibleHelps: boolean
  obsHelps: boolean
}

/** Catalog search / list hit used to derive flags (frozen fixtures in tests). */
export interface CatalogSubjectHit {
  languageCode: string
  subject: string
}

export interface LanguageAvailabilityClient {
  getLanguages(filters?: {
    subjects?: string[]
    stage?: string
    topic?: string
    limit?: number
  }): Promise<Array<{ code: string }>>
}

/** Subject lists the caller derives from plugins / compositions. */
export interface LanguageAvailabilitySubjectSets {
  bible: readonly string[]
  obs: readonly string[]
  bibleHelps: readonly string[]
  obsHelps: readonly string[]
}

export const ORIGINAL_LANGUAGE_CODES = new Set(['el-x-koine', 'hbo'])
const ORIGINAL_LANGUAGE_SUBJECTS = new Set([
  'Greek New Testament',
  'Hebrew Old Testament',
])

const LIST_FILTER = { stage: 'prod', topic: 'tc-ready' } as const
/** OBS TN/TWL are mostly prod without `topic=tc-ready` (only ~3 TSV GLs are tagged). */
const HELPS_LIST_FILTER = { stage: 'prod' } as const
const LIST_LIMIT = 1000

export function emptyLanguageAvailability(): LanguageAvailabilityFlags {
  return { bible: false, obs: false, bibleHelps: false, obsHelps: false }
}

export function availabilityFromSubjects(
  subjects: Iterable<string>,
  sets: LanguageAvailabilitySubjectSets
): LanguageAvailabilityFlags {
  const bible = new Set(sets.bible)
  const obs = new Set(sets.obs)
  const bibleHelps = new Set(sets.bibleHelps)
  const obsHelps = new Set(sets.obsHelps)
  const flags = emptyLanguageAvailability()
  for (const raw of subjects) {
    const subject = String(raw ?? '').trim()
    if (!subject || ORIGINAL_LANGUAGE_SUBJECTS.has(subject)) continue
    if (bible.has(subject)) flags.bible = true
    else if (obs.has(subject)) flags.obs = true
    else if (bibleHelps.has(subject)) flags.bibleHelps = true
    else if (obsHelps.has(subject)) flags.obsHelps = true
  }
  return flags
}

/**
 * Index availability for every language present in catalog subject hits.
 * Original-language codes (UGNT/UHB) are omitted.
 */
export function indexAvailabilityByLanguage(
  hits: readonly CatalogSubjectHit[],
  sets: LanguageAvailabilitySubjectSets
): Map<string, LanguageAvailabilityFlags> {
  const subjectsByLang = new Map<string, string[]>()
  for (const hit of hits) {
    const code = String(hit.languageCode ?? '').trim()
    if (!code || ORIGINAL_LANGUAGE_CODES.has(code)) continue
    const list = subjectsByLang.get(code)
    if (list) list.push(hit.subject)
    else subjectsByLang.set(code, [hit.subject])
  }
  const byCode = new Map<string, LanguageAvailabilityFlags>()
  for (const [code, subjects] of subjectsByLang) {
    byCode.set(code, availabilityFromSubjects(subjects, sets))
  }
  return byCode
}

export function mergeAvailabilityFromLanguageSets(sets: {
  bible: Iterable<string>
  obs: Iterable<string>
  bibleHelps: Iterable<string>
  obsHelps: Iterable<string>
}): Map<string, LanguageAvailabilityFlags> {
  const byCode = new Map<string, LanguageAvailabilityFlags>()
  const ensure = (code: string): LanguageAvailabilityFlags => {
    const existing = byCode.get(code)
    if (existing) return existing
    const created = emptyLanguageAvailability()
    byCode.set(code, created)
    return created
  }
  const apply = (codes: Iterable<string>, flag: keyof LanguageAvailabilityFlags) => {
    for (const raw of codes) {
      const code = String(raw ?? '').trim()
      if (!code || ORIGINAL_LANGUAGE_CODES.has(code)) continue
      ensure(code)[flag] = true
    }
  }
  apply(sets.bible, 'bible')
  apply(sets.obs, 'obs')
  apply(sets.bibleHelps, 'bibleHelps')
  apply(sets.obsHelps, 'obsHelps')
  return byCode
}

/**
 * One `getLanguages` per subject so DCS multi-subject AND cannot collapse the
 * union. OBS helps omit `topic=tc-ready` (only ~3 TSV GLs are tagged; prod OBS
 * TN covers ~23 langs). Bible/OBS text flags and Bible helps stay tc-ready.
 */
async function languageCodesForSubjects(
  client: LanguageAvailabilityClient,
  subjects: readonly string[],
  filter: { stage: string; topic?: string }
): Promise<string[]> {
  const pages = await Promise.all(
    subjects.map((subject) =>
      client.getLanguages({ ...filter, subjects: [subject], limit: LIST_LIMIT })
    )
  )
  return pages.flatMap(languageCodes)
}

/**
 * Batched list/languages lookups (same Door43 client as the language picker).
 * Per-subject queries — not N+1 per language, no manifests.
 */
export async function fetchLanguageAvailabilityByCode(
  client: LanguageAvailabilityClient,
  sets: LanguageAvailabilitySubjectSets
): Promise<Map<string, LanguageAvailabilityFlags>> {
  const [bible, obs, bibleHelps, obsHelps] = await Promise.all([
    languageCodesForSubjects(client, sets.bible, LIST_FILTER),
    languageCodesForSubjects(client, sets.obs, LIST_FILTER),
    languageCodesForSubjects(client, sets.bibleHelps, LIST_FILTER),
    languageCodesForSubjects(client, sets.obsHelps, HELPS_LIST_FILTER),
  ])
  return mergeAvailabilityFromLanguageSets({
    bible,
    obs,
    bibleHelps,
    obsHelps,
  })
}

export function availabilityForCode(
  byCode: ReadonlyMap<string, LanguageAvailabilityFlags>,
  code: string
): LanguageAvailabilityFlags {
  return byCode.get(code) ?? emptyLanguageAvailability()
}

/** Missing map entries stay unknown — do not invent empty flags (Any fail-open). */
export function availabilityIfPresent(
  byCode: ReadonlyMap<string, LanguageAvailabilityFlags>,
  code: string
): LanguageAvailabilityFlags | undefined {
  return byCode.get(code)
}

function languageCodes(langs: Array<{ code: string }>): string[] {
  return langs.map((lang) => lang.code)
}
