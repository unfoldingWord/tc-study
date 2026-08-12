/**
 * Pure theme resolution — preference + system → effective light|dark.
 * Lifeless: no DOM, no markup.
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): EffectiveTheme {
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return systemPrefersDark ? 'dark' : 'light'
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}
