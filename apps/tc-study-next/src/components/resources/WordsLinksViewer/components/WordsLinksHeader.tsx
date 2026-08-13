/**
 * WordsLinksHeader Component
 * 
 * Header for WordsLinksViewer showing current reference
 */

import { Link2 } from 'lucide-react'

interface WordsLinksHeaderProps {
  refString: string
}

export function WordsLinksHeader({ refString }: WordsLinksHeaderProps) {
  return (
    <div className="px-4 py-3 border-b border-border bg-canvas">
      <div className="flex items-center gap-2">
        <Link2 className="w-5 h-5 text-accent" />
        <h3 className="text-sm font-semibold text-fg">Translation Words Links</h3>
      </div>
      <p className="text-xs text-fg-muted mt-1">{refString}</p>
    </div>
  )
}
