/**
 * Mixed-batch download order: original-language scripture (UGNT/UHB) before TN.
 * TN is getDownloadPriority 1; pinning OL ahead lets quote/align succeed
 * once the helps zip lands.
 */

import { specForOriginalLanguageKey } from '../read/originalLanguageForBook'

const OL_LANGS = new Set(['el-x-koine', 'hbo'])
const OL_IDS = new Set(['ugnt', 'uhb'])

function languageFromResourceKey(resourceKey: string): string {
  const parts = resourceKey.split('/')
  return (parts[1] ?? '').toLowerCase()
}

function identifierFromResourceKey(resourceKey: string): string {
  const parts = resourceKey.split('/')
  return (parts[2] ?? '').split('#')[0]?.toLowerCase() ?? ''
}

export function isOriginalLanguageDownloadTarget(args: {
  resourceKey: string
  language?: string
  identifier?: string
}): boolean {
  if (specForOriginalLanguageKey(args.resourceKey)) return true
  const language = (args.language ?? languageFromResourceKey(args.resourceKey)).toLowerCase()
  if (OL_LANGS.has(language)) return true
  const identifier = (args.identifier ?? identifierFromResourceKey(args.resourceKey)).toLowerCase()
  return OL_IDS.has(identifier)
}

export type DownloadBatchOrderItem = {
  resourceKey: string
  priority: number
  language?: string
  identifier?: string
}

/** OL scripture first, then SoT downloadPriority (lower = earlier). */
export function compareDownloadBatchOrder(
  a: DownloadBatchOrderItem,
  b: DownloadBatchOrderItem
): number {
  const aOl = isOriginalLanguageDownloadTarget(a)
  const bOl = isOriginalLanguageDownloadTarget(b)
  if (aOl !== bOl) return aOl ? -1 : 1
  return a.priority - b.priority
}

export function sortDownloadBatch<T extends DownloadBatchOrderItem>(items: T[]): T[] {
  return [...items].sort(compareDownloadBatchOrder)
}
