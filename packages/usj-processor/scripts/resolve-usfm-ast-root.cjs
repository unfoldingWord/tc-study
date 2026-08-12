/**
 * Resolve optional usfm-ast checkout for local npm override only.
 * Default install path is published @usfm-tools/* (see usj-processor README).
 *
 * Order:
 * 1. USFM_AST_ROOT env
 * 2. <repo>/usfm-ast (nested checkout)
 * 3. <repo>/../usfm-ast (local sibling layout)
 */
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '../../..')

function resolveUsfmAstRoot() {
  const fromEnv = process.env.USFM_AST_ROOT
  if (fromEnv && fs.existsSync(fromEnv)) {
    return path.resolve(fromEnv)
  }

  const nested = path.join(repoRoot, 'usfm-ast')
  if (fs.existsSync(path.join(nested, 'packages', 'usfm-parser'))) {
    return nested
  }

  const sibling = path.resolve(repoRoot, '../usfm-ast')
  if (fs.existsSync(path.join(sibling, 'packages', 'usfm-parser'))) {
    return sibling
  }

  return null
}

function usfmToolsPackagePaths(usfmAstRoot) {
  if (!usfmAstRoot) return null
  return {
    parser: path.join(usfmAstRoot, 'packages', 'usfm-parser'),
    types: path.join(usfmAstRoot, 'packages', 'shared-types'),
    'usj-core': path.join(usfmAstRoot, 'packages', 'usfm-usj-core'),
  }
}

/** Dist entry files required for Vite/Bun (CJS parser + ESM usj-core). */
const DIST_ENTRIES = {
  parser: path.join('dist', 'index.js'),
  types: path.join('dist', 'index.js'),
  'usj-core': path.join('dist', 'index.mjs'),
}

function missingDistEntries(packagePaths) {
  const missing = []
  for (const [name, pkgPath] of Object.entries(packagePaths)) {
    const entry = path.join(pkgPath, DIST_ENTRIES[name])
    if (!fs.existsSync(entry)) missing.push(`${name}: ${entry}`)
  }
  return missing
}

/**
 * Prefer linked node_modules/@usfm-tools/<name>/<dist>, else usfm-ast package dist.
 */
function resolveUsfmToolsDistEntries(usfmAstRoot = resolveUsfmAstRoot()) {
  const nm = path.join(repoRoot, 'node_modules', '@usfm-tools')
  const fromAst = usfmToolsPackagePaths(usfmAstRoot)
  const out = {}

  for (const name of Object.keys(DIST_ENTRIES)) {
    const nmEntry = path.join(nm, name, DIST_ENTRIES[name])
    if (fs.existsSync(nmEntry)) {
      out[name] = nmEntry
      continue
    }
    if (fromAst) {
      const astEntry = path.join(fromAst[name], DIST_ENTRIES[name])
      if (fs.existsSync(astEntry)) {
        out[name] = astEntry
        continue
      }
    }
    out[name] = null
  }

  return out
}

module.exports = {
  repoRoot,
  resolveUsfmAstRoot,
  usfmToolsPackagePaths,
  DIST_ENTRIES,
  missingDistEntries,
  resolveUsfmToolsDistEntries,
}
