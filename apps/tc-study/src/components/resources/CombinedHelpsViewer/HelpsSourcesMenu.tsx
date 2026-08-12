import { BookMarked, Info, NotebookPen, Scale } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../../contexts/AppContext'
import type { ResourceInfo } from '../../../contexts/types'
import { useWorkspaceStore } from '../../../features/workspace/workspaceStore'
import { ModalPortal } from '../../shared/ModalPortal'
import { ResourceInfoModal } from '../../studio/ResourceInfoModal'
import { chromeIconButtonClass } from '../common/chromeIconButton'
import {
  licenseIdOf,
  releaseVersionOf,
  toResourceInfoModalProps,
} from '../common/resourceInfoModalProps'

export { licenseIdOf, releaseVersionOf, toResourceInfoModalProps }

function lookupLoadedResource(
  loadedResources: Record<string, ResourceInfo | undefined>,
  key: string
): ResourceInfo | undefined {
  if (!key) return undefined
  return (
    loadedResources[key] ??
    Object.values(loadedResources).find((r) => r?.key === key || r?.id === key)
  )
}

/**
 * Resolve a helps peer (TN/TWL) for Sources rows.
 *
 * Unlock 1 keeps TN/TWL in the workspace package map but strips them from panel
 * keys, so AppStore `loadedResources` often has TN (orphan from an earlier
 * assign) and never projects TWL (stripped in the same tick as assign). Prefer
 * the package map — that is the SoT for helps pointers.
 */
export function lookupHelpsSourceResource(
  key: string,
  packageResources: Map<string, ResourceInfo> | Record<string, ResourceInfo> | undefined,
  loadedResources: Record<string, ResourceInfo | undefined>
): ResourceInfo | undefined {
  if (!key) return undefined
  if (packageResources) {
    const fromPackage =
      packageResources instanceof Map ? packageResources.get(key) : packageResources[key]
    if (fromPackage) return fromPackage
    if (packageResources instanceof Map) {
      for (const r of packageResources.values()) {
        if (r?.key === key || r?.id === key) return r
      }
    } else {
      const byScan = Object.values(packageResources).find((r) => r?.key === key || r?.id === key)
      if (byScan) return byScan
    }
  }
  return lookupLoadedResource(loadedResources, key)
}

type SourceKind = 'tn' | 'twl'

interface SourceRow {
  kind: SourceKind
  resource: ResourceInfo
}

interface HelpsSourcesMenuProps {
  tnKey: string
  twlKey: string
}

/**
 * Icon-first Sources control for Combined Helps.
 * Lists resolved TN + TWL packages; row opens real ResourceInfoModal metadata.
 */
export function HelpsSourcesMenu({ tnKey, twlKey }: HelpsSourcesMenuProps) {
  const [open, setOpen] = useState(false)
  const [infoResource, setInfoResource] = useState<ResourceInfo | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  const loadedResources = useAppStore((s) => s.loadedResources)
  const packageResources = useWorkspaceStore((s) => s.currentPackage?.resources)

  const sources = useMemo((): SourceRow[] => {
    const rows: SourceRow[] = []
    const tn = lookupHelpsSourceResource(tnKey, packageResources, loadedResources)
    const twl = lookupHelpsSourceResource(twlKey, packageResources, loadedResources)
    if (tn) rows.push({ kind: 'tn', resource: tn })
    if (twl) rows.push({ kind: 'twl', resource: twl })
    return rows
  }, [loadedResources, packageResources, tnKey, twlKey])

  useEffect(() => {
    if (!open) return
    const update = () => {
      const el = buttonRef.current
      if (!el) {
        setPos({ top: 56, right: 12 })
        return
      }
      const rect = el.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        title="Sources"
        aria-label="Sources"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-pressed={open}
        className={chromeIconButtonClass(open)}
      >
        <Info className="w-4 h-4" aria-hidden />
      </button>

      {open && pos ? (
        <ModalPortal>
          <div
            ref={menuRef}
            role="menu"
            aria-label="Sources"
            className="fixed z-[100] min-w-[14rem] max-w-[20rem] py-1 bg-elevated border border-border rounded-lg shadow-lg"
            style={{ top: pos.top, right: pos.right }}
          >
            {sources.length === 0 ? (
              <div className="px-3 py-2 text-chrome text-fg-muted flex items-center gap-2">
                <Scale className="w-4 h-4 shrink-0 opacity-60" aria-hidden />
              </div>
            ) : (
              sources.map(({ kind, resource }) => {
                const Icon = kind === 'tn' ? NotebookPen : BookMarked
                const lang = (resource.languageCode ?? resource.language ?? '').toString()
                const owner = typeof resource.owner === 'string' ? resource.owner : ''
                const version = releaseVersionOf(resource)
                const license = licenseIdOf(resource)
                const meta = [owner, lang, version, license].filter(Boolean).join(' · ')
                const label =
                  kind === 'tn'
                    ? resource.title || 'Translation Notes'
                    : resource.title || 'Translation Words List'
                return (
                  <button
                    key={`${kind}-${resource.key || resource.id}`}
                    type="button"
                    role="menuitem"
                    title={label}
                    aria-label={meta ? `${label}. ${meta}` : label}
                    onClick={() => {
                      setInfoResource(resource)
                      setOpen(false)
                    }}
                    className="w-full flex items-start gap-2 px-3 py-2 text-left transition-colors text-fg-secondary hover:bg-muted"
                  >
                    <Icon className="w-4 h-4 shrink-0 mt-0.5 text-helps-fg" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-chrome font-medium text-fg truncate">{label}</span>
                      {meta ? (
                        <span className="block text-caption text-fg-muted truncate">{meta}</span>
                      ) : null}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </ModalPortal>
      ) : null}

      {infoResource ? (
        <ResourceInfoModal
          isOpen
          onClose={() => setInfoResource(null)}
          resource={toResourceInfoModalProps(infoResource)}
        />
      ) : null}
    </div>
  )
}
