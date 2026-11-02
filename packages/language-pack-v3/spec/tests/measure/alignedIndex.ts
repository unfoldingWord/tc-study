/**
 * Task 21: a MEASUREMENT of an index of aligned phrases per language (numbers for Abel). It does not change the format, the
 * spec or any builder; it is not imported by `src/` and `bun test` does not run it.
 *
 *     bun spec/tests/measure/alignedIndex.ts <build dir> <out dir>      (from `packages/language-pack-v3`)
 *
 * `<build dir>` holds `catalog-common.seg`, one or more `catalog-<lang>.seg` and `segments/`. `<out dir>` receives
 * `aligned-index.md`. The segments measured are never written to the build, the repo or a catalog.
 *
 * Definitions
 * - Texts: the bridge texts of the `book` segments whose resource ends in `/glt`, `/gst` (es-419) or `/ult`, `/ust` (en).
 *   One index per language, all its texts together.
 * - A word entry: each word piece of a text whose `align` list is non-empty.
 * - A phrase entry: each maximal run of two or more consecutive word pieces (only `" "` pieces between them) whose `align`
 *   lists are equal and non-empty, joined with single spaces.
 * - The key: the text normalized with NFC and lowercased (`toLocaleLowerCase(lang)`).
 * - The value: the set of Strong keys (`strongKey` of the original words at the aligned positions; a word with no Strong is
 *   skipped) and per Strong key the books, the distinct verses (by verse id) and the occurrences. An occurrence is one
 *   appearance of the entry in a text, counted once for each distinct Strong key of its aligned positions. The two texts
 *   (GLT and GST) of a verse each add their own occurrences; the verse is counted once.
 *   A verse event with a range ("1-2") is the verse of its first number.
 * - The segment (class `map`, table `aligned`): `keys` = `texts` of the entries sorted by code point; `strongs` = the
 *   string table of Strong keys (most used first); `data` = `uvarints`, per entry: the number of Strong keys, then per Strong
 *   key (sorted by code point): its number in the string table, the number of books, then per book (ascending): book delta
 *   (from the previous book, the first from 0), distinct verses, occurrences. Compressed by `writeSegment` (deflate-raw 9).
 * - Parts: by the first code point of the key, and by the Strong group of `lexGroupOf` (`G5`, `H1`...; an entry goes to
 *   each group it has a Strong key in, with only the Strong keys of that group; a five-digit Greek key is grouped by its first four digits). Each part is a segment of its own.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { lexGroupOf } from '../../../src/build/lex'
import type { CborValue } from '../../../src/codec/cbor'
import { compareCodePoints, encodeTexts, encodeUvarints, stringTable } from '../../../src/codec/columns'
import { hex, readSegment, writeSegment } from '../../../src/codec/container'
import { BOOKS, bookNumber, strongKey, verseId } from '../../../src/ids'
import type { BookModel, OrigModel } from '../../../src/model'
import { bookView } from '../../../src/read/book'
import { catalogView } from '../../../src/read/catalog'
import { origView } from '../../../src/read/orig'
import { KNOWN } from '../../../src/read/output'

const [buildDir, outDir] = process.argv.slice(2)
if (buildDir === undefined || outDir === undefined) {
  console.error('usage: bun spec/tests/measure/alignedIndex.ts <build dir> <out dir>')
  process.exit(2)
}

const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(path))
const TEXTS = new Set(['glt', 'gst', 'ult', 'ust'])

type PerStrong = Map<number, { verses: Set<number>; occ: number }> // book number -> counts
type Entry = { kind: 'word' | 'phrase'; strongs: Map<string, PerStrong> }
type Rows = [string, Map<string, PerStrong>][]

async function catalogOf(file: string) {
  const { seg } = await readSegment(bytesOf(join(buildDir!, file)), { known: KNOWN.catalog, expectedClass: 'catalog' })
  return catalogView(seg)
}

const fmt = (n: number): string => n.toLocaleString('en-US')
const bookCode = (n: number): string => BOOKS[n - 1] ?? String(n)
const refOf = (v: number): string => `${Math.floor(v / 1000) % 1000}:${v % 1000}`
const same = (x: number[], y: number[]): boolean => x.length === y.length && x.every((v, k) => v === y[k])

async function main(): Promise<void> {
  const common = await catalogOf('catalog-common.seg')
  const origs = new Map<string, OrigModel>()
  for (const e of common.segments) {
    if (e.class !== 'orig') continue
    const { seg } = await readSegment(bytesOf(join(buildDir!, 'segments', `${hex(e.id)}.seg`)), { known: KNOWN.orig, expectedClass: 'orig' })
    const o = origView(seg)
    origs.set(o.book, o)
  }
  const langFiles = readdirSync(buildDir!).filter((f) => /^catalog-.+\.seg$/.test(f) && f !== 'catalog-common.seg').sort()
  const lines: string[] = []
  const log = (...s: string[]): void => void lines.push(...s)
  log('# Aligned-phrase index per language (measurement, Task 21)', '')
  log(`Build: \`${buildDir}\`. Orig books in the common catalog: ${origs.size}.`, '')
  const summary: string[] = []
  const lookups: [string, string][] = [['es-419', 'diestra'], ['en', 'right hand'], ['en', 'before his face']]
  const lookupOut: string[] = []

  for (const file of langFiles) {
    const cat = await catalogOf(file)
    const lang = cat.lang ?? file.slice(8, -4)
    const tRead = performance.now()
    const books: BookModel[] = []
    for (const e of cat.segments) {
      if (e.class !== 'book') continue
      const { seg } = await readSegment(bytesOf(join(buildDir!, 'segments', `${hex(e.id)}.seg`)), { known: KNOWN.book, expectedClass: 'book' })
      books.push(bookView(seg))
    }
    const readMs = performance.now() - tRead
    const textsUsed = new Map<string, number>()
    const withText = new Set<string>()
    let stampMismatch = 0
    let noOrig = 0

    // The index build (timed): pieces and align to entries.
    const t0 = performance.now()
    const index = new Map<string, Entry>()
    const add = (key: string, kind: 'word' | 'phrase', strongs: string[], book: number, verse: number): void => {
      let entry = index.get(key)
      if (entry === undefined) index.set(key, (entry = { kind, strongs: new Map() }))
      for (const s of strongs) {
        let per = entry.strongs.get(s)
        if (per === undefined) entry.strongs.set(s, (per = new Map()))
        let c = per.get(book)
        if (c === undefined) per.set(book, (c = { verses: new Set(), occ: 0 }))
        c.verses.add(verse)
        c.occ++
      }
    }
    const norm = (s: string): string => s.normalize('NFC').toLocaleLowerCase(lang)
    for (const b of books) {
      const orig = origs.get(b.book)
      if (orig === undefined) {
        noOrig++
        continue
      }
      if (orig.stamp !== b.orig[1]) stampMismatch++
      const bookNo = bookNumber(b.book)
      const strongsOf = (a: number[]): string[] => [...new Set(a.map((p) => strongKey(orig.words[p]?.strong ?? '')).filter((s) => s !== ''))]
      for (const text of b.texts) {
        const short = text.res.slice(text.res.lastIndexOf('/') + 1)
        if (!TEXTS.has(short) || text.align === undefined) continue
        textsUsed.set(short, (textsUsed.get(short) ?? 0) + 1)
        withText.add(b.book)
        const words: { t: string; a: number[]; v: number; adj: boolean }[] = []
        let ev = 0
        let chapter = 0
        let verse = 0
        let ord = 0
        let gap = false // only " " pieces since the last word
        for (let i = 0; i < text.pieces.length; i++) {
          while (ev < text.events.length && text.events[ev]![0] <= i) {
            const [, kind, arg] = text.events[ev++]!
            if (kind === 'chapter') {
              chapter = parseInt(arg, 10) || 0
              verse = 0
            } else if (kind === 'verse') verse = parseInt(arg, 10) || 0
          }
          const [p, isWord] = text.pieces[i]!
          if (isWord) {
            words.push({ t: p, a: text.align[ord++] ?? [], v: verseId(b.book, chapter, verse), adj: gap })
            gap = true
          } else if (p !== ' ') gap = false
        }
        for (const w of words) if (w.a.length > 0) add(norm(w.t), 'word', strongsOf(w.a), bookNo, w.v)
        for (let i = 0; i < words.length; ) {
          const w = words[i]!
          if (w.a.length === 0) {
            i++
            continue
          }
          let j = i + 1
          while (j < words.length && words[j]!.adj && same(words[j]!.a, w.a)) j++
          if (j - i >= 2) add(norm(words.slice(i, j).map((x) => x.t).join(' ')), 'phrase', strongsOf(w.a), bookNo, w.v)
          i = j
        }
      }
    }
    const buildMs = performance.now() - t0

    const keys = [...index.keys()].sort(compareCodePoints)
    const nWord = [...index.values()].filter((e) => e.kind === 'word').length
    const nPhrase = index.size - nWord

    async function measure(entries: Rows): Promise<number> {
      const table = stringTable(entries.flatMap(([, m]) => [...m.keys()]))
      const nums: number[] = []
      for (const [, m] of entries) {
        const ss = [...m.keys()].sort(compareCodePoints)
        nums.push(ss.length)
        for (const s of ss) {
          const per = m.get(s)!
          const bs = [...per.keys()].sort((x, y) => x - y)
          nums.push(table.index.get(s)!, bs.length)
          let prev = 0
          for (const bk of bs) {
            nums.push(bk - prev, per.get(bk)!.verses.size, per.get(bk)!.occ)
            prev = bk
          }
        }
      }
      const aligned = {
        keys: encodeTexts(entries.map(([k]) => k)),
        strongs: table.list,
        data: encodeUvarints(nums),
      } as unknown as CborValue
      const { bytes } = await writeSegment({ h: { class: 'map', v: 1, tables: { aligned: [1, true] }, lang }, t: { aligned } })
      return bytes.length
    }
    const stats = (sizes: number[]) => ({ n: sizes.length, max: Math.max(0, ...sizes), total: sizes.reduce((a, b) => a + b, 0) })
    const all: Rows = keys.map((k) => [k, index.get(k)!.strongs])
    const whole = await measure(all)
    const byLetter = new Map<string, Rows>()
    for (const e of all) {
      const l = String.fromCodePoint(e[0].codePointAt(0)!)
      byLetter.set(l, [...(byLetter.get(l) ?? []), e])
    }
    const letterSizes: number[] = []
    for (const rows of byLetter.values()) letterSizes.push(await measure(rows))
    const byGroup = new Map<string, Rows>()
    for (const [k, m] of all) {
      const split = new Map<string, Map<string, PerStrong>>()
      for (const [s, per] of m) {
        // Greek is published with a fifth digit (`G54850` is G5485, `G13615` is G1361): the group is that of the number without it.
        const g = lexGroupOf(/^G[0-9]{5}$/.test(s) ? s.slice(0, -1) : s) ?? 'other'
        if (!split.has(g)) split.set(g, new Map())
        split.get(g)!.set(s, per)
      }
      for (const [g, sub] of split) byGroup.set(g, [...(byGroup.get(g) ?? []), [k, sub]])
    }
    const groupSizes: number[] = []
    for (const rows of byGroup.values()) groupSizes.push(await measure(rows))
    const L = stats(letterSizes)
    const G = stats(groupSizes)
    let occTotal = 0
    for (const e of index.values()) for (const per of e.strongs.values()) for (const c of per.values()) occTotal += c.occ

    log(`## ${lang}`, '')
    log(`- Books with a book segment: ${books.length} (${books.map((b) => b.book).join(', ')}); with aligned text read: ${[...withText].join(', ')}; without an orig segment in the build: ${noOrig}; book \`orig\` stamp different from the orig segment's: ${stampMismatch}.`)
    log(`- Texts read (book x text with alignment): ${[...textsUsed].map(([k, v]) => `${k} ${v}`).join(', ')}.`)
    log(`- Distinct entries: ${fmt(index.size)} (word ${fmt(nWord)}, phrase ${fmt(nPhrase)}); entry x Strong occurrences: ${fmt(occTotal)}.`)
    log(`- One segment (\`map\`, \`aligned\`, deflate-raw 9): **${fmt(whole)} bytes**.`)
    log(`- By first letter of the key: ${L.n} parts, largest ${fmt(L.max)}, total ${fmt(L.total)} bytes.`)
    log(`- By Strong group: ${G.n} parts (${[...byGroup.keys()].sort(compareCodePoints).join(' ')}), largest ${fmt(G.max)}, total ${fmt(G.total)} bytes.`)
    log(`- Index build time (decoded books to entries, no file reading): ${buildMs.toFixed(0)} ms; reading and decoding the ${books.length} book segments: ${readMs.toFixed(0)} ms.`, '')
    summary.push(`${lang}: books ${withText.size}, entries ${index.size} (word ${nWord}, phrase ${nPhrase}), segment ${whole}, letter ${L.n}/${L.max}/${L.total}, group ${G.n}/${G.max}/${G.total}, build ${buildMs.toFixed(0)} ms`)

    for (const [l, key] of lookups) {
      if (l !== lang) continue
      const e = index.get(key)
      const out = [`### \`${key}\` (${lang})`, '']
      if (e === undefined) {
        out.push('Not in the index.')
        const near = keys.filter((k) => k.split(' ').includes(key.split(' ')[0]!)).slice(0, 12)
        out.push('', `Entries with the word \`${key.split(' ')[0]}\` (up to 12 of ${keys.filter((k) => k.split(' ').includes(key.split(' ')[0]!)).length}): ${near.map((k) => `\`${k}\``).join(', ') || 'none'}.`)
      } else {
        const ss = [...e.strongs.keys()].sort(compareCodePoints)
        out.push(`kind: ${e.kind}; Strong keys: ${ss.join(', ')}`, '')
        for (const s of ss) {
          out.push(`- ${s}`)
          for (const [bk, c] of [...e.strongs.get(s)!].sort((x, y) => x[0] - y[0])) {
            const code = bookCode(bk)
            out.push(`  - ${code}: occurrences ${c.occ}, verses ${c.verses.size}: ${[...c.verses].sort((x, y) => x - y).map(refOf).join(' ')}`)
          }
        }
      }
      lookupOut.push(...out, '')
    }
  }
  log('## Lookups', '', ...lookupOut)
  mkdirSync(outDir!, { recursive: true })
  writeFileSync(join(outDir!, 'aligned-index.md'), lines.join('\n') + '\n')
  console.log(summary.join('\n'))
}

await main()
