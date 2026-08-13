import { describe, expect, test } from 'bun:test'
import {
  BIBLE_HELPS_SUBJECTS,
  BIBLE_SUBJECTS,
  OBS_HELPS_SUBJECTS,
  OBS_SUBJECTS,
  availabilityForCode,
  availabilityFromSubjects,
  emptyLanguageAvailability,
  fetchLanguageAvailabilityByCode,
  indexAvailabilityByLanguage,
  mergeAvailabilityFromLanguageSets,
  type CatalogSubjectHit,
  type LanguageAvailabilityClient,
} from './languageAvailability'

/** Frozen catalog hits — one language per DoD case, plus OBS+helps. */
const CATALOG_HITS = Object.freeze([
  Object.freeze({ languageCode: 'pt', subject: 'Aligned Bible' }),
  Object.freeze({ languageCode: 'tpi', subject: 'Open Bible Stories' }),
  Object.freeze({ languageCode: 'fr', subject: 'Bible' }),
  Object.freeze({ languageCode: 'fr', subject: 'Open Bible Stories' }),
  Object.freeze({ languageCode: 'es', subject: 'Aligned Bible' }),
  Object.freeze({ languageCode: 'es', subject: 'TSV Translation Notes' }),
  Object.freeze({ languageCode: 'es', subject: 'TSV Translation Words Links' }),
  Object.freeze({ languageCode: 'hi', subject: 'Open Bible Stories' }),
  Object.freeze({ languageCode: 'hi', subject: 'TSV OBS Translation Notes' }),
  Object.freeze({ languageCode: 'hi', subject: 'TSV OBS Translation Words Links' }),
  // Must not count as gateway Bible / helps
  Object.freeze({ languageCode: 'el-x-koine', subject: 'Greek New Testament' }),
  Object.freeze({ languageCode: 'hbo', subject: 'Hebrew Old Testament' }),
  Object.freeze({ languageCode: 'sw', subject: 'Translation Academy' }),
  Object.freeze({ languageCode: 'sw', subject: 'Translation Words' }),
  Object.freeze({ languageCode: 'sw', subject: 'TSV Translation Questions' }),
]) satisfies readonly CatalogSubjectHit[]

describe('availabilityFromSubjects', () => {
  test('bible-only language', () => {
    expect(availabilityFromSubjects(['Aligned Bible'])).toEqual({
      bible: true,
      obs: false,
      bibleHelps: false,
      obsHelps: false,
    })
  })

  test('OBS-only language', () => {
    expect(availabilityFromSubjects(['Open Bible Stories'])).toEqual({
      bible: false,
      obs: true,
      bibleHelps: false,
      obsHelps: false,
    })
  })

  test('Bible and OBS', () => {
    expect(availabilityFromSubjects(['Bible', 'Open Bible Stories'])).toEqual({
      bible: true,
      obs: true,
      bibleHelps: false,
      obsHelps: false,
    })
  })

  test('Bible + helps (TN/TWL)', () => {
    expect(
      availabilityFromSubjects([
        'Aligned Bible',
        'TSV Translation Notes',
        'TSV Translation Words Links',
      ])
    ).toEqual({
      bible: true,
      obs: false,
      bibleHelps: true,
      obsHelps: false,
    })
  })

  test('OBS + helps (OBS TN/TWL)', () => {
    expect(
      availabilityFromSubjects([
        'Open Bible Stories',
        'TSV OBS Translation Notes',
        'TSV OBS Translation Words Links',
      ])
    ).toEqual({
      bible: false,
      obs: true,
      bibleHelps: false,
      obsHelps: true,
    })
  })

  test('bibleHelps is true with TN alone (either CombinedHelps side)', () => {
    expect(availabilityFromSubjects(['TSV Translation Notes']).bibleHelps).toBe(true)
    expect(availabilityFromSubjects(['TSV Translation Words Links']).bibleHelps).toBe(true)
  })

  test('TA / TW / TQ and original-language subjects do not set flags', () => {
    expect(
      availabilityFromSubjects([
        'Translation Academy',
        'Translation Words',
        'TSV Translation Questions',
        'Greek New Testament',
        'Hebrew Old Testament',
      ])
    ).toEqual(emptyLanguageAvailability())
  })
})

