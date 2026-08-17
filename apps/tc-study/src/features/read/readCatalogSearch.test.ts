import { describe, expect, test } from 'bun:test'
import { OBS_HELPS_SUBJECTS } from './languageAvailability'
import { hydrateReadCatalogHits } from './hydrateReadCatalogHits'
import {
  catalogSearchRequestsForTarget,
  searchCatalogHitsForTarget,
  type CatalogSearchClient,
} from './readCatalogSearch'
import type { CatalogEntry } from './readCatalogIdentity'

/** Hindi is in the prod OBS-helps set, not the 3-GL tc-ready TSV set (en / es-419 / id). */
const HI_OBS_TN = Object.freeze({
  name: 'hi_obs-tn',
  owner: 'Door43-Catalog',
  language: 'hi',
  identifier: 'obs-tn',
  title: 'Hindi OBS TN',
  subject: 'OBS Translation Notes',
  release: { tag_name: 'v1' },
}) satisfies CatalogEntry

const HI_OBS_TWL = Object.freeze({
  name: 'hi_obs-twl',
  owner: 'Door43-Catalog',
  language: 'hi',
  identifier: 'obs-twl',
  title: 'Hindi OBS TWL',
  subject: 'OBS Translation Words Links',
  release: { tag_name: 'v1' },
}) satisfies CatalogEntry

const ES_TN = Object.freeze({
  name: 'es_tn',
  owner: 'unfoldingWord',
  language: 'es',
  identifier: 'tn',
  title: 'Spanish TN',
  subject: 'TSV Translation Notes',
  release: { tag_name: 'v1' },
}) satisfies CatalogEntry

function recordingClient(
  hitsBySubject: Record<string, CatalogEntry[]>,
  tcReadyHits: CatalogEntry[] = []
): { client: CatalogSearchClient; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  return {
    calls,
    client: {
      async searchCatalog(params) {
        calls.push({ ...params })
        if (params.subject) return hitsBySubject[params.subject] ?? []
        if (params.topic === 'tc-ready') return tcReadyHits
        return []
      },
    },
  }
}

function registry() {
  return {
    getTypeForSubject: (subject: string) => {
      if (subject === 'OBS Translation Notes' || subject === 'TSV OBS Translation Notes') {
        return 'obs-notes'
      }
      if (
        subject === 'OBS Translation Words Links' ||
        subject === 'TSV OBS Translation Words Links'
      ) {
        return 'obs-words-links'
      }
      if (subject === 'TSV Translation Notes') return 'notes'
      if (subject === 'Open Bible Stories') return 'obs'
      return undefined
    },
    get: (typeId: string) => ({
      contentRole: typeId === 'obs' || typeId === 'scripture' ? 'primary' : 'companion',
    }),
    getScopeForType: (typeId: string) =>
      typeId === 'obs' ? 'obs' : typeId === 'scripture' ? 'scripture' : 'shared',
  }
}

