import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { compatKeyOf, fingerprintOf, PACK_FORMAT_VERSION, PARTS_FORMAT_VERSION } from '@bt-synergy/language-pack'
import { USJ_TOOL_VERSIONS } from '@bt-synergy/usj-processor'
import { HELPS_INDEX_VERSION } from './bookIndex'
import { PACK_VERSIONS } from './packVersions'
import {
  installedVersions,
  NOT_ROW_CODE,
  NOT_ROW_DEPENDENCIES,
  NOT_SCANNED,
  partsCode,
  partsCodeOf,
  partsCodeVersions,
  ROW_DEPENDENCIES,
  STAMP_SAMPLE,
} from './partsCode'

const PACKAGES = join(import.meta.dir, '..', '..', '..')

/** Every package whose code writes rows a part carries: loaders, parsers, preparers, quotes, alignments, companions. */
const ROW_PRODUCERS = [
  'usj-processor/src',
  'scripture-loader/src',
  'resource-parsers/src',
  'resource-catalog/src',
  'translation-notes-loader/src',
  'translation-questions-loader/src',
  'translation-words-links-loader/src',
  'translation-words-loader/src',
  'translation-academy-loader/src',
  'resource-pipeline/src',
  'resource-pipeline/cli',
  'language-pack/src',
  // The catalog rows the loaders read their files and ingredients from, the registry that picks a loader, the client
  // that downloads, and the stores every row goes through.
  'catalog-manager/src',
  'resource-types/src',
  'door43-api/src',
  'cache-adapter-indexeddb/src',
  'catalog-adapter-indexeddb/src',
]

const packageJson = (name: string) =>
  JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }

/** The leaves of a constant's object, `NAME.a.b`, as partsCodeVersions names them. */
function leaves(prefix: string, value: unknown): string[] {
  if (value === null || typeof value !== 'object') return [prefix]
  return Object.entries(value).flatMap(([k, v]) => leaves(`${prefix}.${k}`, v))
}

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== 'node_modules' && name !== 'dist') out.push(...sources(path))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(path)
  }
  return out
}