describe('indexAvailabilityByLanguage', () => {
  const byCode = indexAvailabilityByLanguage(CATALOG_HITS)

  test('Bible-only language', () => {
    expect(byCode.get('pt')).toEqual({
      bible: true,
      obs: false,
      bibleHelps: false,
      obsHelps: false,
    })
  })

  test('OBS-only language', () => {
    expect(byCode.get('tpi')).toEqual({
      bible: false,
      obs: true,
      bibleHelps: false,
      obsHelps: false,
    })
  })

  test('both Bible and OBS', () => {
    expect(byCode.get('fr')).toEqual({
      bible: true,
      obs: true,
      bibleHelps: false,
      obsHelps: false,
    })
  })

  test('Bible + helps', () => {
    expect(byCode.get('es')).toEqual({
      bible: true,
      obs: false,
      bibleHelps: true,
      obsHelps: false,
    })
  })

  test('OBS + helps', () => {
    expect(byCode.get('hi')).toEqual({
      bible: false,
      obs: true,
      bibleHelps: false,
      obsHelps: true,
    })
  })

  test('omits original-language codes and TA/TW/TQ-only languages stay empty', () => {
    expect(byCode.has('el-x-koine')).toBe(false)
    expect(byCode.has('hbo')).toBe(false)
    expect(byCode.get('sw')).toEqual(emptyLanguageAvailability())
  })

  test('availabilityForCode falls back to empty flags', () => {
    expect(availabilityForCode(byCode, 'missing')).toEqual(emptyLanguageAvailability())
    expect(availabilityForCode(byCode, 'es').bibleHelps).toBe(true)
  })
})

describe('fetchLanguageAvailabilityByCode', () => {
  const SETS = {
    bible: ['pt', 'fr', 'es', 'el-x-koine'],
    obs: ['tpi', 'fr', 'hi'],
    bibleHelps: ['es'],
    obsHelps: ['hi'],
  } as const

  function mockClient(): LanguageAvailabilityClient {
    return {
      async getLanguages(filters) {
        const subjects = new Set(filters?.subjects ?? [])
        const codes = new Set<string>()
        const addIfOverlap = (group: readonly string[], langs: readonly string[]) => {
          if (group.some((subject) => subjects.has(subject))) {
            for (const code of langs) codes.add(code)
          }
        }
        addIfOverlap(BIBLE_SUBJECTS, SETS.bible)
        addIfOverlap(OBS_SUBJECTS, SETS.obs)
        addIfOverlap(BIBLE_HELPS_SUBJECTS, SETS.bibleHelps)
        addIfOverlap(OBS_HELPS_SUBJECTS, SETS.obsHelps)
        return [...codes].map((code) => ({ code }))
      },
    }
  }

  test('batched getLanguages derives the same DoD cases (no live Door43)', async () => {
    const byCode = await fetchLanguageAvailabilityByCode(mockClient())
    expect(byCode.get('pt')).toEqual({
      bible: true,
      obs: false,
      bibleHelps: false,
      obsHelps: false,
    })
    expect(byCode.get('tpi')).toEqual({
      bible: false,
      obs: true,
      bibleHelps: false,
      obsHelps: false,
    })
    expect(byCode.get('fr')).toEqual({
      bible: true,
      obs: true,
      bibleHelps: false,
      obsHelps: false,
    })
    expect(byCode.get('es')).toEqual({
      bible: true,
      obs: false,
      bibleHelps: true,
      obsHelps: false,
    })
    expect(byCode.get('hi')).toEqual({
      bible: false,
      obs: true,
      bibleHelps: false,
      obsHelps: true,
    })
    expect(byCode.has('el-x-koine')).toBe(false)
  })

  test('mergeAvailabilityFromLanguageSets is a single selector over listed codes', () => {
    const byCode = mergeAvailabilityFromLanguageSets({
      bible: ['pt'],
      obs: ['tpi'],
      bibleHelps: ['es'],
      obsHelps: ['hi'],
    })
    expect([...byCode.keys()].sort()).toEqual(['es', 'hi', 'pt', 'tpi'])
    expect(byCode.get('es')?.bibleHelps).toBe(true)
    expect(byCode.get('pt')?.bible).toBe(true)
  })
})
