/**
 * The stamps a helps-quote / helps-align key carries for one book, read from the catalog.
 *
 * They must be exactly what the warm planner computes (resolveWarmStamps in resource-pipeline's warm/warmStamps.ts):
 * warm GC collects every row whose key does not carry the current per-book stamps, so a hook that keyed by another
 * stamp would see its rows deleted and rebuilt in a loop.
 */

import type { BookStampSource } from '@bt-synergy/resource-catalog'
import { targetBookStamp } from './helpsAlignCache'
import { helpsBookStamp, olBookStamp } from './helpsQuoteCache'

type StampCatalog = { getResourceMetadata: (key: string) => Promise<unknown> }

export async function readHelpsBookStamps(
  catalog: StampCatalog,
  args: { helpsKey: string; olKey: string; targetKey?: string; bookCode: string }
): Promise<{ helpsStamp: string; olStamp: string; targetStamp?: string }> {
  const read = async (key: string) => (await catalog.getResourceMetadata(key)) as BookStampSource | null
  const helpsMeta = await read(args.helpsKey)
  const olMeta = await read(args.olKey)
  const stamps = {
    helpsStamp: helpsBookStamp(helpsMeta, args.bookCode),
    olStamp: olBookStamp(olMeta, args.bookCode),
  }
  if (args.targetKey === undefined) return stamps
  return { ...stamps, targetStamp: targetBookStamp(await read(args.targetKey), args.bookCode) }
}
