import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import type { PanelConfig } from '../../lib/stores/workspaceStore'
import { projectCurrentWorkspacePanels } from '../workspace/resourceMutations'
import {
  compositionsAlreadyConsistent,
  compositionsForEnsure,
  matchesCompositionPersistId,
  membershipFingerprint,
  packageEnsureInputFingerprint,
} from './ensureCompositions'
import { ensureCombinedHelpsInWorkspace } from './ensureCombinedHelps'
import type { WorkspacePanelLike } from './ensureCombinedHelps'

let lastInputFingerprint = ''

/** Test-only: clear same-turn skip so a fresh apply can run. */
export function resetApplyEnsureFingerprint(): void {
  lastInputFingerprint = ''
}

/**
 * Sole store-facing CombinedHelps inject/reconcile for Read bootstrap (and any
 * caller that needs ensure + one-way AppStore projection).
 *
 * Runs {@link ensureCombinedHelpsInWorkspace} against the current workspace
 * package, writes panels/resources back, then projects all panel keys into
 * AppStore (pruning reconciled-away CombinedHelps ids).
 *
 * Skips ensure (no clone / findConsumedKeys / synthesize) when a cheap
 * pre-fingerprint matches the last apply, or when membership is already
 * consistent. No-op writes: no setState, no new catalogedAt, no remount.
 */
export function applyCombinedHelpsEnsure(
  languageCode?: string,
  panelId?: string,
  options?: { forceHelpsPanel?: boolean }
): string[] {
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg) return []

  const optionKey = {
    languageCode,
    panelId,
    forceHelpsPanel: options?.forceHelpsPanel,
  }
  const currentFp = packageEnsureInputFingerprint(pkg, optionKey)
  if (currentFp === lastInputFingerprint) {
    return paintedCompositionIds(pkg.panels)
  }

  if (
    compositionsAlreadyConsistent({
      resources: pkg.resources,
      panels: pkg.panels,
      languageCode,
      panelId,
      forceHelpsPanel: options?.forceHelpsPanel,
    })
  ) {
    lastInputFingerprint = currentFp
    return paintedCompositionIds(pkg.panels)
  }

  const before = membershipFingerprint(pkg.panels)
  const ensured = ensureCombinedHelpsInWorkspace({
    resources: pkg.resources,
    panels: pkg.panels,
    languageCode,
    panelId,
    forceHelpsPanel: options?.forceHelpsPanel,
  })

  lastInputFingerprint = packageEnsureInputFingerprint(
    { resources: ensured.resources, panels: ensured.panels },
    optionKey
  )

  if (
    ensured.injected.length === 0 &&
    ensured.removed.length === 0 &&
    membershipFingerprint(ensured.panels) === before
  ) {
    return paintedCompositionIds(pkg.panels)
  }

  useWorkspaceStore.setState((state) => {
    if (!state.currentPackage) return
    state.currentPackage.resources = ensured.resources
    state.currentPackage.panels = ensured.panels as PanelConfig[]
    state.isPackageModified = true
  })

  projectCurrentWorkspacePanels({
    pruneKeys: ensured.removed,
  })

  if (ensured.injected.length > 0) return ensured.injected
  return paintedCompositionIds(ensured.panels)
}

function paintedCompositionIds(panels: WorkspacePanelLike[]): string[] {
  const compositions = compositionsForEnsure()
  const painted = panels.flatMap((p) => p.entries?.map((e) => e.instanceId) ?? p.resourceKeys)
  return painted.filter((id) =>
    compositions.some((c) => c.persistId && matchesCompositionPersistId(id, c.persistId))
  )
}
