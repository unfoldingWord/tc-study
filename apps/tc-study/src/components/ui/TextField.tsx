/**
 * tC4 TextField: an overline label over a radius-9 input on the control ladder (36, 44 on touch).
 * See docs/TC4_STYLE_AND_BRAND.md §5.5.
 */
import type { InputHTMLAttributes } from 'react'
import clsx from 'clsx'
import { SectionLabel } from './SectionLabel'

export function TextField({
  id,
  label,
  className,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel as="label" htmlFor={id}>
        {label}
      </SectionLabel>
      <input
        id={id}
        className={clsx(
          'h-9 pointer-coarse:h-11 w-full rounded-[9px] border border-border bg-surface px-3 text-sm text-fg',
          'placeholder:text-fg-muted outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'disabled:opacity-50',
          className
        )}
        {...input}
      />
    </div>
  )
}
