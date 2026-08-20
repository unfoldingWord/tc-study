import { underlineFilterInQuote } from '../../../features/helps/underlineFilterInQuote'
import { HELPS_QUOTE_FILTER_MARK } from '../helpsCardStyles'

interface QuotedFilterTextProps {
  quote: string
  filterText?: string | null
}

/** Renders quote text with the active token-filter word underlined. No marks when filter is empty. */
export function QuotedFilterText({ quote, filterText }: QuotedFilterTextProps) {
  const segments = underlineFilterInQuote(quote, filterText)
  if (segments.length === 1 && !segments[0]?.underline) {
    return quote
  }
  return (
    <>
      {segments.map((seg, i) =>
        seg.underline ? (
          <span key={i} className={HELPS_QUOTE_FILTER_MARK} data-filter-mark="">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  )
}
