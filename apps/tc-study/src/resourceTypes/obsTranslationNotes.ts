/**
 * OBS Translation Notes Resource Type Plugin
 *
 * Thin wrapper around the standard TranslationNotesLoader/Viewer for
 * Open Bible Stories. The TSV file shape (tn_OBS.tsv) is identical to
 * Bible TN, so no loader changes are needed. Quote/OrigWords already
 * contain literal frame text — no alignment middle layer required.
 *
 * NOTE: The UGNT/UHB dependencies are intentionally omitted here because
 * OBS-TN rows reference gateway-language text directly, not originals.
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { obsTranslationNotesResourceTypeBase } from '@bt-synergy/resource-pipeline/resourceTypes/obsTranslationNotes'
import { TranslationNotesViewer } from '../components/resources/TranslationNotesViewer'
import { asResourceViewer } from './asResourceViewer'

export const obsTranslationNotesResourceType: ResourceTypeDefinition = defineResourceType({
  ...obsTranslationNotesResourceTypeBase,
  viewer: asResourceViewer(TranslationNotesViewer),
})
