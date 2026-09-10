/**
 * Lane-1 SoT: IDB first, else one DCS file via existing loaders.
 * Publishes `__sotDebug` for e2e (source + book).
 */

import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { fetchDcsViaLoader, type DcsLoader } from './fetchDcsSoT'
import { getSoT, type SoTCache, type SoTResult } from './getSoT'
import { isUsjViewModel, publishSoTDebug, unwrapSoTPayload } from './sotDebug'

export async function resolveLane1SoT(args: {
  resourceKey: string
  book: string
  chapter?: number
  typeId: string
  cache: SoTCache
  loader: DcsLoader | null | undefined
}): Promise<SoTResult> {
  const result = await getSoT({
    resourceKey: args.resourceKey,
    book: args.book,
    chapter: args.chapter,
    typeId: args.typeId,
    cache: args.cache,
    allowDcs: true,
    fetchDcs: fetchDcsViaLoader(args.loader),
  })
  publishSoTDebug({
    source: result.status === 'hit' ? result.source : 'missing',
    typeId: result.typeId,
    book: args.book,
    chapter: args.chapter,
  })
  return result
}

export async function resolveLane1ScriptureViewModel(args: {
  resourceKey: string
  book: string
  chapter?: number
  cache: SoTCache | null | undefined
  loader: DcsLoader | null | undefined
  loadViewModel: (
    loader: DcsLoader | null | undefined,
    resourceKey: string,
    bookId: string
  ) => Promise<{ chapters: Array<{ number: number }> }>
}): Promise<{ chapters: Array<{ number: number }> }> {
  if (!args.cache) {
    return args.loadViewModel(args.loader, args.resourceKey, args.book)
  }
  const sot = await resolveLane1SoT({
    resourceKey: args.resourceKey,
    book: args.book,
    chapter: args.chapter,
    typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
    cache: args.cache,
    loader: args.loader,
  })
  if (sot.status === 'hit' && isUsjViewModel(sot.payload)) {
    return sot.payload
  }
  return args.loadViewModel(args.loader, args.resourceKey, args.book)
}

export function processedFromSoT<T>(sot: SoTResult): T | null {
  if (sot.status !== 'hit') return null
  return unwrapSoTPayload(sot.payload) as T
}
