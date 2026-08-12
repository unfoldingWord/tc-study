/**
 * Bridge to sibling `usfm-ast` built packages.
 *
 * - Parser: `@usfm-tools/parser` (CJS). Vite aliases + optimizeDeps.needsInterop;
 *   Bun/tests resolve via `node_modules/@usfm-tools/*` symlink (scripts/link-usfm-tools.cjs).
 * - usj-core: import compiled ESM `dist/index.mjs` by relative path so Bun does not
 *   evaluate type-only re-exports from `@usfm-tools/types` (AlignmentGroup is interface-only).
 *
 * Layout: Git/Github/{bt-synergy,usfm-ast} with parser/usj-core/types dist built.
 */

import * as UsfmParserModule from '@usfm-tools/parser'
import {
  chapterSliceToUsjDocument,
  splitUsjByChapter,
  stripAlignments,
  tokenizeGatewayUsj,
  type AlignmentMap,
} from '../../../../usfm-ast/packages/usfm-usj-core/dist/index.mjs'

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
    '[usj-processor] USFMParser not found in @usfm-tools/parser (CJS/ESM interop failed)'
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
