/**
 * The processing versions a pack made here carries in its manifest. prepare-language writes them and publish-language
 * names the bucket folder (the compatibility key) after them, so both read this one constant and can never disagree.
 */

import type { PackVersions } from '@bt-synergy/language-pack'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { HELPS_TEXT_VERSION } from '../helps/helpsCacheKeys'
import { HELPS_ALIGN_VERSION } from '../helps/helpsAlignCache'
import { HELPS_QUOTE_VERSION } from '../helps/helpsQuoteCache'
import { SCRIPTURE_PREPARE_VERSION } from '../scripture/scripturePreparer'
import { HELPS_INDEX_VERSION } from './bookIndex'

export const PACK_VERSIONS = {
  sot: { usjProcessing: USJ_PROCESSING_VERSION },
  // An app that reads the prepared chapters without making them (Servos) must know whose they are.
  prepared: { scripturePrepare: SCRIPTURE_PREPARE_VERSION },
  quote: { helpsQuote: HELPS_QUOTE_VERSION },
  align: { helpsAlign: HELPS_ALIGN_VERSION },
  text: { helpsText: HELPS_TEXT_VERSION },
  // Optional: not in the compatibility key. A reader that does not state it, or states another, skips the layer.
  index: { helpsIndex: HELPS_INDEX_VERSION },
} satisfies PackVersions
