/**
 * Whether a parts build (buildLanguageParts) carries what today's whole build packs: the same rows, each in exactly
 * one part, with the same values once the volatile fields are gone, and the same catalog row for each resource. The
 * parts replace the whole packs only if nothing is lost or added on the way.
 *
 * Receipts (`resource:{key}`) and `warm-coverage:v1` are left out of the whole side: parts never carry them (the list
 * says when a resource is complete), so they are only counted.
 *
 * Values are compared by a hash of their stable JSON without volatile fields, so a language as large as es-419 fits in
 * memory: each row costs its key and a hash.
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  partPath,
  partsListPath,
  readPack,
  readPart,
  stableJson,
  stripVolatile,
  withoutBookkeeping,
  type PackLayer,
  type PartsList,
} from '@bt-synergy/language-pack'

export type RowDifferences = {
  resource: string
  layer: PackLayer
  whole: number
  parts: number
  onlyInWhole: string[]
  onlyInParts: string[]
  /** Keys in both whose values differ once stripped. */
  differ: string[]
}

export type ResourceDifference = { resource: string; problem: string }

export type PartFileProblem = { part: string; problem: string }

export type PartsComparison = {
  language: string
  compat: string
  /** By resource, then layer; every pair either side has, with or without differences. */
  rows: RowDifferences[]
  /** Whole-pack rows parts do not carry by design. */
  ignored: { receipts: number; warmCoverage: number }
  /** Catalog row, stamp, role or books (when the whole pack names them) that differ, or a resource only one side has. */
  resources: ResourceDifference[]
  /** Part files missing or not as the list says, and rows carried by two parts. */
  partFiles: PartFileProblem[]
  partsChecked: number
  /** How many differences of every kind; 0 means the parts carry exactly what the whole packs do. */
  differences: number
}

const WARM_COVERAGE = 'warm-coverage:v1'

const hashOf = (value: unknown): string => createHash('sha1').update(stableJson(stripVolatile(value))).digest('base64')

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** The compat folder of a parts build: `<work>/catalog/<compat>/` holding `<language>.json`. */
export function partsCompatOf(workDir: string, language: string): string {
  const root = join(workDir, 'catalog')
  const found = existsSync(root)
    ? readdirSync(root).filter((c) => statSync(join(root, c)).isDirectory() && existsSync(join(root, c, `${language}.json`)))
    : []
  if (found.length !== 1) {
    throw new Error(`${root} should hold one compat folder with ${language}.json, found ${found.length ? found.join(', ') : 'none'}`)
  }
  return found[0]
}

/** Paths in two JSON values that differ, as `a.b[2].c`; at most `limit`. */
function differingPaths(a: unknown, b: unknown, limit: number, at = '', out: string[] = []): string[] {
  if (out.length >= limit) return out
  const objects = a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)
  if (!objects) {
    if (stableJson(a) !== stableJson(b)) out.push(at || '(value)')
    return out
  }
  const keys = [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])].sort()
  for (const k of keys) {
    const path = Array.isArray(a) ? `${at}[${k}]` : at ? `${at}.${k}` : k
    differingPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], limit, path, out)
  }
  return out
}

type Side = Map<string, Map<PackLayer, Map<string, string>>>

function put(side: Side, resource: string, layer: PackLayer, key: string, hash: string): boolean {
  const layers = side.get(resource) ?? new Map<PackLayer, Map<string, string>>()
  side.set(resource, layers)
  const rows = layers.get(layer) ?? new Map<string, string>()
  layers.set(layer, rows)
  if (rows.has(key)) return false
  rows.set(key, hash)
  return true
}

