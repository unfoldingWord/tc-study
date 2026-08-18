/**
 * Dual-read persist: existing panel.resourceKeys → PanelEntryInstance[].
 *
 * composition persist ids → composition entry
 * scripture / TQ keys → 1:1 pane-member entries
 * TN/TWL keys have no pane-member — CombinedHelps inject owns those bindings
 *
 * CombinedHelps persist strings may remain as instanceId.
 */

import type { PanelEntryDefinition, PanelEntryInstance } from '@bt-synergy/resource-types'
import type { ResourceInfo } from '../../contexts/types'
import {
  compositionBaseKey,
  findConsumedKeys,
  resolveResourceTypeForKey,
  resourceMatchesConsumedType,
} from '../helps/compositionInjection'
import { getActivePanelEntryRegistry } from '../../resourceTypes/activeRegistry'
import { normalizeResourceTypeId } from '../../utils/normalizeResourceTypeId'

export function migrateResourceKeysToEntries(options: {
  resourceKeys: string[]
  resources: Map<string, ResourceInfo>
  languageCode?: string
  entries?: PanelEntryDefinition[]
}): PanelEntryInstance[] {
  const registry = getActivePanelEntryRegistry()
  const defs = options.entries ?? registry?.getAll() ?? []
  if (defs.length === 0) return []

  const compositions = defs.filter((d) => d.kind === 'composition')
  const paneMembers = defs.filter((d) => d.kind === 'pane-member')
  const instances: PanelEntryInstance[] = []
  const usedKeys = new Set<string>()

  for (const key of options.resourceKeys) {
    const composition = compositions.find((c) => c.persistId && matchPersist(key, c.persistId))
    if (!composition) continue
    const existing = options.resources.get(key) ?? options.resources.get(compositionBaseKey(key))
    const bindings =
      existing?.consumedKeys && Object.keys(existing.consumedKeys).length > 0
        ? { ...existing.consumedKeys }
        : findConsumedKeys(options.resources.values(), composition.consumes, {
            langCode: options.languageCode || existing?.languageCode || existing?.language,
          })
    instances.push({
      instanceId: key,
      entryId: composition.id,
      bindings,
    })
    usedKeys.add(key)
    for (const bound of Object.values(bindings)) {
      if (bound) usedKeys.add(bound)
    }
  }

  const leftover = options.resourceKeys.filter((k) => !usedKeys.has(k))
  for (const key of leftover) {
    const type = resolveResourceTypeForKey(options.resources, key)
    const paneMember = paneMembers.find((m) =>
      m.consumes.some((id) => resourceMatchesConsumedType(type, id))
    )
    if (!paneMember) continue
    const typeId =
      paneMember.consumes.find((id) => resourceMatchesConsumedType(type, id)) ?? paneMember.consumes[0]!
    instances.push({
      instanceId: key,
      entryId: paneMember.id,
      bindings: { [typeId]: compositionBaseKey(key) },
    })
  }

  return instances
}

/** When entries already exist, still convert leftover resourceKeys (assign / mode-switch). */
export function mergeResourceKeysIntoEntries(options: {
  existing: PanelEntryInstance[] | undefined
  resourceKeys: string[]
  resources: Map<string, ResourceInfo>
  languageCode?: string
  entries?: PanelEntryDefinition[]
}): PanelEntryInstance[] {
  const current = options.existing
    ? options.existing.map((e) => ({ ...e, bindings: { ...e.bindings } }))
    : []
  if (current.length === 0) {
    return migrateResourceKeysToEntries({
      resourceKeys: options.resourceKeys,
      resources: options.resources,
      languageCode: options.languageCode,
      entries: options.entries,
    })
  }

  const claimed = new Set<string>()
  for (const inst of current) {
    claimed.add(inst.instanceId)
    for (const bound of Object.values(inst.bindings)) {
      if (bound) claimed.add(bound)
    }
  }
  const leftover = options.resourceKeys.filter((k) => !claimed.has(k))
  if (leftover.length === 0) return current

  const extra = migrateResourceKeysToEntries({
    resourceKeys: leftover,
    resources: options.resources,
    languageCode: options.languageCode,
    entries: options.entries,
  })
  const have = new Set(current.map((e) => e.instanceId))
  for (const inst of extra) {
    if (have.has(inst.instanceId)) continue
    current.push(inst)
    have.add(inst.instanceId)
  }
  return current
}

function matchPersist(key: string, persistId: string): boolean {
  return key === persistId || key.startsWith(`${persistId}:`)
}

export function paintedKeysFromEntries(entries: PanelEntryInstance[]): string[] {
  return entries.map((e) => e.instanceId)
}

export function dropSyntheticCatalogRows(
  resources: Map<string, ResourceInfo>,
  entries: PanelEntryDefinition[]
): void {
  for (const def of entries) {
    if (def.kind !== 'composition' || !def.persistId) continue
    for (const key of [...resources.keys()]) {
      if (key === def.persistId || key.startsWith(`${def.persistId}:`)) {
        resources.delete(key)
      }
    }
  }
}

export function normalizeResourceTypeForEntry(type: string | undefined): string {
  return normalizeResourceTypeId(type) || String(type || '')
}
