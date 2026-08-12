/**
 * Vite helpers for @usfm-tools/* (published npm under node_modules).
 *
 * Default: no path aliases — let Vite resolve package exports.
 * Keep commonjs include + needsInterop for CJS parser/types (e2e Journey 4/8).
 *
 * Optional local override: alias to usfm-ast dist only when node_modules is
 * missing and a usfm-ast checkout provides dist (after link:usfm-tools:local
 * node_modules usually already has junctions — no alias needed).
 */
const path = require('path')
const {
  resolveUsfmAstRoot,
  resolveUsfmToolsDistEntries,
} = require('../../../packages/usj-processor/scripts/resolve-usfm-ast-root.cjs')

function getUsfmToolsViteResolve() {
  const usfmAstRoot = resolveUsfmAstRoot()
  const entries = resolveUsfmToolsDistEntries(usfmAstRoot)

  const alias = {}
  for (const [name, distPath] of Object.entries(entries)) {
    const pkg = `@usfm-tools/${name}`
    if (!distPath) {
      console.warn(
        `[tc-study vite] missing ${pkg}. Run: bun install (or bun run link:usfm-tools:local for usfm-ast override)`
      )
      continue
    }
    if (usfmAstRoot && distPath.startsWith(usfmAstRoot)) {
      alias[pkg] = distPath
    }
  }

  const fsAllow = []
  if (usfmAstRoot) fsAllow.push(usfmAstRoot)

  return {
    usfmAstRoot,
    alias,
    fsAllow,
    /** CJS parser/types in node_modules (and optional usfm-ast fallback). */
    commonjsInclude: [/node_modules/, /usfm-ast[\\/]packages[\\/](usfm-parser|shared-types)/],
  }
}

module.exports = { getUsfmToolsViteResolve, path }
