import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { COMBINED_HELPS_RESOURCE_ID } from './combinedHelpsIds'
import { applyCombinedHelpsEnsure, resetApplyEnsureFingerprint } from './applyCombinedHelpsEnsure'
import { ensureCompositionsWork } from './ensureCompositions'
import { bindCombinedHelpsCompositionsForTest } from './testCompositionRegistry'

enableMapSet()

function res(partial: Partial<ResourceInfo> & { key: string; type: string }): ResourceInfo {
  return {
    id: partial.key,
    language: 'en',
    languageCode: 'en',
    owner: 'u',
    category: partial.type,
    format: ResourceFormat.TSV,
    ...partial,
    type: partial.type as ResourceType,
  } as ResourceInfo
}

function seedHelpsPackage(): void {
  useAppStore.setState({
    loadedResources: {},
    anchorResourceId: null,
    lastActiveScriptureResourceId: null,
    isInitialized: false,
  })
  useWorkspaceStore.setState({
    currentPackage: {
      id: 'p',
      name: 'P',
      version: '1.0.0',
      resources: new Map([
        ['u/en/tn', res({ key: 'u/en/tn', type: 'notes' })],
        ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links' })],
      ]),
      panels: [
        { id: 'panel-1', name: 'P1', resourceKeys: [], activeIndex: 0, position: 0 },
        {
          id: 'panel-2',
          name: 'P2',
          resourceKeys: ['u/en/tn', 'u/en/twl'],
          activeIndex: 0,
          position: 1,
        },
      ],
    },
    isPackageModified: false,
  })
}

describe('applyCombinedHelpsEnsure', () => {
  let unbind: () => void

  beforeEach(() => {
    unbind = bindCombinedHelpsCompositionsForTest()
    resetApplyEnsureFingerprint()
    ensureCompositionsWork.reset()
    seedHelpsPackage()
  })

  afterEach(() => {
    unbind()
  })

  test('second apply is a no-op (same resources/panels, no new catalogedAt)', () => {
    expect(applyCombinedHelpsEnsure('en')).toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(ensureCompositionsWork.runs).toBe(1)
    const first = useWorkspaceStore.getState().currentPackage!
    const firstHelps = first.resources.get(COMBINED_HELPS_RESOURCE_ID)
    expect(firstHelps).toBeTruthy()
    const firstAt = firstHelps!.catalogedAt
    const firstResources = first.resources
    const firstPanels = first.panels

    expect(applyCombinedHelpsEnsure('en')).toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(ensureCompositionsWork.runs).toBe(1)
    const second = useWorkspaceStore.getState().currentPackage!
    expect(second.resources).toBe(firstResources)
    expect(second.panels).toBe(firstPanels)
    expect(second.resources.get(COMBINED_HELPS_RESOURCE_ID)?.catalogedAt).toBe(firstAt)
  })

  test('already-consistent apply does not clone or synthesize', () => {
    applyCombinedHelpsEnsure('en')
    expect(ensureCompositionsWork.runs).toBe(1)
    resetApplyEnsureFingerprint()
    ensureCompositionsWork.reset()

    applyCombinedHelpsEnsure('en')
    expect(ensureCompositionsWork.runs).toBe(0)
    const pkg = useWorkspaceStore.getState().currentPackage!
    expect(pkg.resources.has(COMBINED_HELPS_RESOURCE_ID)).toBe(true)
  })
})

describe('tab activate does not ensure compositions', () => {
  test('setActiveResourceInPanel skips ensure and full-package persist', () => {
    const src = readFileSync(
      join(import.meta.dir, '../workspace/workspaceResourceSlice.ts'),
      'utf8'
    )
    const start = src.indexOf('setActiveResourceInPanel:')
    const end = src.indexOf('hasResourceInPackage:')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = src.slice(start, end)
    expect(body).not.toContain('reconcileCombinedHelps')
    expect(body).not.toContain('ensureCombinedHelps')
    expect(body).not.toContain('applyCombinedHelpsEnsure')
    expect(body).not.toContain('autoSaveWorkspace')
    expect(body).toContain('scheduleWorkspacePersist')
  })

  test('TWL quote click sends one token-click with alignedSemanticIds', () => {
    const handlers = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/useCombinedHelpsHandlers.ts'),
      'utf8'
    )
    expect(handlers).not.toMatch(/link\.quoteTokens\.forEach/)
    expect(handlers).toContain('alignedSemanticIds: semanticIds')
    expect(handlers).toContain('const firstToken = link.quoteTokens[0]')
  })
})
