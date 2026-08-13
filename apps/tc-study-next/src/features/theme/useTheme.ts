/**
 * Lifeless theme API for app chrome — preference, effective, and actions.
 */

import { useEffect } from 'react'
import { useThemeStore } from './themeStore'
import type { EffectiveTheme, ThemePreference } from './resolveEffectiveTheme'

export interface UseThemeResult {
  preference: ThemePreference
  effective: EffectiveTheme
  setPreference: (preference: ThemePreference) => void
  toggleLightDark: () => void
  cyclePreference: () => void
}

/**
 * Subscribe to theme state. Mount once near the app root (or rely on ThemeBootstrap)
 * so `prefers-color-scheme` stays in sync when preference is `system`.
 */
export function useTheme(): UseThemeResult {
  const preference = useThemeStore((s) => s.preference)
  const effective = useThemeStore((s) => s.effective)
  const setPreference = useThemeStore((s) => s.setPreference)
  const toggleLightDark = useThemeStore((s) => s.toggleLightDark)
  const cyclePreference = useThemeStore((s) => s.cyclePreference)

  return {
    preference,
    effective,
    setPreference,
    toggleLightDark,
    cyclePreference,
  }
}

/** Keep document class in sync with OS when preference is `system`. */
export function useThemeSystemListener(): void {
  const preference = useThemeStore((s) => s.preference)
  const syncFromSystem = useThemeStore((s) => s.syncFromSystem)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (useThemeStore.getState().preference === 'system') {
        syncFromSystem()
      }
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference, syncFromSystem])
}
