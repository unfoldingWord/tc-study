/**
 * Create node_modules/@usfm-tools/{parser,types,usj-core} → sibling usfm-ast packages.
 * Safe no-op if links already exist. Does not run `bun install` on usfm-ast.
 */
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '../../..')
const usfmAst = path.resolve(repoRoot, '../usfm-ast')
const nm = path.join(repoRoot, 'node_modules', '@usfm-tools')

const links = {
  parser: path.join(usfmAst, 'packages', 'usfm-parser'),
  types: path.join(usfmAst, 'packages', 'shared-types'),
  'usj-core': path.join(usfmAst, 'packages', 'usfm-usj-core'),
}

fs.mkdirSync(nm, { recursive: true })

for (const [name, target] of Object.entries(links)) {
  const dest = path.join(nm, name)
  if (!fs.existsSync(target)) {
    console.warn(`[link-usfm-tools] skip ${name}: missing ${target}`)
    continue
  }
  try {
    const stat = fs.lstatSync(dest)
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      console.log(`[link-usfm-tools] ok ${name}`)
      continue
    }
  } catch {
    /* missing */
  }
  try {
    fs.symlinkSync(target, dest, 'junction')
    console.log(`[link-usfm-tools] linked ${name} -> ${target}`)
  } catch (err) {
    console.error(`[link-usfm-tools] failed ${name}:`, err.message)
    process.exitCode = 1
  }
}
