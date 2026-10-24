import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { compatKeyOf, fingerprintOf, PARTS_FORMAT_VERSION } from '@bt-synergy/language-pack'
import { PACK_VERSIONS } from './packVersions'
import { NOT_ROW_CODE, partsCode, partsCodeOf, partsCodeVersions } from './partsCode'

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
]

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

  test('holds every exported version or schema constant of the row producers, or says why one is not row code', () => {
    const versions = partsCodeVersions()
    const unknown: string[] = []
    for (const dir of ROW_PRODUCERS) {
      for (const file of sources(join(PACKAGES, dir))) {
        for (const m of readFileSync(file, 'utf8').matchAll(/export const ([A-Z][A-Z0-9_]*_(?:VERSION|SCHEMA))\b/g)) {
          if (!(m[1] in versions) && !(m[1] in NOT_ROW_CODE)) unknown.push(`${m[1]} (${relative(PACKAGES, file)})`)
        }
      }
    }
    // A new one is either code a part's rows come from (add it to partsCodeVersions) or not (NOT_ROW_CODE, with why).
    expect(unknown).toEqual([])
    for (const name of Object.keys(NOT_ROW_CODE)) expect(versions[name]).toBeUndefined()
  })
})
