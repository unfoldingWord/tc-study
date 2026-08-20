/**
 * Book-scoped UGNT/UHB membership on scripture panels.
 * Batched (not per-key remove) so CombinedHelps reconcile cannot clobber tabs.
 */

import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
  collectPanelResourceKeys,
  generateInstanceId,
  getBaseResourceKey,
} from '../workspace/projectPanelResourcesToAppStore'
import { projectCurrentWorkspacePanels } from '../workspace/resourceMutations'
import {
  isOriginalLanguagePanelKey,
  originalLanguageKeyForBook,
  originalLanguageResourceKey,
  specForOriginalLanguageKey,
  type OriginalLanguageSpec,
} from './originalLanguageForBook'
import type { ReadPanelId } from './readPanelModel'

export function buildOriginalLanguageResourceInfo(spec: OriginalLanguageSpec): ResourceInfo {
  const resourceKey = originalLanguageResourceKey(spec)
  return {
    id: resourceKey,
    key: resourceKey,
    resourceKey: resourceKey,
    title: spec.label,
    type: ResourceType.SCRIPTURE,
    category: 'Bible',
    subject: spec.subject,
    owner: 'unfoldingWord',
    language: spec.lang,
    languageCode: spec.lang,
    languageName: spec.label,
    resourceId: spec.id,
    server: 'git.door43.org',
    format: ResourceFormat.USFM,
    contentType: 'text/usfm',
    contentStructure: 'book',
    version: '1.0',
    availability: { online: true, offline: false, bundled: false, partial: false },
    locations: [],
    catalogedAt: new Date().toISOString(),
    appliesToScope: 'scripture',
  }
}

export function panelKeysAndActiveEqual(
  currentKeys: readonly string[],
  nextKeys: readonly string[],
  currentActive: number,
  nextActive: number
): boolean {
  return (
    currentActive === nextActive &&
    currentKeys.length === nextKeys.length &&
    currentKeys.every((key, i) => key === nextKeys[i])
  )
}

/**
 * Keep only the original that matches `bookCode` on each scripture panel.
 * Dual panes get distinct instance ids (`ugnt` vs `ugnt#2`).
 * Matching OL is always appended (never left at index 0 / prepended).
 * No-ops when membership and active index are already correct.
 */
export function syncOriginalLanguageOnScripturePanels(options: {
  bookCode: string
  scripturePanelIds: readonly ReadPanelId[]
}): string[] {
  const keepKey = originalLanguageKeyForBook(options.bookCode)
  const spec = keepKey ? specForOriginalLanguageKey(keepKey) : undefined
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg || options.scripturePanelIds.length === 0) return []

  const needsResource = Boolean(spec && keepKey && !pkg.resources.has(keepKey))
  const pruneKeys = new Set<string>()
  const existingIds = new Set([
    ...Object.keys(useAppStore.getState().loadedResources),
    ...collectPanelResourceKeys(pkg.panels),
  ])
  const planned: Array<{ panelId: ReadPanelId; next: string[]; nextActive: number }> = []
  for (const panelId of options.scripturePanelIds) {
    const panel = pkg.panels.find((p) => p.id === panelId)
    if (!panel) continue
    const prevActiveKey = panel.resourceKeys[panel.activeIndex]
    const next: string[] = []
    let keptOl: string | undefined
    for (const key of panel.resourceKeys) {
      if (!isOriginalLanguagePanelKey(key)) {
        next.push(key)
        continue
      }
      if (keepKey && getBaseResourceKey(key) === keepKey && !keptOl) {
        keptOl = key
      } else {
        pruneKeys.add(key)
      }
    }
    if (keepKey) {
      if (keptOl) {
        next.push(keptOl)
      } else {
        const instanceId = generateInstanceId(keepKey, existingIds)
        existingIds.add(instanceId)
        next.push(instanceId)
      }
    }
    const moved = prevActiveKey ? next.indexOf(prevActiveKey) : -1
    const nextActive =
      moved >= 0 ? moved : panel.activeIndex >= next.length ? Math.max(0, next.length - 1) : panel.activeIndex
    if (!panelKeysAndActiveEqual(panel.resourceKeys, next, panel.activeIndex, nextActive)) {
      planned.push({ panelId, next, nextActive })
    }
  }

  if (!needsResource && planned.length === 0) {
    return keepKey ? [keepKey] : []
  }

  useWorkspaceStore.setState((state) => {
    if (!state.currentPackage) return
    if (spec && keepKey && !state.currentPackage.resources.has(keepKey)) {
      state.currentPackage.resources.set(keepKey, buildOriginalLanguageResourceInfo(spec))
    }
    for (const { panelId, next, nextActive } of planned) {
      const panel = state.currentPackage.panels.find((p) => p.id === panelId)
      if (!panel) continue
      panel.resourceKeys = next
      panel.activeIndex = nextActive
    }
    state.isPackageModified = true
  })

  projectCurrentWorkspacePanels({ pruneKeys })
  return keepKey ? [keepKey] : []
}