export async function compareParts(o: {
  /** Today's `<language>.langpack.zip`. */
  pack: Uint8Array
  /** Today's `originals.langpack.zip`. */
  originals: Uint8Array
  /** The `--work` folder of a `--parts` build. */
  workDir: string
}): Promise<PartsComparison> {
  const packs = [await readPack(o.pack), await readPack(o.originals)]
  const language = packs[0].manifest.language
  const compat = partsCompatOf(o.workDir, language)
  const readList = (path: string): { list: PartsList; text: string } => {
    const text = readFileSync(join(o.workDir, path), 'utf8')
    return { list: JSON.parse(text) as PartsList, text }
  }
  const languageList = readList(partsListPath(compat, language))
  // The originals list the language list was made against (its content address), not the latest `originals.json`.
  const originalsList = readList(languageList.list.originals?.path ?? partsListPath(compat, 'originals'))

  // The whole side.
  const whole: Side = new Map()
  const ignored = { receipts: 0, warmCoverage: 0 }
  const resources: ResourceDifference[] = []
  const wholeResources = new Map<string, { role: string; stamp: string; books?: string[]; metadata?: unknown }>()
  for (const pack of packs) {
    const catalog = new Map(pack.catalog.map((c) => [c.key, c.metadata]))
    for (const r of pack.manifest.resources) {
      wholeResources.set(r.key, { role: r.role, stamp: r.stamp, books: r.books, metadata: catalog.get(r.key) })
    }
    for await (const { resource, layer, row } of pack.rows()) {
      if (layer === 'receipt') ignored.receipts += 1
      else if (row.key === WARM_COVERAGE) ignored.warmCoverage += 1
      else if (!put(whole, resource, layer, row.key, hashOf(row.entry))) {
        resources.push({ resource, problem: `the whole packs carry ${layer} ${row.key} twice` })
      }
    }
  }

  // The parts side: every file the lists name, as they name it.
  const parted: Side = new Map()
  const partFiles: PartFileProblem[] = []
  const originalsSha = createHash('sha256').update(originalsList.text).digest('hex')
  if (languageList.list.originals?.sha256 !== originalsSha) {
    partFiles.push({ part: languageList.list.originals?.path ?? 'originals.json', problem: `the language list names sha256 ${languageList.list.originals?.sha256}, the file has ${originalsSha}` })
  }
  const lists = [languageList.list, originalsList.list]
  let partsChecked = 0
  for (const list of lists) {
    for (const entry of list.parts) {
      partsChecked += 1
      const name = `${entry.kind} ${entry.resource}${entry.book ? ` ${entry.book}` : ''}${entry.group ? ` ${entry.group}` : ''} (${entry.sha256.slice(0, 12)})`
      const file = join(o.workDir, partPath(entry.sha256))
      if (!existsSync(file)) {
        partFiles.push({ part: name, problem: 'missing' })
        continue
      }
      const bytes = new Uint8Array(readFileSync(file))
      const actual = sha256(bytes)
      if (actual !== entry.sha256) partFiles.push({ part: name, problem: `sha256 is ${actual}` })
      if (bytes.length !== entry.bytes) partFiles.push({ part: name, problem: `${bytes.length} bytes, the list says ${entry.bytes}` })
      const rows = await readPart(bytes)
      if (rows.length !== entry.rows) partFiles.push({ part: name, problem: `${rows.length} rows, the list says ${entry.rows}` })
      const layers = [...new Set(rows.map((r) => r.layer))]
      if (stableJson([...layers].sort()) !== stableJson([...entry.layers].sort())) {
        partFiles.push({ part: name, problem: `layers ${layers.join(',')}, the list says ${entry.layers.join(',')}` })
      }
      for (const row of rows) {
        if (!put(parted, entry.resource, row.layer, row.key, hashOf(row.value))) {
          partFiles.push({ part: name, problem: `${row.layer} ${row.key} is in another part too` })
        }
      }
    }
  }

  // Rows, by resource and layer.
  const rowDiffs: RowDifferences[] = []
  const resourceKeys = [...new Set([...whole.keys(), ...parted.keys()])].sort()
  for (const resource of resourceKeys) {
    const w = whole.get(resource) ?? new Map()
    const p = parted.get(resource) ?? new Map()
    const layers = [...new Set<PackLayer>([...w.keys(), ...p.keys()])].sort()
    for (const layer of layers) {
      const a: Map<string, string> = w.get(layer) ?? new Map()
      const b: Map<string, string> = p.get(layer) ?? new Map()
      const d: RowDifferences = { resource, layer, whole: a.size, parts: b.size, onlyInWhole: [], onlyInParts: [], differ: [] }
      for (const [key, hash] of a) {
        const other = b.get(key)
        if (other === undefined) d.onlyInWhole.push(key)
        else if (other !== hash) d.differ.push(key)
      }
      for (const key of b.keys()) if (!a.has(key)) d.onlyInParts.push(key)
      for (const list of [d.onlyInWhole, d.onlyInParts, d.differ]) list.sort()
      rowDiffs.push(d)
    }
  }

  // Each resource as the lists describe it, against the whole packs' manifest and catalog.
  const listed = new Map(lists.flatMap((l) => l.resources).map((r) => [r.key, r]))
  for (const key of [...new Set([...wholeResources.keys(), ...listed.keys()])].sort()) {
    const w = wholeResources.get(key)
    const l = listed.get(key)
    if (!w) {
      resources.push({ resource: key, problem: 'only in the parts lists' })
      continue
    }
    if (!l) {
      resources.push({ resource: key, problem: 'only in the whole packs' })
      continue
    }
    if (w.role !== l.role) resources.push({ resource: key, problem: `role ${w.role} in the whole pack, ${l.role} in the list` })
    if (w.stamp !== l.stamp) resources.push({ resource: key, problem: `stamp ${w.stamp} in the whole pack, ${l.stamp} in the list` })
    // A whole pack names the books only of the language's book-scoped resources, not of the originals.
    if (w.books && stableJson(w.books) !== stableJson(l.books ?? null)) {
      resources.push({ resource: key, problem: `books ${(w.books ?? []).join(',') || '-'} in the whole pack, ${(l.books ?? []).join(',') || '-'} in the list` })
    }
    if (w.metadata === undefined) {
      resources.push({ resource: key, problem: 'no row in the whole pack catalog.json' })
      continue
    }
    const paths = differingPaths(withoutBookkeeping(w.metadata), withoutBookkeeping(l.metadata), 10)
    if (paths.length) resources.push({ resource: key, problem: `catalog row differs at ${paths.join(', ')}` })
  }

  const differences =
    rowDiffs.reduce((n, d) => n + d.onlyInWhole.length + d.onlyInParts.length + d.differ.length, 0) + resources.length + partFiles.length
  return { language, compat, rows: rowDiffs, ignored, resources, partFiles, partsChecked, differences }
}

