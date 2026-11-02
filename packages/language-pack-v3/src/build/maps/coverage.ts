import type { Coverage } from '../../codec/counts'
import type { ResourceRef } from '../../source/rows'

/** The books of each resource, as `whole`, or as `partial` for a bridged pack. */
export function coverageOf(refs: ResourceRef[], partial: boolean): Coverage {
  const out: Coverage = new Map()
  for (const ref of refs) out.set(ref.key, partial ? { whole: [], partial: [...ref.books] } : { whole: [...ref.books], partial: [] })
  return out
}
