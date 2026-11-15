/**
 * Old OBS notes and questions (Door43 `*_obs-tn`, `*_obs-tq` before the TSV format) are markdown: `content/NN/FF.md`, each
 * `# heading` followed by one paragraph. In notes the heading is the quote and the paragraph the note; in questions the
 * question and the answer. {@link markdownObsHelps} turns the files into the rows the TSV loaders write for the same
 * content (`tn:{res}:obs`, `tq:{res}:obs`: one book row, the `ProcessedNotes` / `ProcessedQuestions` of book `obs`), so the
 * part builders and `extractObs` read them unchanged.
 *
 * Layout (checked on `Door43-Catalog/hi_obs-tn` v11.2 and `hi_obs-tq` v8.2): besides `LICENSE.md`, `README.md`,
 * `manifest.yaml` and `media.yaml`, every file is `content/NN/FF.md`; `00.md` holds the title's note.
 *
 * Rules:
 * - **Frame.** `FF.md` is frame `FF`; `00.md`, `title.md` and `intro.md` are frame 0 (the reference `N:intro`; the TSV
 *   loader reads `N:intro` as `N:1` with `isIntro`, which would put the row on frame 1, so the converter keeps `N:intro`).
 * - **Rows.** One per heading, in story then frame order, then file order. A heading with no text keeps the quote and an
 *   empty note; an empty heading with no text gives no row.
 * - **Issue lines, no row.** A frame file with no heading, a story-level `content/NN.md`, any other `.md` under `content/`
 *   (`front/intro.md`, a frame outside 0 to 99, a story outside 1 to 50). Root files are ignored. Nothing here throws.
 * - **Id.** The first four hex digits of sha256(`N:F` + heading): stable (a later duplicate gets `~2` downstream).
 * - **SupportReference** (notes only): the first `rc://* /ta/man/…` link of the note text, else empty.
 *
 * No Node module is used: the hash is computed here, so the resource types stay loadable in a browser.
 */

import {
  ABSENT_FROM_RELEASE_KEY,
  buildIngestReceiptFromCatalog,
  expectedIngestReleaseStamp,
  helpsIngestSchema,
  isMatchingIngestReceipt,
  presentIngredientCount,
  readAbsentFromRelease,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import { NOTES_TSV_PARSER_VERSION } from '@bt-synergy/resource-parsers'
import JSZip from 'jszip'

/** Bump when the rows this converter writes change: it is in every part fingerprint (`partsCode.ts`). */
export const OBS_MARKDOWN_HELPS_VERSION = 1

/** The `processingDate` the TSV loaders write is the time of the run; rows built from the same files must have the same bytes. */
const FIXED_DATE = '1970-01-01T00:00:00.000Z'
const MAX_STORY = 50
const MAX_FRAME = 99
const TA_LINK = /rc:\/\/[^/\s\])]*\/ta\/man\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/

// sha256, synchronous and without Node (FIPS 180-4).
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function sha256Hex(text: string): string {
  const data = new TextEncoder().encode(text)
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor((data.length * 8) / 2 ** 32))
  view.setUint32(padded.length - 4, (data.length * 8) >>> 0)
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    const add = [a, b, c, d, e, f, g, hh]
    for (let i = 0; i < 8; i++) h[i] = (h[i] + add[i]) >>> 0
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('')
}

/** The id of a row: the first four hex digits of sha256(`N:F` + heading). */
export function markdownHelpId(story: number, frame: number, heading: string): string {
  return sha256Hex(`${story}:${frame}${heading}`).slice(0, 4)
}

interface Entry {
  story: number
  frame: number
  heading: string
  text: string
}

