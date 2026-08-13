/**
 * Custom Pointer Events long-press FSM for panel resource tabs.
 * Portal overlay + elementFromPoint drop targets — no HTML5 DnD / no @dnd-kit.
 *
 * Touch: long-press ~350ms, cancel if move exceeds tolerance (scroll wins).
 * Mouse/pen: distance activation (no long-press) for desktop parity.
 *
 * Unlock 1: painted hit-test keys and store panel.resourceKeys share one SoT
 * (CombinedHelps no longer leaves hidden TN/TWL in the panel key list).
 * Do not add permanent visible→raw index-map / coordinate-system layers —
 * Unlock 1 retires dual painted≠raw as architecture.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import type { StudioPanelId } from '../studio/studioDnDHelpers'
import {
  TAB_DND_ATTR,
  TAB_DND_LONG_PRESS_MS,
  TAB_DND_MOVE_TOLERANCE_PX,
} from './tabDnDConstants'
import { commitTabDrop, resolveDropFromPoint, type TabDropTarget } from './tabDnDHitTest'

const MOUSE_ACTIVATION_DISTANCE_PX = 6

type PendingPress = {
  key: string
  panelId: StudioPanelId
  label: string
  Icon: LucideIcon | null
  showShortLabel: boolean
  pointerId: number
  pointerType: string
  startX: number
  startY: number
  timer: ReturnType<typeof setTimeout> | null
}

type ActiveDrag = {
  key: string
  panelId: StudioPanelId
  label: string
  Icon: LucideIcon | null
  showShortLabel: boolean
  pointerId: number
  x: number
  y: number
}

export type TabDnDPublicState = {
  activeId: string | null
  activeLabel: string | null
  /** Resolved tab icon for overlay / cross-panel placeholder */
  activeIcon: LucideIcon | null
  hoverPanelId: StudioPanelId | null
  /** Insert index for ghost placeholder; null when not hovering other panel */
  dropIndex: number | null
  isDragging: boolean
  /** True while a drag is active — tab strips should disable overflow scroll */
  scrollLocked: boolean
}

type TabDnDContextValue = TabDnDPublicState & {
  beginTabPress: (opts: {
    key: string
    panelId: StudioPanelId
    label: string
    Icon?: LucideIcon | null
    showShortLabel?: boolean
    event: ReactPointerEvent
  }) => void
  /** Call from tab onClick; returns true if the click should be ignored */
  shouldSuppressClick: () => boolean
}

const TabDnDContext = createContext<TabDnDContextValue | null>(null)

export function useTabDnD(): TabDnDContextValue {
  const ctx = useContext(TabDnDContext)
  if (!ctx) {
    throw new Error('useTabDnD must be used within TabDnDProvider')
  }
  return ctx
}

/** Optional: components outside provider get inert defaults. */
export function useTabDnDOptional(): TabDnDPublicState {
  const ctx = useContext(TabDnDContext)
  return (
    ctx ?? {
      activeId: null,
      activeLabel: null,
      activeIcon: null,
      hoverPanelId: null,
      dropIndex: null,
      isDragging: false,
      scrollLocked: false,
    }
  )
}

export interface TabDnDProviderProps {
  /**
   * Tab keys in store order (Unlock 1: painted === panel.resourceKeys for Studio).
   * Read may pass book-filtered keys; callers convert commit indices to store space.
   */
  panel1Keys: string[]
  panel2Keys: string[]
  getLabel: (resourceKey: string) => string
  onReorder: (resourceKey: string, panelId: StudioPanelId, newIndex: number) => void
  onMove: (
    resourceKey: string,
    from: StudioPanelId,
    to: StudioPanelId,
    insertIndex?: number
  ) => void
  children: ReactNode
}

