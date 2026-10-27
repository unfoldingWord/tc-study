/**
 * The real-data proof (spec §7): one release's whole packs and the same release's parts give the same rows. Run only
 * when `PARTS_REAL=<folder>` names a folder with `es-419.langpack.zip`, `originals.langpack.zip` (whole packs),
 * `es-419.json`, `originals.json` (the parts lists) and `parts/<sha>.part.gz` for every part both lists name.
 *
 * The whole packs go into one store with `importLanguagePack`; every part is staged and `applyParts` fills another
 * store with all units chosen. The rows of the part layers must be the same, keys and values, volatile fields left out.
 * Receipts and register rows are not compared: they are written by different paths on purpose (`receipts.ts`); they
 * are counted. Any other row outside the part layers fails the test, listed by family. The catalog rows must be the
 * same too, bookkeeping left out, except `version`, `release.tag_name` and `release.published_at` of a resource the
 * whole pack has at another release than the list's stamp (a release published between the two builds whose rows did
 * not change): those are printed.
 */

import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { belongsTo, scansFor } from '../keys'
import { importLanguagePack, readPackManifest } from '../pack'
import type { PackLayer } from '../types'
import { applyParts } from './apply'
import { PART_LAYERS, stableJson, stripVolatile } from './partFile'
import { unitOfPart, withoutBookkeeping, type PartsList } from './partsList'
import { planParts } from './plan'
import { REGISTER_PREFIX } from './register'
import { memoryByteStore, stagingFrom } from './staging'
import { memoryTarget } from './testTarget'

const FOLDER = process.env.PARTS_REAL
if (!FOLDER) console.log('realParts.test.ts: skipped (set PARTS_REAL=<folder> to compare the whole packs with their parts)')

const LAYERS = new Set<PackLayer>(PART_LAYERS)

/** The layer a key is a row of, among these resources' scans; null when no scan of theirs finds it. */
function layerOf(key: string, resourceKeys: string[]): PackLayer | null {
  for (const resourceKey of resourceKeys) {
    for (const scan of scansFor(resourceKey)) {
      if (key.startsWith(scan.prefix) && belongsTo(key, resourceKey, scan)) return scan.layer
    }
  }
  return null
}

/** A family of keys, to list what is left out: the text before the first `:`, or before the first `/`. */
const familyOfKey = (key: string): string => key.match(/^[^:/]+[:/]/)?.[0] ?? key

const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)

