/**
 * Shared chrome for TN / TWL / Combined Helps / TQ lists and cards.
 */

/** Scrollable helps content (under ResourceViewerHeader). */
export const HELPS_LIST_PANEL = 'flex-1 overflow-y-auto bg-surface'

/** Verse / ref group header — neutral muted chip (not lavender wash). */
export const HELPS_VERSE_HEADER =
  'flex items-center gap-chrome-tight px-chrome py-chrome-tight bg-muted rounded-md'

export const HELPS_VERSE_HEADER_ICON = 'w-3.5 h-3.5 text-fg-secondary'

/** Count badge on verse headers. */
export const HELPS_VERSE_COUNT =
  'ml-auto px-1.5 py-0.5 bg-surface text-fg-secondary rounded-full text-micro font-medium'

/** Idle / selected chrome for TN + TWL help cards. */
export const HELPS_CARD_IDLE =
  'bg-surface hover:border-border border-border-subtle'

/** Selected: lighter soft blue fill + even border (no left bar / ring / purple or yellow wash). */
export const HELPS_CARD_SELECTED = 'bg-accent-soft/50 border-border'