export function TabDnDProvider({
  panel1Keys,
  panel2Keys,
  getLabel,
  onReorder,
  onMove,
  children,
}: TabDnDProviderProps) {
  const [active, setActive] = useState<ActiveDrag | null>(null)
  const [hover, setHover] = useState<TabDropTarget | null>(null)
  const pendingRef = useRef<PendingPress | null>(null)
  const activeRef = useRef<ActiveDrag | null>(null)
  const suppressClickRef = useRef(false)
  const keysRef = useRef({ panel1Keys, panel2Keys })
  const callbacksRef = useRef({ onReorder, onMove, getLabel })

  keysRef.current = { panel1Keys, panel2Keys }
  callbacksRef.current = { onReorder, onMove, getLabel }
  activeRef.current = active

  const clearPending = useCallback(() => {
    const pending = pendingRef.current
    if (pending?.timer) clearTimeout(pending.timer)
    pendingRef.current = null
  }, [])

  const updateHoverAt = useCallback((x: number, y: number, key: string) => {
    const { panel1Keys: p1, panel2Keys: p2 } = keysRef.current
    setHover(resolveDropFromPoint(x, y, p1, p2, key))
  }, [])

  const startDrag = useCallback(
    (pending: PendingPress, x: number, y: number) => {
      if (pending.timer) clearTimeout(pending.timer)
      pendingRef.current = null
      const next: ActiveDrag = {
        key: pending.key,
        panelId: pending.panelId,
        label: pending.label,
        Icon: pending.Icon,
        showShortLabel: pending.showShortLabel,
        pointerId: pending.pointerId,
        x,
        y,
      }
      activeRef.current = next
      setActive(next)
      suppressClickRef.current = true
      updateHoverAt(x, y, pending.key)
    },
    [updateHoverAt]
  )

  const endDrag = useCallback(
    (clientX: number, clientY: number, commit: boolean) => {
      const drag = activeRef.current
      clearPending()
      setActive(null)
      activeRef.current = null

      if (!drag) {
        setHover(null)
        return
      }

      if (commit) {
        const { panel1Keys: p1, panel2Keys: p2 } = keysRef.current
        const target = resolveDropFromPoint(clientX, clientY, p1, p2, drag.key)
        if (target) {
          commitTabDrop({
            activeKey: drag.key,
            sourcePanelId: drag.panelId,
            target,
            panel1Keys: p1,
            panel2Keys: p2,
            onReorder: callbacksRef.current.onReorder,
            onMove: callbacksRef.current.onMove,
          })
        }
      }

      setHover(null)
    },
    [clearPending]
  )

  const beginTabPress = useCallback(
    (opts: {
      key: string
      panelId: StudioPanelId
      label: string
      Icon?: LucideIcon | null
      showShortLabel?: boolean
      event: ReactPointerEvent
    }) => {
      const { key, panelId, label, Icon = null, showShortLabel = true, event } = opts
      if (event.button !== 0 && event.pointerType === 'mouse') return
      if (activeRef.current) return

      clearPending()
      const startX = event.clientX
      const startY = event.clientY
      const pointerId = event.pointerId
      const pointerType = event.pointerType || 'mouse'
      const isTouch = pointerType === 'touch'

      const pending: PendingPress = {
        key,
        panelId,
        label: label || callbacksRef.current.getLabel(key),
        Icon,
        showShortLabel,
        pointerId,
        pointerType,
        startX,
        startY,
        timer: null,
      }

      if (isTouch) {
        pending.timer = setTimeout(() => {
          const current = pendingRef.current
          if (!current || current.pointerId !== pointerId) return
          startDrag(current, current.startX, current.startY)
        }, TAB_DND_LONG_PRESS_MS)
      }

      pendingRef.current = pending

      try {
        ;(event.currentTarget as HTMLElement).setPointerCapture?.(pointerId)
      } catch {
        // optional
      }
    },
    [clearPending, startDrag]
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pending = pendingRef.current
      if (pending && e.pointerId === pending.pointerId) {
        const dist = Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY)
        if (pending.pointerType === 'touch') {
          if (dist > TAB_DND_MOVE_TOLERANCE_PX) clearPending()
          return
        }
        // Mouse/pen: activate after small distance
        if (dist >= MOUSE_ACTIVATION_DISTANCE_PX) {
          startDrag(pending, e.clientX, e.clientY)
        }
        return
      }

      const drag = activeRef.current
      if (!drag || e.pointerId !== drag.pointerId) return

      e.preventDefault()
      const next: ActiveDrag = {
        ...drag,
        x: e.clientX,
        y: e.clientY,
      }
      activeRef.current = next
      setActive(next)
      updateHoverAt(e.clientX, e.clientY, drag.key)
    }

    const onUp = (e: PointerEvent) => {
      const pending = pendingRef.current
      if (pending && e.pointerId === pending.pointerId) {
        clearPending()
        // Tap — do not suppress click
        suppressClickRef.current = false
        return
      }
      const drag = activeRef.current
      if (!drag || e.pointerId !== drag.pointerId) return
      endDrag(e.clientX, e.clientY, true)
    }

    const onCancel = (e: PointerEvent) => {
      const pending = pendingRef.current
      if (pending && e.pointerId === pending.pointerId) {
        clearPending()
        suppressClickRef.current = false
      }
      const drag = activeRef.current
      if (drag && e.pointerId === drag.pointerId) endDrag(e.clientX, e.clientY, false)
    }

    const onContextMenu = (e: Event) => {
      if (pendingRef.current || activeRef.current) e.preventDefault()
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('contextmenu', onContextMenu)
      clearPending()
    }
  }, [clearPending, endDrag, startDrag, updateHoverAt])

  const shouldSuppressClick = useCallback(() => {
    if (!suppressClickRef.current) return false
    suppressClickRef.current = false
    return true
  }, [])

  const sourcePanelId = active?.panelId ?? null
  const hoverPanelId =
    hover && sourcePanelId && hover.targetPanelId !== sourcePanelId
      ? hover.targetPanelId
      : null
  const dropIndex =
    hover && sourcePanelId && hover.targetPanelId !== sourcePanelId
      ? hover.dropIndex
      : null

  const activeId = active?.key ?? null
  const activeLabel = active?.label ?? null
  const activeIcon = active?.Icon ?? null
  const isDragging = !!active
  const scrollLocked = isDragging

  const value = useMemo<TabDnDContextValue>(
    () => ({
      activeId,
      activeLabel,
      activeIcon,
      hoverPanelId,
      dropIndex,
      isDragging,
      scrollLocked,
      beginTabPress,
      shouldSuppressClick,
    }),
    [
      activeId,
      activeLabel,
      activeIcon,
      hoverPanelId,
      dropIndex,
      isDragging,
      scrollLocked,
      beginTabPress,
      shouldSuppressClick,
    ]
  )

  const OverlayIcon = active?.Icon ?? null
  const overlayShowLabel = active ? active.showShortLabel || !OverlayIcon : true

  return (
    <TabDnDContext.Provider value={value}>
      {children}
      {active && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed z-[9999] pointer-events-none px-2 py-1.5 text-xs font-medium bg-blue-100 text-blue-800 border-2 border-blue-300 rounded shadow-lg opacity-90 -translate-x-1/2 -translate-y-full inline-flex items-center gap-1"
              style={{ left: active.x, top: active.y - 8 }}
              aria-hidden
            >
              {OverlayIcon ? <OverlayIcon className="w-3.5 h-3.5 flex-shrink-0" /> : null}
              {overlayShowLabel ? <span>{active.label}</span> : null}
            </div>,
            document.body
          )
        : null}
    </TabDnDContext.Provider>
  )
}

export { TAB_DND_ATTR }
