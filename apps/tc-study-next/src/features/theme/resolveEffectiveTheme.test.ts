import { describe, expect, test } from 'bun:test'
import {
  isThemePreference,
  resolveEffectiveTheme,
} from './resolveEffectiveTheme'

describe('resolveEffectiveTheme', () => {
  test('light preference wins over system dark', () => {
    expect(resolveEffectiveTheme('light', true)).toBe('light')
  })

  test('dark preference wins over system light', () => {
    expect(resolveEffectiveTheme('dark', false)).toBe('dark')
  })

  test('system follows prefers-color-scheme', () => {
    expect(resolveEffectiveTheme('system', true)).toBe('dark')
    expect(resolveEffectiveTheme('system', false)).toBe('light')
  })
})

describe('isThemePreference', () => {
  test('accepts known values', () => {
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('auto')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })
})
