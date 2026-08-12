import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Library,
  List,
  ListOrdered,
  Menu,
  X,
} from 'lucide-react'
import type { RefObject } from 'react'
import {
  useAvailableBooks,
  useCurrentReference,
  useNavigation,
  useNavigationHistory,
  useNavigationMode,
} from '../../contexts'
import { useBookTitleSource } from '../../contexts/AppContext'
import { formatReferenceParts } from '../../features/nav/navigationBarReferenceFormat'
import { LanguagePicker } from '../LanguagePicker'
import { BCVNavigator } from './BCVNavigator'
import { NavigationBarMenu } from './NavigationBarMenu'
import { NavigationBarVersionModal } from './NavigationBarVersionModal'
import { NavigationHistoryModal } from './NavigationHistoryModal'
import { NavigationTypeSelector } from './NavigationTypeSelector'
import { ObsNavigationTypeSelector } from './ObsNavigationTypeSelector'

interface NavigationBarCompactProps {
  isRtl: boolean
  hasObsResource: boolean
  modeLabel: string
  handlePrevious: () => void
  handleNext: () => void
  canGoPrevious: () => boolean
  canGoNext: () => boolean
  downloadIndicator?: React.ReactNode
  showLanguagePicker?: boolean
  onLanguageSelected?: (languageCode: string) => void
  autoOpenLanguagePicker?: boolean
  languagePickerRequired?: boolean
  onDownloadCollection?: () => void
  onLoadCollection?: () => void
  isNavigatorOpen: boolean
  setIsNavigatorOpen: (open: boolean) => void
  isHistoryOpen: boolean
  setIsHistoryOpen: (open: boolean) => void
  isTypeSelectorOpen: boolean
  setIsTypeSelectorOpen: (open: boolean) => void
  isMenuOpen: boolean
  setIsMenuOpen: (open: boolean) => void
  isVersionOpen: boolean
  setIsVersionOpen: (open: boolean) => void
  menuRef: RefObject<HTMLDivElement | null>
  typeSelectorRef: RefObject<HTMLDivElement | null>
}

