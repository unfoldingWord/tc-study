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

export function IconButton({
  label,
  size = 'md',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: IconButtonSize; children: ReactNode }) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors',
        'hover:bg-muted hover:text-fg pointer-coarse:size-11 disabled:pointer-events-none disabled:opacity-50',
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
