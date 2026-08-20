/**
 * Unlock 1: rightward splice adjust + activeIndex follows dragged key.
 */
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import { COMBINED_HELPS_RESOURCE_ID } from '../helps/combinedHelpsIds'
import { ensureCombinedHelpsInWorkspace } from '../helps/ensureCombinedHelps'
import { bindCombinedHelpsCompositionsForTest } from '../helps/testCompositionRegistry'
import {
  moveResourceBetweenPanels,
  reorderResourceInPanel,
} from './resourceMutations'
import { useWorkspaceStore } from './workspaceStore'

enableMapSet()

const unbindCompositions = bindCombinedHelpsCompositionsForTest()
afterAll(() => unbindCompositions())

function res(partial: Partial<ResourceInfo> & { key: string; type?: string }): ResourceInfo {
  return {
    id: partial.key,
    key: partial.key,
    resourceKey: partial.key,
    resourceId: partial.key.split('/')[2] || 'x',
    server: 'git.door43.org',
    owner: 'u',
    language: 'en',
    languageCode: 'en',
    title: partial.key,
    subject: 'test',
    version: '1.0.0',
    type: (partial.type || 'scripture') as ResourceType,
    format: ResourceFormat.USFM,
    contentType: 'text/usfm',
    contentStructure: 'book',
    category: partial.type || 'scripture',
    availability: { online: true, offline: false, bundled: false, partial: false },
    locations: [],
    catalogedAt: new Date().toISOString(),
    ...partial,
  } as ResourceInfo
}

function panelKeys(panelId: string): string[] {
  return [...(useWorkspaceStore.getState().getPanel(panelId)?.resourceKeys ?? [])]
}

function activeKey(panelId: string): string | undefined {
  const panel = useWorkspaceStore.getState().getPanel(panelId)
  if (!panel) return undefined
  return panel.resourceKeys[panel.activeIndex]
}

describe('reorderResourceInPanel + CombinedHelps single tab space', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      currentPackage: {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        resources: new Map([
          ['u/en/a', res({ key: 'u/en/a', type: 'scripture' })],
          ['u/en/b', res({ key: 'u/en/b', type: 'scripture' })],
          ['u/en/c', res({ key: 'u/en/c', type: 'scripture' })],
          ['u/en/d', res({ key: 'u/en/d', type: 'questions' })],
        ]),
        panels: [
          {
            id: 'panel-1',
            name: 'P1',
            resourceKeys: ['u/en/a', 'u/en/b', 'u/en/c', 'u/en/d'],
            activeIndex: 0,
            position: 0,
          },
          {
            id: 'panel-2',
            name: 'P2',
            resourceKeys: [],
            activeIndex: 0,
            position: 1,
          },
        ],
      },
      isPackageModified: false,
    })
  })

  test('reorder left and right; active follows dragged key', () => {
    // Rightward: a onto c (index 2) → take c's slot
    reorderResourceInPanel('u/en/a', 'panel-1', 2)
    expect(panelKeys('panel-1')).toEqual(['u/en/b', 'u/en/a', 'u/en/c', 'u/en/d'])
    expect(activeKey('panel-1')).toBe('u/en/a')

    // Leftward: d onto b (index 0)
    reorderResourceInPanel('u/en/d', 'panel-1', 0)
    expect(panelKeys('panel-1')).toEqual(['u/en/d', 'u/en/b', 'u/en/a', 'u/en/c'])
    expect(activeKey('panel-1')).toBe('u/en/d')
  })

  test('move keeps active on dragged key at destination', () => {
    moveResourceBetweenPanels('u/en/b', 'panel-1', 'panel-2', 0)
    expect(panelKeys('panel-1')).toEqual(['u/en/a', 'u/en/c', 'u/en/d'])
    expect(panelKeys('panel-2')).toEqual(['u/en/b'])
    expect(activeKey('panel-2')).toBe('u/en/b')
  })

  test('CombinedHelps present; TN/TWL absent from panel.resourceKeys', () => {
    const resources = new Map<string, ResourceInfo>([
      ['u/en/tn', res({ key: 'u/en/tn', type: 'notes', format: ResourceFormat.TSV })],
      ['u/en/twl', res({ key: 'u/en/twl', type: 'words-links', format: ResourceFormat.TSV })],
      ['u/en/tq', res({ key: 'u/en/tq', type: 'questions', format: ResourceFormat.TSV })],
    ])
    const panels = [
      { id: 'panel-2', resourceKeys: ['u/en/tn', 'u/en/twl', 'u/en/tq'], activeIndex: 0 },
    ]
    const out = ensureCombinedHelpsInWorkspace({ resources, panels, languageCode: 'en' })
    expect(out.panels[0]!.resourceKeys).toContain(COMBINED_HELPS_RESOURCE_ID)
    expect(out.panels[0]!.resourceKeys).toContain('u/en/tq')
    expect(out.panels[0]!.resourceKeys).not.toContain('u/en/tn')
    expect(out.panels[0]!.resourceKeys).not.toContain('u/en/twl')
    expect(out.resources.has('u/en/tn')).toBe(true)
    expect(out.resources.has('u/en/twl')).toBe(true)
  })
})
