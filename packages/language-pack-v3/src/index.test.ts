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

  test('no file in its import graph imports a Node module', () => {
    const seen = new Set<string>()
    const bare = new Set<string>()
    const visit = (path: string): void => {
      if (seen.has(path)) return
      seen.add(path)
      const text = readFileSync(path, 'utf8')
      for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"\n]*?from\s+'([^']+)'|(?:^|\n)\s*import\s+'([^']+)'|\bimport\(\s*'([^']+)'\s*\)/g)) {
        const spec = m[1] ?? m[2] ?? m[3]
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
})
