/**
 * Read-only panel chrome. Do not change studio/PanelHeader.tsx.
 * Overflow menu is gone — mode switch + per-panel language.
 */

import { useState, type ReactNode } from 'react'
import { useResourceTypeRegistry } from '../../contexts/CatalogContext'
import type { ResourceInfo } from '../../contexts/types'
import { useTabDnDOptional } from '../../features/dnd/TabDnDContext'
import type { ReadPanelMode } from '../../features/read/readPanelModel'
import { resolveTabPresentationFromRegistry } from '../../features/tabs'
import { LanguagePicker } from '../LanguagePicker'
import { ResourceTabs } from '../studio/ResourceTabs'
import { ReadModeSwitch } from './ReadModeSwitch'
import { READ_HEADER_ICON_BUTTON } from './readHeaderChrome'

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

  const strip =
    colorScheme === 'blue' ? 'bg-panel-1-soft/70' : 'bg-panel-2-soft/70'

  return (
    <div className={`read-panel-header min-h-11 h-11 px-chrome flex items-center border-b border-border-subtle ${strip}`}>
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

        <div className="w-px h-5 bg-border flex-shrink-0" aria-hidden />

        <div className="flex-shrink-0 flex items-center gap-chrome-tight ml-auto">
          {headerActions}
          <div className="inline-flex items-center gap-0" role="group">
            <LanguagePicker
              compact
              listMode={languageListMode}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onLanguageSelected={onLanguageSelected}
              triggerClassName={READ_HEADER_ICON_BUTTON}
            />
            <ReadModeSwitch mode={mode} onModeSwitch={onModeSwitch} />
          </div>
        </div>
      </div>
    </div>
  )
}
