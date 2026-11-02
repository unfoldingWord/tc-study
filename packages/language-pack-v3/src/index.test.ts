import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// The public API, without a Node module

describe('index.ts', () => {
  const SRC = import.meta.dir
  const exportsOf = async () => import('./index')

  test('exports the public API of the package', async () => {
    const names = Object.keys(await exportsOf())
    for (const name of [
      'writeSegment', 'readSegment', 'readHeader', 'FormatError', 'hex',
      'extractOrig', 'origSegment', 'OrigIndex', 'extractBook', 'bookSegment', 'extractArticles', 'artSegment', 'extractLexicon', 'lexSegment',
      'extractObs', 'obsSegment', 'buildCatalog', 'builtSegment', 'unitsOf', 'needsOfBook', 'buildLanguage', 'buildCommon', 'bridgeZip',
      'origView', 'bookView', 'artView', 'lexView', 'obsView', 'catalogView', 'writeTransfer', 'readTransfer', 'readerOutput', 'KNOWN',
      'zipSource', 'verseId', 'parseRef', 'formatRef', 'bookSet', 'strongKey',
    ]) {
      expect(names).toContain(name)
    }
  })

  test('exports no test helper and no Node-only piece', async () => {
    const names = Object.keys(await exportsOf())
    expect(names).not.toContain('partsSource')
    expect(names.filter((name) => /test|fixture|mock/i.test(name))).toEqual([])
  })

  /** The module specifiers a file imports or re-exports: `import … from 'x'` and `export … from 'x'` (also over several lines), `import 'x'` and `import('x')`. */
  const specifiersOf = (text: string): string[] => [
    ...[...text.matchAll(/(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
    ...[...text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ...[...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
  ]

  test('the scan of imports finds every import of index.ts, also the ones over several lines', () => {
    const text = readFileSync(join(SRC, 'index.ts'), 'utf8')
    const found = specifiersOf(text)
    // Every `from '…'` of the file, counted without the regex above.
    expect(found).toHaveLength(text.split(/\bfrom\s*'/).length - 1)
    expect(found.length).toBeGreaterThan(20)
    expect(found.every((spec) => spec.startsWith('./'))).toBe(true)
    // A multi-line export is found.
    expect(specifiersOf("export {\n  a,\n  b,\n} from './x'\nimport 'y'\nconst z = import('w')\n").sort()).toEqual(['./x', 'w', 'y'])
  })

  test('no file in its import graph imports a Node module', () => {
    const seen = new Set<string>()
    const bare = new Set<string>()
    const visit = (path: string): void => {
      if (seen.has(path)) return
      seen.add(path)
      const text = readFileSync(path, 'utf8')
      for (const spec of specifiersOf(text)) {
        if (spec.startsWith('.')) visit(resolveSource(resolve(dirname(path), spec)))
        else bare.add(spec)
      }
    }
    const resolveSource = (base: string): string => {
      for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
        try {
          readFileSync(candidate)
          return candidate
        } catch {}
      }
      throw new Error(`Cannot find ${base}`)
    }
    visit(join(SRC, 'index.ts'))
    expect([...bare].sort()).toEqual(['jszip', 'pako'])
    expect([...seen].some((path) => path.replace(/\\/g, '/').includes('/src/node/'))).toBe(false)
    expect(seen.size).toBeGreaterThan(20)
  })

  test('the subpath for partsSource is in package.json, next to ".", and index.ts says that path', () => {
    const pkg = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8'))
    expect(Object.keys(pkg.exports)).toEqual(['.', './node/partsSource'])
    expect(pkg.exports['./node/partsSource']).toEqual({ types: './dist/node/partsSource.d.ts', import: './dist/node/partsSource.js' })
    expect(readFileSync(join(SRC, 'index.ts'), 'utf8')).toContain('@bt-synergy/language-pack-v3/node/partsSource')
  })
})
