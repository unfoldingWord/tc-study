/**
 * Viewer load adapter — UsjScriptureViewModel via ScriptureLoader only.
 * No loadContent / ProcessedScripture fallback.
 */

import type { ScriptureLoader, UsjScriptureViewModel } from '@bt-synergy/scripture-loader'

export type ScriptureLoaderLike = {
  loadViewModel?: ScriptureLoader['loadViewModel']
  loadScriptureResult?: ScriptureLoader['loadScriptureResult']
}

/**
 * Require a scripture loader with loadViewModel (or loadScriptureResult).
 */
export async function loadUsjViewModel(
  scriptureLoader: ScriptureLoaderLike | null | undefined,
  resourceKey: string,
  bookId: string
): Promise<UsjScriptureViewModel> {
  if (scriptureLoader && typeof scriptureLoader.loadViewModel === 'function') {
    return scriptureLoader.loadViewModel(resourceKey, bookId)
  }

  if (scriptureLoader && typeof scriptureLoader.loadScriptureResult === 'function') {
    const { viewModel } = await scriptureLoader.loadScriptureResult(resourceKey, bookId)
    return viewModel
  }

  throw new Error(
    `Scripture loader with loadViewModel required for ${resourceKey}/${bookId}`
  )
}

export type { UsjScriptureViewModel }
