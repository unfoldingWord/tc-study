import type { LucideIcon } from 'lucide-react'

/**
 * Panel-tab icon input: Lucide name string (resolved via allowlist) or a component.
 * Keeps `@bt-synergy/resource-types` UI-free (`icon?: string`) while apps can
 * pass components through overrides / presentation APIs.
 */
export type TabIcon = string | LucideIcon

/** Lucide icons are forwardRef objects (not plain functions). */
export function isTabIconComponent(value: TabIcon): value is LucideIcon {
  return typeof value !== 'string'
}

export function isTabIconName(value: TabIcon): value is string {
  return typeof value === 'string'
}