/** The `# heading` + text blocks of a frame file; the text before the first heading is returned apart. */
function blocks(markdown: string): { before: string; entries: { heading: string; text: string }[] } {
  const entries: { heading: string; text: string[] }[] = []
  const before: string[] = []
  for (const line of markdown.replace(/^﻿/, '').split(/\r?\n/)) {
    // A closing run of #'s needs a space before it ("## x ##"); the # of "C#" is part of the heading.
    const m = /^#+(?:\s+(.*?))?(?:\s+#+)?\s*$/.exec(line)
    if (m !== null) entries.push({ heading: m[1] ?? '', text: [] })
    else (entries.length === 0 ? before : entries[entries.length - 1].text).push(line)
  }
  return { before: paragraphs(before), entries: entries.map((e) => ({ heading: e.heading, text: paragraphs(e.text) })) }
}

/** The paragraphs of some lines, joined with the escape the TSV files use (a backslash and an n, twice). */
function paragraphs(lines: string[]): string {
  return lines
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join(' '))
    .filter((p) => p !== '')
    .join('\\n\\n')
}

const frameOf = (name: string): number | null => {
  if (name === 'title' || name === 'intro') return 0
  return /^\d{1,3}$/.test(name) ? Number(name) : null
}

const ROOT = /^(?:LICENSE|README)\.md$/i

