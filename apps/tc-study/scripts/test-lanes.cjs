/**
 * Split unit tests into behavior vs arch-freeze/LOC/guard lanes.
 *
 * Usage:
 *   node scripts/test-lanes.cjs behavior
 *   node scripts/test-lanes.cjs arch
 *
 * Globs (matched against path relative to src/, forward slashes):
 *
 * ARCH (excluded from behavior):
 *   - *Freeze.test.ts — asAny / colonAny / consoleLog ratchets
 *   - godSize.test.ts — hard LOC budgets (files)
 *   - folderSize.test.ts — aggregate directory LOC soft/hard
 *   - *Size.test.ts — navSize / composerSize / folderSize LOC
 *   - *Guards.test.ts — messaging / legacy / bootstrap / window / deploy / appStore / combinedHelps
 *   - *.guard.test.ts — importDirection / resourceTypesPanelsBoundary
 *   - assertAllPluginsRegistered.test.ts
 *
 * BEHAVIOR: every other src test/spec file (includes *.behavior.test.ts and product units)
 */
const { spawnSync } = require('node:child_process')
const { readdirSync, statSync } = require('node:fs')
const { join, relative } = require('node:path')

const lane = process.argv[2]
if (lane !== 'behavior' && lane !== 'arch') {
  console.error('Usage: node scripts/test-lanes.cjs <behavior|arch>')
  process.exit(2)
}

const srcRoot = join(__dirname, '..', 'src')

const ARCH_PATTERNS = [
  /Freeze\.test\.(ts|tsx)$/,
  /godSize\.test\.(ts|tsx)$/,
  /Size\.test\.(ts|tsx)$/,
  /Guards\.test\.(ts|tsx)$/,
  /\.guard\.test\.(ts|tsx)$/,
  /assertAllPluginsRegistered\.test\.(ts|tsx)$/,
]

function isArch(relPosix) {
  return ARCH_PATTERNS.some((re) => re.test(relPosix))
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue
      walk(full, out)
      continue
    }
    if (/\.(test|spec)\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const all = walk(srcRoot)
const selected = all.filter((abs) => {
  const rel = relative(srcRoot, abs).replace(/\\/g, '/')
  const arch = isArch(rel)
  return lane === 'arch' ? arch : !arch
})

if (selected.length === 0) {
  console.error(`No ${lane} tests found under src/`)
  process.exit(1)
}

console.log(`[test:${lane}] ${selected.length} file(s)`)
const result = spawnSync('bun', ['test', ...selected], {
  stdio: 'inherit',
  cwd: join(__dirname, '..'),
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
