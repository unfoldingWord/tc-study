import type { StudioPanelId } from '../studio/studioDnDHelpers'
import { TAB_DND_ATTR } from './tabDnDConstants'

export type TabDropTarget = {
  targetPanelId: StudioPanelId
  dropIndex: number
}

function asPanelId(value: string | null): StudioPanelId | null {
  if (value === 'panel-1' || value === 'panel-2') return value
  return null
}

/** Pure drop resolution from parsed hit attrs (unit-testable). */
export function resolveDropFromHit(
  hit: {
    tabKey: string | null
    tabPanel: StudioPanelId | null
    droppablePanel: StudioPanelId | null
  },
  panel1Keys: string[],
  panel2Keys: string[],
  activeKey: string
): TabDropTarget | null {
  if (hit.tabKey && hit.tabPanel) {
    const keys = hit.tabPanel === 'panel-1' ? panel1Keys : panel2Keys
    if (hit.tabKey === activeKey) {
      return { targetPanelId: hit.tabPanel, dropIndex: keys.indexOf(activeKey) }
    }
    const idx = keys.indexOf(hit.tabKey)
    if (idx < 0) return null
    return { targetPanelId: hit.tabPanel, dropIndex: idx }
  }

  if (hit.droppablePanel) {
    const keys = hit.droppablePanel === 'panel-1' ? panel1Keys : panel2Keys
    return { targetPanelId: hit.droppablePanel, dropIndex: keys.length }
  }

  return null
}

/**
 * Resolve drop target from a DOM node under the pointer (tab or panel droppable).
 */
export function resolveDropFromElement(
  el: Element | null,
  panel1Keys: string[],
  panel2Keys: string[],
  activeKey: string
): TabDropTarget | null {
  if (!el) return null

  const tabEl = el.closest(`[${TAB_DND_ATTR.tabKey}]`)
  const panelEl = el.closest(`[${TAB_DND_ATTR.droppable}]`)

  return resolveDropFromHit(
    {
      tabKey:
        tabEl instanceof HTMLElement ? tabEl.getAttribute(TAB_DND_ATTR.tabKey) : null,
      tabPanel:
        tabEl instanceof HTMLElement
          ? asPanelId(tabEl.getAttribute(TAB_DND_ATTR.tabPanel))
          : null,
      droppablePanel:
        panelEl instanceof HTMLElement
          ? asPanelId(panelEl.getAttribute(TAB_DND_ATTR.droppable))
          : null,
    },
    panel1Keys,
    panel2Keys,
    activeKey
  )
}

/** Hit-test at client coordinates (overlay must use pointer-events: none). */
export function resolveDropFromPoint(
  clientX: number,
  clientY: number,
  panel1Keys: string[],
  panel2Keys: string[],
  activeKey: string,
  elementFromPoint: (x: number, y: number) => Element | null = (x, y) =>
    typeof document !== 'undefined' ? document.elementFromPoint(x, y) : null
): TabDropTarget | null {
  return resolveDropFromElement(
    elementFromPoint(clientX, clientY),
    panel1Keys,
    panel2Keys,
    activeKey
  )
}

/**
 * Apply drop: same-panel reorder vs cross-panel move.
 * Unlock 1: indices are in the same key space as store panel.resourceKeys
 * (painted === store for Studio; Read converts book-filter indices at the call site).
 * Returns false when no-op.
 */
export function commitTabDrop(options: {
  activeKey: string
  sourcePanelId: StudioPanelId
  target: TabDropTarget
  panel1Keys: string[]
  panel2Keys: string[]
  onReorder: (resourceKey: string, panelId: StudioPanelId, newIndex: number) => void
  onMove: (
    resourceKey: string,
    from: StudioPanelId,
    to: StudioPanelId,
    insertIndex?: number
  ) => void
}): boolean {
  const {
    activeKey,
    sourcePanelId,
    target,
    panel1Keys,
    panel2Keys,
    onReorder,
    onMove,
  } = options

  const keysFor = (panelId: StudioPanelId) =>
    panelId === 'panel-1' ? panel1Keys : panel2Keys

  if (sourcePanelId === target.targetPanelId) {
    const keys = keysFor(sourcePanelId)
    const oldIndex = keys.indexOf(activeKey)
    const clamped =
      target.dropIndex >= keys.length ? keys.length - 1 : target.dropIndex
    if (oldIndex < 0 || clamped < 0 || oldIndex === clamped) return false
    onReorder(activeKey, sourcePanelId, clamped)
    return true
  }

  const targetKeys = keysFor(target.targetPanelId)
  const insertIndex =
    target.dropIndex >= targetKeys.length ? undefined : target.dropIndex
  onMove(activeKey, sourcePanelId, target.targetPanelId, insertIndex)
  return true
}
