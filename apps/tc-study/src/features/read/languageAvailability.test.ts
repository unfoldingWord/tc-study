import { describe, expect, test } from 'bun:test'
import {
  availabilityForCode,
  availabilityIfPresent,
  availabilityFromSubjects,
  emptyLanguageAvailability,
  fetchLanguageAvailabilityByCode,
  indexAvailabilityByLanguage,
  mergeAvailabilityFromLanguageSets,
  type CatalogSubjectHit,
  type LanguageAvailabilityClient,
  type LanguageAvailabilitySubjectSets,
} from './languageAvailability'

/**
 * CombinedHelps-era fixtures (same Door43 subjects as today).
 * Production lists come from compositions → plugin subjects; this file
 * stays fail-closed for TQ-only (`sw`) and TN-alone → bibleHelps.
 */
const SUBJECT_SETS: LanguageAvailabilitySubjectSets = {
  bible: ['Bible', 'Aligned Bible'],
  obs: ['Open Bible Stories'],
  bibleHelps: ['TSV Translation Notes', 'TSV Translation Words Links'],
  obsHelps: [
    'TSV OBS Translation Notes',
    'OBS Translation Notes',
    'TSV OBS Translation Words Links',
    'OBS Translation Words Links',
  ],
}

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
  Object.freeze({ languageCode: 'el-x-koine', subject: 'Greek New Testament' }),
  Object.freeze({ languageCode: 'hbo', subject: 'Hebrew Old Testament' }),
  Object.freeze({ languageCode: 'sw', subject: 'Translation Academy' }),
  Object.freeze({ languageCode: 'sw', subject: 'Translation Words' }),
  Object.freeze({ languageCode: 'sw', subject: 'TSV Translation Questions' }),
]) satisfies readonly CatalogSubjectHit[]

describe('availabilityFromSubjects', () => {
  test('bible-only language', () => {
    expect(availabilityFromSubjects(['Aligned Bible'], SUBJECT_SETS)).toEqual({
      bible: true,
      obs: false,
      bibleHelps: false,
      obsHelps: false,
    })
  })

  test('OBS-only language', () => {
    expect(availabilityFromSubjects(['Open Bible Stories'], SUBJECT_SETS)).toEqual({
      bible: false,
      obs: true,
      bibleHelps: false,
      obsHelps: false,
    })
  })

  test('Bible and OBS', () => {
    expect(availabilityFromSubjects(['Bible', 'Open Bible Stories'], SUBJECT_SETS)).toEqual({
      bible: true,
      obs: true,
      bibleHelps: false,
      obsHelps: false,
    })
  })

  test('Bible + helps (TN/TWL)', () => {
    expect(
      availabilityFromSubjects(
        ['Aligned Bible', 'TSV Translation Notes', 'TSV Translation Words Links'],
        SUBJECT_SETS
      )
    ).toEqual({
      bible: true,
      obs: false,
      bibleHelps: true,
      obsHelps: false,
    })
  })

  test('OBS + helps (OBS TN/TWL)', () => {
    expect(
      availabilityFromSubjects(
        [
          'Open Bible Stories',
          'TSV OBS Translation Notes',
          'TSV OBS Translation Words Links',
        ],
        SUBJECT_SETS
      )
    ).toEqual({
      bible: false,
      obs: true,
      bibleHelps: false,
      obsHelps: true,
    })
  })

  test('bibleHelps is true with TN alone (either CombinedHelps side)', () => {
    expect(availabilityFromSubjects(['TSV Translation Notes'], SUBJECT_SETS).bibleHelps).toBe(
      true
    )
    expect(
      availabilityFromSubjects(['TSV Translation Words Links'], SUBJECT_SETS).bibleHelps
    ).toBe(true)
  })

  test('TA / TW / TQ and original-language subjects do not set flags', () => {
    expect(
      availabilityFromSubjects(
        [
          'Translation Academy',
          'Translation Words',
          'TSV Translation Questions',
          'Greek New Testament',
          'Hebrew Old Testament',
        ],
        SUBJECT_SETS
      )
    ).toEqual(emptyLanguageAvailability())
  })
})

