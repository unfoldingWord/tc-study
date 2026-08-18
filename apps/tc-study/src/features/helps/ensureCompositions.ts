/**
 * Ensure panel entry instances exist when consumed types are present.
 * CombinedHelps is one composition entry — it does not auto-add TN/TWL 1:1 entries.
 *
 * Membership SoT is panel.entries. resourceKeys is a painted projection of instance ids.
 * Package map stays catalog ResourceInfo only.
 *
 * Persist-id scoping: default helps pane unscoped; other panes `:panel-N`.
 * N-pane groups will use group+panel ids later. This file takes panelId: string.
 */

import type { PanelEntryDefinition, PanelEntryInstance } from '@bt-synergy/resource-types'
import type { ResourceInfo } from '../../contexts/types'
import {
  getActivePanelEntryRegistry,
} from '../../resourceTypes/activeRegistry'
import { defaultDestPanelIdForTarget } from '../read/readPanelModel'
import { applyDualScopeHelpsPolicy } from './helpsPanelPolicy'
import {
  dropSyntheticCatalogRows,
  mergeResourceKeysIntoEntries,
} from '../workspace/migratePanelEntries'
import {
  compositionBaseKey,
  findConsumedKeys,
  resolveResourceTypeForKey,
  resourceMatchesConsumedType,
  shouldInjectComposition,
  synthesizeEntryResourceInfo,
  type CompositionEnsureSpec,
} from './compositionInjection'

export type { CompositionEnsureSpec }

export interface WorkspacePanelLike {
  id: string
  resourceKeys: string[]
  activeIndex: number
  entries?: PanelEntryInstance[]
}

/** App policy: Read default helps pane. Not registry policy. */
export function defaultHelpsPanelId(): string {
  return defaultDestPanelIdForTarget('helps')
}

/**
 * Instance ids: unscoped on the default helps pane so existing bootstrap stays green;
 * others `:panel-N`. Documented for later group+panel ids.
 */
export function entryInstanceIdForPanel(persistId: string, panelId: string): string {
  const defaultId = defaultHelpsPanelId()
  return !panelId || panelId === defaultId ? persistId : `${persistId}:${panelId}`
}

/** Original-language codes must never drive composition pair selection. */
const ORIGINAL_LANG_CODES = new Set(['el-x-koine', 'hbo', 'und', ''])

export function compositionsForEnsure(
  override?: CompositionEnsureSpec[]
): CompositionEnsureSpec[] {
  if (override && override.length > 0) return override
  return getActivePanelEntryRegistry()?.getCompositions() ?? []
}

export function panelEntriesForEnsure(
  override?: PanelEntryDefinition[]
): PanelEntryDefinition[] {
  if (override && override.length > 0) return override
  return getActivePanelEntryRegistry()?.getAll() ?? []
}

/** Test-only: increments only when maps are cloned / synthesize runs. */
export const ensureCompositionsWork = {
  runs: 0,
  reset() {
    this.runs = 0
  },
}

