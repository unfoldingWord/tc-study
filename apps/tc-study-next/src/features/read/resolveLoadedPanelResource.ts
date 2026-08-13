/**
 * Panel instance ids (`ult#2`) share content with the base key (`ult`).
 */

import type { ResourceInfo } from '../../contexts/types'
import { getBaseResourceKey } from '../workspace/projectPanelResourcesToAppStore'

export function resolveLoadedPanelResource(
  loaded: Record<string, ResourceInfo | undefined>,
  resourceId: string
): ResourceInfo | undefined {
  const direct = loaded[resourceId]
  if (direct) return direct
  const baseKey = getBaseResourceKey(resourceId)
  if (!baseKey || baseKey === resourceId) return undefined
  const base = loaded[baseKey]
  if (!base) return undefined
  return {
    ...base,
    id: resourceId,
    key: base.key || baseKey,
  }
}
