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
  /** `menu` matches NavigationBarCompact overflow rows. `ocean` is white-on-Ocean app bar. */
  variant?: 'chrome' | 'menu' | 'ocean'
}

export function ThemeToggle({
  cycle = false,
  className = '',
  size = 'md',
  variant = 'chrome',
}: ThemeToggleProps) {
  const { preference, effective, toggleLightDark, cyclePreference } = useTheme()

  const iconClass = size === 'sm' ? 'w-4 h-4' : 'w-4 h-4'
  const padClass = size === 'sm' ? 'p-1.5' : 'p-2'
  const skin =
    variant === 'menu'
      ? 'flex items-center justify-center p-2 w-full text-fg-secondary hover:text-fg hover:bg-muted transition-colors'
      : variant === 'ocean'
        ? `${padClass} rounded-md text-accent-fill-fg/60 hover:text-accent-fill-fg hover:bg-accent-fill-fg/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-fill-fg/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--uw-ocean)] transition-colors`
        : `${padClass} rounded-full text-fg-secondary hover:text-fg hover:bg-muted transition-colors`

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
      className={`${skin} ${className}`}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={effective === 'dark'}
    >
      <Icon className={iconClass} aria-hidden />
    </button>
  )
}
