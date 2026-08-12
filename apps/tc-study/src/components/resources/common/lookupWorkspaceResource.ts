import type { ResourceInfo } from '../../../contexts/types'
import { mergeResourceInfoDocs } from './enrichResourceInfoDocs'

function lookupLoadedResource(
  loadedResources: Record<string, ResourceInfo | undefined>,
  key: string
): ResourceInfo | undefined {
  if (!key) return undefined
  return (
    loadedResources[key] ??
    Object.values(loadedResources).find((r) => r?.key === key || r?.id === key)
  )
}

/**
 * Resolve a workspace resource by key from the package map and/or AppStore
 * loadedResources. Prefer the package map (SoT for helps/deps pointers that may
 * be stripped from panel keys), then hydrate missing README/description/license
 * from loadedResources when present.
 */
export function lookupWorkspaceResource(
  key: string,
  packageResources: Map<string, ResourceInfo> | Record<string, ResourceInfo> | undefined,
  loadedResources: Record<string, ResourceInfo | undefined>
): ResourceInfo | undefined {
  if (!key) return undefined
  let fromPackage: ResourceInfo | undefined
  if (packageResources) {
    fromPackage =
      packageResources instanceof Map ? packageResources.get(key) : packageResources[key]
    if (!fromPackage) {
      if (packageResources instanceof Map) {
        for (const r of packageResources.values()) {
          if (r?.key === key || r?.id === key) {
            fromPackage = r
            break
          }
        }
      } else {
        fromPackage = Object.values(packageResources).find((r) => r?.key === key || r?.id === key)
      }
    }
  }
  const fromLoaded = lookupLoadedResource(loadedResources, key)
  if (fromPackage) return mergeResourceInfoDocs(fromPackage, fromLoaded)
  return fromLoaded
}
