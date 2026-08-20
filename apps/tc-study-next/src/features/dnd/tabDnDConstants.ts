/** Shared activation + data-attribute keys for panel tab pointer DnD. */

/** Long-press before drag starts (iOS/Android scroll-friendly). */
export const TAB_DND_LONG_PRESS_MS = 350

/** Cancel pending drag if pointer moves farther than this before activation. */
export const TAB_DND_MOVE_TOLERANCE_PX = 10

export const TAB_DND_ATTR = {
  tabKey: 'data-tab-dnd-key',
  tabPanel: 'data-tab-dnd-panel',
  droppable: 'data-tab-dnd-droppable',
} as const
