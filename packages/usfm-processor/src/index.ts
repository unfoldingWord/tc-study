/**
 * @bt-synergy/usfm-processor
 * 
 * USFM parsing and processing for Bible translation resources
 * Compatible with @bt-toolkit and @bt-synergy ecosystems
 */

export { USFMProcessor } from './USFMProcessor'

export type {
  // USFM JSON types
  USFMDocument,
  USFMChapter,
  USFMVerse,
  USFMVerseObject,
  USFMAlignmentObject,
  USFMWordObject,
  USFMTextObject,
  USFMParagraphObject,
  USFMHeader,
  
  // Processed types
  ProcessedBook,
  ProcessedChapter,
  ProcessedVerse,
  ProcessedParagraph,
  ProcessedScripture,
  ProcessingResult,
  TranslatorSection,
  WordToken,
  WordAlignment,
  
  // Options
  USFMProcessingOptions
} from './types'
