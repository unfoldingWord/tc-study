import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  TAB_DND_ATTR,
  TAB_DND_LONG_PRESS_MS,
  TAB_DND_MOVE_TOLERANCE_PX,
} from './tabDnDConstants'

const ROOT = join(import.meta.dir, '../..')

describe('tabDnDConstants', () => {
  test('long-press and tolerance are in the mobile-friendly band', () => {
    expect(TAB_DND_LONG_PRESS_MS).toBeGreaterThanOrEqual(300)
    expect(TAB_DND_LONG_PRESS_MS).toBeLessThanOrEqual(450)
    expect(TAB_DND_MOVE_TOLERANCE_PX).toBeGreaterThanOrEqual(8)
    expect(TAB_DND_ATTR.tabKey).toBe('data-tab-dnd-key')
    expect(TAB_DND_ATTR.droppable).toBe('data-tab-dnd-droppable')
  })

  test('ResourceTabs always uses SortableTab (no single-tab non-draggable branch)', () => {
    const src = readFileSync(join(ROOT, 'components/studio/ResourceTabs.tsx'), 'utf8')
    expect(src).toContain('SortableTab')
    expect(src).not.toMatch(/if\s*\(\s*resources\.length\s*===\s*1\s*\)/)
    expect(src).toContain('scrollLocked')
  })

  test('Studio and Read wire TabDnDProvider (not @dnd-kit DndContext)', () => {
    const studio = readFileSync(join(ROOT, 'components/studio/LinkedPanelsStudio.tsx'), 'utf8')
    const read = readFileSync(join(ROOT, 'components/read/SimplifiedReadView.tsx'), 'utf8')
    expect(studio).toContain('TabDnDProvider')
    expect(read).toContain('TabDnDProvider')
    expect(studio).not.toContain('@dnd-kit')
    expect(read).not.toContain('@dnd-kit')
    // Unlock 1: single key space — no raw-key dual props on TabDnDProvider
    expect(studio).not.toContain('panel1RawKeys')
    expect(studio).not.toContain('panel2RawKeys')
    expect(read).not.toContain('panel1RawKeys')
    expect(read).toContain('filteredPanel1Keys')
    expect(read).toContain('filteredPanel2Keys')
  })
})
