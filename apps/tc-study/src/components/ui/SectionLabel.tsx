/**
 * tC4 Overline: 11 px uppercase at weight 800 and 0.13 em tracking, for "BOOKS · 1"-style labels.
 * Pass `as="h2"` when the label heads a section, or `as="label"` for a field.
 * See docs/TC4_STYLE_AND_BRAND.md §5.5.
 */
import type { ElementType, HTMLAttributes } from 'react'
import clsx from 'clsx'

export function SectionLabel({
  as: Tag = 'div',
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: ElementType; htmlFor?: string }) {
  return (
    <Tag
      className={clsx('text-[11px] font-extrabold uppercase tracking-[0.13em] text-fg-muted', className)}
      {...rest}
    />
  )
}
