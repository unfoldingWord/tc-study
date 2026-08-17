/**
 * Persist per-panel mode + language (and layout chrome) independently of the URL.
 * URL `:textLang` is a cold-start / share hint — never the SoT for panel-2,
 * and never a shared scripture language for both panels.
 */

import { readPersistedHelpsLanguage } from './defaultHelpsLanguage'
import { inheritEmptyHelpsFromSession } from './readColdStartPolicy'
import {
  DEFAULT_READ_PANEL_MODELS,
  type ReadPanelId,
  type ReadPanelModels,
} from './readPanelModel'

export const READ_PANELS_STORAGE_KEY = 'tc-study:read-panels'

export type ReadLayoutMode = 'one' | 'two'

export interface PersistedReadPanels {
  panels: ReadPanelModels
  layout: ReadLayoutMode
  collapsedPanelId: ReadPanelId | null
  splitPercent: number
  layoutUserChosen: boolean
  seededBoth: boolean
}

const DEFAULT_PERSISTED: PersistedReadPanels = {
  panels: DEFAULT_READ_PANEL_MODELS,
  layout: 'two',
  collapsedPanelId: null,
  splitPercent: 50,
  layoutUserChosen: false,
  seededBoth: false,
}

function isPanelId(value: unknown): value is ReadPanelId {
  return value === 'panel-1' || value === 'panel-2'
}

function isMode(value: unknown): value is 'scripture' | 'helps' {
  return value === 'scripture' || value === 'helps'
}

function parsePanels(raw: unknown): ReadPanelModels | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const next: ReadPanelModels = {
    'panel-1': { ...DEFAULT_READ_PANEL_MODELS['panel-1'] },
    'panel-2': { ...DEFAULT_READ_PANEL_MODELS['panel-2'] },
  }
  for (const id of ['panel-1', 'panel-2'] as const) {
    const p = rec[id]
    if (!p || typeof p !== 'object') continue
    const row = p as { mode?: unknown; languageCode?: unknown }
    if (isMode(row.mode)) next[id].mode = row.mode
    if (typeof row.languageCode === 'string' && row.languageCode.trim()) {
      next[id].languageCode = row.languageCode.trim()
    } else if (row.languageCode === null) {
      next[id].languageCode = null
    }
  }
  return next
}

export function emptyPersistedReadPanels(): PersistedReadPanels {
  const helps = readPersistedHelpsLanguage()
  return {
    ...DEFAULT_PERSISTED,
    panels: {
      'panel-1': { mode: 'scripture', languageCode: null },
      'panel-2': { mode: 'helps', languageCode: helps },
    },
  }
}

export function readPersistedReadPanels(): PersistedReadPanels {
  const fallback = emptyPersistedReadPanels()
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(READ_PANELS_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<PersistedReadPanels>
    const panels = inheritEmptyHelpsFromSession(parsePanels(parsed.panels) ?? fallback.panels)
    const layout = parsed.layout === 'one' || parsed.layout === 'two' ? parsed.layout : fallback.layout
    const collapsedPanelId = isPanelId(parsed.collapsedPanelId) ? parsed.collapsedPanelId : null
    const splitPercent =
      typeof parsed.splitPercent === 'number' && Number.isFinite(parsed.splitPercent)
        ? parsed.splitPercent
        : fallback.splitPercent
    return {
      panels,
      layout,
      collapsedPanelId,
      splitPercent,
      layoutUserChosen: parsed.layoutUserChosen === true,
      seededBoth: parsed.seededBoth === true || Boolean(panels['panel-1'].languageCode),
    }
  } catch {
    return fallback
  }
}

export function writePersistedReadPanels(state: PersistedReadPanels): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(READ_PANELS_STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota / private mode */
  }
}