export function NavigationBarCompact({
  isRtl,
  hasObsResource,
  modeLabel,
  handlePrevious,
  handleNext,
  canGoPrevious,
  canGoNext,
  downloadIndicator,
  showLanguagePicker = false,
  onLanguageSelected,
  autoOpenLanguagePicker = false,
  languagePickerRequired = false,
  onDownloadCollection,
  onLoadCollection,
  isNavigatorOpen,
  setIsNavigatorOpen,
  isHistoryOpen,
  setIsHistoryOpen,
  isTypeSelectorOpen,
  setIsTypeSelectorOpen,
  isMenuOpen,
  setIsMenuOpen,
  isVersionOpen,
  setIsVersionOpen,
  menuRef,
  typeSelectorRef,
}: NavigationBarCompactProps) {
  const navigation = useNavigation()
  const currentRef = useCurrentReference()
  const navigationMode = useNavigationMode()
  const history = useNavigationHistory()
  const availableBooks = useAvailableBooks()
  const bookTitleSource = useBookTitleSource()

  const { bookPart, numberPart } = formatReferenceParts(
    currentRef,
    navigationMode,
    isRtl,
    bookTitleSource
  )

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex items-center gap-1">
        {navigation.canGoBack() && (
          <button
            onClick={() => navigation.goBack()}
            className="p-2 rounded-full hover:bg-muted text-fg-secondary hover:text-fg transition-colors"
            title="Go back in navigation history"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 bg-accent-soft px-2 py-2 rounded-full">
          <button
            onClick={isRtl ? handleNext : handlePrevious}
            disabled={isRtl ? !canGoNext() : !canGoPrevious()}
            className="w-7 h-7 rounded-full bg-accent/25 hover:bg-accent/35 disabled:opacity-40 disabled:cursor-not-allowed text-accent-fg transition-colors flex items-center justify-center flex-shrink-0"
            title={isRtl ? `Next ${modeLabel}` : `Previous ${modeLabel}`}
            aria-label={isRtl ? 'Next' : 'Previous'}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div className="relative" ref={typeSelectorRef}>
            {currentRef.book === 'obs' ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsTypeSelectorOpen(!isTypeSelectorOpen)}
                  className="p-1.5 hover:bg-accent/15 text-accent-fg transition-colors rounded-full flex items-center justify-center"
                  title={`Navigation type: ${modeLabel}`}
                >
                  {navigationMode === 'chapter' ? (
                    <Library className="w-4 h-4" />
                  ) : (
                    <BookMarked className="w-4 h-4" />
                  )}
                </button>
                {isTypeSelectorOpen && (
                  <ObsNavigationTypeSelector onClose={() => setIsTypeSelectorOpen(false)} />
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsTypeSelectorOpen(!isTypeSelectorOpen)}
                  className="p-1.5 hover:bg-accent/15 text-accent-fg transition-colors rounded-full flex items-center justify-center"
                  title={`Navigation type: ${modeLabel}`}
                >
                  {navigationMode === 'verse' && <BookOpen className="w-4 h-4" />}
                  {navigationMode === 'chapter' && <Library className="w-4 h-4" />}
                  {navigationMode === 'section' && <List className="w-4 h-4" />}
                  {navigationMode === 'passage-set' && <ListOrdered className="w-4 h-4" />}
                </button>
                {isTypeSelectorOpen && (
                  <NavigationTypeSelector onClose={() => setIsTypeSelectorOpen(false)} />
                )}
              </>
            )}
          </div>

          <div className="w-px h-6 bg-accent/30" />

          <button
            onClick={() => setIsNavigatorOpen(true)}
            className="px-3 py-1 hover:bg-accent/15 text-sm font-medium text-accent-fg transition-colors rounded-md inline-flex items-center gap-1"
            title="Click to navigate or adjust range"
            dir={isRtl && currentRef.book !== 'obs' ? 'rtl' : 'ltr'}
          >
            {isRtl && currentRef.book !== 'obs' ? (
              <span className="inline-flex flex-row-reverse gap-1" dir="rtl">
                <span>{numberPart}</span>
                <span>{bookPart}</span>
              </span>
            ) : (
              <span className="inline-flex gap-1" dir="ltr">
                <span>{bookPart}</span>
                <span>{numberPart}</span>
              </span>
            )}
          </button>

          <button
            onClick={isRtl ? handlePrevious : handleNext}
            disabled={isRtl ? !canGoPrevious() : !canGoNext()}
            className="w-7 h-7 rounded-full bg-accent/25 hover:bg-accent/35 disabled:opacity-40 disabled:cursor-not-allowed text-accent-fg transition-colors flex items-center justify-center flex-shrink-0"
            title={isRtl ? `Previous ${modeLabel}` : `Next ${modeLabel}`}
            aria-label={isRtl ? 'Previous' : 'Next'}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {downloadIndicator}
        {showLanguagePicker && (
          <LanguagePicker
            onLanguageSelected={onLanguageSelected}
            compact
            autoOpen={autoOpenLanguagePicker}
            required={languagePickerRequired}
          />
        )}

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-full hover:bg-muted text-fg-secondary hover:text-fg transition-colors"
            title={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {isMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          {isMenuOpen && (
            <NavigationBarMenu
              history={history}
              showLanguagePicker={showLanguagePicker}
              onOpenHistory={() => setIsHistoryOpen(true)}
              onOpenVersion={() => setIsVersionOpen(true)}
              onDownloadCollection={onDownloadCollection}
              onLoadCollection={onLoadCollection}
              onClose={() => setIsMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {isVersionOpen && <NavigationBarVersionModal onClose={() => setIsVersionOpen(false)} />}

      {isNavigatorOpen && (availableBooks.length > 0 || hasObsResource) && (
        <BCVNavigator
          onClose={() => setIsNavigatorOpen(false)}
          mode={navigationMode === 'section' && currentRef.book !== 'obs' ? 'section' : 'verse'}
        />
      )}

      {isHistoryOpen && <NavigationHistoryModal onClose={() => setIsHistoryOpen(false)} />}
    </div>
  )
}
