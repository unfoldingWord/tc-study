import { useState } from 'react'
import type { BCVReference } from '../../../../contexts/types-only'
import { scriptureNoteClickTarget } from '../utils/scriptureNoteClick'
import { ScriptureRefLinks } from './ScriptureRefLinks'

interface ScriptureNoteMarkerProps {
  kind: 'note' | 'xref'
  caller: string
  text: string
  currentBook: string
  onScriptureRefClick?: (ref: BCVReference) => void
}

export function ScriptureNoteMarker({
  kind,
  caller,
  text,
  currentBook,
  onScriptureRefClick,
}: ScriptureNoteMarkerProps) {
  const [open, setOpen] = useState(false)

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    const target = scriptureNoteClickTarget(kind, text, currentBook)
    if (target.action === 'navigate' && onScriptureRefClick) {
      onScriptureRefClick(target.ref)
      return
    }
    setOpen((value) => !value)
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="align-super text-[0.65em] font-semibold text-accent hover:text-accent-hover px-0.5 leading-none"
        title={text}
        aria-label={text}
        aria-expanded={open}
        onClick={handleClick}
      >
        {caller}
      </button>
      {open ? (
        <span
          className="absolute z-20 left-0 top-full mt-1 min-w-40 max-w-xs rounded-md border border-border bg-surface px-2 py-1.5 text-sm font-normal text-scripture-fg shadow-md normal-case"
          role="note"
        >
          <ScriptureRefLinks
            text={text}
            currentBook={currentBook}
            onScriptureRefClick={onScriptureRefClick}
          />
        </span>
      ) : null}
    </span>
  )
}
