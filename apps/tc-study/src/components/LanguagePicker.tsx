/**
 * Language Picker Component
 *
 * Modal for selecting a language on the Read page. Styled like the resource
 * selection wizard in the Studio sidebar (header, progress strip, content, footer)
 * but with a single step: language selection only.
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
  filterPickerLanguages,
  type LanguagePickerListMode,
} from '../features/read/filterPickerLanguages'
import type { HelpsModeFlag } from '../features/read/helpsLanguagePolicy'
import {
  availabilityForCode,
  fetchLanguageAvailabilityByCode,
} from '../features/read/languageAvailability'
import {
  loadLanguagesCache,
  saveLanguagesCache,
  withAvailability,
  type ListedLanguage,
} from '../features/read/languagesCache'
import { useWizardStore } from '../lib/stores/wizardStore'
import { LanguagePickerRow } from './LanguagePickerRow'
import { ModalPortal } from './shared/ModalPortal'
import { SelectableGridWithStatus } from './shared/SelectableGrid'
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
}: LanguagePickerProps) {
  const { isOpen, setOpen } = useLanguagePickerOpen({
    autoOpen,
    required,
    open,
    onOpenChange,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const triggerLabel =
    listMode === 'helps' ? 'Select helps language' : 'Select language'

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
        client.getLanguages({
          subjects: supportedSubjects,
          stage: 'prod',
          topic: 'tc-ready',
        }),
        fetchLanguageAvailabilityByCode(client),
      ])
      const door43NameMap = new Map<string, string>()
      const door43DirectionMap = new Map<string, 'ltr' | 'rtl'>()
      for (const lang of door43Langs) {
        door43NameMap.set(lang.code, lang.name || lang.code.toUpperCase())
        door43DirectionMap.set(lang.code, lang.direction)
      }
      const catalogStats = await catalogManager.getCatalogStats()
      const catalogLanguageCodes = Object.keys(catalogStats.byLanguage)
      const languageMap = new Map<string, ListedLanguage>()
      for (const code of catalogLanguageCodes) {
        languageMap.set(
          code,
          withAvailability(
            {
              code,
              name: door43NameMap.get(code) || code.toUpperCase(),
              source: 'catalog',
              direction: door43DirectionMap.get(code),
            },
            availabilityForCode(availabilityByCode, code)
          )
        )
      }
      for (const lang of door43Langs) {
        if (!languageMap.has(lang.code)) {
          languageMap.set(
            lang.code,
            withAvailability(
              {
                code: lang.code,
                name: lang.name || lang.code.toUpperCase(),
                source: 'door43',
                direction: lang.direction,
              },
              availabilityForCode(availabilityByCode, lang.code)
            )
          )
        }
      }
      const merged = Array.from(languageMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      )
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
  })

  const catalogLanguages = filteredLanguages.filter((l) => l.source === 'catalog')
  const onlineLanguages = filteredLanguages.filter((l) => l.source === 'door43')

  const closeModal = () => {
    if (required) return
    setOpen(false)
    setSearchQuery('')
  }

  const handleSelect = (code: string) => {
    onLanguageSelected?.(code)
    setOpen(false)
    setSearchQuery('')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 rounded transition-colors ${
          compact ? 'p-1 text-fg-secondary hover:bg-muted' : 'px-3 py-1.5 bg-accent text-white hover:bg-accent-hover shadow-md'
        }`}
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
            className="relative flex flex-col bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden m-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="language-picker-title"
          >
            {/* Header - matches wizard */}
            <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-muted flex-shrink-0">
              <div className="flex items-center gap-2">
                <Languages className="w-5 h-5 text-accent" />
              </div>
              {!required && (
                <button
                  onClick={closeModal}
                  className="p-1 hover:bg-surface rounded transition-colors text-fg-secondary"
                  title="Close"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Progress strip - single step (wizard-style) */}
            <div className="px-4 py-2 border-b border-border bg-surface flex-shrink-0">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="p-1.5 rounded-full bg-accent text-white"
                    title="Language selection"
                    aria-label="Language selection"
                  >
                    <Languages className="w-3.5 h-3.5" />
                  </div>
                </div>
                {(!isLoading || displayedLanguages.length > 0) && !error && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-full">
                    {isRevalidating && displayedLanguages.length > 0 && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" aria-hidden />
                    )}
                    <Globe className="w-3.5 h-3.5 text-fg-secondary" />
                    <span className="text-xs font-medium text-fg">
                      {filteredLanguages.length}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Content - matches wizard step layout */}
            <div className="flex-1 overflow-auto p-4 min-h-0 bg-canvas">
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
                <div>
                  <div className="mb-4">
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-fg-muted" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-accent focus:border-accent bg-surface text-fg placeholder:text-fg-muted"
                        placeholder="..."
                        aria-label="Search languages"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {catalogLanguages.length > 0 && (
                      <SelectableGridWithStatus
                        items={catalogLanguages}
                        selected={new Set<string>()}
                        onToggle={handleSelect}
                        getKey={(lang) => lang.code}
                        getStatus={() => 'cached'}
                        renderItem={(lang, _selected, status) => (
                          <LanguagePickerRow lang={lang} status={status} />
                        )}
                      />
                    )}
                    {onlineLanguages.length > 0 && (
                      <SelectableGridWithStatus
                        items={onlineLanguages}
                        selected={new Set<string>()}
                        onToggle={handleSelect}
                        getKey={(lang) => lang.code}
                        getStatus={() => 'online'}
                        renderItem={(lang, _selected, status) => (
                          <LanguagePickerRow lang={lang} status={status} />
                        )}
                      />
                    )}
                    {filteredLanguages.length === 0 && (
                      <div className="text-center py-12 text-fg-muted">
                        <Globe className="w-12 h-12 mx-auto mb-3 text-fg-muted opacity-50" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer - matches wizard (Cancel only) */}
            {!required && (
              <div className="px-4 py-2 border-t border-border bg-muted flex-shrink-0">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={closeModal}
                    className="p-1.5 text-fg-secondary hover:bg-surface rounded transition-colors"
                    title="Cancel"
                    aria-label="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}
