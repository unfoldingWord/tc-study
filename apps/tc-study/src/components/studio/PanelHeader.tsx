import { ArrowLeftRight, Info, MoreVertical, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useResourceTypeRegistry } from '../../contexts/CatalogContext'
import type { ResourceInfo } from '../../contexts/types'
import { useTabDnDOptional } from '../../features/dnd/TabDnDContext'
import { resolveTabPresentationFromRegistry } from '../../features/tabs'
import { ResourceInfoModal } from './ResourceInfoModal'
import { ResourceTabs } from './ResourceTabs'

interface PanelHeaderProps {
  resources: ResourceInfo[]
  currentIndex: number
  currentResource: ResourceInfo | null | undefined
  onIndexChange: (index: number) => void
  onRemove: () => void
  /** Move current resource to the other panel. When provided, shows menu item. */
  onMoveToOtherPanel?: () => void
  colorScheme: 'blue' | 'purple'
  /** Panel id (e.g. 'panel-1'). Required for tab pointer DnD. */
  panelId: string
  /** Show a ghost placeholder tab when dragging from another panel */
  showDropPlaceholder?: boolean
  /** Label for the placeholder tab */
  placeholderLabel?: string
  /** Index where the placeholder should appear (null = end of tabs) */
  placeholderIndex?: number | null
}

export function PanelHeader({
  resources,
  currentIndex,
  currentResource,
  onIndexChange,
  onRemove,
  onMoveToOtherPanel,
  colorScheme,
  panelId,
  showDropPlaceholder = false,
  placeholderLabel = '',
  placeholderIndex = null,
}: PanelHeaderProps) {
  const registry = useResourceTypeRegistry()
  const { activeIcon } = useTabDnDOptional()
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const colors = {
    blue: {
      gradient: 'from-blue-50 to-gray-50',
      button: 'hover:bg-blue-100 active:bg-blue-200',
      icon: 'text-blue-600',
    },
    purple: {
      gradient: 'from-purple-50 to-gray-50',
      button: 'hover:bg-purple-100 active:bg-purple-200',
      icon: 'text-purple-600',
    },
  }
  const c = colors[colorScheme]

  return (
    <div className={`px-2 pt-1.5 pb-0 md:px-3 md:pt-2 md:pb-0 bg-gradient-to-r ${c.gradient}`}>
      <div className="flex items-center gap-2 min-w-0">
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

        {currentResource && (
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className={`p-2.5 min-w-10 min-h-10 flex items-center justify-center rounded ${c.button} transition-colors`}
              title="Actions"
              aria-label="Resource actions"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              <MoreVertical className={`w-5 h-5 ${c.icon}`} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-auto py-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
                role="menu"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setShowInfoModal(true)
                    setMenuOpen(false)
                  }}
                  className="flex items-center justify-center p-2 hover:bg-gray-100"
                  title="Resource info"
                  aria-label="Resource info"
                >
                  <Info className="w-4 h-4 text-gray-500" />
                </button>
                {onMoveToOtherPanel && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      onMoveToOtherPanel()
                      setMenuOpen(false)
                    }}
                    className="flex items-center justify-center p-2 hover:bg-gray-100"
                    title="Move to other panel"
                    aria-label="Move to other panel"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-gray-500" />
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    onRemove()
                    setMenuOpen(false)
                  }}
                  className="flex items-center justify-center p-2 hover:bg-red-50"
                  title="Remove from panel"
                  aria-label="Remove from panel"
                >
                  <X className="w-4 h-4 text-red-600" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {currentResource && (
        <ResourceInfoModal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          resource={{
            title: currentResource.title,
            key: currentResource.key,
            owner: currentResource.owner,
            languageCode: currentResource.languageCode ?? currentResource.language,
            subject: currentResource.subject,
            description: currentResource.description,
            readme: currentResource.readme,
            license:
              typeof currentResource.license === 'string'
                ? currentResource.license
                : currentResource.license?.id,
          }}
        />
      )}
    </div>
  )
}
