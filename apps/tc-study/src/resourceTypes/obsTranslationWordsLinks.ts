/**
 * OBS Translation Words Links Resource Type Plugin
 *
 * Thin wrapper around TranslationWordsLinksLoader/WordsLinksViewer for
 * Open Bible Stories. The TWL file (twl_OBS.tsv) has the same columns
 * as Bible TWL. OrigWords contains literal frame text; TW links use
 * the same rc:// scheme pointing to the shared Translation Words dictionary.
 *
 * NOTE: UGNT/UHB dependencies are omitted — OBS rows reference gateway
 * text directly. The shared TW dictionary (contentRole='shared') is still
 * needed and resolved implicitly via existing TWL dependency logic.
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { obsTranslationWordsLinksResourceTypeBase } from '@bt-synergy/resource-pipeline/resourceTypes/obsTranslationWordsLinks'
import { WordsLinksViewer } from '../components/resources'
import { asResourceViewer } from './asResourceViewer'

export const obsTranslationWordsLinksResourceType: ResourceTypeDefinition = defineResourceType({
  ...obsTranslationWordsLinksResourceTypeBase,
  viewer: asResourceViewer(WordsLinksViewer),
})
