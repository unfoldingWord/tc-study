/**
 * Shared Vite alias + fs.allow roots for @usfm-tools/* (USJ bridge).
 * Prefer linked node_modules dist; fall back to USFM_AST_ROOT / nested / sibling usfm-ast.
 *
 * Keep vite.config.js and vite.config.ts in sync via this helper
 * (Vite loads .js first when both exist).
 */
const path = require('path')
const {
  resolveUsfmAstRoot,
  resolveUsfmToolsDistEntries,
} = require('../../../packages/usj-processor/scripts/resolve-usfm-ast-root.cjs')

function getUsfmToolsViteResolve() {
  const usfmAstRoot = resolveUsfmAstRoot()
  const entries = resolveUsfmToolsDistEntries(usfmAstRoot)

  const missing = Object.entries(entries)
    .filter(([, p]) => !p)
    .map(([name]) => name)

  if (missing.length > 0) {
    console.warn(
      `[tc-study vite] missing @usfm-tools dist for: ${missing.join(', ')}. ` +
        `Build usfm-ast then run: node packages/usj-processor/scripts/link-usfm-tools.cjs`
    )
  }

  const alias = {
    '@usfm-tools/parser': entries.parser || '@usfm-tools/parser',
    '@usfm-tools/types': entries.types || '@usfm-tools/types',
    '@usfm-tools/usj-core': entries['usj-core'] || '@usfm-tools/usj-core',
  }

  const fsAllow = []
  if (usfmAstRoot) fsAllow.push(usfmAstRoot)

  return {
    usfmAstRoot,
    alias,
    fsAllow,
    /** Rollup must convert sibling/nested CJS parser (outside node_modules). */
    commonjsInclude: [/node_modules/, /usfm-ast[\\/]packages[\\/](usfm-parser|shared-types)/],
  }
}

module.exports = { getUsfmToolsViteResolve, path }
