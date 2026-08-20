import { BookMarked, BookOpen, Filter, LayoutGrid } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { TextKindFilter } from '../features/read/filterPickerLanguages'

const OPTIONS: Array<{
  value: TextKindFilter
  label: string
  Icon: typeof LayoutGrid
}> = [
  { value: 'both', label: 'Any', Icon: LayoutGrid },
  { value: 'bible', label: 'Bible', Icon: BookOpen },
  { value: 'obs', label: 'OBS', Icon: BookMarked },
]

export function LanguagePickerTextKindFilter({
  value,
  onChange,
  defaultOpen = false,
}: {
  value: TextKindFilter
  onChange: (next: TextKindFilter) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const rootRef = useRef<HTMLDivElement>(null)
  const isFiltered = value !== 'both'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Filter languages"
        aria-label="Filter languages"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-pressed={isFiltered}
        className={`p-1 rounded transition-colors hover:bg-muted ${
          isFiltered ? 'text-accent' : 'text-fg-secondary'
        }`}
      >
        <Filter className="w-4 h-4" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Filter languages"
          className="absolute right-0 top-full mt-1 py-1 bg-surface border border-border-subtle rounded-md shadow z-50"
        >
          {OPTIONS.map(({ value: optValue, label, Icon }) => {
            const selected = value === optValue
            return (
              <button
                key={optValue}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                title={label}
                aria-label={label}
                onClick={() => {
                  onChange(optValue)
                  setOpen(false)
                }}
                className={`flex items-center justify-center p-2 transition-colors ${
                  selected
                    ? 'bg-muted text-accent'
                    : 'text-fg-secondary hover:bg-muted'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
