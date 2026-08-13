/**
 * Apply resolved theme to the document root (class + data + color-scheme).
 * Side effects only — no React.
 */

import type { EffectiveTheme, ThemePreference } from './resolveEffectiveTheme'

export const THEME_STORAGE_KEY = 'tc-study:theme-preference'

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyDocumentTheme(effective: EffectiveTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', effective === 'dark')
  root.dataset.theme = effective
  root.style.colorScheme = effective
}

export function readStoredPreference(): ThemePreference | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* ignore */
  }
  return null
}

export function writeStoredPreference(preference: ThemePreference): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    /* ignore */
  }
}
