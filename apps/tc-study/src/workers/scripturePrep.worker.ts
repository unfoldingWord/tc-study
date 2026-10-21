/**
 * Scripture prep worker — fold keys / layout / quote matching off main thread.
 *
 * Messages IN:
 *  { id, type: 'prep-from-view-model', resourceKey, bookId, viewModel }
 *  { id, type: 'batch-quotes', bookCode, links, originalChapters }
 *  { id, type: 'layout-chapter', viewModel, chapter }
 *
 * Messages OUT:
 *  { id, type: 'ok', result }
 *  { id, type: 'error', message }
 */

import {
  batchBuildQuoteTokens,
  chapterSequencePayload,
  prepareViewModel,
} from '../features/scripture/scripturePrepCore'

const WorkerScope = (globalThis as typeof globalThis & {
  WorkerGlobalScope?: new () => object
}).WorkerGlobalScope
if (typeof WorkerScope === 'undefined' || !(self instanceof WorkerScope)) {
  console.error('[scripturePrep] This file should only run in a Web Worker')
}

type InMsg =
  | {
      id: string
      type: 'prep-from-view-model'
      resourceKey: string
      bookId: string
      viewModel: Parameters<typeof prepareViewModel>[0]
    }
  | {
      id: string
      type: 'batch-quotes'
      bookCode: string
      links: Parameters<typeof batchBuildQuoteTokens>[0]['links']
      originalChapters: Parameters<typeof batchBuildQuoteTokens>[0]['originalChapters']
    }
  | {
      id: string
      type: 'layout-chapter'
      viewModel: Parameters<typeof prepareViewModel>[0]
      chapter: number
    }

self.onmessage = (event: MessageEvent<InMsg>) => {
  const msg = event.data
  const reply = (payload: Record<string, unknown>) => {
    ;(self as unknown as { postMessage: (data: unknown) => void }).postMessage(payload)
  }
  try {
    if (msg.type === 'prep-from-view-model') {
      const prepared = prepareViewModel(msg.viewModel)
      reply({
        id: msg.id,
        type: 'ok',
        result: { viewModel: prepared },
      })
      return
    }
    if (msg.type === 'batch-quotes') {
      const result = batchBuildQuoteTokens({
        links: msg.links,
        originalChapters: msg.originalChapters,
        bookCode: msg.bookCode,
      })
      reply({ id: msg.id, type: 'ok', result })
      return
    }
    if (msg.type === 'layout-chapter') {
      const prepared = prepareViewModel(msg.viewModel)
      const sequence = chapterSequencePayload(prepared, msg.chapter)
      reply({
        id: msg.id,
        type: 'ok',
        result: { sequence },
      })
      return
    }
    reply({
      id: (msg as { id: string }).id,
      type: 'error',
      message: `Unknown message type`,
    })
  } catch (err) {
    reply({
      id: msg.id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
