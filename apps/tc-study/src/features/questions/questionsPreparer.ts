/**
 * Translation Questions preparer — chapter units from tq:{resourceKey}:{book}.
 */

import {
  markdownToHastSync,
  stripMarkdownLight,
  type HastRoot,
} from '../../lib/markdown/markdownToHast'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import {
  registerPreparer,
  type PrepareContext,
  type ResourcePreparer,
} from '../prepare/prepareRegistry'

export const QUESTIONS_PREPARE_VERSION = 1

export function tqCacheKey(resourceKey: string, bookId: string): string {
  return `tq:${resourceKey}:${bookId}`
}

type QuestionRow = {
  reference: string
  id: string
  tags?: string
  quote?: string
  occurrence?: string
  question: string
  response: string
}

type ProcessedQuestions = {
  bookCode?: string
  bookName?: string
  questions?: QuestionRow[]
  questionsByChapter?: Record<string, QuestionRow[]>
  metadata?: { chaptersWithQuestions?: number[] }
}

export type QuestionsSource = {
  resourceKey: string
  bookId: string
  questions: ProcessedQuestions
}

function unwrap(entry: unknown): ProcessedQuestions | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  if (e.questionsByChapter || Array.isArray(e.questions)) {
    return e as unknown as ProcessedQuestions
  }
  if (e.content && typeof e.content === 'object') return unwrap(e.content)
  return null
}

function rowsForUnit(source: QuestionsSource, unit: number): QuestionRow[] {
  const by = source.questions.questionsByChapter
  if (by) return by[String(unit)] ?? []
  return (source.questions.questions ?? []).filter(
    (q) => parseInt(q.reference.split(':')[0] || '0', 10) === unit
  )
}

function unitsFromSource(source: QuestionsSource): number[] {
  const by = source.questions.questionsByChapter
  if (by) {
    return Object.keys(by)
      .map((k) => parseInt(k, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)
  }
  const fromMeta = source.questions.metadata?.chaptersWithQuestions
  if (Array.isArray(fromMeta) && fromMeta.length) return [...fromMeta].sort((a, b) => a - b)
  const chapters = new Set<number>()
  for (const q of source.questions.questions ?? []) {
    const ch = parseInt(q.reference.split(':')[0] || '0', 10)
    if (ch > 0) chapters.add(ch)
  }
  return [...chapters].sort((a, b) => a - b)
}

export const questionsPreparer: ResourcePreparer<QuestionsSource, number> = {
  id: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
  version: QUESTIONS_PREPARE_VERSION,

  async readSource(ctx: PrepareContext, resourceKey: string, bookId: string) {
    const entry = await ctx.cacheAdapter.get(tqCacheKey(resourceKey, bookId))
    const questions = unwrap(entry)
    if (!questions) return null
    return { resourceKey, bookId, questions }
  },

  unitsFor: unitsFromSource,

  prepareNav(source) {
    return {
      version: QUESTIONS_PREPARE_VERSION,
      bookId: source.questions.bookCode || source.bookId,
      bookName: source.questions.bookName || source.bookId,
      chapters: unitsFromSource(source),
      totalQuestions: source.questions.questions?.length ?? 0,
    }
  },

  prepareLight(source, unit) {
    return {
      version: QUESTIONS_PREPARE_VERSION,
      unit,
      questions: rowsForUnit(source, unit).map((q) => ({
        id: q.id,
        reference: q.reference,
        question: stripMarkdownLight(q.question || ''),
        response: stripMarkdownLight(q.response || ''),
      })),
    }
  },

  prepareFull(source, unit) {
    return {
      version: QUESTIONS_PREPARE_VERSION,
      unit,
      questions: rowsForUnit(source, unit).map((q) => ({
        id: q.id,
        reference: q.reference,
        question: q.question || '',
        response: q.response || '',
        questionHast: markdownToHastSync(q.question || '') as HastRoot,
        responseHast: markdownToHastSync(q.response || '') as HastRoot,
      })),
    }
  },
}

registerPreparer(questionsPreparer)
