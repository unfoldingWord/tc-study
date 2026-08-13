/**
 * Language Picker Component
 *
 * Modal for selecting a language on the Read page. Icon-first chrome: one
 * header icon + count badge, optional Bible/OBS filter (text mode only).
 * Uses Door43 API via useDoor43Data (same as LanguageSelectorStep).
 */

import {
    AlertCircle,
    Globe,
    Languages,
    Loader2,
    RefreshCw,
    X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { useCatalogManager, useResourceTypeRegistry } from '../contexts'
import {
  DEFAULT_TEXT_KIND_FILTER,
  filterPickerLanguages,
  type LanguagePickerListMode,
  type TextKindFilter,
} from '../features/read/filterPickerLanguages'
import type { HelpsModeFlag } from '../features/read/helpsLanguagePolicy'
import { fetchLanguageAvailabilityByCode } from '../features/read/languageAvailability'
import {
  loadLanguagesCache,
  saveLanguagesCache,
  type ListedLanguage,
} from '../features/read/languagesCache'
import { mergePickerLanguages } from '../features/read/mergePickerLanguages'
import { useWizardStore } from '../lib/stores/wizardStore'
import { LanguagePickerGrid } from './LanguagePickerGrid'
import { LanguagePickerTextKindFilter } from './LanguagePickerTextKindFilter'
import { ModalPortal } from './shared/ModalPortal'
import { useLanguagePickerOpen } from './useLanguagePickerOpen'

interface LanguagePickerProps {
  onLanguageSelected?: (languageCode: string) => void
  compact?: boolean
  autoOpen?: boolean
  /** When true, the dialog cannot be dismissed without choosing a language (Read page on /read). */
  required?: boolean
  /** Default `'text'` so header / Studio pickers are unchanged. */
  listMode?: LanguagePickerListMode
  /** Helps-list filter only (`bibleHelps` vs `obsHelps`). Ignored in text mode. */
  helpsFlag?: HelpsModeFlag
  /** Controlled open — empty-state CTA can open the same instance. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Extra classes on the trigger (Read panel chrome uses thumb-sized targets). */
  triggerClassName?: string
}

export function LanguagePicker({
  onLanguageSelected,
  compact = false,
  autoOpen = false,
  required = false,
  listMode = 'text',
  helpsFlag,
  open,
  onOpenChange,
  triggerClassName,
}: LanguagePickerProps) {
  const { isOpen, setOpen } = useLanguagePickerOpen({
    autoOpen,
    required,
    open,
    onOpenChange,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [textKind, setTextKind] = useState<TextKindFilter>(DEFAULT_TEXT_KIND_FILTER)
  const triggerLabel =
    listMode === 'helps' ? 'Select helps language' : 'Select language'
  const showTextKindFilter = listMode !== 'helps'

  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const setAvailableLanguages = useWizardStore((s) => s.setAvailableLanguages)

  // Get supported subjects for filtering (stable string for effect/callback deps)
  const supportedSubjects = resourceTypeRegistry.getSupportedSubjects()
  const supportedSubjectsKey = supportedSubjects.join(',')

  // Displayed list: show cache immediately, then update when revalidation completes
  const [displayedLanguages, setDisplayedLanguages] = useState<ListedLanguage[]>([])
  const [isRevalidating, setIsRevalidating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const revalidate = useCallback(async () => {
    setIsRevalidating(true)
    setError(null)
    try {
      const client = getDoor43ApiClient()
      const [door43Langs, availabilityByCode] = await Promise.all([
        // Full tc-ready list (no subject filter). Passing all plugin subjects
        // can collapse to the ~15 Aligned Bible GLs when OBS is not registered yet.
        client.getLanguages({
          stage: 'prod',
          topic: 'tc-ready',
        }),
        fetchLanguageAvailabilityByCode(client),
      ])
      const catalogStats = await catalogManager.getCatalogStats()
      const merged = mergePickerLanguages({
        catalogCodes: Object.keys(catalogStats.byLanguage),
        door43Langs,
        availabilityByCode,
      })
      saveLanguagesCache(merged, supportedSubjects)
      setDisplayedLanguages(merged)
      setAvailableLanguages(merged)
    } catch (err) {
      console.error('❌ Failed to revalidate languages:', err)
      setError(err as Error)
    } finally {
      setIsRevalidating(false)
    }
  }, [supportedSubjectsKey, catalogManager])

  const revalidateRef = useRef(revalidate)
  revalidateRef.current = revalidate

  // When picker opens: show cache immediately (optimistic), then revalidate in background
  useEffect(() => {
    if (!isOpen) return

    const cached = loadLanguagesCache(supportedSubjects)
    if (cached?.length) {
      setDisplayedLanguages(cached)
      setAvailableLanguages(cached)
    } else {
      setDisplayedLanguages([])
    }
    setError(null)
    revalidateRef.current()
  }, [isOpen])

  const languages = displayedLanguages
  const isLoading = isRevalidating && displayedLanguages.length === 0
  const retry = revalidate

  const filteredLanguages = filterPickerLanguages(languages, {
    searchQuery,
    listMode,
    helpsFlag,
    textKind: showTextKindFilter ? textKind : undefined,
  })

  const catalogLanguages = filteredLanguages.filter((l) => l.source === 'catalog')
  const onlineLanguages = filteredLanguages.filter((l) => l.source === 'door43')
  const showCount = (!isLoading || displayedLanguages.length > 0) && !error

  const resetAndClose = () => {
    setOpen(false)
    setSearchQuery('')
    setTextKind(DEFAULT_TEXT_KIND_FILTER)
  }

  const closeModal = () => {
    if (required) return
    resetAndClose()
  }

  const handleSelect = (code: string) => {
    onLanguageSelected?.(code)
    resetAndClose()
  }

  return (
    <div className="relative inline-flex shrink-0">
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center justify-center rounded transition-colors ${
          compact ? 'p-1 text-fg-secondary hover:bg-muted' : 'px-3 py-1.5 bg-accent text-white hover:bg-accent-hover shadow-md'
        } ${triggerClassName ?? ''}`}
        title={triggerLabel}
        aria-label={triggerLabel}
      >
        <Languages className="w-4 h-4" />
      </button>

      {isOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-overlay backdrop-blur-sm"
            onClick={required ? undefined : closeModal}
            aria-hidden="true"
          />
          <div
            className="relative flex flex-col bg-surface border border-border-subtle rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden m-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={triggerLabel}
          >
            <div className="px-chrome py-chrome-tight border-b border-border-subtle flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Languages className="w-5 h-5 text-accent shrink-0" aria-hidden />
                {showCount && (
                  <span className="inline-flex items-center gap-1 h-5 min-w-[1.25rem] px-1.5 rounded-full bg-accent-soft text-accent-fg text-micro font-semibold">
                    {isRevalidating && displayedLanguages.length > 0 && (
                      <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                    )}
                    {filteredLanguages.length}
                  </span>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                {showTextKindFilter && (
                  <LanguagePickerTextKindFilter value={textKind} onChange={setTextKind} />
                )}
                {!required && (
                  <button
                    onClick={closeModal}
                    className="p-1 hover:bg-muted rounded transition-colors text-fg-secondary"
                    title="Close"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-content min-h-0 bg-canvas">
              {isLoading && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-accent" />
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center py-20">
                  <AlertCircle className="w-12 h-12 text-danger mb-4" />
                  <button
                    onClick={retry}
                    className="flex items-center justify-center p-3 bg-accent text-white rounded-full hover:bg-accent-hover transition-colors"
                    title="Retry loading languages"
                    aria-label="Retry loading languages"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
              )}

              {!isLoading && !error && (
                <div className="flex flex-col gap-stack">
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-chrome-tight border border-border-subtle rounded-md bg-surface text-fg placeholder:text-fg-muted focus:ring-2 focus:ring-accent focus:border-accent"
                      placeholder="..."
                      aria-label="Search languages"
                    />
                  </div>
                  <LanguagePickerGrid
                    catalogLanguages={catalogLanguages}
                    onlineLanguages={onlineLanguages}
                    onSelect={handleSelect}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}
