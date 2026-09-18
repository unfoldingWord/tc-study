import type { NavigationMode } from '../../contexts/types'

/** Bible hamburger grain: Custom Range → Chapter → Section → Passage Set. */
export const BIBLE_NAVIGATION_MODE_ORDER = [
  'verse',
  'chapter',
  'section',
  'passage-set',
] as const satisfies readonly NavigationMode[]

/** Stories hamburger grain: Frame → Story. */
export const OBS_NAVIGATION_MODE_ORDER = ['verse', 'chapter'] as const satisfies readonly NavigationMode[]

export function nextNavigationMode(
  order: readonly NavigationMode[],
  current: NavigationMode
): NavigationMode {
  const index = order.indexOf(current)
  const from = index >= 0 ? index : 0
  return order[(from + 1) % order.length] ?? order[0]!
}

export function resolveNavigationModeInOrder(
  order: readonly NavigationMode[],
  current: NavigationMode
): NavigationMode {
  return order.includes(current) ? current : order[0]!
}
