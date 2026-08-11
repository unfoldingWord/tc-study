/**
 * QUARANTINED — not used by production ScriptureViewer.
 *
 * Request/response scripture content path superseded by SCRIPTURE_TOKENS STATE
 * (`useTokenBroadcast` / `useScriptureTokens`). Kept for reference / emergency
 * rollback only. Do not re-wire into `ScriptureViewer/index.tsx`.
 *
 * @deprecated Prefer token STATE only.
 */

import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import type { ProcessedScripture } from '@bt-synergy/usfm-processor'
import { useCallback, useEffect, useRef } from 'react'
import type {
  ScriptureContentRequestSignal,
  ScriptureContentResponseSignal,
} from '../../../../signals/studioSignals'

interface UseContentRequestsOptions {
  resourceId: string
  resourceKey: string
  loadedContent: ProcessedScripture | null
  language?: string
}

/** @deprecated Quarantined — production uses useTokenBroadcast only. */
export function useContentRequests({
  resourceId,
  resourceKey,
  loadedContent,
  language,
}: UseContentRequestsOptions) {
  const loadedContentRef = useRef<ProcessedScripture | null>(loadedContent)
  const previousContentRef = useRef<ProcessedScripture | null>(null)

  const { sendToAll: sendContentResponse } = useSignal<ScriptureContentResponseSignal>(
    'scripture-content-response',
    resourceId,
    {
      type: 'scripture',
      language: language || 'en',
      tags: ['bible'],
    }
  )

  useEffect(() => {
    loadedContentRef.current = loadedContent

    if (loadedContent && !previousContentRef.current) {
      const book = loadedContent.metadata?.bookCode || ''
      const chaptersCount = loadedContent.chapters.length

      if (chaptersCount > 0) {
        const firstChapter = loadedContent.chapters[0]

        sendContentResponse({
          lifecycle: 'event',
          response: {
            requestId: `proactive-${resourceId}-${Date.now()}`,
            resourceId,
            resourceKey,
            book,
            chapter: firstChapter.number,
            hasContent: true,
            content: loadedContent,
          },
        })
      }
    }

    previousContentRef.current = loadedContent
  }, [loadedContent, resourceId, resourceKey, sendContentResponse])

  useSignalHandler<ScriptureContentRequestSignal>(
    'scripture-content-request',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) {
          return
        }

        const { request } = signal
        const { book, chapter, language: requestedLanguage } = request

        const content = loadedContentRef.current
        if (!content) {
          sendContentResponse({
            lifecycle: 'event',
            response: {
              requestId: String(signal.timestamp),
              resourceId,
              resourceKey,
              book,
              chapter,
              hasContent: false,
              error: 'No content loaded',
            },
          })
          return
        }

        if (requestedLanguage && language !== requestedLanguage) {
          sendContentResponse({
            lifecycle: 'event',
            response: {
              requestId: String(signal.timestamp),
              resourceId,
              resourceKey,
              book,
              chapter,
              hasContent: false,
              error: `Language mismatch: requested ${requestedLanguage}, have ${language}`,
            },
          })
          return
        }

        const currentBook = content.metadata?.bookCode?.toUpperCase()
        if (currentBook !== book.toUpperCase()) {
          sendContentResponse({
            lifecycle: 'event',
            response: {
              requestId: String(signal.timestamp),
              resourceId,
              resourceKey,
              book,
              chapter,
              hasContent: false,
              error: `Book mismatch: requested ${book}, have ${currentBook}`,
            },
          })
          return
        }

        const requestedChapter = content.chapters.find((ch) => ch.number === chapter)
        if (!requestedChapter) {
          sendContentResponse({
            lifecycle: 'event',
            response: {
              requestId: String(signal.timestamp),
              resourceId,
              resourceKey,
              book,
              chapter,
              hasContent: false,
              error: `Chapter ${chapter} not found`,
            },
          })
          return
        }

        sendContentResponse({
          lifecycle: 'event',
          response: {
            requestId: String(signal.timestamp),
            resourceId,
            resourceKey,
            book,
            chapter,
            hasContent: true,
            content,
          },
        })
      },
      [resourceId, resourceKey, language]
    ),
    {
      debug: true,
      resourceMetadata: {
        type: 'scripture',
        language: language || 'en',
        tags: ['bible'],
      },
    }
  )
}
