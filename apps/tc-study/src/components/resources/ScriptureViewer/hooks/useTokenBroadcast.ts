import { RESOURCE_STATE_KEYS, useResourceStateSender } from '@bt-synergy/resource-panels'
import type { UsjScriptureViewModel } from '@bt-synergy/scripture-loader'
import { useEffect } from 'react'
import { useAppStore } from '../../../../contexts/AppContext'
import { setHelpsTargetScriptureKey } from '../../../../features/helps/helpsTargetScripture'
import {
  invalidatePublishedScriptureTokensForPassage,
  publishScriptureTokens,
} from '../../../../features/helps/scriptureTokensStore'
import { isScriptureTokensOwner } from '../../../../features/messaging/scriptureTokensOwnership'
import { shouldBroadcastScriptureTokens } from '../../../../features/nav/chapterScrollActivity'
import { useChapterScrollActivity } from '../../../../features/nav/usePinnedHelpsReference'
import { extractPreparedBroadcastTokens } from '../../../../features/scripture/extractPreparedBroadcastTokens'
import {
  fullChapterForScriptureBroadcast,
  viewModelForScriptureBroadcast,
} from '../../../../features/scripture/scriptureTokensBookNav'
import type { ScriptureFullChapter } from '../../../../features/scripture/scripturePreparer'
import type { ScriptureTokensBroadcastSignal } from '../../../../signals/studioSignals'
import { extractUsjBroadcastTokens } from '../utils/extractUsjBroadcastTokens'

interface UseTokenBroadcastOptions {
  resourceId: string
  resourceKey: string
  viewModel: UsjScriptureViewModel | null
  /** Prefer full prepared chapter when available (avoids viewModel walk). */
  fullChapter?: ScriptureFullChapter | null
  bookCode?: string
  language: string
  languageDirection?: 'ltr' | 'rtl'
  currentChapter: number
  currentVerse: number
  endChapter?: number
  endVerse?: number
}

export function useTokenBroadcast({
  resourceId,
  resourceKey,
  viewModel,
  fullChapter = null,
  bookCode: bookCodeProp,
  language,
  languageDirection = 'ltr',
  currentChapter,
  currentVerse,
  endChapter,
  endVerse,
}: UseTokenBroadcastOptions) {
  const lastActiveScriptureResourceId = useAppStore((s) => s.lastActiveScriptureResourceId)
  const anchorResourceId = useAppStore((s) => s.anchorResourceId)
  const scrollActivity = useChapterScrollActivity()
  const isOwner = isScriptureTokensOwner({
    resourceId,
    lastActiveScriptureResourceId,
    anchorResourceId,
  })

  const { sendState, clearState } = useResourceStateSender<ScriptureTokensBroadcastSignal>(
    'scripture-tokens-broadcast',
    resourceId,
    RESOURCE_STATE_KEYS.SCRIPTURE_TOKENS,
    'scripture',
    { clearOnUnmount: isOwner }
  )

  useEffect(() => {
    if (!isOwner) return
    // Identity for helps quote/align — catalog key, not tokens. Set even when
    // USJ/prepared are still loading so CombinedHelps can hit cache without
    // waiting for SCRIPTURE_TOKENS.
    setHelpsTargetScriptureKey(resourceKey)
    if (!shouldBroadcastScriptureTokens(scrollActivity.unsettled)) return

    const bookCode = bookCodeProp || viewModel?.bookCode || ''
    // Ignore lingering previous-book USJ / prepared full during BCV book switches.
    const broadcastViewModel = viewModelForScriptureBroadcast(viewModel, bookCode)
    const broadcastFull = fullChapterForScriptureBroadcast(fullChapter, currentChapter)
    const resourceMetadata = {
      id: resourceKey,
      language,
      languageDirection,
      type: 'scripture',
    }

    if (!bookCode || !currentChapter || !currentVerse) {
      sendState({
        reference: { book: '', chapter: 0, verse: 0 },
        tokens: [],
        resourceMetadata,
      })
      return
    }

    // Passage known but full/USJ not ready — announce empty for this chapter and
    // drop hydrate from another passage so helps does not align against stale tokens.
    if (!broadcastViewModel && !broadcastFull) {
      invalidatePublishedScriptureTokensForPassage(bookCode, currentChapter)
      sendState({
        reference: {
          book: bookCode,
          chapter: currentChapter,
          verse: currentVerse,
          endChapter: endChapter || undefined,
          endVerse: endVerse || undefined,
        },
        tokens: [],
        resourceMetadata,
      })
      return
    }

    const actualEndChapter = endChapter || currentChapter
    const actualEndVerse = endVerse || currentVerse

    // Prefer prepared full for a single-chapter whole-unit extract.
    // Nav resolves endVerse to the real last verse (e.g. Psa 14 → 7), not 999 —
    // treat verse 1→chapter-end as whole-chapter when prepared full is present.
    const wholeSingleChapter =
      actualEndChapter === currentChapter &&
      currentVerse <= 1 &&
      (actualEndVerse >= 999 ||
        (broadcastFull != null && actualEndVerse > currentVerse))

    const tokens =
      wholeSingleChapter && broadcastFull
        ? extractPreparedBroadcastTokens(
            bookCode,
            currentChapter,
            broadcastFull,
            1,
            999
          )
        : broadcastViewModel
          ? extractUsjBroadcastTokens(
              broadcastViewModel,
              currentChapter,
              currentVerse,
              endChapter,
              endVerse
            )
          : broadcastFull && actualEndChapter === currentChapter
            ? extractPreparedBroadcastTokens(
                bookCode,
                currentChapter,
                broadcastFull,
                currentVerse,
                actualEndVerse
              )
            : []

    const reference = {
      book: bookCode,
      chapter: currentChapter,
      verse: currentVerse,
      endChapter: endChapter || undefined,
      endVerse: endVerse || undefined,
    }
    sendState({
      reference,
      tokens,
      resourceMetadata,
    })
    if (tokens.length > 0) {
      // Catalog key (not panel instance id) so helps warm/align cache hits
      // prepared:scripture after dual-scripture mode-switch (#2 suffix).
      publishScriptureTokens({
        tokens,
        reference,
        resourceMetadata,
        sourceResourceId: resourceKey,
      })
    } else {
      invalidatePublishedScriptureTokensForPassage(bookCode, currentChapter)
    }
  }, [
    isOwner,
    resourceId,
    resourceKey,
    viewModel,
    fullChapter,
    bookCodeProp,
    language,
    languageDirection,
    currentChapter,
    currentVerse,
    endChapter,
    endVerse,
    scrollActivity.unsettled,
    sendState,
  ])

  useEffect(() => {
    if (!isOwner) clearState()
  }, [isOwner, clearState])
}
