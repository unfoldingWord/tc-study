import { ArrowLeftRight, MoreVertical, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useResourceTypeRegistry } from '../../contexts/CatalogContext'
import type { ResourceInfo } from '../../contexts/types'
import { useTabDnDOptional } from '../../features/dnd/TabDnDContext'
import { resolveTabPresentationFromRegistry } from '../../features/tabs'
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
  /** Trailing chrome on the right of the tab strip (e.g. helps-pane Languages picker). */
  headerActions?: ReactNode
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
  headerActions,
}: PanelHeaderProps) {
  const registry = useResourceTypeRegistry()
  const { activeIcon } = useTabDnDOptional()
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

  return (
    <div
      className={`h-chrome-bar px-chrome flex items-center border-b border-border-subtle ${c.strip}`}
    >
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

        {(headerActions || currentResource) ? (
          <div className="flex-shrink-0 flex items-center gap-chrome-tight ml-auto">
            {headerActions}
            {currentResource && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className={`h-chrome-control w-chrome-control flex items-center justify-center rounded-md ${c.button} transition-colors`}
                  title="Actions"
                  aria-label="Resource actions"
                  aria-expanded={menuOpen}
                  aria-haspopup="true"
                >
                  <MoreVertical className={`w-4 h-4 ${c.icon}`} />
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 w-auto py-1 bg-elevated border border-border rounded-lg shadow-lg z-50"
                    role="menu"
                  >
                    {onMoveToOtherPanel && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          onMoveToOtherPanel()
                          setMenuOpen(false)
                        }}
                        className="flex items-center justify-center p-2 hover:bg-muted"
                        title="Move to other panel"
                        aria-label="Move to other panel"
                      >
                        <ArrowLeftRight className="w-4 h-4 text-fg-secondary" />
                      </button>
                    )}
                    <button
                      role="menuitem"
                      onClick={() => {
                        onRemove()
                        setMenuOpen(false)
                      }}
                      className="flex items-center justify-center p-2 hover:bg-danger-soft"
                      title="Remove from panel"
                      aria-label="Remove from panel"
                    >
                      <X className="w-4 h-4 text-danger" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
