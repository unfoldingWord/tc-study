/**
 * OPTIONAL local override: junction node_modules/@usfm-tools/* → usfm-ast packages.
 *
 * Default path is published npm (@usfm-tools/* in package.json). Use this only when
 * developing against an unpublished usfm-ast checkout. Re-run `bun install` to restore npm.
 *
 * Layout (either):
 * - Local: Git/Github/{bt-synergy,usfm-ast}
 * - Nested: <repo>/usfm-ast
 * - Custom: USFM_AST_ROOT=/path/to/usfm-ast
 *
 * Usage:
 *   bun run link:usfm-tools:local
 *   node packages/usj-processor/scripts/link-usfm-tools.cjs
 */
const fs = require('fs')
const path = require('path')
const {
  repoRoot,
  resolveUsfmAstRoot,
  usfmToolsPackagePaths,
  DIST_ENTRIES,
  missingDistEntries,
} = require('./resolve-usfm-ast-root.cjs')

const usfmAst = resolveUsfmAstRoot()
const nm = path.join(repoRoot, 'node_modules', '@usfm-tools')

if (!usfmAst) {
  console.error(
    '[link-usfm-tools:local] usfm-ast not found. Clone sibling ../usfm-ast, nest at ./usfm-ast, or set USFM_AST_ROOT.'
  )
  console.error(
    '[link-usfm-tools:local] For normal use, prefer published npm: bun install (see packages/usj-processor/README.md).'
  )
  process.exitCode = 1
  process.exit()
}

const links = usfmToolsPackagePaths(usfmAst)
const missingDist = missingDistEntries(links)
if (missingDist.length > 0) {
  console.error('[link-usfm-tools:local] usfm-ast packages missing dist (build usfm-ast first):')
  for (const line of missingDist) console.error(`  - ${line}`)
  console.error(
    '[link-usfm-tools:local] from usfm-ast: bun install && bun run build --filter @usfm-tools/parser --filter @usfm-tools/types --filter @usfm-tools/usj-core'
  )
  process.exitCode = 1
  process.exit()
}

fs.mkdirSync(nm, { recursive: true })

let linked = 0
for (const [name, target] of Object.entries(links)) {
  const dest = path.join(nm, name)
  try {
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true })
    }
    fs.symlinkSync(target, dest, 'junction')
    console.log(`[link-usfm-tools:local] linked ${name} -> ${target}`)
    linked += 1
  } catch (err) {
    console.error(`[link-usfm-tools:local] failed ${name}:`, err.message)
    process.exitCode = 1
  }
}

console.log(
  `[link-usfm-tools:local] usfm-ast=${usfmAst} (overrode npm with ${linked} junctions; bun install restores published packages)`
)