describe('the code of a parts build', () => {
  test('is the parts compatibility key and a hash of every row-producing code version', async () => {
    const compat = compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)
    const code = await partsCode()
    expect(code).toMatch(/^f2\.0-[^+]+\+[0-9a-f]{16}$/)
    expect(code.startsWith(`${compat}+`)).toBe(true)
    expect(code).toBe(await partsCodeOf(compat, partsCodeVersions()))
  })

  test('changes with any one version, or the compatibility key, and not with the order versions are listed in', async () => {
    const versions = partsCodeVersions()
    const code = await partsCodeOf('f2.0-x', versions)
    expect(await partsCodeOf('f2.0-x', Object.fromEntries(Object.entries(versions).reverse()))).toBe(code)
    expect(await partsCodeOf('f2.0-y', versions)).not.toBe(code)
    const codes = new Set([code])
    for (const [name, value] of Object.entries(versions)) {
      codes.add(await partsCodeOf('f2.0-x', { ...versions, [name]: typeof value === 'number' ? value + 1 : `${value}.next` }))
    }
    expect(codes.size).toBe(Object.keys(versions).length + 1)
  })

  test('moves every fingerprint, so a carried part never outlives the code that built it', async () => {
    const inputs = { files: [['r', 'a.tsv', 'ce013625030ba8dba906f756967f9e9ca394464a']] as Array<[string, string, string]>, manifests: [], stamps: [] }
    const versions = partsCodeVersions()
    const before = await fingerprintOf({ code: await partsCodeOf('f2.0-x', versions), id: 'p', inputs })
    const after = await fingerprintOf({ code: await partsCodeOf('f2.0-x', { ...versions, TW_ROWS_VERSION: Number(versions.TW_ROWS_VERSION) + 1 }), id: 'p', inputs })
    expect(after).not.toBe(before)
  })

  test('holds every version the compatibility key is made of', () => {
    const versions = partsCodeVersions()
    expect(versions.USJ_PROCESSING_VERSION).toBe(PACK_VERSIONS.sot.usjProcessing)
    expect(versions.SCRIPTURE_PREPARE_VERSION).toBe(PACK_VERSIONS.prepared.scripturePrepare)
    expect(versions.HELPS_QUOTE_VERSION).toBe(PACK_VERSIONS.quote.helpsQuote)
    expect(versions.HELPS_ALIGN_VERSION).toBe(PACK_VERSIONS.align.helpsAlign)
    expect(versions.HELPS_TEXT_VERSION).toBe(PACK_VERSIONS.text.helpsText)
  })

  test('states the index version, which the compatibility key leaves out', () => {
    expect(PACK_VERSIONS.index).toEqual({ helpsIndex: HELPS_INDEX_VERSION })
    expect(compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)).toBe('f2.0-u2.3.0-p6000230-q9-a12-t1')
    expect(compatKeyOf(PACK_FORMAT_VERSION, PACK_VERSIONS)).toBe('f1.1-u2.3.0-p6000230-q9-a12-t1')
  })

  test('holds every version, versions or schema constant of the row producers, or says why one is not row code', async () => {
    const versions = partsCodeVersions()
    const unknown: string[] = []
    for (const dir of ROW_PRODUCERS) {
      for (const file of sources(join(PACKAGES, dir))) {
        const text = readFileSync(file, 'utf8')
        for (const m of text.matchAll(/^\s*(export\s+)?const ([A-Z][A-Z0-9_]*_(?:VERSIONS?|SCHEMA))\b/gm)) {
          const [, exported, name] = m
          if (name in NOT_ROW_CODE) continue
          const where = `${name} (${relative(PACKAGES, file)})`
          if (!exported) {
            // Not exported, it cannot be read here: export it and add it, or say in NOT_ROW_CODE why it is not row code.
            unknown.push(`${where}: not exported`)
          } else if (name.endsWith('_VERSIONS')) {
            // An object of versions: each of its leaves by `NAME.key`.
            const value = (await import(file))[name]
            for (const leaf of leaves(name, value)) if (!(leaf in versions)) unknown.push(`${leaf} (${relative(PACKAGES, file)})`)
          } else if (!(name in versions)) unknown.push(where)
        }
      }
    }
    // A new one is either code a part's rows come from (add it to partsCodeVersions) or not (NOT_ROW_CODE, with why).
    expect(unknown).toEqual([])
    for (const name of Object.keys(NOT_ROW_CODE)) expect(versions[name]).toBeUndefined()
  })

  test('scans every workspace package the row producers depend on, or says why one makes no rows', () => {
    const scanned = new Set(ROW_PRODUCERS.map((dir) => dir.split('/')[0]))
    const unscanned: string[] = []
    for (const name of scanned) {
      const pkg = packageJson(name)
      for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
        const workspace = dep.startsWith('@bt-synergy/') ? dep.slice('@bt-synergy/'.length) : null
        if (workspace && !scanned.has(workspace) && !(workspace in NOT_SCANNED)) unscanned.push(`${workspace} (a dependency of ${name})`)
      }
    }
    expect(unscanned).toEqual([])
  })

  test('holds the installed version of every third-party package on the row path and of what they depend on', () => {
    const versions = partsCodeVersions()
    const installed = installedVersions()
    for (const [name, version] of Object.entries(installed)) expect(versions[name]).toBe(version)
    // The roots, and some of what they pull in: an upgrade of any of them may change rows without any constant moving.
    for (const name of ['@usfm-tools/parser', '@usfm-tools/usj-core', '@usfm-tools/types', '@xmldom/xmldom', 'unified', 'remark-parse', 'remark-gfm', 'remark-rehype', 'mdast-util-to-hast', 'micromark', 'jszip', 'fake-indexeddb']) {
      expect(installed[`npm ${name}`]).toMatch(/^\d+\.\d+\.\d+/)
    }
    // Read from node_modules, not from a package.json range.
    const parser = JSON.parse(readFileSync(join(PACKAGES, 'usj-processor', 'node_modules', '@usfm-tools', 'parser', 'package.json'), 'utf8'))
    expect(installed['npm @usfm-tools/parser']).toBe(parser.version)
  })

  test("names every third-party dependency of the row producers, or says why it makes no rows", () => {
    const roots = new Set(Object.values(ROW_DEPENDENCIES).flat())
    const unnamed: string[] = []
    for (const dir of ROW_PRODUCERS) {
      const name = dir.split('/')[0]
      const pkg = packageJson(name)
      for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
        if (dep.startsWith('@bt-synergy/')) continue
        if (!roots.has(dep) && !(dep in NOT_ROW_DEPENDENCIES)) unnamed.push(`${dep} (${name})`)
      }
    }
    expect([...new Set(unnamed)]).toEqual([])
    for (const [pkg, deps] of Object.entries(ROW_DEPENDENCIES)) {
      const declared = { ...packageJson(pkg).dependencies, ...packageJson(pkg).peerDependencies, ...(pkg === 'resource-pipeline' ? { 'fake-indexeddb': '' } : {}) }
      for (const dep of deps) expect(`${dep} in ${pkg}: ${dep in declared}`).toBe(`${dep} in ${pkg}: true`)
    }
  })

  test('says the USJ tool versions the USJ rows are stamped with are the installed ones', () => {
    const installed = installedVersions()
    expect({ ...USJ_TOOL_VERSIONS }).toEqual({ parser: installed['npm @usfm-tools/parser'], usjCore: installed['npm @usfm-tools/usj-core'] })
  })

  test('holds a sample of the stamps keys carry, so a change of their format moves the code', () => {
    const versions = partsCodeVersions()
    expect(versions['stamp resourceContentStamp']).toBe('v2_a_b_c#2026-01-02T03_04_05Z')
    expect(versions['stamp bookContentStamp']).toBe('gce01362503')
    expect(versions['stamp bookContentStamp, no blob']).toBe('v2_a_b_c#2026-01-02T03_04_05Z')
    expect(versions['stamp lexiconStampOf']).toBe('0123456789#2026-07-01T00_00_00Z')
    expect(STAMP_SAMPLE.release.tag_name).toBe('v2:a|b@c')
  })
})
