/**
 * Run a preparer for one book: write nav + light/full for each unit.
 */

import {
  writePreparedNav,
  writePreparedUnit,
} from './prepareCache'
import {
  getPreparer,
  type PrepareCacheAdapter,
  type PrepareContext,
} from './prepareRegistry'

export async function prepareBookWithPreparer(args: {
  typeId: string
  resourceKey: string
  bookId: string
  cacheAdapter: PrepareCacheAdapter
  /** When the download path already holds the source, skip readSource. */
  source?: unknown
  units?: Array<string | number>
  tiers?: Array<'light' | 'full'>
}): Promise<{ unitsWritten: number }> {
  const preparer = getPreparer(args.typeId)
  if (!preparer) {
    throw new Error(`No preparer registered for ${args.typeId}`)
  }
  const ctx: PrepareContext = { cacheAdapter: args.cacheAdapter }
  const source =
    args.source ??
    (await preparer.readSource(ctx, args.resourceKey, args.bookId))
  if (source == null) {
    return { unitsWritten: 0 }
  }

  if (preparer.prepareNav) {
    const nav = preparer.prepareNav(source)
    await writePreparedNav(
      args.cacheAdapter,
      args.typeId,
      args.resourceKey,
      args.bookId,
      preparer.version,
      nav
    )
  }

  const units = args.units ?? preparer.unitsFor(source)
  const tiers = args.tiers ?? (['light', 'full'] as const)
  let unitsWritten = 0
  for (const unit of units) {
    for (const tier of tiers) {
      const payload =
        tier === 'light'
          ? preparer.prepareLight(source, unit)
          : preparer.prepareFull(source, unit)
      await writePreparedUnit(
        args.cacheAdapter,
        args.typeId,
        args.resourceKey,
        args.bookId,
        unit,
        tier,
        preparer.version,
        payload
      )
    }
    unitsWritten += 1
  }
  return { unitsWritten }
}
