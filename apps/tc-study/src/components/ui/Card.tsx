/**
 * tC4 Card / Surface: radius 16, a 1 px border and the card shadow. See docs/TC4_STYLE_AND_BRAND.md §5.5.
 */
import type { ElementType, HTMLAttributes } from 'react'
import clsx from 'clsx'

export function Card({
  as: Tag = 'div',
  padded = true,
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: ElementType; padded?: boolean }) {
  return (
    <Tag
      className={clsx('rounded-2xl border border-border bg-surface shadow-sm', padded && 'p-6', className)}
      {...rest}
    />
  )
}
