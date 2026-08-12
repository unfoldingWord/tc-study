/**
 * Viewer load adapter — primary path is ScriptureLoader.loadScriptureResult().
 * Falls back to loadContent() + viewModelFromProcessedScripture when needed.
 */

import {
  ScriptureLoader,
  isProcessedScriptureContent,
  viewModelFromProcessedScripture,
  type ProcessedScripture,
  type ScriptureLoadResult,
  type UsjScriptureViewModel,
} from '@bt-synergy/scripture-loader'

export type ScriptureLoaderLike = Pick<ScriptureLoader, 'loadScriptureResult' | 'loadContent'>

export type CatalogManagerLike = {
  loadContent: (resourceKey: string, bookId: string) => Promise<unknown>
}

export type LoadUsjScriptureResult = ScriptureLoadResult

/**
 * Prefer loader.loadScriptureResult (USJ view model + projection).
 * Fallback: catalog/loader loadContent → viewModelFromProcessedScripture.
 */
export async function loadUsjScripture(
  scriptureLoader: ScriptureLoaderLike | null | undefined,
  catalogManager: CatalogManagerLike,
  resourceKey: string,
  bookId: string
): Promise<LoadUsjScriptureResult> {
  if (scriptureLoader && typeof scriptureLoader.loadScriptureResult === 'function') {
    return scriptureLoader.loadScriptureResult(resourceKey, bookId)
  }

  const loaded =
    scriptureLoader && typeof scriptureLoader.loadContent === 'function'
      ? await scriptureLoader.loadContent(resourceKey, bookId)
      : await catalogManager.loadContent(resourceKey, bookId)

  if (!isProcessedScriptureContent(loaded)) {
    throw new Error(
      `Scripture load for ${resourceKey}/${bookId} did not return ProcessedScripture`
    )
  }

  const scripture = loaded as ProcessedScripture
  return {
    viewModel: viewModelFromProcessedScripture(scripture),
    scripture,
    fromUsjCache: false,
  }
}

export type { UsjScriptureViewModel, ProcessedScripture }
