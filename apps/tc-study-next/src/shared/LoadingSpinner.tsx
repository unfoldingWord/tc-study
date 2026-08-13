/**
 * Shared loading spinner for resource panels/viewers and related UI.
 * Uses Lucide Loader2 so animation, stroke, and sizing stay consistent.
 * Panel accent color via className (e.g. text-blue-600 / text-violet-500).
 *
 * Lives under src/shared (not components/) so features/ may import it
 * without violating the features→components import-direction guard.
 */

import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

const SIZE_CLASS = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
} as const

export type LoadingSpinnerSize = keyof typeof SIZE_CLASS

export interface LoadingSpinnerProps {
  /** Icon size. Default md (w-8 h-8). */
  size?: LoadingSpinnerSize
  /**
   * Accessible name for the status. Default "Loading".
   * Shown visually only when showLabel is true.
   */
  label?: string
  /** When true, render a short visible label under the icon. Default false. */
  showLabel?: boolean
  /** Color / extra classes on the icon (e.g. text-blue-600). Default text-gray-400. */
  className?: string
  /** When true, wrap in a centered flex container. */
  centered?: boolean
  /** Extra classes on the centered wrapper. */
  containerClassName?: string
}

export function LoadingSpinner({
  size = 'md',
  label = 'Loading',
  showLabel = false,
  className,
  centered = false,
  containerClassName,
}: LoadingSpinnerProps) {
  const icon = (
    <Loader2
      className={clsx('animate-spin', SIZE_CLASS[size], className ?? 'text-gray-400')}
      aria-hidden
    />
  )

  if (!centered && !showLabel) {
    return (
      <span role="status" aria-label={label} className="inline-flex">
        {icon}
      </span>
    )
  }

  return (
    <div
      className={clsx(
        centered && 'flex items-center justify-center',
        showLabel && 'flex-col gap-2',
        containerClassName
      )}
      role="status"
      aria-label={label}
    >
      {icon}
      {showLabel ? <span className="text-sm text-gray-600">{label}</span> : null}
    </div>
  )
}
