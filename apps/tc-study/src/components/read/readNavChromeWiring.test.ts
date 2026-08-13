import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const viewSrc = readFileSync(join(import.meta.dir, 'SimplifiedReadView.tsx'), 'utf8')
const indicatorSrc = readFileSync(join(import.meta.dir, 'DownloadIndicator.tsx'), 'utf8')
const menuSrc = readFileSync(
  join(import.meta.dir, '../studio/NavigationBarMenu.tsx'),
  'utf8'
)
const compactSrc = readFileSync(
  join(import.meta.dir, '../studio/NavigationBarCompact.tsx'),
  'utf8'
)
const layoutSrc = readFileSync(join(import.meta.dir, '../Layout.tsx'), 'utf8')

describe('Read nav chrome: DownloadIndicator + ThemeToggle', () => {
  test('DownloadIndicator hides leftover success via shouldShowDownloadIndicator', () => {
    expect(indicatorSrc).toContain('shouldShowDownloadIndicator')
    expect(indicatorSrc).toContain('title="Download progress"')
    expect(indicatorSrc).not.toContain('!isDownloading && !progress')
    expect(indicatorSrc).not.toContain('CheckCircle2')
    expect(viewSrc).toContain('error={downloadStats.error}')
  })

  test('ThemeToggle lives in NavigationBarCompact overflow, not beside the Read bar', () => {
    expect(viewSrc).not.toContain('ThemeToggle')
    expect(viewSrc).not.toContain("from '../../features/theme'")
    expect(compactSrc).toContain('<NavigationBarMenu')
    expect(menuSrc).toContain('<ThemeToggle size="sm" variant="menu" />')
    expect(menuSrc).toContain("from '../../features/theme'")
    expect(layoutSrc).toContain('<ThemeToggle size="sm" />')
  })
})
