/** Shared Tailwind classes for controls on the tC4 Ocean app bar (see Layout header). */

export const OCEAN_BAR_BG = 'bg-[var(--uw-ocean)]'

export const OCEAN_BAR_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-fill-fg/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--uw-ocean)]'

/** Secondary header icons (theme, menu): white at 60%, full white on hover. */
export const OCEAN_BAR_ICON =
  `text-accent-fill-fg/60 hover:text-accent-fill-fg hover:bg-accent-fill-fg/10 ${OCEAN_BAR_FOCUS_RING}`

/** Current-section shortcut on the bar: same as secondary icons plus an underline “you are here”. */
export const OCEAN_BAR_SECTION_SHORTCUT = `${OCEAN_BAR_ICON} shadow-[inset_0_-2px_0_0] shadow-accent-fill-fg/80`