/** The entries of the files, with a line in `issues` for each file that gives none. */
function readEntries(files: Map<string, string>, issues: string[]): Entry[] {
  const out: (Entry & { order: number })[] = []
  let order = 0
  for (const [rawPath, markdown] of files) {
    const path = rawPath.replace(/\\/g, '/').replace(/^\.\//, '')
    if (!/\.md$/i.test(path) || ROOT.test(path)) continue
    const m = /^(?:.*\/)?content\/(.+)$/.exec(path)
    if (m === null) continue
    const parts = m[1].split('/')
    const file = parts[parts.length - 1].replace(/\.md$/i, '').toLowerCase()
    if (parts.length === 1 && /^\d{1,3}$/.test(file)) {
      issues.push(`${path}: a story-level file has no frame; no row`)
      continue
    }
    const story = parts.length === 2 && /^\d{1,3}$/.test(parts[0]) ? Number(parts[0]) : null
    const frame = parts.length === 2 ? frameOf(file) : null
    if (story === null || frame === null || story < 1 || story > MAX_STORY || frame > MAX_FRAME) {
      issues.push(`${path}: not a story 1 to ${MAX_STORY} and a frame 0 to ${MAX_FRAME}; no row`)
      continue
    }
    const { before, entries } = blocks(markdown)
    if (entries.length === 0) {
      issues.push(`${path}: no heading${before === '' ? '' : ' (the text is left out)'}; no row`)
      continue
    }
    for (const e of entries) {
      if (e.heading === '' && e.text === '') continue
      out.push({ story, frame, heading: e.heading, text: e.text, order: order++ })
    }
  }
  return out.sort((a, b) => a.story - b.story || a.frame - b.frame || a.order - b.order)
}

const referenceOf = (e: Entry) => (e.frame === 0 ? `${e.story}:intro` : `${e.story}:${e.frame}`)

function group<T extends { reference: string }>(rows: T[]): Record<string, T[]> {
  const byChapter: Record<string, T[]> = {}
  for (const row of rows) (byChapter[row.reference.split(':')[0]] ??= []).push(row)
  return byChapter
}

const counts = (by: Record<string, unknown[]>) => Object.fromEntries(Object.entries(by).map(([c, rows]) => [c, rows.length]))
const chapters = (by: Record<string, unknown[]>) => Object.keys(by).map(Number).sort((a, b) => a - b)

/**
 * The rows of old markdown OBS notes (`tn`) or questions (`tq`), keyed as the TSV loaders key them (`tn:{res}:obs`): an empty
 * map, and a line in `issues`, when no file gives a row. `files` maps paths from the repository root to their text.
 */
export function markdownObsHelps(files: Map<string, string>, kind: 'tn' | 'tq', resourceKey: string, issues: string[]): Map<string, unknown> {
  const entries = readEntries(files, issues)
  const out = new Map<string, unknown>()
  if (entries.length === 0) {
    issues.push(`${resourceKey}: the markdown files give no ${kind === 'tn' ? 'notes' : 'questions'}`)
    return out
  }
  const book = { bookCode: 'obs', bookName: 'obs' }
  const key = `${kind}:${resourceKey}:obs`
  if (kind === 'tn') {
    const notes = entries.map((e) => ({
      reference: referenceOf(e),
      id: markdownHelpId(e.story, e.frame, e.heading),
      tags: '',
      supportReference: TA_LINK.exec(e.text)?.[0] ?? '',
      quote: e.heading,
      occurrence: '1',
      note: e.text,
      isIntro: e.frame === 0,
    }))
    const notesByChapter = group(notes)
    out.set(key, {
      ...book,
      notes,
      notesByChapter,
      metadata: {
        ...book,
        processingDate: FIXED_DATE,
        parserVersion: NOTES_TSV_PARSER_VERSION,
        totalNotes: notes.length,
        chaptersWithNotes: chapters(notesByChapter),
        statistics: { totalNotes: notes.length, notesPerChapter: counts(notesByChapter) },
      },
    })
  } else {
    const questions = entries.map((e) => ({
      reference: referenceOf(e),
      id: markdownHelpId(e.story, e.frame, e.heading),
      tags: '',
      quote: '',
      occurrence: '',
      question: e.heading,
      response: e.text,
    }))
    const questionsByChapter = group(questions)
    out.set(key, {
      ...book,
      questions,
      questionsByChapter,
      metadata: {
        ...book,
        processingDate: FIXED_DATE,
        totalQuestions: questions.length,
        chaptersWithQuestions: chapters(questionsByChapter),
        statistics: { totalQuestions: questions.length, questionsPerChapter: counts(questionsByChapter) },
      },
    })
  }
  return out
}

// The switch between the TSV path and this one

/**
 * Whether a catalog row is an old markdown helps resource: it needs positive evidence (an ingredient path ending in `.md`, or
 * a format that says markdown) and no `.tsv` ingredient or TSV format. A row that says nothing, or only lists ingredients with
 * no path, stays on the TSV path.
 */
export function isMarkdownHelps(metadata: ResourceMetadata): boolean {
  const meta = metadata as { format?: unknown; contentMetadata?: { ingredients?: { path?: string }[] } }
  const ingredients = Array.isArray(meta.contentMetadata?.ingredients) ? meta.contentMetadata.ingredients : []
  const format = typeof meta.format === 'string' ? meta.format.toLowerCase() : ''
  if (format.includes('tsv') || ingredients.some((i) => /\.tsv$/i.test(i.path ?? ''))) return false
  return format.includes('markdown') || ingredients.some((i) => /\.md$/i.test(i.path ?? ''))
}

type ZipClient = { downloadZipball: (owner: string, repo: string, ref?: string) => Promise<ArrayBuffer | Uint8Array> }

/** The markdown files of a release zip, by path from the repository root (the one top folder is removed). */
export async function markdownFilesOfZip(bytes: ArrayBuffer | Uint8Array): Promise<Map<string, string>> {
  const archive = await JSZip.loadAsync(bytes)
  const names = Object.keys(archive.files).filter((n) => !archive.files[n].dir)
  const tops = new Set(names.map((n) => (n.includes('/') ? n.slice(0, n.indexOf('/')) : '')))
  const [top] = tops
  if (tops.size !== 1 || !top) throw new Error('The zip does not have one top folder')
  const files = new Map<string, string>()
  for (const name of names) if (/\.md$/i.test(name)) files.set(name.slice(top.length + 1), await archive.files[name].async('string'))
  return files
}

type CacheLike = { get: (key: string) => Promise<any>; set: (key: string, value: unknown) => Promise<void> }

/**
 * The `resource:{key}` ingest receipt, written as the TSV loaders' `markComplete` writes it (same call, same absent-from-release
 * handling), so `ResourceCompletenessChecker` takes its stamped-receipt path. That path does not count ingredients; the count
 * recorded is the one of the catalog row (a markdown repo lists a directory, or one file per story).
 */
async function writeReceipt(cache: CacheLike, resourceKey: string, metadata: ResourceMetadata): Promise<void> {
  const resourceCacheKey = `resource:${resourceKey}`
  const prior = await cache.get(resourceCacheKey)
  const absentFromRelease = readAbsentFromRelease(prior?.metadata)
  const listed = (metadata as { contentMetadata?: { ingredients?: unknown[] } }).contentMetadata?.ingredients
  const presentCount = presentIngredientCount(Array.isArray(listed) ? listed.length : 0, absentFromRelease)
  const receipt = buildIngestReceiptFromCatalog(metadata, {
    ingestSchema: helpsIngestSchema(),
    ingredientCount: presentCount,
    downloadMethod: 'zip',
    entryCount: presentCount,
    expectedEntryCount: presentCount,
  })
  await cache.set(resourceCacheKey, {
    content: { downloaded: true },
    metadata: {
      ...(receipt ?? { downloadComplete: true, downloadCompletedAt: new Date().toISOString(), downloadMethod: 'zip', entryCount: presentCount, expectedEntryCount: presentCount }),
      ...(absentFromRelease.length > 0 ? { [ABSENT_FROM_RELEASE_KEY]: absentFromRelease } : {}),
    },
  })
}

async function receiptIsMatching(cache: CacheLike, resourceKey: string, metadata: ResourceMetadata): Promise<boolean> {
  const stamp = expectedIngestReleaseStamp(metadata)
  return isMatchingIngestReceipt(await cache.get(`resource:${resourceKey}`), stamp, helpsIngestSchema())
}

/**
 * The loader class `Base` (the TSV notes or questions loader) that, for a catalog row of old markdown OBS helps, reads the
 * release zip and writes the converted `{tn|tq}:{res}:obs` row, and for any other resource does what `Base` does. The
 * issues of the last conversion are in `lastIssues`.
 */
export function withMarkdownObsHelps<C extends new (config: any) => any>(Base: C, kind: 'tn' | 'tq'): C {
  const Loader = Base as unknown as new (config: any) => any
  class MarkdownAware extends Loader {
    lastIssues: string[] = []

    async convertZip(resourceKey: string, metadata: ResourceMetadata): Promise<Map<string, unknown>> {
      const [owner, language, resourceId] = resourceKey.split('/')
      const ref = metadata.release?.tag_name || (metadata as { default_branch?: string }).default_branch || 'master'
      const bytes = await (this.door43Client as ZipClient).downloadZipball(owner, `${language}_${resourceId}`, ref)
      this.lastIssues = []
      return markdownObsHelps(await markdownFilesOfZip(bytes), kind, resourceKey, this.lastIssues)
    }

    async loadContent(resourceKey: string, bookCode: string) {
      const metadata = await this.getMetadata(resourceKey)
      if (!isMarkdownHelps(metadata)) return super.loadContent(resourceKey, bookCode)
      const key = `${kind}:${resourceKey}:${bookCode}`
      const cached = await this.cacheAdapter.get(key)
      if (cached) return cached
      for (const [k, v] of await this.convertZip(resourceKey, metadata)) await this.cacheAdapter.set(k, v)
      return this.cacheAdapter.get(key)
    }

    async downloadResource(resourceKey: string, options?: { skipExisting?: boolean }, ...rest: unknown[]) {
      const metadata = await this.getMetadata(resourceKey)
      if (!isMarkdownHelps(metadata)) return super.downloadResource(resourceKey, options, ...rest)
      const rowKey = `${kind}:${resourceKey}:obs`
      if (options?.skipExisting !== false && (await this.cacheAdapter.get(rowKey)) && (await receiptIsMatching(this.cacheAdapter, resourceKey, metadata))) return
      const rows = await this.convertZip(resourceKey, metadata)
      // A resource the catalog lists that gives no row fails, as a TSV one that fails to parse does (no receipt is written).
      if (rows.size === 0) throw new Error(`${resourceKey}: ${this.lastIssues.join('; ')}`)
      for (const [k, v] of rows) await this.cacheAdapter.set(k, v)
      await writeReceipt(this.cacheAdapter, resourceKey, metadata)
    }
  }
  return MarkdownAware as unknown as C
}
