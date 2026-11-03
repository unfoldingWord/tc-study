/**
 * `@bt-synergy/language-pack-v3`: builders and readers for the segment files and the transfer file of format 3 (`spec/`).
 *
 * Nothing here imports a Node module, so the package runs in a browser and in a Worker. `partsSource`, which reads format 2.0 parts from
 * a disk, is the one Node-only piece: import it by its subpath, `@bt-synergy/language-pack-v3/node/partsSource`, from a script or a test.
 */

// Container and errors
export { CLASS_NAMES, type ClassName, hex, type LogicalHeader, readHeader, readSegment, type Segment, writeSegment } from './codec/container'
export { FORMAT_ERROR_CODES, FormatError, type FormatErrorCode } from './codec/errors'

// Ids
export {
  BOOKS,
  bookNumber,
  bookSet,
  conceptOfSupportReference,
  conceptOfTwLink,
  formatRef,
  parseRef,
  rewriteLinks,
  strongKey,
  unescapeTsv,
  verseId,
} from './ids'

// Row sources
export { ORIGINALS, type ResourceRef, type Row, type RowFilter, type RowSource } from './source/rows'
export { zipSource, type ZipSource } from './source/zipSource'

// Builders
export { extractOrig, OrigIndex, origSegment } from './build/orig'
export { bookSegment } from './build/book'
export { extractBook } from './build/bookHelps'
export { artSegment, extractArticles } from './build/art'
export { extractLexicon, lexSegment } from './build/lex'
export { extractObs, obsSegment } from './build/obs'
export { buildCatalog, type BuiltSegment, builtSegment, needsOfBook, unitsOf } from './build/catalog'
export { BUILDER, buildCommon, buildLanguage, type LanguageBuild } from './build/language'
export type { RegistryEntry, SectionRegistry } from './build/sections'
export { bridgeZip } from './bridge/fromV2'

// Views and the transfer file
export { artView } from './read/art'
export { bookView } from './read/book'
export { catalogView } from './read/catalog'
export { lexView } from './read/lex'
export { obsView } from './read/obs'
export { origView } from './read/orig'
export { xtopicsView } from './read/topics'
export { parseTipnr, type TipnrRecord } from './source/tipnr'
export {
  type ComplementFile,
  readTransfer,
  type TransferEntry,
  type TransferIndex,
  type TransferIndexEntry,
  writeTransfer,
} from './transfer'

// The reader output (`spec/tests/README.md`)
export { canonicalJson, KNOWN, readerOutput } from './read/output'

// The model
export * from './model'
