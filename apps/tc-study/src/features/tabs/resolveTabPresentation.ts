import type { LucideIcon } from 'lucide-react'
import type { ResourceTypeDefinition, ResourceTypeRegistry } from '@bt-synergy/resource-types'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from '../helps/combinedHelpsIds'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { isCombinedHelpsResourceType, normalizeResourceTypeId } from '../../utils/normalizeResourceTypeId'
import { resolveLucideIconName } from './lucideIconRegistry'
import { isTabIconComponent, type TabIcon } from './tabIcon'
import { TAB_ICON_OVERRIDES } from './tabIconOverrides'
import { getTabShortLabel, type TabShortLabelResource } from './tabShortLabel'

export interface TabPresentationResource extends TabShortLabelResource {
  title?: string
  type?: string
}

export interface TabPresentation {
  /** Resolved Lucide component, or null when unavailable */
  Icon: LucideIcon | null
  /** Always computed for fallback / primary disambiguation / DnD text */
  shortLabel: string
  /**
   * Primary types show icon + abbrev. Combined Helps shows icon + "Helps"
   * because the notes glyph is not self-explanatory. Other companions with
   * an icon can be icon-only. Always true when Icon is null (text fallback).
   */
  showShortLabel: boolean
  /** Full accessible name (resource.title) */
  title: string
}

export interface ResolveTabPresentationOptions {
  /** Lookup plugin definition by canonical type id */
  getType?: (typeId: string) => ResourceTypeDefinition | undefined
  /** Tab-only overrides (string | component), merged over defaults */
  overrides?: Record<string, TabIcon>
}

function resolveTypeId(resource: TabPresentationResource): string | null {
  const key = resource.key || resource.id || ''
  if (key === COMBINED_HELPS_RESOURCE_ID) return RESOURCE_TYPE_IDS.COMBINED_HELPS
  if (key === OBS_COMBINED_HELPS_RESOURCE_ID) return RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS
  return normalizeResourceTypeId(resource.type)
}

/** Resolve a TabIcon (name string or component) to a Lucide component. */
export function resolveTabIcon(icon: TabIcon | undefined | null): LucideIcon | null {
  if (!icon) return null
  if (isTabIconComponent(icon)) return icon
  return resolveLucideIconName(icon)
}

function pickIconSource(
  typeId: string | null,
  resource: TabPresentationResource,
  plugin: ResourceTypeDefinition | undefined,
  overrides: Record<string, TabIcon>
): TabIcon | undefined {
  const key = resource.key || resource.id || ''
  if (key && overrides[key] != null) return overrides[key]
  if (typeId && overrides[typeId] != null) return overrides[typeId]
  if (plugin?.icon) return plugin.icon
  return undefined
}

/**
 * Resolve panel-tab presentation from plugin SoT + optional overrides.
 * Does not touch SortableTab — callers pass the result as props.
 */
export function resolveTabPresentation(
  resource: TabPresentationResource | null | undefined,
  options: ResolveTabPresentationOptions = {}
): TabPresentation {
  const shortLabel = getTabShortLabel(resource)
  const title = (resource?.title && resource.title.trim()) || shortLabel

  if (!resource) {
    return { Icon: null, shortLabel, showShortLabel: true, title }
  }

  const overrides = options.overrides ?? TAB_ICON_OVERRIDES
  const typeId = resolveTypeId(resource)
  const plugin = typeId && options.getType ? options.getType(typeId) : undefined
  const Icon = resolveTabIcon(pickIconSource(typeId, resource, plugin, overrides))

  const contentRole = plugin?.contentRole ?? 'companion'
  const isPrimary = contentRole === 'primary'
  // Primary: icon + abbrev for disambiguation (GLT vs GST).
  // Combined Helps: icon + "Helps" — notes glyph is not self-explanatory.
  // Other non-primary with icon: icon-only. No icon: short text fallback.
  const showShortLabel = !Icon || isPrimary || isCombinedHelpsResourceType(typeId)

  return { Icon, shortLabel, showShortLabel, title }
}

/** Convenience: bind a ResourceTypeRegistry as getType. */
export function resolveTabPresentationFromRegistry(
  resource: TabPresentationResource | null | undefined,
  registry: ResourceTypeRegistry | null | undefined,
  overrides?: Record<string, TabIcon>
): TabPresentation {
  return resolveTabPresentation(resource, {
    getType: registry ? (id) => registry.get(id) : undefined,
    overrides,
  })
}
