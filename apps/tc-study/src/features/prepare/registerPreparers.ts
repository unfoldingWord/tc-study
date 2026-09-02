/**
 * Side-effect registration of all ResourcePreparers.
 * Import this from workers (never from resourceTypes).
 */

import { getRegisteredPreparerIds } from './prepareRegistry'
import '../scripture/scripturePreparer'
import '../notes/notesPreparer'

export function ensurePreparersRegistered(): string[] {
  return getRegisteredPreparerIds()
}
