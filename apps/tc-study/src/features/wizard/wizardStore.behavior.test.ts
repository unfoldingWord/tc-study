/**
 * Behavioral: wizard ephemeral state is not part of workspace persistence.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import { enableMapSet } from 'immer'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import {
  persistWorkspacePackage,
  WORKSPACE_STORAGE_KEY,
} from '../workspace/workspacePersistence'
import { useWorkspaceStore } from '../workspace/workspaceStore'
import { useWizardStore } from './wizardStore'

enableMapSet()

const g = globalThis as typeof globalThis & { localStorage?: Storage }
if (!g.localStorage) {
  const mem = new Map<string, string>()
  g.localStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, String(v))
    },
    removeItem: (k) => {
      mem.delete(k)
    },
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size
    },
  }
}

function res(key: string): ResourceInfo {
  return {
    id: key,
    key,
    resourceKey: key,
    resourceId: key.split('/')[2] || 'x',
    server: 'git.door43.org',
    owner: key.split('/')[0] || 'u',
    language: 'en',
    languageCode: 'en',
    title: key,
    subject: 'test',
    version: '1.0.0',
    type: ResourceType.SCRIPTURE,
    format: ResourceFormat.USFM,
    contentType: 'text/usfm',
    contentStructure: 'book',
    category: 'scripture',
    availability: { online: true, offline: false, bundled: false, partial: false },
    locations: [],
    catalogedAt: new Date().toISOString(),
  } as ResourceInfo
}

describe('wizardStore behavior', () => {
  beforeEach(() => {
    useWizardStore.setState({
      wizardMode: null,
      wizardStep: null,
      selectedLanguages: new Set(),
      selectedOrganizations: new Set(),
      selectedResourceKeys: new Set(),
      availableLanguages: [],
      availableOrganizations: [],
      availableResources: new Map(),
    })
    g.localStorage?.removeItem(WORKSPACE_STORAGE_KEY)
  })

  test('wizard fields are absent from persisted workspace snapshot', () => {
    useWizardStore.getState().startWizard('edit-workspace')
    useWizardStore.getState().toggleLanguage('en')
    useWizardStore.getState().setAvailableLanguages([
      { code: 'en', name: 'English', source: 'door43' },
    ])
    useWizardStore.getState().toggleResource('u/en/ult', res('u/en/ult'))

    expect(useWizardStore.getState().wizardMode).toBe('edit-workspace')
    expect(useWizardStore.getState().selectedLanguages.has('en')).toBe(true)

    // Workspace store must not carry wizard API
    const ws = useWorkspaceStore.getState() as Record<string, unknown>
    expect(ws.wizardMode).toBeUndefined()
    expect(ws.startWizard).toBeUndefined()
    expect(ws.selectedLanguages).toBeUndefined()

    const pkg = useWorkspaceStore.getState().currentPackage!
    persistWorkspacePackage(pkg)
    const raw = JSON.parse(g.localStorage!.getItem(WORKSPACE_STORAGE_KEY)!)
    expect(raw.wizardMode).toBeUndefined()
    expect(raw.wizardStep).toBeUndefined()
    expect(raw.selectedLanguages).toBeUndefined()
    expect(raw.availableLanguages).toBeUndefined()
    expect(raw.selectedResourceKeys).toBeUndefined()
  })

  test('closeWizard clears selections but keeps language catalog cache', () => {
    useWizardStore.getState().setAvailableLanguages([
      { code: 'en', name: 'English', source: 'door43' },
    ])
    useWizardStore.getState().startWizard('edit-workspace')
    useWizardStore.getState().toggleLanguage('en')
    useWizardStore.getState().closeWizard()

    expect(useWizardStore.getState().wizardMode).toBeNull()
    expect(useWizardStore.getState().selectedLanguages.size).toBe(0)
    expect(useWizardStore.getState().availableLanguages).toEqual([
      { code: 'en', name: 'English', source: 'door43' },
    ])
  })
})
