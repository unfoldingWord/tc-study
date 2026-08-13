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
  existingPanelInstanceId,
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

/**
 * Keep only the original that matches `bookCode` on each scripture panel.
 * Dual panes get distinct instance ids (`ugnt` vs `ugnt#2`).
 */
export function syncOriginalLanguageOnScripturePanels(options: {
  bookCode: string
  scripturePanelIds: readonly ReadPanelId[]
}): string[] {
  const keepKey = originalLanguageKeyForBook(options.bookCode)
  const spec = keepKey ? specForOriginalLanguageKey(keepKey) : undefined
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg || options.scripturePanelIds.length === 0) return []

  const pruneKeys = new Set<string>()
  useWorkspaceStore.setState((state) => {
    if (!state.currentPackage) return
    if (spec && keepKey && !state.currentPackage.resources.has(keepKey)) {
      state.currentPackage.resources.set(keepKey, buildOriginalLanguageResourceInfo(spec))
    }
    const existingIds = new Set([
      ...Object.keys(useAppStore.getState().loadedResources),
      ...collectPanelResourceKeys(state.currentPackage.panels),
    ])

    for (const panelId of options.scripturePanelIds) {
      const panel = state.currentPackage.panels.find((p) => p.id === panelId)
      if (!panel) continue
      const next: string[] = []
      for (const key of panel.resourceKeys) {
        if (!isOriginalLanguagePanelKey(key)) {
          next.push(key)
          continue
        }
        if (keepKey && getBaseResourceKey(key) === keepKey) {
          next.push(key)
        } else {
          pruneKeys.add(key)
        }
      }
      if (keepKey && !existingPanelInstanceId(next, keepKey)) {
        const instanceId = generateInstanceId(keepKey, existingIds)
        existingIds.add(instanceId)
        next.push(instanceId)
      }
      panel.resourceKeys = next
      if (panel.activeIndex >= next.length) {
        panel.activeIndex = Math.max(0, next.length - 1)
      }
    }
    state.isPackageModified = true
  })

  projectCurrentWorkspacePanels({ pruneKeys })
  return keepKey ? [keepKey] : []
}
