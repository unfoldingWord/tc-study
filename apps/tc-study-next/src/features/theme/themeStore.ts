/**
 * Lifeless theme preference store (Zustand).
 * Owns preference + persistence; does not render UI.
 */

import { create } from 'zustand'
import {
  applyDocumentTheme,
  getSystemPrefersDark,
  readStoredPreference,
  writeStoredPreference,
} from './applyDocumentTheme'
import {
  resolveEffectiveTheme,
  type EffectiveTheme,
  type ThemePreference,
} from './resolveEffectiveTheme'

interface ThemeStore {
  preference: ThemePreference
  /** Last applied effective theme (kept in sync for subscribers). */
  effective: EffectiveTheme
  setPreference: (preference: ThemePreference) => void
  /** Toggle between light and dark (explicit). Leaves system when clicked. */
  toggleLightDark: () => void
  /** Cycle light → dark → system → light. */
  cyclePreference: () => void
  /** Re-resolve from preference + current system (e.g. OS change). */
  syncFromSystem: () => void
}

function initialPreference(): ThemePreference {
  return readStoredPreference() ?? 'system'
}

function initialEffective(preference: ThemePreference): EffectiveTheme {
  return resolveEffectiveTheme(preference, getSystemPrefersDark())
}

function applyAndPersist(preference: ThemePreference): EffectiveTheme {
  writeStoredPreference(preference)
  const effective = resolveEffectiveTheme(preference, getSystemPrefersDark())
  applyDocumentTheme(effective)
  return effective
}

const bootPreference = initialPreference()
const bootEffective = initialEffective(bootPreference)
applyDocumentTheme(bootEffective)

export const useThemeStore = create<ThemeStore>((set, get) => ({
  preference: bootPreference,
  effective: bootEffective,

  setPreference: (preference) => {
    const effective = applyAndPersist(preference)
    set({ preference, effective })
  },

  toggleLightDark: () => {
    const current = get().effective
    const next: ThemePreference = current === 'dark' ? 'light' : 'dark'
    const effective = applyAndPersist(next)
    set({ preference: next, effective })
  },

  cyclePreference: () => {
    const order: ThemePreference[] = ['light', 'dark', 'system']
    const idx = order.indexOf(get().preference)
    const next = order[(idx + 1) % order.length]!
    const effective = applyAndPersist(next)
    set({ preference: next, effective })
  },

  syncFromSystem: () => {
    const { preference } = get()
    if (preference !== 'system') return
    const effective = resolveEffectiveTheme('system', getSystemPrefersDark())
    applyDocumentTheme(effective)
    set({ effective })
  },
}))