describe.skipIf(!FOLDER)('the q9-a12 whole packs and their parts', () => {
  test(
    'applying every part gives the rows of the whole packs',
    async () => {
      const folder = FOLDER!
      const read = (name: string) => new Uint8Array(readFileSync(join(folder, name)))
      const list = JSON.parse(readFileSync(join(folder, 'es-419.json'), 'utf8')) as PartsList
      const originals = JSON.parse(readFileSync(join(folder, 'originals.json'), 'utf8')) as PartsList

      // A: the whole packs, each with its own versions (the parts list's must be the same, or apply refuses).
      const whole = memoryTarget()
      const packStamps = new Map<string, string | undefined>()
      for (const name of ['originals.langpack.zip', 'es-419.langpack.zip']) {
        const bytes = read(name)
        const manifest = await readPackManifest(bytes)
        for (const r of manifest.resources) packStamps.set(r.key, r.stamp)
        const imported = await importLanguagePack({ bytes, target: whole, versions: manifest.versions })
        console.log(`${name}: ${imported.written} rows written, ${imported.keptExisting} kept, skipped layers [${imported.skippedLayers.join(', ')}], skipped resources [${imported.skippedResources.join(', ')}]`)
        expect(imported.skippedLayers).toEqual([])
      }

      // B: every part both lists name, staged, then applied with every unit chosen.
      const staging = stagingFrom(memoryByteStore())
      const shas = new Set([...list.parts, ...originals.parts].map((p) => p.sha256))
      for (const sha of shas) {
        const file = join(folder, 'parts', `${sha}.part.gz`)
        if (!existsSync(file)) throw new Error(`Part ${sha} is not in ${folder}/parts`)
        await staging.put(sha, new Uint8Array(readFileSync(file)))
      }
      const chosen = [...new Set([...(list.units ?? []).map((u) => u.id), ...[...list.parts, ...originals.parts].map(unitOfPart)])]
      const parts = memoryTarget()
      const plan = planParts({ list, originals, register: new Map(), chosen })
      const applied = await applyParts({ target: parts, staging, plan, list, originals, register: new Map(), chosen, versions: list.versions! })
      console.log(`parts: ${shas.size} staged, ${plan.download.length} planned in ${plan.units.length} units, ${applied.applied.length} applied, ${applied.completed.length} resources whole`)
      expect(plan.download.length).toBeGreaterThan(0)
      expect(applied.applied.length).toBeGreaterThan(0)
      expect(applied.failed).toEqual([])
      expect(applied.applied).toEqual(plan.units)

      // The rows of the part layers on each side, by key.
      const resourceKeys = [...new Set([...list.resources, ...originals.resources].map((r) => r.key))]
      const ignored = new Map<string, number>()
      const skipped = new Map<string, number>()
      const sides = (rows: Map<string, unknown>, side: string) => {
        const out = new Map<string, { layer: PackLayer; json: string }>()
        for (const [key, entry] of rows) {
          if (key.startsWith('resource:') || key.startsWith(REGISTER_PREFIX)) {
            count(skipped, `${side} ${familyOfKey(key)}`)
            continue
          }
          const layer = layerOf(key, resourceKeys)
          if (!layer || !LAYERS.has(layer)) {
            count(ignored, `${side} ${layer ?? 'no layer'} ${familyOfKey(key)}`)
            continue
          }
          out.set(key, { layer, json: stableJson(stripVolatile(entry)) })
        }
        return out
      }
      const a = sides(whole.rows, 'whole')
      const b = sides(parts.rows, 'parts')

      expect(a.size).toBeGreaterThan(0)
      const onlyWhole: string[] = []
      const onlyParts: string[] = []
      const differ: string[] = []
      const perLayer = new Map<string, number>()
      for (const [key, row] of a) {
        const other = b.get(key)
        if (!other) onlyWhole.push(key)
        else if (other.json !== row.json) differ.push(key)
        else count(perLayer, row.layer)
      }
      for (const key of b.keys()) if (!a.has(key)) onlyParts.push(key)

      console.log(`rows compared: whole ${a.size}, parts ${b.size}; equal by layer ${JSON.stringify(Object.fromEntries([...perLayer].sort()))}`)
      console.log(`not compared (receipts, register): ${JSON.stringify(Object.fromEntries([...skipped].sort()))}`)
      console.log(`left out: ${ignored.size ? JSON.stringify(Object.fromEntries([...ignored].sort())) : 'nothing'}`)
      // A catalog row may differ only in its release, and only when the inputs are of another release.
      const listStamps = { ...originals.stamps, ...list.stamps }
      const withoutRelease = (row: unknown) => {
        const { version: _version, release, ...rest } = withoutBookkeeping(row) as Record<string, unknown>
        if (release === undefined) return stableJson(rest)
        const { tag_name: _tag, published_at: _published, ...releaseRest } = release as Record<string, unknown>
        return stableJson({ ...rest, release: releaseRest })
      }
      const catalogDiffer: string[] = []
      const catalogMoved: string[] = []
      for (const [key, row] of whole.catalog) {
        const other = parts.catalog.get(key)
        if (!other || stableJson(withoutBookkeeping(row)) === stableJson(withoutBookkeeping(other))) continue
        const moved = packStamps.get(key) !== undefined && listStamps[key] !== undefined && packStamps.get(key) !== listStamps[key]
        if (moved && withoutRelease(row) === withoutRelease(other)) catalogMoved.push(`${key} (whole ${packStamps.get(key)}, list ${listStamps[key]})`)
        else catalogDiffer.push(key)
      }
      console.log(`catalog: whole ${whole.catalog.size} rows, parts ${parts.catalog.size} rows; different without bookkeeping [${catalogDiffer.join(', ')}]`)
      console.log(`catalog: at another release in the inputs, rows the same, release fields differ [${catalogMoved.join(', ')}]`)
      for (const [name, keys] of [['only in the whole packs', onlyWhole], ['only in the parts', onlyParts], ['different values', differ]] as const) {
        if (keys.length) console.log(`${name}: ${keys.length}\n  ${keys.sort().slice(0, 20).join('\n  ')}`)
      }
      expect({ onlyWhole: onlyWhole.length, onlyParts: onlyParts.length, differ: differ.length }).toEqual({ onlyWhole: 0, onlyParts: 0, differ: 0 })
      // Only receipts and register rows may be left out of the comparison.
      expect(Object.fromEntries(ignored)).toEqual({})
      expect([...parts.catalog.keys()].sort()).toEqual([...whole.catalog.keys()].sort())
      expect(catalogDiffer).toEqual([])
    },
    // About 130 s on an idle machine; ten minutes were seen on a loaded one.
    { timeout: 1_800_000 },
  )
})
