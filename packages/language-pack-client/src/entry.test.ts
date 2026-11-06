/** Guard: nothing reachable from the main entry imports a Node or Bun module. Node-only code lives in `src/node/`, which `src/index.ts` must not reach. */
import { expect, test } from 'bun:test'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'

const SRC = import.meta.dir
const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, '').split('/')[0]!))
const FROM = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function specifiers(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const out: string[] = []
  for (const m of code.matchAll(FROM)) out.push((m[1] ?? m[2])!)
  return out
}

function resolveRelative(from: string, spec: string): string | undefined {
  const base = resolve(dirname(from), spec)
  for (const c of [base, `${base}.ts`, `${base}.json`, join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c
  return undefined
}

function forbidden(spec: string): boolean {
  if (spec.startsWith('node:') || spec.startsWith('bun:')) return true
  return BUILTINS.has(spec.split('/')[0]!) && !spec.startsWith('.')
}

/** Follows the relative imports from `entry`; returns the offending chains. */
function offenders(entry: string, root: string): { chains: string[]; files: string[] } {
  const seen = new Map<string, string[]>()
  const chains: string[] = []
  const queue: string[] = [entry]
  seen.set(entry, [entry])
  while (queue.length > 0) {
    const file = queue.shift()!
    const chain = seen.get(file)!
    if (!file.endsWith('.ts')) continue
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      const names = [...chain, spec].map((p) => (p.startsWith(root) ? relative(root, p) : p))
      if (forbidden(spec)) chains.push(names.join(' -> '))
      else if (spec.startsWith('.')) {
        const next = resolveRelative(file, spec)
        if (next === undefined) chains.push(`${names.join(' -> ')} (cannot resolve)`)
        else if (!seen.has(next)) {
          seen.set(next, [...chain, next])
          queue.push(next)
        }
      }
    }
  }
  return { chains, files: [...seen.keys()] }
}

test('the specifier scanner sees imports, exports and dynamic imports', () => {
  const t = `import { a } from 'node:fs'\nexport * from './x'\nexport { b } from "bun:test"\nimport type { C } from './c'\nconst d = await import('path')\n// import z from 'fs'\nimport './side'`
  expect(specifiers(t)).toEqual(['node:fs', './x', 'bun:test', './c', 'path', './side'])
  expect(forbidden('node:fs')).toBe(true)
  expect(forbidden('fs')).toBe(true)
  expect(forbidden('crypto')).toBe(true)
  expect(forbidden('@noble/hashes/sha2.js')).toBe(false)
})

test('the main entry reaches no Node or Bun module, and not src/node', () => {
  const { chains, files } = offenders(join(SRC, 'index.ts'), SRC)
  expect(files.length).toBeGreaterThan(15)
  expect(files.some((f) => relative(SRC, f).startsWith('node'))).toBe(false)
  expect(chains).toEqual([])
})

test('the library modules the client imports (language-pack-v3 index) reach none either', () => {
  const v3 = join(SRC, '..', '..', 'language-pack-v3', 'src')
  const { chains, files } = offenders(join(v3, 'index.ts'), v3)
  expect(files.length).toBeGreaterThan(10)
  expect(chains).toEqual([])
})
