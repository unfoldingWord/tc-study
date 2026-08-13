/**
 * Read-only panel chrome. Do not change studio/PanelHeader.tsx.
 * Overflow menu is gone — mode switch + per-panel language.
 */

import { BookOpen, LifeBuoy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useResourceTypeRegistry } from '../../contexts/CatalogContext'
import type { ResourceInfo } from '../../contexts/types'
import { useTabDnDOptional } from '../../features/dnd/TabDnDContext'
import type { HelpsModeFlag } from '../../features/read/helpsLanguagePolicy'
import type { ReadPanelMode } from '../../features/read/readPanelModel'
import { resolveTabPresentationFromRegistry } from '../../features/tabs'
import { LanguagePicker } from '../LanguagePicker'
import { ResourceTabs } from '../studio/ResourceTabs'

interface ReadPanelHeaderProps {
  resources: ResourceInfo[]
  currentIndex: number
  onIndexChange: (index: number) => void
  colorScheme: 'blue' | 'purple'
  panelId: string
  mode: ReadPanelMode
  onModeSwitch: (mode: ReadPanelMode) => void
  onLanguageSelected: (languageCode: string) => void
  languageListMode: 'text' | 'helps'
  helpsFlag?: HelpsModeFlag
  languagePickerOpen?: boolean
  onLanguagePickerOpenChange?: (open: boolean) => void
  showDropPlaceholder?: boolean
  placeholderLabel?: string
  placeholderIndex?: number | null
  headerActions?: ReactNode
}

export function ReadPanelHeader({
  resources,
  currentIndex,
  onIndexChange,
  colorScheme,
  panelId,
  mode,
  onModeSwitch,
  onLanguageSelected,
  languageListMode,
  helpsFlag,
  languagePickerOpen,
  onLanguagePickerOpenChange,
  showDropPlaceholder = false,
  placeholderLabel = '',
  placeholderIndex = null,
  headerActions,
}: ReadPanelHeaderProps) {
  const registry = useResourceTypeRegistry()
  const { activeIcon } = useTabDnDOptional()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const pickerOpen = languagePickerOpen ?? uncontrolledOpen
  const setPickerOpen = onLanguagePickerOpenChange ?? setUncontrolledOpen

  const colors = {
    blue: {
      strip: 'bg-panel-1-soft/70',
      button: 'hover:bg-accent/15 active:bg-accent/25',
      icon: 'text-panel-1-fg',
    },
    purple: {
      strip: 'bg-panel-2-soft/70',
      button: 'hover:bg-panel-2/15 active:bg-panel-2/25',
      icon: 'text-panel-2-fg',
    },
  }
  const c = colors[colorScheme]
  const nextMode: ReadPanelMode = mode === 'scripture' ? 'helps' : 'scripture'
  const modeTitle = nextMode === 'helps' ? 'Show helps' : 'Show scripture'

  return (
    <div className={`min-h-11 h-11 px-chrome flex items-center border-b border-border-subtle ${c.strip}`}>
      <div className="flex items-center gap-chrome-tight min-w-0 w-full h-full">
        <ResourceTabs
          resources={resources}
          currentIndex={currentIndex}
          onIndexChange={onIndexChange}
          getTabPresentation={(r) =>
            resolveTabPresentationFromRegistry(r as ResourceInfo, registry)
          }
          colorScheme={colorScheme}
          panelId={panelId}
          showDropPlaceholder={showDropPlaceholder}
          placeholderLabel={placeholderLabel}
          placeholderIcon={activeIcon}
          placeholderIndex={placeholderIndex}
        />

        <div className="flex-shrink-0 flex items-center gap-chrome-tight ml-auto">
          {headerActions}
          <LanguagePicker
            compact
            listMode={languageListMode}
            helpsFlag={helpsFlag}
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            onLanguageSelected={onLanguageSelected}
            triggerClassName="min-h-11 min-w-11 justify-center"
          />
          <button
            type="button"
            onClick={() => onModeSwitch(nextMode)}
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-md ${c.button} transition-colors`}
            title={modeTitle}
            aria-label={modeTitle}
          >
            {nextMode === 'helps' ? (
              <LifeBuoy className={`w-5 h-5 ${c.icon}`} />
            ) : (
              <BookOpen className={`w-5 h-5 ${c.icon}`} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