/** The comparison for people: counts per resource and layer first, then up to `examples` keys of each bucket. */
export function formatComparison(c: PartsComparison, examples = 10): string {
  const out: string[] = []
  out.push(`${c.language} (${c.compat}): ${c.partsChecked} parts checked`)
  out.push(`Left out of the whole packs (parts never carry them): ${c.ignored.receipts} receipts, ${c.ignored.warmCoverage} warm-coverage rows`)
  out.push('')
  const header = ['resource', 'layer', 'whole', 'parts', 'only-whole', 'only-parts', 'differ']
  const table = c.rows.map((d) => [d.resource, d.layer, d.whole, d.parts, d.onlyInWhole.length, d.onlyInParts.length, d.differ.length].map(String))
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((r) => r[i].length)))
  const line = (cells: string[]) => cells.map((cell, i) => (i < 2 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  ').trimEnd()
  out.push(line(header))
  for (const r of table) out.push(line(r))

  const more = (n: number) => (n > examples ? [`    … and ${n - examples} more`] : [])
  for (const d of c.rows) {
    for (const [label, keys] of [
      ['only in the whole pack', d.onlyInWhole],
      ['only in the parts', d.onlyInParts],
      ['values differ', d.differ],
    ] as const) {
      if (!keys.length) continue
      out.push('', `${d.resource} ${d.layer}, ${label} (${keys.length}):`)
      for (const key of keys.slice(0, examples)) out.push(`    ${key}`)
      out.push(...more(keys.length))
    }
  }
  for (const [label, items] of [
    ['Resources', c.resources.map((r) => `${r.resource}: ${r.problem}`)],
    ['Part files', c.partFiles.map((p) => `${p.part}: ${p.problem}`)],
  ] as const) {
    out.push('', `${label}: ${items.length ? `${items.length} problem${items.length === 1 ? '' : 's'}` : 'no problems'}`)
    for (const item of items.slice(0, examples)) out.push(`    ${item}`)
    out.push(...more(items.length))
  }
  out.push('', c.differences ? `${c.differences} differences` : 'No differences: the parts carry what the whole packs carry.')
  return out.join('\n')
}
