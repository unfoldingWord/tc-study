/**
 * Headless-ish theme control: behavior + a11y; skin from design tokens / Tailwind.
 * Icon-first: Sun (light) / Moon (dark). Optional Monitor hint when preference is system.
 */

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from './useTheme'

interface ThemeToggleProps {
  /** When true, click cycles light → dark → system. Default: toggle light/dark. */
  cycle?: boolean
  className?: string
  size?: 'sm' | 'md'
}

export function ThemeToggle({
  cycle = false,
  className = '',
  size = 'md',
}: ThemeToggleProps) {
  const { preference, effective, toggleLightDark, cyclePreference } = useTheme()

  const iconClass = size === 'sm' ? 'w-4 h-4' : 'w-4 h-4'
  const padClass = size === 'sm' ? 'p-1.5' : 'p-2'

  const title =
    preference === 'system'
      ? `Theme: system (${effective}). Click to ${cycle ? 'cycle' : 'set'} theme`
      : `Theme: ${preference}. Click to ${cycle ? 'cycle' : 'switch'} theme`

  const ariaLabel =
    preference === 'system'
      ? `Theme system, currently ${effective}`
      : `Theme ${preference}`

  const Icon =
    preference === 'system' ? Monitor : effective === 'dark' ? Moon : Sun

  return (
    <button
      type="button"
      onClick={cycle ? cyclePreference : toggleLightDark}
      className={`${padClass} rounded-full text-fg-secondary hover:text-fg hover:bg-muted transition-colors ${className}`}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={effective === 'dark'}
    >
      <Icon className={iconClass} aria-hidden />
    </button>
  )
}
