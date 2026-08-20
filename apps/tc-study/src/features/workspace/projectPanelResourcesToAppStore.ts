/**
 * One-way workspace → AppStore projector (Unlock 3 sealed CQRS).
 *
 * SoT for panel membership is `workspaceStore`. `useAppStore.loadedResources`
 * is a **read model** of panel `resourceKeys` for viewers — never the layout SoT.
 * Membership upsert/prune goes through {@link ./appStoreMembership} only
 * (not public AppStore actions).
 *
 * Instance ids (`resourceKey#N`) are resolved here: panel keys are storage ids;
 * content lookup uses the base key against `workspace.resources`.
 *
 * Prune policy: only remove AppStore entries listed in `pruneKeys` that are no
 * longer referenced by any panel. Modal-only / pre-assign package entries never
 * create AppStore membership until assigned (see `resourceMutations.addResource`).
 */

import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import {
  removeLoadedResourceMembership,
  upsertLoadedResourceMembership,
} from './appStoreMembership'

export interface PanelLike {
  resourceKeys: string[]
}

/**
 * Strip instance suffix: `owner/lang/ult#2` → `owner/lang/ult`
 */
export function getBaseResourceKey(instanceId: string): string {
  return instanceId.replace(/#\d+$/, '')
}

/** Existing panel membership for this resource (base or `#N` instance). */
export function existingPanelInstanceId(
  resourceKeys: string[] | undefined,
  resourceKey: string
): string | undefined {
  const base = getBaseResourceKey(resourceKey)
  return (resourceKeys ?? []).find((k) => getBaseResourceKey(k) === base)
}

/**
 * Next instance id for a base key among existing ids (panel + AppStore).
 * First instance has no suffix; further instances use `#2`, `#3`, …
 */
export function generateInstanceId(baseResourceKey: string, existingIds: Iterable<string>): string {
  const escaped = baseResourceKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const instancePattern = new RegExp(`^${escaped}(#\\d+)?$`)
  const existingInstances = [...existingIds].filter((id) => instancePattern.test(id))

  if (existingInstances.length === 0) {
    return baseResourceKey
  }

  const instanceNumbers = existingInstances.map((id) => {
    const match = id.match(/#(\d+)$/)
    return match ? parseInt(match[1], 10) : 1
  })

  const nextNumber = Math.max(...instanceNumbers) + 1
  return `${baseResourceKey}#${nextNumber}`
}

export function collectPanelResourceKeys(panels: PanelLike[]): Set<string> {
  const keys = new Set<string>()
  for (const panel of panels) {
    for (const key of panel.resourceKeys || []) {
      if (key) keys.add(key)
    }
  }
  return keys
}

export function buildProjectedResourceInstance(
  panelResourceKey: string,
  resources: Map<string, ResourceInfo> | Record<string, ResourceInfo>,
  existing?: ResourceInfo
): ResourceInfo | null {
  const baseKey = getBaseResourceKey(panelResourceKey)
  const base =
    resources instanceof Map ? resources.get(baseKey) : resources[baseKey]
  if (!base) return null

  return {
    ...base,
    ...(existing?.toc !== undefined ? { toc: existing.toc } : {}),
    ...(existing?.verifiedIngredients !== undefined
      ? { verifiedIngredients: existing.verifiedIngredients }
      : {}),
    ...(existing?.verifiedRef !== undefined ? { verifiedRef: existing.verifiedRef } : {}),
    id: panelResourceKey,
    key: baseKey,
  }
}

/** Skip AppStore upsert when projection would not change membership/runtime fields. */
export function membershipProjectionUnchanged(
  existing: ResourceInfo | undefined,
  instance: ResourceInfo
): boolean {
  if (!existing) return false
  return (
    existing.id === instance.id &&
    existing.key === instance.key &&
    existing.title === instance.title &&
    existing.owner === instance.owner &&
    existing.language === instance.language &&
    existing.toc === instance.toc &&
    existing.verifiedIngredients === instance.verifiedIngredients &&
    existing.verifiedRef === instance.verifiedRef &&
    // CombinedHelps TN/TWL pointers update after Unlock 1 strips raw tabs from the panel.
    existing.helpsTnResourceKey === instance.helpsTnResourceKey &&
    existing.helpsTwlResourceKey === instance.helpsTwlResourceKey &&
    JSON.stringify(existing.consumedKeys) === JSON.stringify(instance.consumedKeys)
  )
}

export interface ProjectPanelResourcesResult {
  projected: string[]
  missing: string[]
  pruned: string[]
}

/**
 * Upsert every panel resourceKey into `useAppStore.loadedResources`.
 * Optionally prune keys that left all panels (see module prune policy).
 */
export function projectPanelResourcesToAppStore(options: {
  panels: PanelLike[]
  resources: Map<string, ResourceInfo> | Record<string, ResourceInfo>
  /** Keys to remove from AppStore if no longer on any panel */
  pruneKeys?: Iterable<string>
}): ProjectPanelResourcesResult {
  const panelKeys = collectPanelResourceKeys(options.panels)
  const app = useAppStore.getState()
  const projected: string[] = []
  const missing: string[] = []

  for (const panelKey of panelKeys) {
    const existing = app.loadedResources[panelKey]
    const instance = buildProjectedResourceInstance(
      panelKey,
      options.resources,
      existing
    )
    if (!instance) {
      missing.push(panelKey)
      continue
    }
    if (!membershipProjectionUnchanged(existing, instance)) {
      upsertLoadedResourceMembership(instance)
    }
    projected.push(panelKey)
  }

  const pruned: string[] = []
  if (options.pruneKeys) {
    for (const key of options.pruneKeys) {
      if (!key || panelKeys.has(key)) continue
      if (useAppStore.getState().loadedResources[key]) {
        removeLoadedResourceMembership(key)
        pruned.push(key)
      }
    }
  }

  return { projected, missing, pruned }
}
