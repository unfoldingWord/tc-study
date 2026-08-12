/**
 * ARCH-FREEZE (non-behavioral): aggregate directory LOC budgets.
 * Fail-closed soft ratchet — growth past softMax fails CI.
 * Hard ceiling ~actual×1.15; does not require Grade A peel.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dir, '..')

function isSourceFile(name: string): boolean {
  if (!/\.(ts|tsx)$/.test(name)) return false
  if (/\.test\.(ts|tsx)$/.test(name)) return false
  if (/\.spec\.(ts|tsx)$/.test(name)) return false
  return true
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue
      collectSourceFiles(full, out)
      continue
    }
    if (isSourceFile(name)) out.push(full)
  }
  return out
}

function directoryLoc(relativeDir: string): number {
  const files = collectSourceFiles(join(SRC, relativeDir))
  let lines = 0
  for (const file of files) {
    lines += readFileSync(file, 'utf8').split(/\r?\n/).length
  }
  return lines
}

/** Soft = current + ~5% headroom (fail growth). Hard = ~current×1.15. */
function softMax(currentLoc: number): number {
  return Math.ceil((currentLoc * 105) / 100)
}

function hardMax(currentLoc: number): number {
  return Math.ceil((currentLoc * 115) / 100)
}

/**
 * Worst-folder aggregates (production .ts/.tsx only; tests excluded).
 * currentLoc measured 2026-08-10 — bump only when intentionally growing.
 */
const FOLDER_BUDGETS: { name: string; path: string; currentLoc: number }[] = [
  {
    name: 'CombinedHelpsViewer',
    path: 'components/resources/CombinedHelpsViewer',
    currentLoc: 2348,
  },
  {
    name: 'WordsLinksViewer',
    path: 'components/resources/WordsLinksViewer',
    currentLoc: 2322,
  },
  {
    name: 'ScriptureViewer',
    path: 'components/resources/ScriptureViewer',
    currentLoc: 2558,
  },
  {
    name: 'TranslationNotesViewer',
    path: 'components/resources/TranslationNotesViewer',
    currentLoc: 1788,
  },
  {
    name: 'features/nav',
    path: 'features/nav',
    currentLoc: 3195,
  },
  {
    name: 'wizard',
    path: 'components/wizard',
    currentLoc: 2398,
  },
]

describe('folderSize (soft ratchet)', () => {
  for (const folder of FOLDER_BUDGETS) {
    const max = softMax(folder.currentLoc)
    test(`${folder.name} stays under soft aggregate (${max})`, () => {
      const lines = directoryLoc(folder.path)
      expect(lines).toBeLessThanOrEqual(max)
    })
  }
})

describe('folderSize (hard ceiling)', () => {
  for (const folder of FOLDER_BUDGETS) {
    const max = hardMax(folder.currentLoc)
    test(`${folder.name} stays under hard aggregate (${max})`, () => {
      const lines = directoryLoc(folder.path)
      expect(lines).toBeLessThanOrEqual(max)
    })
  }
})
