/**
 * Mount once under the app tree to listen for system preference changes.
 * Renders nothing (lifeless wiring).
 */

import { useThemeSystemListener } from './useTheme'

export function ThemeBootstrap(): null {
  useThemeSystemListener()
  return null
}
