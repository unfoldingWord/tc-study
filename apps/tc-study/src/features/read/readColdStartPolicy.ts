/**
 * Cold-start language for dual Read panels.
 *
 * Both empty → one picker seeds both ({@link shouldSeedBothPanelLanguages}).
 * One empty → inherit the other panel’s language (do not leave the empty copy).
 * Both set → leave them; pickers may diverge after inherit.
 */

import { canonicalReadLanguageCode } from '../../utils/languageCodeMatch'
import {
  applyPanelLanguage,
  type ReadPanelId,
  type ReadPanelMode,
  type ReadPanelModels,
} from './readPanelModel'

/** Persist/runtime may omit languageCode; treat missing the same as null. */
export type InheritPanelLanguageSnapshot = Record<
  ReadPanelId,
  { mode: ReadPanelMode; languageCode?: string | null }
>

function trimmedPanelLanguage(code: string | null | undefined): string | null {
  const trimmed = code?.trim()
  return trimmed ? canonicalReadLanguageCode(trimmed) : null
}

export interface InheritEmptyPanelLanguageResult {
  panels: ReadPanelModels
  inheritedPanelId: ReadPanelId
  languageCode: string
}

/**
 * When exactly one pane has a language, copy it onto the empty pane.
 * Helps-only language must not seed empty scripture (that is a leftover
 * default, not a user/cache pick — do not silently apply `en`/`eng`).
 * Modes are unchanged. Returns null when both are empty or both are set.
 */
export function inheritEmptyPanelLanguage(
  panels: InheritPanelLanguageSnapshot
): InheritEmptyPanelLanguageResult | null {
  const asModels = panels as ReadPanelModels
  const p1 = trimmedPanelLanguage(panels['panel-1'].languageCode)
  const p2 = trimmedPanelLanguage(panels['panel-2'].languageCode)
  if (p1 && !p2) {
    return {
      panels: applyPanelLanguage(asModels, 'panel-2', p1),
      inheritedPanelId: 'panel-2',
      languageCode: p1,
    }
  }
  if (p2 && !p1 && panels['panel-2'].mode === 'scripture') {
    return {
      panels: applyPanelLanguage(asModels, 'panel-1', p2),
      inheritedPanelId: 'panel-1',
      languageCode: p2,
    }
  }
  return null
}

export interface HydrateReadLanguagesFromHintResult {
  panels: ReadPanelModels
  appliedHintTo: ReadPanelId | null
  inheritedPanelId: ReadPanelId | null
  languageCode: string | null
}

function asReadPanelModels(panels: InheritPanelLanguageSnapshot): ReadPanelModels {
  return {
    'panel-1': {
      mode: panels['panel-1'].mode,
      languageCode: trimmedPanelLanguage(panels['panel-1'].languageCode),
    },
    'panel-2': {
      mode: panels['panel-2'].mode,
      languageCode: trimmedPanelLanguage(panels['panel-2'].languageCode),
    },
  }
}

/**
 * URL hydrate: an explicit `:lang` is authoritative over a persisted session.
 * Apply it to panel-1 even when cache already has another language. An empty
 * sibling inherits the URL language. Panes that still share the previous
 * session language follow the URL (so cache `eng`/`eng` becomes `tr`/`tr`).
 * A diverged other pane is left alone.
 */
export function hydrateReadLanguagesFromHint(options: {
  panels: InheritPanelLanguageSnapshot
  hintLanguage?: string | null
}): HydrateReadLanguagesFromHintResult {
  let panels = asReadPanelModels(options.panels)
  const hint = trimmedPanelLanguage(options.hintLanguage)
  const previousP1 = trimmedPanelLanguage(panels['panel-1'].languageCode)
  const previousP2 = trimmedPanelLanguage(panels['panel-2'].languageCode)
  let appliedHintTo: ReadPanelId | null = null
  if (hint && previousP1 !== hint) {
    panels = applyPanelLanguage(panels, 'panel-1', hint)
    appliedHintTo = 'panel-1'
    if (previousP2 && previousP2 === previousP1) {
      panels = applyPanelLanguage(panels, 'panel-2', hint)
      return {
        panels,
        appliedHintTo,
        inheritedPanelId: 'panel-2',
        languageCode: hint,
      }
    }
  }
  const inherited = inheritEmptyPanelLanguage(panels)
  if (inherited) {
    return {
      panels: inherited.panels,
      appliedHintTo,
      inheritedPanelId: inherited.inheritedPanelId,
      languageCode: inherited.languageCode,
    }
  }
  return {
    panels,
    appliedHintTo,
    inheritedPanelId: null,
    languageCode:
      trimmedPanelLanguage(panels['panel-1'].languageCode) ||
      trimmedPanelLanguage(panels['panel-2'].languageCode),
  }
}

/** Persist restore: copy panel-1 onto an empty panel-2 only (do not seed p1 from helps). */
export function inheritEmptyHelpsFromSession(panels: ReadPanelModels): ReadPanelModels {
  const plan = inheritEmptyPanelLanguage(panels)
  if (plan?.inheritedPanelId === 'panel-2') return plan.panels
  return panels
}