describe('indexAvailabilityByLanguage', () => {
  const byCode = indexAvailabilityByLanguage(CATALOG_HITS, SUBJECT_SETS)

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

  test('availabilityIfPresent does not invent empty flags', () => {
    expect(availabilityIfPresent(byCode, 'missing')).toBeUndefined()
    expect(availabilityIfPresent(byCode, 'es')?.bibleHelps).toBe(true)
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
        addIfOverlap(SUBJECT_SETS.bible, SETS.bible)
        addIfOverlap(SUBJECT_SETS.obs, SETS.obs)
        addIfOverlap(SUBJECT_SETS.bibleHelps, SETS.bibleHelps)
        addIfOverlap(SUBJECT_SETS.obsHelps, SETS.obsHelps)
        return [...codes].map((code) => ({ code }))
      },
    }
  }

  test('batched getLanguages derives the same DoD cases (no live Door43)', async () => {
    const byCode = await fetchLanguageAvailabilityByCode(mockClient(), SUBJECT_SETS)
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

  test('OBS-helps subjects are queried one-at-a-time without topic (not a 4-subject AND)', async () => {
    const calls: Array<{ subjects?: string[]; topic?: string; limit?: number }> = []
    const client: LanguageAvailabilityClient = {
      async getLanguages(filters) {
        calls.push({
          subjects: filters?.subjects,
          topic: filters?.topic,
          limit: filters?.limit,
        })
        const subject = filters?.subjects?.[0]
        if (subject && SUBJECT_SETS.obsHelps.includes(subject)) {
          if (subject === 'OBS Translation Notes') return [{ code: 'hi' }, { code: 'fr' }]
          if (subject === 'TSV OBS Translation Notes') return [{ code: 'en' }, { code: 'id' }]
          return [{ code: 'en' }]
        }
        return []
      },
    }
    const byCode = await fetchLanguageAvailabilityByCode(client, SUBJECT_SETS)
    const obsHelpsCalls = calls.filter((call) =>
      (call.subjects ?? []).some((subject) => SUBJECT_SETS.obsHelps.includes(subject))
    )
    expect(obsHelpsCalls.length).toBe(SUBJECT_SETS.obsHelps.length)
    expect(obsHelpsCalls.every((call) => call.subjects?.length === 1)).toBe(true)
    expect(obsHelpsCalls.every((call) => call.topic === undefined)).toBe(true)
    expect(obsHelpsCalls.every((call) => call.limit === 1000)).toBe(true)
    expect(byCode.get('hi')?.obsHelps).toBe(true)
    expect(byCode.get('fr')?.obsHelps).toBe(true)
    expect(byCode.get('en')?.obsHelps).toBe(true)
    expect(byCode.get('id')?.obsHelps).toBe(true)
  })

  test('multi-subject AND client still unions OBS-helps when fetched per subject', async () => {
    const tsvGls = ['en', 'es-419', 'id'] as const
    const prodObsTn = ['hi', 'fr', 'ru', 'sw'] as const
    const client: LanguageAvailabilityClient = {
      async getLanguages(filters) {
        const subjects = filters?.subjects ?? []
        if (subjects.length !== 1) {
          return tsvGls.map((code) => ({ code }))
        }
        const subject = subjects[0]
        if (subject === 'TSV OBS Translation Notes') {
          return tsvGls.map((code) => ({ code }))
        }
        if (subject === 'OBS Translation Notes') {
          return prodObsTn.map((code) => ({ code }))
        }
        return []
      },
    }
    const byCode = await fetchLanguageAvailabilityByCode(client, SUBJECT_SETS)
    for (const code of [...tsvGls, ...prodObsTn]) {
      expect(byCode.get(code)?.obsHelps).toBe(true)
    }
  })
})
