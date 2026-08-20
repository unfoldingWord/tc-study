/**
 * Panel-entry inject helpers — find consumed package keys and
 * synthesize a view-only ResourceInfo from an entry instance.
 * CombinedHelps stays a product viewer; these helpers do not name TN/TWL
 * except when writing existing product bindings.
 */

import type {
  PanelEntryDefinition,
  PanelEntryInstance,
  PanelEntryScope,
} from '@bt-synergy/resource-types'
import { ResourceFormat } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import { languageCodesMatch, primaryLanguageSegment } from '../../utils/languageCodeMatch'
import {
  isNotesResourceType,
  isWordsLinksResourceType,
  normalizeResourceTypeId,
} from '../../utils/normalizeResourceTypeId'
import { getActiveResourceTypeRegistry } from '../../resourceTypes/activeRegistry'

/** Bible vs OBS reading scope — same contract as PanelEntryDefinition.scope / groupId. */
export type HelpsScope = PanelEntryScope

export type CompositionEnsureSpec = Pick<
  PanelEntryDefinition,
  | 'id'
  | 'displayName'
  | 'kind'
  | 'entryType'
  | 'consumes'
  | 'injectWhen'
  | 'scope'
  | 'groupId'
  | 'persistId'
>

export function shouldInjectComposition(
  consumedKeys: Partial<Record<string, string>>,
  consumes: readonly string[],
  injectWhen: PanelEntryDefinition['injectWhen']
): boolean {
  if (injectWhen === 'all') {
    return consumes.every((typeId) => Boolean(consumedKeys[typeId]))
  }
  return consumes.some((typeId) => Boolean(consumedKeys[typeId]))
}

export function findConsumedKeys(
  resources: Iterable<ResourceInfo | null | undefined>,
  consumes: readonly string[],
  options?: {
    langCode?: string
    skipKeys?: Set<string>
  }
): Partial<Record<string, string>> {
  const want = primaryLanguageSegment(options?.langCode || '')
  const skip = options?.skipKeys ?? new Set<string>()
  const found: Partial<Record<string, string>> = {}

  for (const r of resources) {
    if (!r) continue
    const key = r.key || r.id
    if (!key || skip.has(key)) continue
    if (want && !keyMatchesLang(key, want)) continue
    for (const consumedId of consumes) {
      if (found[consumedId]) continue
      if (resourceMatchesConsumedType(r.type, consumedId)) {
        found[consumedId] = key
      }
    }
  }

  return found
}

/** Strip `#N` instance and `:panel-N` persist suffixes for package lookup. */
export function compositionBaseKey(key: string): string {
  return key.replace(/#\d+$/, '').replace(/:panel-\d+$/, '')
}

/** Type for a painted key — instance `#2` / `:panel-N` share the base entry. */
export function resolveResourceTypeForKey(
  resources: Map<string, ResourceInfo> | Record<string, ResourceInfo | undefined>,
  key: string
): string | undefined {
  const get = (k: string) => (resources instanceof Map ? resources.get(k) : resources[k])
  const direct = get(key)?.type
  if (direct) return String(direct)
  const base = compositionBaseKey(key)
  if (base === key) return undefined
  const fallback = get(base)?.type
  return fallback ? String(fallback) : undefined
}

/** Match a package resource type to a consumed id via aliases. */
export function resourceMatchesConsumedType(
  rawType: string | undefined,
  consumedId: string
): boolean {
  if (!rawType) return false
  if (rawType === consumedId) return true
  const normalized = normalizeResourceTypeId(rawType)
  if (normalized === consumedId) return true

  const def = getActiveResourceTypeRegistry()?.get(consumedId)
  if (def?.aliases) {
    for (const alias of def.aliases) {
      if (rawType === alias || normalized === alias) return true
      if (normalizeResourceTypeId(alias) === normalized) return true
    }
  }
  return false
}

/**
 * Thin adapter: synthesize a view ResourceInfo from an entry instance.
 * Not membership SoT — do not persist this as a catalog row.
 */
export function synthesizeEntryResourceInfo(options: {
  entry: CompositionEnsureSpec
  instance: PanelEntryInstance
  languageCode: string
}): ResourceInfo {
  const scope = (options.entry.groupId ?? options.entry.scope ?? 'scripture') as HelpsScope
  const id = options.instance.instanceId
  const productBindings = productHelpsBindings(options.instance.bindings)

  return {
    id,
    key: id,
    resourceKey: id,
    title: options.entry.displayName,
    type: options.entry.id,
    category: 'Composition',
    subject: options.entry.displayName,
    owner: 'local',
    language: options.languageCode,
    languageCode: options.languageCode,
    languageName: options.languageCode,
    resourceId: options.entry.id,
    server: 'git.door43.org',
    format: ResourceFormat.TSV,
    contentType: 'text/tab-separated-values',
    contentStructure: 'book',
    version: '1.0',
    description: options.entry.displayName,
    availability: { online: true, offline: false, bundled: false, partial: false },
    locations: [],
    catalogedAt: new Date().toISOString(),
    consumedKeys: options.instance.bindings,
    helpsTnResourceKey: productBindings.helpsTnResourceKey,
    helpsTwlResourceKey: productBindings.helpsTwlResourceKey,
    appliesToScope: scope,
  } as unknown as ResourceInfo
}

/** @deprecated Prefer synthesizeEntryResourceInfo from an entry instance. */
export function buildCompositionResourceInfo(options: {
  composition: CompositionEnsureSpec
  languageCode: string
  consumedKeys: Partial<Record<string, string>>
  id?: string
}): ResourceInfo {
  return synthesizeEntryResourceInfo({
    entry: options.composition,
    instance: {
      instanceId: options.id || options.composition.persistId || options.composition.id,
      entryId: options.composition.id,
      bindings: options.consumedKeys,
    },
    languageCode: options.languageCode,
  })
}

/**
 * CombinedHelpsViewer + AppStore projector still read these product fields
 * when consumed types are notes / words-links (or OBS twins).
 */
export function productHelpsBindings(consumedKeys: Partial<Record<string, string>>): {
  helpsTnResourceKey?: string
  helpsTwlResourceKey?: string
} {
  let helpsTnResourceKey: string | undefined
  let helpsTwlResourceKey: string | undefined
  for (const [typeId, key] of Object.entries(consumedKeys)) {
    if (!key) continue
    if (isNotesResourceType(typeId, 'scripture') || isNotesResourceType(typeId, 'obs')) {
      helpsTnResourceKey = key
    }
    if (
      isWordsLinksResourceType(typeId, 'scripture') ||
      isWordsLinksResourceType(typeId, 'obs')
    ) {
      helpsTwlResourceKey = key
    }
  }
  return { helpsTnResourceKey, helpsTwlResourceKey }
}

export function keyMatchesLang(key: string, want: string): boolean {
  const seg = primaryLanguageSegment(key.split('/')[1] || '')
  return languageCodesMatch(seg, want)
}
