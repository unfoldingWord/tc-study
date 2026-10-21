import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  nextProcessDebugPresentation,
} from './processDebugPresentation'
import { useProcessDebugPresentationStore } from './processDebugPresentationStore'

describe('process debug panel wiring', () => {
  test('DownloadIndicator opens process debug via shared presentation store', () => {
    const indicator = readFileSync(join(import.meta.dir, 'DownloadIndicator.tsx'), 'utf8')
    const menu = readFileSync(join(import.meta.dir, '../studio/NavigationBarMenu.tsx'), 'utf8')
    expect(indicator).toContain('useProcessDebugPresentationStore')
    expect(indicator).toContain('dispatchPresentation')
    expect(indicator).toContain('Process debug')
    expect(indicator).not.toContain('DownloadQueueDetailsModal')
    expect(indicator).not.toContain('docked={detailsDocked}')
    expect(menu).toContain('<DownloadIndicator onClose={onClose} />')
  })

  test('SimplifiedReadView hosts ProcessDebugHost as sibling of nav + panels', () => {
    const view = readFileSync(join(import.meta.dir, 'SimplifiedReadView.tsx'), 'utf8')
    const layout = readFileSync(join(import.meta.dir, '../Layout.tsx'), 'utf8')
    expect(view).toContain('ProcessDebugHost')
    expect(view).toContain('order-3 flex-shrink-0')
    expect(view).toContain('flex-1 overflow-hidden order-1 md:order-2 min-h-0')
    expect(view).toContain('<NavigationBar')
    expect(layout).not.toContain('ProcessDebugHost')
    expect(layout).toContain('flex-1 min-h-0')
  })

  test('ProcessDebugHost wires session fields into DownloadQueueDetailsModal', () => {
    const host = readFileSync(join(import.meta.dir, 'ProcessDebugHost.tsx'), 'utf8')
    expect(host).toContain('DownloadQueueDetailsModal')
    expect(host).toContain('blockedReason')
    expect(host).toContain('lastActivityAt')
    expect(host).toContain('recentSteps')
    expect(host).toContain('onStop')
    expect(host).toContain('onDock')
    expect(host).toContain('onUndock')
    expect(host).toContain('dockHeightCss')
  })

  test('modal polls warm + prepare workers; docked is in-flow (not fixed overlay)', () => {
    const modal = readFileSync(join(import.meta.dir, 'DownloadQueueDetailsModal.tsx'), 'utf8')
    expect(modal).toContain('buildProcessDebugModel')
    expect(modal).toContain('getWarmQueueStats')
    expect(modal).toContain('getPrepareQueueStats')
    expect(modal).toContain('warmScheduler.subscribe')
    expect(modal).toContain('aria-label="Process debug"')
    expect(modal).toContain('recentSteps')
    expect(modal).toContain('Process step events')
    expect(modal).toContain('Dock to bottom')
    expect(modal).toContain('Undock to modal')
    expect(modal).toContain('data-process-debug-docked')
    expect(modal).toContain('data-process-debug-layout="reserved"')
    expect(modal).toContain('flex-shrink-0')
    expect(modal).not.toContain('fixed inset-x-0 bottom-0')
    expect(modal).not.toContain('LinkedPanel')
  })

  test('presentation store dispatch follows nextProcessDebugPresentation', () => {
    useProcessDebugPresentationStore.setState({ presentation: 'closed' })
    useProcessDebugPresentationStore.getState().dispatch('open')
    expect(useProcessDebugPresentationStore.getState().presentation).toBe('modal')
    useProcessDebugPresentationStore.getState().dispatch('dock')
    expect(useProcessDebugPresentationStore.getState().presentation).toBe(
      nextProcessDebugPresentation('modal', 'dock')
    )
    expect(useProcessDebugPresentationStore.getState().presentation).toBe('docked')
    useProcessDebugPresentationStore.getState().dispatch('undock')
    expect(useProcessDebugPresentationStore.getState().presentation).toBe('modal')
    useProcessDebugPresentationStore.getState().dispatch('close')
    expect(useProcessDebugPresentationStore.getState().presentation).toBe('closed')
  })

  test('worker posts download phases, steps, and times out completeness check', () => {
    const worker = readFileSync(
      join(import.meta.dir, '../../workers/backgroundDownload.worker.ts'),
      'utf8'
    )
    expect(worker).toContain("phase: 'metadata'")
    expect(worker).toContain("phase: 'checking'")
    expect(worker).toContain('failFast: true')
    expect(worker).toContain('withResourceDownloadTimeout')
    expect(worker).toContain('30_000')
    expect(worker).toContain("type: 'step'")
    expect(worker).toContain('fetch-manifest')
    expect(worker).toContain('completeness-check')
  })

  test('session falls back when ready arrives but progress never does', () => {
    const session = readFileSync(
      join(import.meta.dir, '../../features/download/backgroundDownloadSession.ts'),
      'utf8'
    )
    expect(session).toContain('shouldFallbackStuckStarting')
    expect(session).toContain('workerProgressCount')
    expect(session).toContain('recentSteps')
    expect(session).toContain("type === 'step'")
  })
})
