/**
 * tC4 IconButton: a radius-8 square on the control-height ladder (30 / 36 / 44, 44 on touch).
 * `label` is its accessible name and tooltip. See docs/TC4_STYLE_AND_BRAND.md §5.5.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

export type IconButtonSize = 'sm' | 'md' | 'lg'

const SIZE: Record<IconButtonSize, string> = {
  sm: 'size-[30px]',
  md: 'size-9',
  lg: 'size-11',
}

const TONE = {
  surface: 'text-fg-secondary hover:bg-muted hover:text-fg',
  onOcean:
    'text-accent-fill-fg/60 hover:text-accent-fill-fg hover:bg-accent-fill-fg/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-fill-fg/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--uw-ocean)]',
} as const

export function IconButton({
  label,
  size = 'md',
  tone = 'surface',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  size?: IconButtonSize
  tone?: keyof typeof TONE
  children: ReactNode
}) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors',
        'pointer-coarse:size-11 disabled:pointer-events-none disabled:opacity-50',
        TONE[tone],
        SIZE[size],
        className
      )}
      {...rest}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}
