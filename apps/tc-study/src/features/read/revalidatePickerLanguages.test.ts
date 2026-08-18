import { beforeEach, describe, expect, test } from 'bun:test'
import { mergeAvailabilityFromLanguageSets } from './languageAvailability'
import {
  LANGUAGES_CACHE_KEY,
  saveLanguagesCache,
} from './languagesCache'
import {
  catalogCodesForLanguageList,
  filterCachedLanguagesForKind,
  revalidatePickerLanguages,
} from './revalidatePickerLanguages'
import type { LanguageListClient } from './fetchLanguagesForSubjects'

const g = globalThis as typeof globalThis & { localStorage?: Storage }
if (!g.localStorage) {
  const mem = new Map<string, string>()
  g.localStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, String(v))
    },
    removeItem: (k) => {
      mem.delete(k)
    },
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size
    },
  }
}

function clientFor(bySubject: Record<string, Array<{ code: string; name?: string }>>): {
  client: LanguageListClient
  requested: string[]
} {
  const requested: string[] = []
  return {
    requested,
    client: {
      async getLanguages(filters) {
        const subject = filters?.subjects?.[0]
        if (subject) requested.push(subject)
        return subject ? (bySubject[subject] ?? []) : []
      },
    },
  }
}

describe('revalidatePickerLanguages', () => {
  beforeEach(() => {
    g.localStorage?.removeItem(LANGUAGES_CACHE_KEY)
  })

  test('scripture content picker does not request the OBS subject', async () => {
    const { client, requested } = clientFor({
      Bible: [{ code: 'en', name: 'English' }],
      'Aligned Bible': [{ code: 'hi', name: 'हिन्दी' }],
      'Open Bible Stories': [{ code: 'fr', name: 'français' }],
    })
    const availabilityByCode = mergeAvailabilityFromLanguageSets({
      bible: ['en', 'hi'],
      obs: ['fr'],
      bibleHelps: ['en'],
      obsHelps: [],
    })
    const { display } = await revalidatePickerLanguages({
      client,
      kind: 'scripture',
      listSubjects: ['Bible', 'Aligned Bible'],
      globalSubjects: ['Bible', 'Aligned Bible', 'Open Bible Stories'],
      catalogCodes: ['en', 'fr'],
      availabilityByCode,
    })
    expect(requested).toEqual(['Bible', 'Aligned Bible'])
    expect(requested).not.toContain('Open Bible Stories')
    expect(display.map((lang) => lang.code).sort()).toEqual(['en', 'hi'])
    expect(display.map((lang) => lang.code)).not.toContain('fr')
  })

  test('text picker (global) requests Bible + Aligned Bible + OBS and keeps Bible langs', async () => {
    const { client, requested } = clientFor({
      Bible: [{ code: 'en', name: 'English' }],
      'Aligned Bible': [{ code: 'hi', name: 'हिन्दी' }],
      'Open Bible Stories': [{ code: 'fr', name: 'français' }],
    })
    const availabilityByCode = mergeAvailabilityFromLanguageSets({
      bible: ['en', 'hi'],
      obs: ['fr', 'en'],
      bibleHelps: ['en'],
      obsHelps: ['fr'],
    })
    const { display } = await revalidatePickerLanguages({
      client,
      kind: 'global',
      listSubjects: ['Bible', 'Aligned Bible', 'Open Bible Stories'],
      globalSubjects: ['Bible', 'Aligned Bible', 'Open Bible Stories'],
      catalogCodes: ['en', 'fr'],
      availabilityByCode,
    })
    expect(requested).toEqual(['Bible', 'Aligned Bible', 'Open Bible Stories'])
    expect(display.map((lang) => lang.code).sort()).toEqual(['en', 'fr', 'hi'])
  })

  test('helps picker requests scripture + OBS helps and includes OBS-helps langs', async () => {
    const requested: Array<{ subject: string; topic?: string }> = []
    const client: LanguageListClient = {
      async getLanguages(filters) {
        const subject = filters?.subjects?.[0]
        if (subject) requested.push({ subject, topic: filters?.topic })
        if (subject === 'TSV Translation Notes') return [{ code: 'en', name: 'English' }]
        if (subject === 'TSV OBS Translation Notes') return [{ code: 'fr', name: 'français' }]
        return []
      },
    }
    const { display } = await revalidatePickerLanguages({
      client,
      kind: 'all-helps',
      listSubjects: [
        'TSV Translation Notes',
        'TSV Translation Words Links',
        'TSV Translation Questions',
        'TSV OBS Translation Notes',
        'OBS Translation Notes',
        'Translation Words',
        'Translation Academy',
      ],
      globalSubjects: ['Bible', 'Aligned Bible', 'Open Bible Stories'],
      catalogCodes: [],
      availabilityByCode: mergeAvailabilityFromLanguageSets({
        bible: ['en'],
        obs: ['fr'],
        bibleHelps: ['en'],
        obsHelps: ['fr'],
      }),
    })
    expect(requested.every((call) => call.topic === undefined)).toBe(true)
    expect(requested.map((call) => call.subject)).toEqual([
      'TSV Translation Notes',
      'TSV Translation Words Links',
      'TSV Translation Questions',
      'TSV OBS Translation Notes',
      'OBS Translation Notes',
      'Translation Words',
      'Translation Academy',
    ])
    expect(display.map((lang) => lang.code).sort()).toEqual(['en', 'fr'])
  })

  test('helps picker in OBS mode requests OBS-helps subjects without topic', async () => {
    const requested: Array<{ subject: string; topic?: string }> = []
    const client: LanguageListClient = {
      async getLanguages(filters) {
        const subject = filters?.subjects?.[0]
        if (subject) requested.push({ subject, topic: filters?.topic })
        if (subject === 'TSV OBS Translation Notes') return [{ code: 'hi', name: 'हिन्दी' }]
        return []
      },
    }
    const { display } = await revalidatePickerLanguages({
      client,
      kind: 'obs-helps',
      listSubjects: ['TSV OBS Translation Notes', 'OBS Translation Notes'],
      globalSubjects: ['Bible', 'Open Bible Stories'],
      catalogCodes: [],
      availabilityByCode: mergeAvailabilityFromLanguageSets({
        bible: [],
        obs: ['hi'],
        bibleHelps: [],
        obsHelps: ['hi'],
      }),
    })
    expect(requested.every((call) => call.topic === undefined)).toBe(true)
    expect(requested.map((call) => call.subject)).toEqual([
      'TSV OBS Translation Notes',
      'OBS Translation Notes',
    ])
    expect(display.map((lang) => lang.code)).toEqual(['hi'])
  })

  test('catalog OBS-only lang is excluded from a scripture-scoped merge', () => {
    const availabilityByCode = mergeAvailabilityFromLanguageSets({
      bible: ['en'],
      obs: ['fr'],
      bibleHelps: [],
      obsHelps: [],
    })
    expect(
      catalogCodesForLanguageList({
        catalogCodes: ['en', 'fr'],
        door43Codes: new Set(['en']),
        availabilityByCode,
        kind: 'scripture',
      })
    ).toEqual(['en'])
  })

  test('optimistic cache filter keeps bible langs for scripture kind', () => {
    saveLanguagesCache(
      [
        {
          code: 'en',
          name: 'English',
          source: 'door43',
          availability: { bible: true, obs: true, bibleHelps: true, obsHelps: false },
        },
        {
          code: 'fr',
          name: 'français',
          source: 'door43',
          availability: { bible: false, obs: true, bibleHelps: false, obsHelps: false },
        },
      ],
      ['Bible', 'Open Bible Stories']
    )
    const cached = [
      {
        code: 'en',
        name: 'English',
        source: 'door43' as const,
        availability: { bible: true, obs: true, bibleHelps: true, obsHelps: false },
      },
      {
        code: 'fr',
        name: 'français',
        source: 'door43' as const,
        availability: { bible: false, obs: true, bibleHelps: false, obsHelps: false },
      },
    ]
    expect(filterCachedLanguagesForKind(cached, 'scripture').map((l) => l.code)).toEqual([
      'en',
    ])
    expect(filterCachedLanguagesForKind(cached, 'obs').map((l) => l.code).sort()).toEqual(
      ['en', 'fr']
    )
    expect(filterCachedLanguagesForKind(cached, 'global').map((l) => l.code).sort()).toEqual(
      ['en', 'fr']
    )
    expect(
      filterCachedLanguagesForKind(cached, 'all-helps').map((l) => l.code)
    ).toEqual(['en'])
  })

  test('all-helps cache/catalog keep bible-helps or OBS-helps langs', () => {
    const availabilityByCode = mergeAvailabilityFromLanguageSets({
      bible: ['en'],
      obs: ['fr', 'hi'],
      bibleHelps: ['en'],
      obsHelps: ['fr'],
    })
    expect(
      catalogCodesForLanguageList({
        catalogCodes: ['en', 'fr', 'hi'],
        door43Codes: new Set(),
        availabilityByCode,
        kind: 'all-helps',
      }).sort()
    ).toEqual(['en', 'fr'])
    const cached = [
      {
        code: 'en',
        name: 'English',
        source: 'door43' as const,
        availability: { bible: true, obs: true, bibleHelps: true, obsHelps: false },
      },
      {
        code: 'fr',
        name: 'français',
        source: 'door43' as const,
        availability: { bible: false, obs: true, bibleHelps: false, obsHelps: true },
      },
      {
        code: 'hi',
        name: 'हिन्दी',
        source: 'door43' as const,
        availability: { bible: false, obs: true, bibleHelps: false, obsHelps: false },
      },
    ]
    expect(filterCachedLanguagesForKind(cached, 'all-helps').map((l) => l.code).sort()).toEqual(
      ['en', 'fr']
    )
  })
})
