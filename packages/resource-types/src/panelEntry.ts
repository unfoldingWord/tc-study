/**
 * Panel entries — what may appear in a pane.
 *
 * Dual-register to paint: a resource shows in the switcher only if it is a
 * catalog resource AND a pane-member (or composition) entry consumes it.
 * Registration ≠ automatic membership.
 *
 * Shared consume: two entries may bind the same resource type id.
 * Do not use exclusive as a consume lock. Paint entry instances, not raw keys.
 */

import type { ComponentType } from 'react'
import type { ResourceViewerProps } from './base-types'
import type { PlatformViewers } from './types'

/** Bible vs OBS reading group. URL {bible|obs} stays nav, not a panel mode. */
export type PanelEntryScope = 'scripture' | 'obs'

/** When to inject a composition entry instance from consumed package resources. */
export type PanelEntryInjectWhen = 'any' | 'all'

/**
 * Entry type used by PanelModeRegistry allowlists.
 * Read today: scripture allows `primary-text`; helps allows `helps`.
 */
export type PanelEntryType = 'primary-text' | 'helps'

/**
 * pane-member: 1:1 (or N:1) paint of a consumed resource (scripture, TQ).
 * composition: multi-consume viewer (CombinedHelps). Same type `helps` as TQ.
 */
export type PanelEntryKind = 'pane-member' | 'composition'

/**
 * Persisted pane membership. Package map stays catalog ResourceInfo only.
 * Bindings map resource type id → catalog resource key.
 */
export interface PanelEntryInstance {
  instanceId: string
  entryId: string
  bindings: Partial<Record<string, string>>
}

export interface PanelEntryDefinition {
  id: string
  displayName: string
  icon?: string
  kind: PanelEntryKind
  entryType: PanelEntryType
  /** Registered resource type ids this entry consumes */
  consumes: readonly string[]
  /**
   * Composition inject: any vs all consumed types present in the package.
   * Required for kind === 'composition'. Ignored for pane-members.
   */
  injectWhen?: PanelEntryInjectWhen
  /**
   * Panel viewer. Required for compositions. Pane-members may omit and use
   * the consumed resource type's viewer (viewer ≠ paint signal).
   */
  viewer?: ComponentType<ResourceViewerProps> | PlatformViewers
  /** Workspace group (scripture vs obs). Not a panel mode. */
  groupId?: string
  /** @deprecated Prefer groupId. Kept for one-wave availability subjects. */
  scope?: PanelEntryScope
  /**
   * Stable persist / instance-id base (e.g. '__combined-helps__').
   * Required for compositions. Unscoped on the default helps pane; `:panel-N` elsewhere.
   */
  persistId?: string
}

export function definePanelEntry(definition: PanelEntryDefinition): PanelEntryDefinition {
  if (!definition.id) {
    throw new Error('Panel entry definition must have an id')
  }
  if (!definition.displayName) {
    throw new Error('Panel entry definition must have a displayName')
  }
  if (definition.kind !== 'pane-member' && definition.kind !== 'composition') {
    throw new Error('Panel entry definition must have kind "pane-member" or "composition"')
  }
  if (definition.entryType !== 'primary-text' && definition.entryType !== 'helps') {
    throw new Error('Panel entry definition must have entryType "primary-text" or "helps"')
  }
  if (!definition.consumes || definition.consumes.length === 0) {
    throw new Error('Panel entry definition must consume at least one resource type')
  }

  if (definition.kind === 'composition') {
    if (!definition.viewer) {
      throw new Error(`Composition entry '${definition.id}' must have a viewer`)
    }
    if (!definition.persistId) {
      throw new Error(`Composition entry '${definition.id}' must have a persistId`)
    }
    if (definition.injectWhen !== 'any' && definition.injectWhen !== 'all') {
      throw new Error(`Composition entry '${definition.id}' must have injectWhen of "any" or "all"`)
    }
  }

  const extras = definition as PanelEntryDefinition & {
    subjects?: unknown
    loader?: unknown
    exclusive?: unknown
    hideConsumed?: unknown
  }
  if (extras.subjects != null) {
    throw new Error('Panel entry definition must not have subjects')
  }
  if (extras.loader != null) {
    throw new Error('Panel entry definition must not have a loader')
  }

  return definition
}

/** Persist-id match. Colon suffix is OBS-safe: `__combined-helps-obs__` ≠ `__combined-helps__:`. */
export function matchesEntryPersistId(key: string, persistId: string): boolean {
  return key === persistId || key.startsWith(`${persistId}:`)
}
