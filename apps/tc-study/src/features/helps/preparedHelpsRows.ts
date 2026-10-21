/**
 * Convert prepared helps rows into viewer/pipeline shapes.
 */

import type { TranslationNote, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import type { HastRoot } from '../../lib/markdown/markdownToHast'
import type { NotesFullRow } from '../notes/notesPreparer'
import type { WordsLinksFullRow } from '../wordsLinks/wordsLinksPreparer'

export type PreparedTranslationNote = TranslationNote & {
  bodyHast?: HastRoot
}

export type PreparedTranslationWordsLink = TranslationWordsLink & {
  articlePath: string
}

export function preparedNoteToTranslationNote(
  row: NotesFullRow
): PreparedTranslationNote {
  return {
    id: row.id,
    reference: row.reference,
    quote: row.quote,
    note: row.note,
    supportReference: row.supportReference,
    tags: row.tags,
    occurrence: row.occurrence,
    bodyHast: row.bodyHast,
    isIntro: row.isIntro === true,
  }
}

export function preparedLinkToTranslationWordsLink(
  row: WordsLinksFullRow
): PreparedTranslationWordsLink {
  return {
    id: row.id,
    reference: row.reference,
    origWords: row.origWords,
    occurrence: row.occurrence,
    twLink: row.twLink,
    tags: row.tags,
    articlePath: row.articlePath,
  }
}
