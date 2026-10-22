/**
 * Every place a download is confirmed complete (the run, the worker, the manager) records the
 * release's per-book blob shas through this one step, so the paths cannot drift apart.
 */

import { recordBookBlobs } from '@bt-synergy/resource-catalog'

type BlobRecorderArgs = Parameters<typeof recordBookBlobs>[0]

export async function recordBlobsAfterComplete(o: {
  /** The resource was just verified complete, or was found complete already. */
  complete: boolean
  /** Typed `unknown` by the download stores; `recordBookBlobs` checks for `fetchRepoTreeBlobs` itself. */
  door43Client: unknown
  catalogAdapter: BlobRecorderArgs['catalogAdapter']
  resourceKey: string
}): Promise<Awaited<ReturnType<typeof recordBookBlobs>> | 'incomplete'> {
  if (!o.complete) return 'incomplete'
  // Never throws: a Door43 hiccup must not turn a finished download into a failed one.
  const outcome = await recordBookBlobs({
    door43Client: o.door43Client as BlobRecorderArgs['door43Client'],
    catalogAdapter: o.catalogAdapter,
    resourceKey: o.resourceKey,
  })
  console.log(`[download] book blobs for ${o.resourceKey}: ${outcome}`)
  return outcome
}