describe('catalogSearchRequestsForTarget', () => {
  test('OBS helps searches each OBS-helps subject at prod without topic', () => {
    const requests = catalogSearchRequestsForTarget({
      languageCode: 'hi',
      target: 'helps',
      navigationScope: 'obs',
    })
    expect(requests.map((r) => r.params.subject)).toEqual([...OBS_HELPS_SUBJECTS])
    expect(requests.every((r) => r.hydrateTarget === 'helps')).toBe(true)
    expect(requests.every((r) => r.params.topic === undefined)).toBe(true)
    expect(requests.every((r) => r.params.stage === 'prod')).toBe(true)
    expect(requests.every((r) => r.params.language === 'hi')).toBe(true)
    expect(requests.every((r) => r.params.limit === 500)).toBe(true)
  })

  test('eng catalog query normalizes to Door43 en', () => {
    expect(
      catalogSearchRequestsForTarget({
        languageCode: 'eng',
        target: 'helps',
        navigationScope: 'scripture',
      })
    ).toEqual([
      {
        hydrateTarget: 'helps',
        params: { language: 'en', topic: 'tc-ready', stage: 'prod', limit: 500 },
      },
    ])
  })

  test('Bible helps still uses topic=tc-ready with no subject filter', () => {
    expect(
      catalogSearchRequestsForTarget({
        languageCode: 'es',
        target: 'helps',
        navigationScope: 'scripture',
      })
    ).toEqual([
      {
        hydrateTarget: 'helps',
        params: { language: 'es', topic: 'tc-ready', stage: 'prod', limit: 500 },
      },
    ])
  })

  test('OBS text stays tc-ready (stories are not the prod-helps search)', () => {
    expect(
      catalogSearchRequestsForTarget({
        languageCode: 'hi',
        target: 'text',
        navigationScope: 'obs',
      })
    ).toEqual([
      {
        hydrateTarget: 'text',
        params: { language: 'hi', topic: 'tc-ready', stage: 'prod', limit: 500 },
      },
    ])
  })

  test('OBS same-language both splits tc-ready text from prod OBS helps', () => {
    const requests = catalogSearchRequestsForTarget({
      languageCode: 'hi',
      target: 'both',
      navigationScope: 'obs',
    })
    expect(requests[0]).toEqual({
      hydrateTarget: 'text',
      params: { language: 'hi', topic: 'tc-ready', stage: 'prod', limit: 500 },
    })
    expect(requests.slice(1).map((r) => r.params.subject)).toEqual([...OBS_HELPS_SUBJECTS])
    expect(requests.slice(1).every((r) => r.params.topic === undefined)).toBe(true)
    expect(requests.slice(1).every((r) => r.hydrateTarget === 'helps')).toBe(true)
  })

  test('Bible same-language both stays a single tc-ready search', () => {
    expect(
      catalogSearchRequestsForTarget({
        languageCode: 'es',
        target: 'both',
        navigationScope: 'scripture',
      })
    ).toEqual([
      {
        hydrateTarget: 'both',
        params: { language: 'es', topic: 'tc-ready', stage: 'prod', limit: 500 },
      },
    ])
  })
})

describe('searchCatalogHitsForTarget (frozen Door43 fixtures)', () => {
  test('OBS helps for Hindi (prod, not tc-ready TSV GL) requests and returns OBS TN', async () => {
    const { client, calls } = recordingClient({
      'OBS Translation Notes': [HI_OBS_TN],
      'OBS Translation Words Links': [HI_OBS_TWL],
    })
    const pages = await searchCatalogHitsForTarget(client, {
      languageCode: 'hi',
      target: 'helps',
      navigationScope: 'obs',
    })

    expect(calls).toHaveLength(OBS_HELPS_SUBJECTS.length)
    expect(calls.every((call) => call.topic === undefined)).toBe(true)
    expect(calls.every((call) => call.stage === 'prod')).toBe(true)
    expect(calls.map((call) => call.subject).sort()).toEqual([...OBS_HELPS_SUBJECTS].sort())
    expect(calls.some((call) => call.topic === 'tc-ready')).toBe(false)

    const helps = pages.find((page) => page.hydrateTarget === 'helps')
    expect(helps?.catalogResults).toEqual([HI_OBS_TN, HI_OBS_TWL])

    const added: Array<{ key: string; panelId?: string }> = []
    const hydrated = hydrateReadCatalogHits({
      catalogResults: helps!.catalogResults,
      languageCode: 'hi',
      target: 'helps',
      resourceTypeRegistry: registry(),
      viewerRegistry: { hasViewer: () => true },
      getPanel: () => ({ resourceKeys: [] }),
      addResource: (resource, options) => {
        added.push({ key: resource.key, panelId: options?.panelId })
      },
      setActiveResourceInPanel: () => undefined,
    })
    expect(hydrated.expectedHelpsKeys).toEqual([
      'Door43-Catalog/hi/obs-tn',
      'Door43-Catalog/hi/obs-twl',
    ])
    expect(added).toEqual([
      { key: 'Door43-Catalog/hi/obs-tn', panelId: 'panel-2' },
      { key: 'Door43-Catalog/hi/obs-twl', panelId: 'panel-2' },
    ])
  })

  test('Bible helps path still requests topic=tc-ready', async () => {
    const { client, calls } = recordingClient({}, [ES_TN])
    const pages = await searchCatalogHitsForTarget(client, {
      languageCode: 'es',
      target: 'helps',
      navigationScope: 'scripture',
    })
    expect(calls).toEqual([
      { language: 'es', topic: 'tc-ready', stage: 'prod', limit: 500 },
    ])
    expect(pages).toEqual([{ hydrateTarget: 'helps', catalogResults: [ES_TN] }])
  })
})
