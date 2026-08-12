/**
 * Bridge to `@usfm-tools/*` (usfm-ast built packages).
 *
 * Resolution (local + CI):
 * 1. `bun run link:usfm-tools` → node_modules/@usfm-tools/* (verifies dist)
 * 2. Vite aliases prefer that linked dist (apps/tc-study/scripts/usfm-tools-vite-aliases.cjs)
 * 3. commonjsOptions include usfm-ast parser/types so Rollup converts CJS `exports`
 *
 * usj-core: import compiled ESM `dist/index.mjs` via the linked package path so Bun
 * does not evaluate the package entry’s type-only re-exports from `@usfm-tools/types`
 * (AlignmentGroup is interface-only — breaks Bun package entry load).
 */

import * as UsfmParserModule from '@usfm-tools/parser'
import {
  chapterSliceToUsjDocument,
  splitUsjByChapter,
  stripAlignments,
  tokenizeGatewayUsj,
  type AlignmentMap,
} from '../../../node_modules/@usfm-tools/usj-core/dist/index.mjs'

type UsfmParserCtor = new (options?: unknown) => {
  parse: (usfm: string) => unknown
  toJSON: () => unknown
}

function resolveUsfmParser(): UsfmParserCtor {
  const mod = UsfmParserModule as {
    USFMParser?: UsfmParserCtor
    default?: { USFMParser?: UsfmParserCtor } | UsfmParserCtor
  }
  const fromNamed = mod.USFMParser
  if (typeof fromNamed === 'function') return fromNamed
  const def = mod.default
  if (def && typeof def === 'object' && typeof def.USFMParser === 'function') {
    return def.USFMParser
  }
  if (typeof def === 'function') {
    return def as UsfmParserCtor
  }
  throw new Error(
    '[usj-processor] USFMParser not found in @usfm-tools/parser (CJS/ESM interop failed). Run: bun run link:usfm-tools'
  )
}

const USFMParser = resolveUsfmParser()

export {
  USFMParser,
  chapterSliceToUsjDocument,
  splitUsjByChapter,
  stripAlignments,
  tokenizeGatewayUsj,
  type AlignmentMap,
}
