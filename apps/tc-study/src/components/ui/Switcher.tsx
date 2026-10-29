/**
 * tC4 Switcher: tabs with a 2 px accent underline, or a pill segmented control. One tab is in the
 * tab order at a time; the arrows, Home and End move between them. See docs/TC4_STYLE_AND_BRAND.md §5.5.
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { nextSwitcherIndex } from './switcherKeys'

export interface SwitcherItem<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

const INDICATOR = {
  underline: {
    list: 'flex items-end gap-1 border-b border-border-subtle pointer-coarse:items-center pointer-coarse:py-1',
    tab: 'h-9 border-b-2 px-3 -mb-px',
    selected: 'border-accent text-fg',
    idle: 'border-transparent text-fg-secondary hover:text-fg',
  },
  pill: {
    list: 'inline-flex items-center rounded-full bg-muted p-1 pointer-coarse:p-1.5',
    tab: 'h-7 rounded-full px-3',
    selected: 'bg-surface shadow-xs text-fg',
    idle: 'text-fg-secondary hover:text-fg',
  },
} as const

export function Switcher<T extends string>({
  items,
  value,
  onChange,
  indicator = 'underline',
  label,
  dir = 'ltr',
}: {
  items: SwitcherItem<T>[]
  value: T
  onChange(v: T): void
  indicator?: 'underline' | 'pill'
  label: string
  dir?: 'ltr' | 'rtl'
}) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const style = INDICATOR[indicator]
  const current = items.findIndex((item) => item.value === value)
  const tabStop = Math.max(current, 0)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextSwitcherIndex(current, event.key, items.length, dir)
    if (next === null) return
    event.preventDefault()
    onChange(items[next].value)
    tabRefs.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={style.list} onKeyDown={onKeyDown}>
      {items.map((item, index) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => {
              onChange(item.value)
              tabRefs.current[index]?.focus()
            }}
            className={clsx(
              'inline-flex items-center gap-2 text-sm font-bold transition-colors pointer-coarse:h-11',
              style.tab,
              selected ? style.selected : style.idle
            )}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
