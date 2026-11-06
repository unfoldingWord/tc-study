/**
 * tC4 Action: a pill button on the control-height ladder (36 desktop, 44 touch).
 * See docs/TC4_STYLE_AND_BRAND.md §5.5.
 */
import type { ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'

export type ButtonVariant = 'fill' | 'outline' | 'quiet' | 'danger'
export type ButtonSize = 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  fill: 'bg-accent-fill text-accent-fill-fg hover:bg-accent-fill-hover active:bg-accent-fill-press',
  outline: 'border-[1.5px] border-helps-border text-helps-fg hover:bg-muted',
  quiet: 'text-fg-secondary hover:bg-muted',
  danger: 'text-danger hover:bg-danger-soft',
}

const SIZE: Record<ButtonSize, string> = {
  md: 'h-9',
  lg: 'h-11',
}

export function Button({
  variant = 'fill',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[13.5px] font-extrabold',
        'pointer-coarse:h-11 transition-colors disabled:pointer-events-none disabled:opacity-50',
        SIZE[size],
        VARIANT[variant],
        className
      )}
      {...rest}
    />
  )
}
