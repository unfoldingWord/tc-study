/**
 * tC4 Badge: a 20 px soft-tone pill with 10 px uppercase type. See docs/TC4_STYLE_AND_BRAND.md §5.5.
 */
import type { ReactNode } from 'react'
import clsx from 'clsx'

export type BadgeTone = 'accent' | 'valid' | 'danger' | 'warning' | 'neutral'

const TONE: Record<BadgeTone, string> = {
  accent: 'bg-accent-soft text-accent-fg',
  valid: 'bg-valid-soft text-valid-fg',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning-fg',
  neutral: 'bg-muted text-fg-secondary',
}

export function Badge({ tone = 'accent', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex h-5 items-center rounded-full px-2 text-[10px] font-extrabold uppercase tracking-[0.06em]',
        TONE[tone]
      )}
    >
      {children}
    </span>
  )
}
