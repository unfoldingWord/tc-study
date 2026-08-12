/**
 * Shared idle/active classes for ResourceViewerHeader trailing icon buttons
 * (ScriptureLayoutToggle, Combined Helps Sources / kind filter, etc.).
 */
export function chromeIconButtonClass(active: boolean): string {
  return `p-1.5 rounded-md transition-colors ${
    active
      ? 'bg-accent-soft text-accent hover:bg-accent/15'
      : 'text-fg-muted hover:bg-muted hover:text-fg-secondary'
  }`
}
