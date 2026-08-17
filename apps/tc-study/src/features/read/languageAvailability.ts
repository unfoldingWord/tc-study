/**
 * Per-language content availability for Read (Epic #21 / issue #22).
 *
 * Flags are derived from Door43 catalog subjects already used by
 * `loadReadLanguageCatalog` and CombinedHelps — not a new network API.
 *
 * Subject mapping (resource type plugins):
 * - bible: `Bible`, `Aligned Bible` (scripture.ts). Excludes original-language
 *   UGNT/UHB (`Greek New Testament`, `Hebrew Old Testament`) which are injected
 *   globally and must not count as a gateway Bible.
 *   French (`fr`) is not in the tc-ready Bible/Aligned Bible set (~15 GLs);
 *   its Bibles are stage=prod without topic=tc-ready. French tc-ready is OBS.
 * - obs: `Open Bible Stories` (obs.ts) — ~200 langs at tc-ready.
 * - bibleHelps: CombinedHelps scripture pair — `TSV Translation Notes` (TN) and
 *   `TSV Translation Words Links` (TWL). TA / TW / TQ do not count.
 *   ~14 langs at tc-ready; fetched per subject at tc-ready.
 * - obsHelps: CombinedHelps OBS pair — `TSV OBS Translation Notes` /
 *   `OBS Translation Notes` and `TSV OBS Translation Words Links` /
 *   `OBS Translation Words Links`.
 *   Door43 2026-08-12: only `en` / `es-419` / `id` at topic=tc-ready (TSV GLs).
 *   ~20 more langs have `OBS Translation Notes` at stage=prod without tc-ready;
 *   helps flags use prod (no topic) so the picker is not stuck on those 3 GLs.
 *
 * A helps flag is true when the language has **either** side of the CombinedHelps
 * pair (TN or TWL). Injection uses the same OR so first-open is not blocked.
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

export const BIBLE_SUBJECTS = ['Bible', 'Aligned Bible'] as const
export const OBS_SUBJECTS = ['Open Bible Stories'] as const
export const BIBLE_HELPS_SUBJECTS = [
  'TSV Translation Notes',
  'TSV Translation Words Links',
] as const
export const OBS_HELPS_SUBJECTS = [
  'TSV OBS Translation Notes',
  'OBS Translation Notes',
  'TSV OBS Translation Words Links',
  'OBS Translation Words Links',
] as const

export const ORIGINAL_LANGUAGE_CODES = new Set(['el-x-koine', 'hbo'])
const ORIGINAL_LANGUAGE_SUBJECTS = new Set([
  'Greek New Testament',
  'Hebrew Old Testament',
])

const BIBLE_SUBJECT_SET = new Set<string>(BIBLE_SUBJECTS)
const OBS_SUBJECT_SET = new Set<string>(OBS_SUBJECTS)
const BIBLE_HELPS_SUBJECT_SET = new Set<string>(BIBLE_HELPS_SUBJECTS)
const OBS_HELPS_SUBJECT_SET = new Set<string>(OBS_HELPS_SUBJECTS)

const LIST_FILTER = { stage: 'prod', topic: 'tc-ready' } as const
/** OBS TN/TWL are mostly prod without `topic=tc-ready` (only ~3 TSV GLs are tagged). */
const HELPS_LIST_FILTER = { stage: 'prod' } as const
const LIST_LIMIT = 1000

export function emptyLanguageAvailability(): LanguageAvailabilityFlags {
  return { bible: false, obs: false, bibleHelps: false, obsHelps: false }
}

export function availabilityFromSubjects(
  subjects: Iterable<string>
): LanguageAvailabilityFlags {
  const flags = emptyLanguageAvailability()
  for (const raw of subjects) {
    const subject = String(raw ?? '').trim()
    if (!subject || ORIGINAL_LANGUAGE_SUBJECTS.has(subject)) continue
    if (BIBLE_SUBJECT_SET.has(subject)) flags.bible = true
    else if (OBS_SUBJECT_SET.has(subject)) flags.obs = true
    else if (BIBLE_HELPS_SUBJECT_SET.has(subject)) flags.bibleHelps = true
    else if (OBS_HELPS_SUBJECT_SET.has(subject)) flags.obsHelps = true
  }
  return flags
}

/**
 * Index availability for every language present in catalog subject hits.
 * Original-language codes (UGNT/UHB) are omitted.
 */
export function indexAvailabilityByLanguage(
  hits: readonly CatalogSubjectHit[]
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
    byCode.set(code, availabilityFromSubjects(subjects))
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
  client: LanguageAvailabilityClient
): Promise<Map<string, LanguageAvailabilityFlags>> {
  const [bible, obs, bibleHelps, obsHelps] = await Promise.all([
    languageCodesForSubjects(client, BIBLE_SUBJECTS, LIST_FILTER),
    languageCodesForSubjects(client, OBS_SUBJECTS, LIST_FILTER),
    languageCodesForSubjects(client, BIBLE_HELPS_SUBJECTS, LIST_FILTER),
    languageCodesForSubjects(client, OBS_HELPS_SUBJECTS, HELPS_LIST_FILTER),
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
