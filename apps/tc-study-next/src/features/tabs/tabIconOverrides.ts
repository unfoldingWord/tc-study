import type { TabIcon } from './tabIcon'

/**
 * Optional tab-strip-only icon overrides keyed by canonical resource type id
 * (or synthetic resource key). Values may be Lucide name strings or components.
 *
 * Prefer plugin `icon` for SoT; use this when the tab strip should differ from
 * other surfaces that also read `ResourceTypeDefinition.icon`.
 */
export const TAB_ICON_OVERRIDES: Record<string, TabIcon> = {
  // Example (component): [RESOURCE_TYPE_IDS.COMBINED_HELPS]: LifeBuoy,
  // Example (string): [RESOURCE_TYPE_IDS.COMBINED_HELPS]: 'LifeBuoy',
}
