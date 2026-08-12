/**
 * Bridge to published `@usfm-tools/*` (npm).
 *
 * Supported install: `bun install` at monorepo root (see README).
 * Optional local override against a usfm-ast checkout: `bun run link:usfm-tools:local`.
 */

import * as UsfmParserModule from '@usfm-tools/parser'
import type { AlignmentMap } from '@usfm-tools/types'
import {
  chapterSliceToUsjDocument,
  splitUsjByChapter,
  stripAlignments,
  tokenizeGatewayUsj,
} from '@usfm-tools/usj-core'

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
    '[usj-processor] USFMParser not found in @usfm-tools/parser (CJS/ESM interop failed). Run: bun install'
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
