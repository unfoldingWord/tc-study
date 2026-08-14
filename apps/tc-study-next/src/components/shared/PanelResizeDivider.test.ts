import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dividerSrc = readFileSync(join(import.meta.dir, 'PanelResizeDivider.tsx'), 'utf8')

describe('PanelResizeDivider collapse rail', () => {
  test('expanded strip is a drag handle; collapsed strip is a thicker bar with a centered inward arrow', () => {
    expect(dividerSrc).toContain('bg-border')
    expect(dividerSrc).toContain('md:w-1.5')
    expect(dividerSrc).toContain('h-1.5')
    expect(dividerSrc).toContain('md:w-4')
    expect(dividerSrc).toContain('w-full h-4')
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
    expect(dividerSrc).toContain('md:translate-y-0')
    expect(dividerSrc).toContain('md:self-stretch')
    expect(dividerSrc).toContain('inset-y-0 right-0 w-4')
    expect(dividerSrc).toContain('inset-y-0 left-0 w-4')
  })
})
