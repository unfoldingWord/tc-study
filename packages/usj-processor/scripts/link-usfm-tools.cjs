/**
 * Create node_modules/@usfm-tools/{parser,types,usj-core} → usfm-ast packages.
 *
 * Safe no-op if links already point at a usable target with dist.
 * Does not run `bun install` / build on usfm-ast — build dist first.
 *
 * Layout (either):
 * - Local: Git/Github/{bt-synergy,usfm-ast}
 * - CI: checkout usfm-ast into <repo>/usfm-ast (or set USFM_AST_ROOT)
 *
 * Usage:
 *   node packages/usj-processor/scripts/link-usfm-tools.cjs
 *   bun run --filter @bt-synergy/usj-processor link:usfm-tools
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
    '[link-usfm-tools] usfm-ast not found. Clone sibling ../usfm-ast, nest at ./usfm-ast, or set USFM_AST_ROOT.'
  )
  process.exitCode = 1
  process.exit()
}

const links = usfmToolsPackagePaths(usfmAst)
const missingDist = missingDistEntries(links)
if (missingDist.length > 0) {
  console.error('[link-usfm-tools] usfm-ast packages missing dist (build usfm-ast first):')
  for (const line of missingDist) console.error(`  - ${line}`)
  console.error(
    '[link-usfm-tools] from usfm-ast: bun install && bun run build --filter @usfm-tools/parser --filter @usfm-tools/types --filter @usfm-tools/usj-core'
  )
  process.exitCode = 1
  process.exit()
}

fs.mkdirSync(nm, { recursive: true })

let linked = 0
for (const [name, target] of Object.entries(links)) {
  const dest = path.join(nm, name)
  const distOk = fs.existsSync(path.join(dest, DIST_ENTRIES[name]))

  try {
    const stat = fs.lstatSync(dest)
    if ((stat.isSymbolicLink() || stat.isDirectory()) && distOk) {
      console.log(`[link-usfm-tools] ok ${name}`)
      continue
    }
    // Broken / stale link without dist — replace
    fs.rmSync(dest, { recursive: true, force: true })
  } catch {
    /* missing */
  }

  try {
    fs.symlinkSync(target, dest, 'junction')
    console.log(`[link-usfm-tools] linked ${name} -> ${target}`)
    linked += 1
  } catch (err) {
    console.error(`[link-usfm-tools] failed ${name}:`, err.message)
    process.exitCode = 1
  }
}

console.log(
  `[link-usfm-tools] usfm-ast=${usfmAst}${linked ? ` (created ${linked})` : ' (already linked)'}`
)
