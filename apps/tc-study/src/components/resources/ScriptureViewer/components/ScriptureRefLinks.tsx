import type { BCVReference } from '../../../../contexts/types-only'
import { splitScriptureRefText } from '../../TranslationNotesViewer/utils/parseScriptureLink'

interface ScriptureRefLinksProps {
  text: string
  currentBook: string
  onScriptureRefClick?: (ref: BCVReference) => void
  className?: string
}

export function ScriptureRefLinks({
  text,
  currentBook,
  onScriptureRefClick,
  className,
}: ScriptureRefLinksProps) {
  const parts = splitScriptureRefText(text, currentBook)

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.kind === 'text') {
          return <span key={`t-${index}`}>{part.text}</span>
        }
        if (!onScriptureRefClick) {
          return <span key={`r-${index}`}>{part.text}</span>
        }
        return (
          <button
            key={`r-${index}`}
            type="button"
            className="text-accent hover:text-accent-hover hover:underline"
            title={part.text}
            aria-label={part.text}
            onClick={(e) => {
              e.stopPropagation()
              onScriptureRefClick(part.ref)
            }}
          >
            {part.text}
          </button>
        )
      })}
    </span>
  )
}
