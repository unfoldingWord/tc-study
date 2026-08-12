import { BookMarked, Check, LayoutList, NotebookPen, SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ModalPortal } from '../../shared/ModalPortal'
import type { HelpsKindFilter } from './types'

const KIND_OPTIONS: {
  value: HelpsKindFilter
  label: string
  icon: typeof LayoutList
}[] = [
  { value: 'all', label: 'All', icon: LayoutList },
  { value: 'notes', label: 'Notes', icon: NotebookPen },
  { value: 'twl', label: 'Word Links', icon: BookMarked },
]

interface HelpsKindFilterMenuProps {
  kindFilter: HelpsKindFilter
  setKindFilter: (v: HelpsKindFilter) => void
}

export function HelpsKindFilterMenu({ kindFilter, setKindFilter }: HelpsKindFilterMenuProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => {
    if (!open || !buttonRef.current) return
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return
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
    <div className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Filter kinds"
        aria-label="Filter kinds"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`rounded-full p-chrome-tight transition-colors ${
          open || kindFilter !== 'all'
            ? 'bg-helps text-white'
            : 'border border-helps/30 text-helps-fg bg-surface hover:bg-helps-soft'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
      </button>

      {open && pos ? (
        <ModalPortal>
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[100] py-1 bg-elevated border border-border rounded-lg shadow-lg"
            style={{ top: pos.top, right: pos.right }}
          >
            {KIND_OPTIONS.map(({ value, label, icon: Icon }) => {
              const selected = kindFilter === value
              return (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  title={label}
                  aria-label={label}
                  onClick={() => {
                    setKindFilter(value)
                    setOpen(false)
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 transition-colors ${
                    selected
                      ? 'bg-helps-soft text-helps-fg'
                      : 'text-fg-secondary hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden />
                  <span className="w-3.5 h-3.5 shrink-0 inline-flex items-center justify-center" aria-hidden>
                    {selected ? <Check className="w-3.5 h-3.5 text-helps-fg" /> : null}
                  </span>
                </button>
              )
            })}
          </div>
        </ModalPortal>
      ) : null}
    </div>
  )
}
