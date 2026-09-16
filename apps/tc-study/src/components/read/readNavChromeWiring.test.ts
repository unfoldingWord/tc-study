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
  test('DownloadIndicator lives in NavigationBarMenu with process debug always available', () => {
    expect(indicatorSrc).toContain('shouldShowDownloadIndicator')
    expect(indicatorSrc).toContain('title="Download progress"')
    expect(indicatorSrc).toContain('aria-label="Download progress"')
    expect(indicatorSrc).toContain('title="Retry download"')
    expect(indicatorSrc).toContain('RotateCcw')
    expect(indicatorSrc).toContain('title="Process debug"')
    expect(indicatorSrc).toContain('ListOrdered')
    expect(indicatorSrc).toContain('useProcessDebugPresentationStore')
    expect(indicatorSrc).toContain("dispatchPresentation('open')")
    expect(indicatorSrc).toContain('export function DownloadBusyBadge')
    expect(indicatorSrc).not.toContain('DownloadQueueDetailsModal')
    expect(indicatorSrc).not.toContain('!isDownloading && !progress')
    expect(indicatorSrc).not.toContain('CheckCircle2')
    expect(indicatorSrc).toContain('backgroundDownloadSession.subscribe')
    expect(indicatorSrc).toContain('displayIngredientCounts')
    expect(indicatorSrc).toContain('retryLastRun')
    expect(menuSrc).toContain('<DownloadIndicator onClose={onClose} />')
    expect(menuSrc).toContain("from '../read/DownloadIndicator'")
    expect(viewSrc).not.toContain('downloadIndicator=')
    expect(viewSrc).not.toContain('<DownloadIndicator')
    expect(viewSrc).not.toContain('downloadStats')
    expect(viewSrc).not.toContain('isBackgroundDownloading')
    expect(viewSrc).toContain('ProcessDebugHost')
    expect(layoutSrc).not.toContain('ProcessDebugHost')
  })

  test('hamburger shows DownloadBusyBadge while downloading; no standalone chrome indicator', () => {
    expect(compactSrc).toContain('<DownloadBusyBadge />')
    expect(compactSrc).toContain("from '../read/DownloadIndicator'")
    expect(compactSrc).not.toContain('{downloadIndicator}')
    expect(compactSrc).not.toContain('downloadIndicator?:')
    expect(compactSrc).toContain('relative p-1.5 rounded-full')
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
