/**
 * Door43 catalog search params for Read hydrate.
 *
 * Text (and Bible helps) stay `topic=tc-ready`. OBS helps match availability:
 * per-subject OBS TN/TWL at `stage=prod` with no topic — most langs are not
 * in the 3-GL tc-ready TSV set.
 */

import { OBS_HELPS_SUBJECTS } from './languageAvailability'
import type { CatalogLoadTarget } from './readCatalogPanelPolicy'
import type { CatalogEntry } from './readCatalogIdentity'

export interface CatalogSearchParams {
  language: string
  stage: 'prod'
  limit: number
  topic?: string
  subject?: string
}

export interface CatalogSearchRequest {
  hydrateTarget: CatalogLoadTarget
  params: CatalogSearchParams
}

export interface CatalogSearchClient {
  searchCatalog(params: CatalogSearchParams): Promise<unknown[]>
}

const SEARCH_LIMIT = 500
const TC_READY_FILTER = { topic: 'tc-ready' as const, stage: 'prod' as const, limit: SEARCH_LIMIT }
const OBS_HELPS_FILTER = { stage: 'prod' as const, limit: SEARCH_LIMIT }

function isObsScope(navigationScope: string): boolean {
  return navigationScope === 'obs'
}

function tcReadyRequest(
  languageCode: string,
  hydrateTarget: CatalogLoadTarget
): CatalogSearchRequest {
  return {
    hydrateTarget,
    params: { language: languageCode, ...TC_READY_FILTER },
  }
}

function obsHelpsRequests(languageCode: string): CatalogSearchRequest[] {
  return OBS_HELPS_SUBJECTS.map((subject) => ({
    hydrateTarget: 'helps' as const,
    params: { language: languageCode, subject, ...OBS_HELPS_FILTER },
  }))
}

/**
 * One Door43 search per request. OBS helps are one subject at a time so DCS
 * multi-subject AND cannot collapse the union (same as availability listing).
 */
export function catalogSearchRequestsForTarget(options: {
  languageCode: string
  target: CatalogLoadTarget
  navigationScope: string
}): CatalogSearchRequest[] {
  const { languageCode, target, navigationScope } = options
  const obsHelps = isObsScope(navigationScope) && target !== 'text'

  if (target === 'text') return [tcReadyRequest(languageCode, 'text')]
  if (target === 'helps') {
    return obsHelps ? obsHelpsRequests(languageCode) : [tcReadyRequest(languageCode, 'helps')]
  }
  if (obsHelps) {
    return [tcReadyRequest(languageCode, 'text'), ...obsHelpsRequests(languageCode)]
  }
  return [tcReadyRequest(languageCode, 'both')]
}

export async function searchCatalogHitsForTarget(
  client: CatalogSearchClient,
  options: {
    languageCode: string
    target: CatalogLoadTarget
    navigationScope: string
  }
): Promise<Array<{ hydrateTarget: CatalogLoadTarget; catalogResults: CatalogEntry[] }>> {
  const requests = catalogSearchRequestsForTarget(options)
  const pages = await Promise.all(
    requests.map(async (request) => ({
      hydrateTarget: request.hydrateTarget,
      catalogResults: ((await client.searchCatalog(request.params)) ?? []) as CatalogEntry[],
    }))
  )
  const merged = new Map<CatalogLoadTarget, CatalogEntry[]>()
  for (const page of pages) {
    const list = merged.get(page.hydrateTarget) ?? []
    list.push(...page.catalogResults)
    merged.set(page.hydrateTarget, list)
  }
  return [...merged.entries()].map(([hydrateTarget, catalogResults]) => ({
    hydrateTarget,
    catalogResults,
  }))
}
