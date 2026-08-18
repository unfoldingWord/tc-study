/**
 * Language Picker Component
 *
 * Modal for selecting a language on the Read page. Icon-first chrome: one
 * header icon + count badge + Bible/OBS filter. Fetch subjects follow
 * listMode + navigationScope (`subjectsForLanguageList`); chrome stays shared.
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
import { useLocation } from 'react-router-dom'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import {
  useCatalogManager,
  useNavigationScope,
  useResourceTypeRegistry,
} from '../contexts'
import {
  DEFAULT_TEXT_KIND_FILTER,
  filterPickerLanguages,
  type LanguagePickerListMode,
  type TextKindFilter,
} from '../features/read/filterPickerLanguages'
import { fetchLanguageAvailabilityByCode } from '../features/read/languageAvailability'
import { resolvePickerLanguageList } from '../features/read/languageListKind'
import {
  loadLanguagesCache,
  loadPickerDisplayCache,
  saveLanguagesCache,
  savePickerDisplayCache,
  type ListedLanguage,
} from '../features/read/languagesCache'
import {
  filterCachedLanguagesForKind,
  revalidatePickerLanguages,
} from '../features/read/revalidatePickerLanguages'
import { supportedSubjectsFromRegistry } from '../features/read/scriptureLanguageMismatch'
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
  /** Label + which subject set to fetch (`text` vs `helps`). */
  listMode?: LanguagePickerListMode
  /** Nav text mode — scopes scripture/OBS vs bible/OBS-helps subjects. Omit on bootstrap → global. */
  navigationScope?: 'scripture' | 'obs' | null
  /** Controlled open — empty-state CTA can open the same instance. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Extra classes on the trigger (Read panel chrome uses thumb-sized targets). */
  triggerClassName?: string
  /** This pane's language — strong selected card. */
  currentLanguageCode?: string | null
  /** Sibling pane's language — softer selected card when different. */
  otherLanguageCode?: string | null
}

export function LanguagePicker({
  onLanguageSelected,
  compact = false,
  autoOpen = false,
  required = false,
  listMode = 'text',
  navigationScope = null,
  open,
  onOpenChange,
  triggerClassName,
  currentLanguageCode,
  otherLanguageCode,
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

  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const setAvailableLanguages = useWizardStore((s) => s.setAvailableLanguages)
  const storeScope = useNavigationScope()
  const { pathname } = useLocation()

  const { kind: listKind, subjects: listSubjects, cacheKey: listCacheKey } =
    resolvePickerLanguageList({
      listMode,
      navigationScope,
      pathname,
      storeScope,
      subjectsForKind: (kind) => resourceTypeRegistry.subjectsForLanguageList(kind),
    })
  const globalSubjects = supportedSubjectsFromRegistry(resourceTypeRegistry)
  const listSubjectsKey = listSubjects.join(',')
  const globalSubjectsKey = globalSubjects.join(',')

  // Displayed list: show cache immediately, then update when revalidation completes
  const [displayedLanguages, setDisplayedLanguages] = useState<ListedLanguage[]>([])
  const [isRevalidating, setIsRevalidating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const revalidate = useCallback(async () => {
    setIsRevalidating(true)
    setError(null)
    try {
      const client = getDoor43ApiClient()
      const [availabilityByCode, catalogStats] = await Promise.all([
        fetchLanguageAvailabilityByCode(client),
        catalogManager.getCatalogStats(),
      ])
      const { display, global } = await revalidatePickerLanguages({
        client,
        kind: listKind,
        listSubjects,
        globalSubjects,
        catalogCodes: Object.keys(catalogStats.byLanguage),
        availabilityByCode,
      })
      saveLanguagesCache(global, globalSubjects)
      savePickerDisplayCache(listCacheKey, display, globalSubjects)
      setDisplayedLanguages(display)
      setAvailableLanguages(global)
    } catch (err) {
      console.error('❌ Failed to revalidate languages:', err)
      setError(err as Error)
    } finally {
      setIsRevalidating(false)
    }
  }, [listKind, listSubjectsKey, listCacheKey, globalSubjectsKey, catalogManager])

  const revalidateRef = useRef(revalidate)
  revalidateRef.current = revalidate

  // When picker opens: show cache immediately (optimistic), then revalidate in background
  useEffect(() => {
    if (!isOpen) return

    const fromDisplay = loadPickerDisplayCache(listCacheKey, globalSubjects)
    if (fromDisplay?.length) {
      setDisplayedLanguages(fromDisplay)
    } else {
      const cached = loadLanguagesCache(globalSubjects)
      if (cached?.length) {
        setDisplayedLanguages(filterCachedLanguagesForKind(cached, listKind))
        setAvailableLanguages(cached)
      } else {
        setDisplayedLanguages([])
      }
    }
    setError(null)
    revalidateRef.current()
  }, [isOpen, listKind, listCacheKey, globalSubjectsKey])

  const languages = displayedLanguages
  const isLoading = isRevalidating && displayedLanguages.length === 0
  const retry = revalidate

  const filteredLanguages = filterPickerLanguages(languages, {
    searchQuery,
    textKind,
    listMode,
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
                <LanguagePickerTextKindFilter value={textKind} onChange={setTextKind} />
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
                      placeholder="Search..."
                      aria-label="Search languages"
                    />
                  </div>
                  <LanguagePickerGrid
                    catalogLanguages={catalogLanguages}
                    onlineLanguages={onlineLanguages}
                    onSelect={handleSelect}
                    currentLanguageCode={currentLanguageCode}
                    otherLanguageCode={otherLanguageCode}
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
