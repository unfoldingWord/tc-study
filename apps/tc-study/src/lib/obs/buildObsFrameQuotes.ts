/**
 * Build OBS frame-quote maps from already-loaded TN/TWL rows.
 * Used on first hydrate (URL / refresh) and on later nav — no nav event required.
 */

import type { MergedObsFrameQuotes } from '@bt-synergy/resource-panels'
import type { ObsFrameQuoteEntry } from '../../signals/studioSignals'

export interface ObsQuoteSourceRow {
  id: string
  reference: string
  quote?: string | null
  occurrence?: string | number | null
  kind: 'tn' | 'twl'
}

function occurrenceOf(value: string | number | null | undefined): number {
  const raw = Number.parseInt(String(value ?? '1'), 10)
  return Number.isFinite(raw) ? raw : 1
}

/** True when the payload has at least one quote to underline. */
export function obsQuotesHaveEntries(payload: MergedObsFrameQuotes | null | undefined): boolean {
  if (!payload) return false
  return payload.hasQuotes || payload.quotes.length > 0 || Object.keys(payload.frameQuoteMap).length > 0
}

function quoteEntryKey(entry: ObsFrameQuoteEntry): string {
  return `${entry.sourceId}:${entry.kind}:${entry.quote}:${entry.occurrence}`
}

/**
 * Content identity for the hydrate store. CombinedHelps rebuilds a new `built`
 * object when row arrays change identity (OBS has no scripture tokens, so
 * `useAlignedTokens` often recomputes every render). Publishing that as a new
 * snapshot would make `useSyncExternalStore` see a new reference and re-render
 * ObsViewer in a loop.
 */
export function obsQuotesSnapshotKey(payload: MergedObsFrameQuotes | null | undefined): string {
  if (!payload) return ''
  const mapKeys = Object.keys(payload.frameQuoteMap).sort((a, b) => Number(a) - Number(b))
  const mapPart = mapKeys
    .map((k) => `${k}:${(payload.frameQuoteMap[Number(k)] ?? []).map(quoteEntryKey).join(',')}`)
    .join(';')
  return `${payload.storyNumber}:${payload.frameNumber}:${payload.hasQuotes ? 1 : 0}:${payload.quotes.map(quoteEntryKey).join('|')}:${mapPart}`
}

/**
 * Prefer the hydrate/publish snapshot when messaging STATE is still empty
 * (CombinedHelps sent before ObsViewer subscribed; no subsequent nav).
 */
export function preferHydratedObsQuotes(
  messaging: MergedObsFrameQuotes | null | undefined,
  published: MergedObsFrameQuotes | null | undefined
): MergedObsFrameQuotes | null {
  if (obsQuotesHaveEntries(published)) return published ?? null
  if (obsQuotesHaveEntries(messaging)) return messaging ?? null
  return published ?? messaging ?? null
}

export function buildObsFrameQuotes(params: {
  book?: string | null
  storyNumber: number
  frameNumber: number
  rows: readonly ObsQuoteSourceRow[]
}): MergedObsFrameQuotes {
  const { book, storyNumber, frameNumber, rows } = params
  const onObs = book === 'obs'
  const frameQuoteMap: Record<number, ObsFrameQuoteEntry[]> = {}
  const quotes: ObsFrameQuoteEntry[] = []

  if (onObs) {
    for (const row of rows) {
      const q = row.quote?.trim()
      if (!q) continue
      const [chStr, frStr] = row.reference.split(':')
      if (parseInt(chStr, 10) !== storyNumber) continue
      const fr = parseInt(frStr, 10)
      if (!Number.isFinite(fr)) continue
      const entry: ObsFrameQuoteEntry = {
        sourceId: row.id,
        kind: row.kind,
        quote: q,
        occurrence: occurrenceOf(row.occurrence),
      }
      if (!frameQuoteMap[fr]) frameQuoteMap[fr] = []
      frameQuoteMap[fr].push(entry)
      if (fr === frameNumber) quotes.push(entry)
    }
  }

  return {
    storyNumber: onObs ? storyNumber : 0,
    frameNumber: onObs ? frameNumber : 0,
    quotes,
    frameQuoteMap,
    hasQuotes: quotes.length > 0 || Object.keys(frameQuoteMap).length > 0,
  }
}

export function obsQuotesOfKind(
  payload: MergedObsFrameQuotes,
  kind: 'tn' | 'twl'
): { quotes: ObsFrameQuoteEntry[]; frameQuoteMap: Record<number, ObsFrameQuoteEntry[]> } {
  const quotes = payload.quotes.filter((q) => q.kind === kind)
  const frameQuoteMap: Record<number, ObsFrameQuoteEntry[]> = {}
  for (const [k, entries] of Object.entries(payload.frameQuoteMap)) {
    const filtered = entries.filter((e) => e.kind === kind)
    if (filtered.length) frameQuoteMap[Number(k)] = filtered
  }
  return { quotes, frameQuoteMap }
}