export function membershipFingerprint(panels: WorkspacePanelLike[]): string {
  return panels
    .map((p) => {
      const keys = (p.resourceKeys ?? []).join(',')
      const entries = (p.entries ?? [])
        .map((e) => {
          const bindings = Object.entries(e.bindings ?? {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(',')
          return `${e.instanceId}:${e.entryId}:{${bindings}}`
        })
        .join('|')
      return `${p.id}[${keys}]{${entries}}`
    })
    .join(';')
}

export function resourceInventoryFingerprint(
  resources: Map<string, ResourceInfo> | Record<string, ResourceInfo>
): string {
  const entries =
    resources instanceof Map ? [...resources.entries()] : Object.entries(resources)
  return entries
    .map(([k, r]) => `${k}:${String(r.type ?? '')}:${r.languageCode || r.language || ''}`)
    .sort()
    .join('|')
}

export function packageEnsureInputFingerprint(
  pkg: {
    resources: Map<string, ResourceInfo> | Record<string, ResourceInfo>
    panels: WorkspacePanelLike[]
  },
  options?: { languageCode?: string; panelId?: string; forceHelpsPanel?: boolean }
): string {
  const compositionIds = compositionsForEnsure()
    .map((c) => c.persistId ?? c.id)
    .sort()
    .join(',')
  return [
    compositionIds,
    options?.languageCode ?? '',
    options?.panelId ?? '',
    options?.forceHelpsPanel ? '1' : '0',
    membershipFingerprint(pkg.panels),
    resourceInventoryFingerprint(pkg.resources),
  ].join('::')
}

function resourceHasPersistId(
  resources: Map<string, ResourceInfo>,
  persistId: string
): boolean {
  for (const key of resources.keys()) {
    if (matchesCompositionPersistId(key, persistId)) return true
  }
  return false
}

function bindingsFingerprint(bindings: Record<string, string> | undefined): string {
  return Object.entries(bindings ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',')
}

/**
 * Cheap "already consistent" check — no map clone / migrate / synthesize.
 * False when TN/TWL arrived and CombinedHelps is missing, or registry just bound.
 */
export function compositionsAlreadyConsistent(options: {
  resources: Map<string, ResourceInfo> | Record<string, ResourceInfo>
  panels: WorkspacePanelLike[]
  languageCode?: string
  panelId?: string
  forceHelpsPanel?: boolean
  compositions?: CompositionEnsureSpec[]
  panelEntries?: PanelEntryDefinition[]
}): boolean {
  const resourceMap =
    options.resources instanceof Map
      ? options.resources
      : new Map(Object.entries(options.resources))
  const allEntries = panelEntriesForEnsure(options.panelEntries)
  const compositions = (options.compositions?.length
    ? options.compositions
    : allEntries.filter((e) => e.kind === 'composition')) as CompositionEnsureSpec[]

  if (allEntries.length === 0 && compositions.length === 0) return true

  for (const panel of options.panels) {
    const keys = panel.resourceKeys ?? []
    const entries = panel.entries
    if (!entries) {
      if (keys.length > 0) return false
      continue
    }
    if (entries.length !== keys.length) return false
    if (entries.some((e, i) => e.instanceId !== keys[i])) return false
  }

  const requested = normalizeGatewayLang(options.languageCode)
  const langCode = requested || guessGatewayLanguage(resourceMap, options.panels, compositions)
  const targetPanelId = options.panelId || defaultHelpsPanelId()
  const helpsPanel =
    options.panels.find((p) => p.id === targetPanelId) ||
    options.panels.find((p) => p.id === defaultHelpsPanelId()) ||
    options.panels[1]
  const hasPrimary =
    Boolean(helpsPanel) && panelHasPrimaryTextEntries(helpsPanel!, resourceMap, allEntries)

  const allConsumes = [...new Set(compositions.flatMap((c) => c.consumes))]
  const inventory = findConsumedKeys(resourceMap.values(), allConsumes, { langCode })

  for (const composition of compositions) {
    if (!composition.persistId) continue
    const persistId = composition.persistId
    const id = entryInstanceIdForPanel(persistId, targetPanelId)
    const consumed: Partial<Record<string, string>> = {}
    for (const typeId of composition.consumes) {
      if (inventory[typeId]) consumed[typeId] = inventory[typeId]
    }
    const shouldInject = shouldInjectComposition(
      consumed,
      composition.consumes,
      composition.injectWhen ?? 'any'
    )
    const existing = (helpsPanel?.entries ?? []).find((e) => e.instanceId === id)
    const hadOnAny = options.panels.some((p) =>
      (p.entries ?? []).some((e) => e.instanceId === id)
    )

    if (!shouldInject) {
      if (hadOnAny) return false
      if (resourceHasPersistId(resourceMap, persistId)) return false
      continue
    }

    if (hasPrimary && !options.forceHelpsPanel) {
      if (existing) return false
      if (resourceHasPersistId(resourceMap, persistId)) return false
      continue
    }

    if (!helpsPanel || !existing) return false
    if (bindingsFingerprint(existing.bindings) !== bindingsFingerprint(consumed)) return false
    if (!resourceMap.has(id)) return false
  }

  return true
}

/**
 * Ensure composition + pane-member instances.
 * hideConsumed is not ownership — we paint entry instances, not raw consumed keys.
 */
export function ensureCompositions(options: {
  resources: Map<string, ResourceInfo> | Record<string, ResourceInfo>
  panels: WorkspacePanelLike[]
  languageCode?: string
  /** Default helps pane from Read layout config (panel-2 today). */
  panelId?: string
  forceHelpsPanel?: boolean
  compositions?: CompositionEnsureSpec[]
  panelEntries?: PanelEntryDefinition[]
}): {
  resources: Map<string, ResourceInfo>
  panels: WorkspacePanelLike[]
  injected: string[]
  removed: string[]
} {
  const sourceMap =
    options.resources instanceof Map
      ? options.resources
      : new Map(Object.entries(options.resources))

  if (compositionsAlreadyConsistent({ ...options, resources: sourceMap })) {
    return { resources: sourceMap, panels: options.panels, injected: [], removed: [] }
  }

  ensureCompositionsWork.runs += 1

  const resourceMap = new Map(sourceMap)

  const allEntries = panelEntriesForEnsure(options.panelEntries)
  const compositions = (options.compositions?.length
    ? options.compositions
    : allEntries.filter((e) => e.kind === 'composition')) as CompositionEnsureSpec[]

  const panels = options.panels.map((p) => ({
    ...p,
    resourceKeys: [...(p.resourceKeys || [])],
    entries: p.entries ? p.entries.map((e) => ({ ...e, bindings: { ...e.bindings } })) : undefined,
  }))

  if (allEntries.length === 0 && compositions.length === 0) {
    return { resources: resourceMap, panels, injected: [], removed: [] }
  }

  const requested = normalizeGatewayLang(options.languageCode)
  const langCode = requested || guessGatewayLanguage(resourceMap, panels, compositions)
  const injected: string[] = []
  const removed: string[] = []

  const targetPanelId = options.panelId || defaultHelpsPanelId()
  const helpsPanel =
    panels.find((p) => p.id === targetPanelId) ||
    panels.find((p) => p.id === defaultHelpsPanelId()) ||
    panels[1]

  for (const panel of panels) {
    panel.entries = mergeResourceKeysIntoEntries({
      existing: panel.entries,
      resourceKeys: panel.resourceKeys,
      resources: resourceMap,
      languageCode: langCode,
      entries: allEntries,
    })
  }

  dropSyntheticCatalogRows(resourceMap, allEntries)

  const previousActiveKey =
    helpsPanel && helpsPanel.resourceKeys.length > 0
      ? helpsPanel.resourceKeys[
          clampIndex(helpsPanel.activeIndex, helpsPanel.resourceKeys.length)
        ]
      : null

  for (const composition of compositions) {
    if (!composition.persistId) continue
    const persistId = composition.persistId
    const id = entryInstanceIdForPanel(persistId, targetPanelId)
    const consumedKeys = findConsumedKeys(resourceMap.values(), composition.consumes, {
      langCode,
    })

    if (!shouldInjectComposition(consumedKeys, composition.consumes, composition.injectWhen ?? 'any')) {
      const hadEntry = panels.some((p) => (p.entries ?? []).some((e) => e.instanceId === id))
      if (hadEntry) {
        for (const panel of panels) {
          panel.entries = (panel.entries ?? []).filter((e) => e.instanceId !== id)
        }
        removed.push(id)
      }
      continue
    }

    if (
      helpsPanel &&
      panelHasPrimaryTextEntries(helpsPanel, resourceMap, allEntries) &&
      !options.forceHelpsPanel
    ) {
      helpsPanel.entries = (helpsPanel.entries ?? []).filter((e) => e.instanceId !== id)
      continue
    }

    if (helpsPanel) {
      helpsPanel.entries = (helpsPanel.entries ?? []).filter(
        (e) => e.instanceId === id || !matchesCompositionPersistId(e.instanceId, persistId)
      )
      const existing = helpsPanel.entries.find((e) => e.instanceId === id)
      if (existing) {
        existing.bindings = { ...existing.bindings, ...consumedKeys }
      } else {
        const insertAt = (composition.groupId ?? composition.scope) === 'scripture' ? 0 : helpsPanel.entries.length
        helpsPanel.entries.splice(insertAt, 0, {
          instanceId: id,
          entryId: composition.id,
          bindings: consumedKeys,
        })
        injected.push(id)
      }
    }
  }

  for (const panel of panels) {
    panel.entries = dropUnpaintableConsumedKeys(panel.entries ?? [], allEntries, resourceMap)
    syncResourceKeysFromEntries(panel)
  }

  if (helpsPanel && !panelHasPrimaryTextEntries(helpsPanel, resourceMap, allEntries)) {
    normalizeCompositionEntryOrder(helpsPanel, compositions)
    syncResourceKeysFromEntries(helpsPanel)
    helpsPanel.activeIndex = resolvePanel2ActiveIndex({
      resourceKeys: helpsPanel.resourceKeys,
      resources: resourceMap,
      previousActiveKey,
    })
  }

  // Leftover adapter: CombinedHelpsViewer / AppStore still read a view ResourceInfo.
  // Not membership SoT — entries are.
  synthesizeCompositionViews(resourceMap, panels, compositions, langCode)

  return { resources: resourceMap, panels, injected, removed }
}

function synthesizeCompositionViews(
  resources: Map<string, ResourceInfo>,
  panels: WorkspacePanelLike[],
  compositions: CompositionEnsureSpec[],
  langCode: string
): void {
  const byId = new Map(compositions.map((c) => [c.id, c]))
  for (const panel of panels) {
    for (const instance of panel.entries ?? []) {
      const entry = byId.get(instance.entryId)
      if (!entry || entry.kind === 'pane-member' || !entry.persistId) continue
      resources.set(
        instance.instanceId,
        synthesizeEntryResourceInfo({
          entry,
          instance,
          languageCode: langCode || 'und',
        })
      )
    }
  }
}

export function matchesCompositionPersistId(key: string, persistId: string): boolean {
  return key === persistId || key.startsWith(`${persistId}:`)
}

export function isCompositionPersistId(
  key: string | undefined | null,
  compositions: CompositionEnsureSpec[]
): boolean {
  if (!key) return false
  return compositions.some((c) => c.persistId && matchesCompositionPersistId(key, c.persistId))
}

function syncResourceKeysFromEntries(panel: WorkspacePanelLike): void {
  panel.resourceKeys = (panel.entries ?? []).map((e) => e.instanceId)
}

function dropUnpaintableConsumedKeys(
  entries: PanelEntryInstance[],
  allEntries: PanelEntryDefinition[],
  resources: Map<string, ResourceInfo>
): PanelEntryInstance[] {
  const paneMembers = allEntries.filter((e) => e.kind === 'pane-member')
  const compositions = allEntries.filter((e) => e.kind === 'composition')
  return entries.filter((instance) => {
    const def = allEntries.find((e) => e.id === instance.entryId)
    if (def) return true
    const type = resolveResourceTypeForKey(resources, instance.instanceId)
    if (paneMembers.some((m) => m.consumes.some((id) => resourceMatchesConsumedType(type, id)))) {
      return true
    }
    if (compositions.some((c) => c.persistId && matchesCompositionPersistId(instance.instanceId, c.persistId))) {
      return true
    }
    return false
  })
}

function normalizeCompositionEntryOrder(
  panel: WorkspacePanelLike,
  compositions: CompositionEnsureSpec[]
): void {
  const preferred = compositions
    .map((c) => c.persistId)
    .filter((id): id is string => Boolean(id) && (panel.entries ?? []).some((e) => e.instanceId === id))
  if (preferred.length === 0) return
  const preferredSet = new Set(preferred)
  const rest = (panel.entries ?? []).filter((e) => !preferredSet.has(e.instanceId))
  const head = preferred
    .map((id) => (panel.entries ?? []).find((e) => e.instanceId === id))
    .filter((e): e is PanelEntryInstance => Boolean(e))
  panel.entries = [...head, ...rest]
}

function resolvePanel2ActiveIndex(options: {
  resourceKeys: string[]
  resources: Map<string, ResourceInfo>
  previousActiveKey: string | null | undefined
}): number {
  const { resourceKeys, resources, previousActiveKey } = options
  if (resourceKeys.length === 0) return 0

  const refs = resourceKeys.map((key) => ({
    key,
    type: resolveResourceTypeForKey(resources, key),
  }))
  const policy = applyDualScopeHelpsPolicy(refs)
  const hidden = new Set(policy.hiddenKeys)

  if (
    previousActiveKey &&
    resourceKeys.includes(previousActiveKey) &&
    !hidden.has(previousActiveKey)
  ) {
    return resourceKeys.indexOf(previousActiveKey)
  }

  if (policy.activeKey && resourceKeys.includes(policy.activeKey)) {
    return resourceKeys.indexOf(policy.activeKey)
  }

  const firstVisible = resourceKeys.find((k) => !hidden.has(k))
  return firstVisible ? resourceKeys.indexOf(firstVisible) : 0
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  if (typeof index !== 'number' || index < 0) return 0
  if (index >= length) return length - 1
  return index
}

function panelHasPrimaryTextEntries(
  panel: WorkspacePanelLike,
  resources: Map<string, ResourceInfo>,
  allEntries: PanelEntryDefinition[]
): boolean {
  const primaryIds = new Set(
    allEntries.filter((e) => e.entryType === 'primary-text').map((e) => e.id)
  )
  if ((panel.entries ?? []).some((e) => primaryIds.has(e.entryId))) return true
  return panel.resourceKeys.some((key) => {
    const r = resources.get(key) || resources.get(compositionBaseKey(key))
    if (!r) return false
    const type = String(r.type || '')
    return type === 'scripture' || type === 'obs'
  })
}

function primaryLang(code: string | undefined | null): string {
  if (!code) return ''
  return String(code).trim().split(/[-_/]/)[0]!.toLowerCase()
}

function normalizeGatewayLang(code: string | undefined | null): string {
  const raw = String(code || '').trim().toLowerCase()
  if (!raw || ORIGINAL_LANG_CODES.has(raw) || raw.startsWith('el-x-')) return ''
  const lang = primaryLang(raw)
  if (!lang || ORIGINAL_LANG_CODES.has(lang)) return ''
  return lang
}

function resourceLang(r: ResourceInfo): string {
  return normalizeGatewayLang(r.languageCode || r.language)
}

export function guessGatewayLanguage(
  resources: Map<string, ResourceInfo>,
  panels: WorkspacePanelLike[],
  compositions: CompositionEnsureSpec[] = compositionsForEnsure()
): string {
  const panel1 = panels.find((p) => p.id === 'panel-1') || panels[0]
  if (panel1) {
    for (const key of panel1.resourceKeys) {
      const r = resources.get(key) || resources.get(compositionBaseKey(key))
      if (!r) continue
      const id = r.key || r.id || ''
      if (isCompositionPersistId(id, compositions)) continue
      const lang = resourceLang(r)
      if (!lang) continue
      const type = String(r.type || '')
      if (type !== 'scripture' && type !== 'obs') continue
      for (const composition of compositions) {
        const keys = findConsumedKeys(resources.values(), composition.consumes, {
          langCode: lang,
        })
        if (shouldInjectComposition(keys, composition.consumes, composition.injectWhen ?? 'any')) {
          return lang
        }
      }
    }
  }

  const persistIds = [...compositions]
    .filter((c) => c.persistId)
    .sort((a, b) => (b.persistId?.length ?? 0) - (a.persistId?.length ?? 0))
    .map((c) => c.persistId!)
  for (const persistId of persistIds) {
    const entry = resources.get(persistId)
    if (!entry) continue
    const lang = resourceLang(entry)
    if (!lang) continue
    const composition = compositions.find((c) => c.persistId === persistId)
    if (!composition) continue
    const keys = findConsumedKeys(resources.values(), composition.consumes, {
      langCode: lang,
    })
    if (shouldInjectComposition(keys, composition.consumes, composition.injectWhen ?? 'any')) {
      return lang
    }
  }

  const seen = new Set<string>()
  for (const r of resources.values()) {
    const lang = resourceLang(r)
    if (!lang || seen.has(lang)) continue
    seen.add(lang)
    for (const composition of compositions) {
      const keys = findConsumedKeys(resources.values(), composition.consumes, {
        langCode: lang,
      })
      if (shouldInjectComposition(keys, composition.consumes, composition.injectWhen ?? 'any')) {
        return lang
      }
    }
  }

  for (const r of resources.values()) {
    const lang = resourceLang(r)
    if (lang) return lang
  }

  return 'und'
}
