import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dividerSrc = readFileSync(join(import.meta.dir, 'PanelResizeDivider.tsx'), 'utf8')

describe('PanelResizeDivider collapse rail', () => {
  test('expanded strip is a drag handle; collapsed strip is the same bar with an inward arrow', () => {
    expect(dividerSrc).toContain('bg-border')
    expect(dividerSrc).toContain('md:w-1.5')
    expect(dividerSrc).toContain('h-1.5')
    expect(dividerSrc).toContain('md:cursor-ew-resize')
    expect(dividerSrc).toContain('cursor-ns-resize')
    expect(dividerSrc).toContain('collapsedArrow')
    expect(dividerSrc).toContain('onRestoreCollapsed')
    expect(dividerSrc).toContain('ChevronLeft')
    expect(dividerSrc).toContain('ChevronRight')
    expect(dividerSrc).toContain('ChevronUp')
    expect(dividerSrc).toContain('ChevronDown')
    expect(dividerSrc).toContain('title={label}')
    expect(dividerSrc).toContain('aria-label={label}')
  })
})
