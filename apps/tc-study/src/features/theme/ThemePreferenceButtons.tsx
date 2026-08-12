/**
 * Icon-only light / dark / system preference control (Settings).
 */

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from './useTheme'
import type { ThemePreference } from './resolveEffectiveTheme'

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

export function ThemePreferenceButtons() {
  const { preference, setPreference } = useTheme()

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
      role="group"
      aria-label="Theme preference"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setPreference(value)}
            className={`p-2 rounded-md transition-colors ${
              active
                ? 'bg-accent-soft text-accent'
                : 'text-fg-muted hover:text-fg hover:bg-muted'
            }`}
            title={label}
            aria-label={label}
            aria-pressed={active}
          >
            <Icon className="w-4 h-4" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
