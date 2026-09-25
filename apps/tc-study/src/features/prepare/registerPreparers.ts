/**
 * Side-effect registration of all ResourcePreparers.
 * Import this from workers (never from resourceTypes).
 */

import { getRegisteredPreparerIds } from './prepareRegistry'
import '../scripture/scripturePreparer'
import '../notes/notesPreparer'
import '../wordsLinks/wordsLinksPreparer'
import '../academy/academyPreparer'
import '../words/wordsPreparer'
import '../questions/questionsPreparer'
import '../obs/obsPreparer'
import '../obs/obsNotesPreparer'
import '../obs/obsQuestionsPreparer'

export function ensurePreparersRegistered(): string[] {
  return getRegisteredPreparerIds()
}
