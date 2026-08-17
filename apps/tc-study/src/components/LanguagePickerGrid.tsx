/**
 * Compact language card grid for LanguagePicker.
 * Cached vs online: hairline + icon split when both groups exist.
 */

import { Globe, Wifi } from 'lucide-react'
import { languagePickerCardRole } from '../features/read/languagePickerCardRole'
import type { ListedLanguage } from '../features/read/languagesCache'
import { LanguagePickerRow } from './LanguagePickerRow'

const GRID_CLASS = 'grid grid-cols-2 md:grid-cols-3 gap-stack'

export interface LanguagePickerGridProps {
  catalogLanguages: ListedLanguage[]
  onlineLanguages: ListedLanguage[]
  onSelect: (code: string) => void
  currentLanguageCode?: string | null
  otherLanguageCode?: string | null
}

function LanguageCardGrid({
  items,
  status,
  onSelect,
  currentLanguageCode,
  otherLanguageCode,
}: {
  items: ListedLanguage[]
  status: 'cached' | 'online'
  onSelect: (code: string) => void
  currentLanguageCode?: string | null
  otherLanguageCode?: string | null
}) {
  return (
    <div className={GRID_CLASS}>
      {items.map((lang) => (
        <LanguagePickerRow
          key={lang.code}
          lang={lang}
          status={status}
          cardRole={languagePickerCardRole(lang.code, currentLanguageCode, otherLanguageCode)}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

export function LanguagePickerGrid({
  catalogLanguages,
  onlineLanguages,
  onSelect,
  currentLanguageCode,
  otherLanguageCode,
}: LanguagePickerGridProps) {
  const hasCatalog = catalogLanguages.length > 0
  const hasOnline = onlineLanguages.length > 0

  if (!hasCatalog && !hasOnline) {
    return (
      <div
        className="flex items-center justify-center py-12"
        role="status"
        aria-label="No matching languages"
      >
        <Globe className="w-12 h-12 text-fg-muted opacity-50" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-stack">
      {hasCatalog && (
        <LanguageCardGrid
          items={catalogLanguages}
          status="cached"
          onSelect={onSelect}
          currentLanguageCode={currentLanguageCode}
          otherLanguageCode={otherLanguageCode}
        />
      )}
      {hasCatalog && hasOnline && (
        <div className="flex items-center gap-chrome" role="separator">
          <span className="flex-1 h-px bg-border-subtle" />
          <Wifi className="w-3 h-3 text-fg-muted" aria-hidden />
          <span className="flex-1 h-px bg-border-subtle" />
        </div>
      )}
      {hasOnline && (
        <LanguageCardGrid
          items={onlineLanguages}
          status="online"
          onSelect={onSelect}
          currentLanguageCode={currentLanguageCode}
          otherLanguageCode={otherLanguageCode}
        />
      )}
    </div>
  )
}
