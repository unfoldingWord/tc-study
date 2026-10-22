/**
 * Views for a server that answers about a passage (translation-helps-mcp): from a language's pack, one small JSON
 * file per book and chapter with its notes, word links and questions, each note and link with its words in the
 * language's literal and simple bridge texts already found, and the titles of the articles they point to.
 * What `cli/mcp-views.ts` does, as a function a publisher can call.
 *
 * A server reads `v1/{lang}/notes/{BOOK}/{chapter}.json` and filters it: no zip, no TSV, no tokenizing, and nothing of
 * bt-synergy's cache formats. The original-language pack is not needed: the alignments travel in the language's pack.
 * The caller supplies an IndexedDB (fake-indexeddb in Node) and checks that the packages it reads are freshly built.
 *
 * Writes in `outDir`:
 *   v1/{lang}/index.json                       the sources (keys, titles, versions) and the chapters of each book
 *   v1/{lang}/notes/{BOOK}/{chapter}.json      the chapter's notes, intros included, each with its aligned words
 *   v1/{lang}/word-links/{BOOK}/{chapter}.json the chapter's word links, each with its aligned words and its title
 *   v1/{lang}/questions/{BOOK}/{chapter}.json  the chapter's questions
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { importLanguagePack, packTargetFrom } from '@bt-synergy/language-pack'
import { resourceContentStamp, type BookStampSource } from '@bt-synergy/resource-catalog'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { unwrapVersioned } from '../cache/versionedEnvelope'
import { HELPS_ALIGN_VERSION, targetBookStamp, type CachedAlignments, type CachedAlignRow } from '../helps/helpsAlignCache'
import { HELPS_TEXT_VERSION } from '../helps/helpsCacheKeys'
import { HELPS_QUOTE_VERSION, helpsBookStamp } from '../helps/helpsQuoteCache'
import { NOTES_PREPARE_VERSION, type NotesLightChapter } from '../notes/notesPreparer'
import { QUESTIONS_PREPARE_VERSION } from '../questions/questionsPreparer'
import { WORDS_LINKS_PREPARE_VERSION, type WordsLinksLightChapter } from '../wordsLinks/wordsLinksPreparer'

/** Bump when a view's shape changes: a server reads the views of the schema it knows. */
const VIEWS_SCHEMA = 1

type Meta = { owner?: string; language?: string; resourceId?: string; subject?: string; title?: string; version?: string }

/**
 * The words of an aligned quote as they stand in the text, in its order, with «…» where words of the text that are not
 * part of it lie between them (as Servos shows them, src/resources/reading.ts). Null when it was not found.
 */
function textQuoteOf(row: CachedAlignRow | undefined): string | null {
  if (!row || row.m === 0 || !row.t?.length) return null
  if (row.p.length !== row.t.length) return row.t.join(' ')
  const ws = row.p.map((position, i) => ({ position, word: row.t![i] })).sort((a, b) => a.position - b.position)
  return ws.map((w, i) => (i > 0 && w.position > ws[i - 1].position + 1 ? `… ${w.word}` : w.word)).join(' ')
}

/** The text of a note with its line ends: TSV cells write them as `\n` or `<br>`. */
const unescape = (text: string) => text.replace(/\\n/g, '\n').replace(/<br\s*\/?>/gi, '\n')

/**
 * Which introduction an intro note is. tc-study keeps them among the chapter's notes marked `isIntro`, their reference
 * rewritten to the chapter's first verse, the book's first in chapter 1. A lone one in chapter 1 is the chapter's when
 * its heading names the chapter («# Jonás 1 Notas generales»), else the book's (as Servos reads them).
 */
function introsOf(intros: string[], chapter: number): Array<'book' | 'chapter'> {
  if (chapter !== 1) return intros.map(() => 'chapter')
  if (intros.length >= 2) return intros.map((_, i) => (i === 0 ? 'book' : 'chapter'))
  const heading = unescape(intros[0] ?? '').trimStart().split('\n')[0]
  return [heading.startsWith('#') && /\b1\b/.test(heading) ? 'chapter' : 'book']
}

/** «1:1» → 1, «1:1-3» → 1 (and 3 as `to`), «1:intro», «front:intro» → intro. */
function versesOf(reference: string): { verse: number | 'intro'; to?: number } {
  const [, vs = ''] = reference.split(':')
  if (!/^\d/.test(vs)) return { verse: 'intro' }
  const [from, to] = vs.split('-').map(Number)
  return Number.isFinite(to) ? { verse: from, to } : { verse: from }
}

export async function writeMcpViews(o: {
  pack: Uint8Array
  outDir: string
  log?: (line: string) => void
}): Promise<{ files: string[]; index: unknown }> {
  const outDir = resolve(o.outDir)
  const say = o.log ?? (() => {})
  const files: string[] = []

  const cache = new IndexedDBCacheAdapter({ dbName: 'mcp-views-cache', storeName: 'cache-entries', version: 1 })
  const catalog = new IndexedDBCatalogAdapter({ dbName: 'mcp-views-catalog', storeName: 'catalog-entries', version: 1 })

  const started = Date.now()
  const imported = await importLanguagePack({
    bytes: o.pack,
    target: packTargetFrom({ cache: cache as never, catalog: catalog as never }),
    versions: {
      sot: { usjProcessing: USJ_PROCESSING_VERSION },
      quote: { helpsQuote: HELPS_QUOTE_VERSION },
      align: { helpsAlign: HELPS_ALIGN_VERSION },
      text: { helpsText: HELPS_TEXT_VERSION },
    },
  })
  const language = imported.manifest.language
  say(`${language}: ${imported.written} filas abiertas en ${((Date.now() - started) / 1000).toFixed(1)} s`)

  const resources: Array<{ key: string; meta: Meta }> = []
  for (const key of await catalog.getAll()) {
    const meta = (await catalog.get(key)) as Meta | null
    if (meta && (meta.language ?? key.split('/')[1]) === language) resources.push({ key, meta })
  }

  // The language's sources, as Servos chooses them (src/resources/sources.ts): its literal text (the one with most
  // helps beside it, from the notes' owner first), its simple one, and the helps.
  const bySubject = (subject: string) => resources.filter((r) => r.meta.subject === subject)
  const notes = bySubject('TSV Translation Notes')[0]
  const owner = notes?.meta.owner ?? resources[0]?.meta.owner
  const preferOwner = <T extends { meta: Meta }>(list: T[]) => [...list].sort((a, b) => Number(b.meta.owner === owner) - Number(a.meta.owner === owner))[0]
  const bibles = bySubject('Aligned Bible')
  const literal = preferOwner(bibles.filter((r) => /lt$/.test(r.meta.resourceId ?? '')))
  const simple = preferOwner(bibles.filter((r) => /st$/.test(r.meta.resourceId ?? '')))
  const wordLinks = preferOwner(bySubject('TSV Translation Words Links'))
  const questions = preferOwner(bySubject('TSV Translation Questions'))
  const academy = preferOwner(bySubject('Translation Academy'))
  const words = preferOwner(bySubject('Translation Words'))

  const stamp = (r: { meta: Meta } | undefined) => (r ? resourceContentStamp(r.meta as never) : '')
  const source = (r: { key: string; meta: Meta } | undefined) =>
    r ? { key: r.key, title: r.meta.title ?? r.key, version: r.meta.version ?? null } : null

  function write(path: string, value: unknown) {
    const relative = `v1/${language}/${path}`
    const file = join(outDir, relative)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(value))
    files.push(relative)
  }

  /** The light rows of a prepared resource, by book and chapter: `prepared:{type}:{key}:{book}:{chapter}:light`. */
  async function lightRows<T>(type: string, key: string, version: number): Promise<Array<{ book: string; chapter: number; data: T }>> {
    const prefix = `prepared:${type}:${key}:`
    const out: Array<{ book: string; chapter: number; data: T }> = []
    for (const row of await cache.getByPrefix(prefix)) {
      const [book, unit, tier] = row.key.slice(prefix.length).split(':')
      const chapter = Number(unit)
      if (tier !== 'light' || !Number.isInteger(chapter)) continue
      const data = unwrapVersioned<T>(row.entry, version)
      if (data) out.push({ book: book.toUpperCase(), chapter, data })
    }
    return out
  }

  /**
   * The aligned rows of a helps resource for one text, by book and chapter: `helps-align:{helps}@{stamp}:{original}@…:
   * {text}@{stamp}:{book}:{chapter}`. The helps and text stamps are each book's own (`helpsBookStamp`,
   * `targetBookStamp`, as warm keys them), so every book's rows are matched with its stamps. The original's stamp is
   * not checked: the language's pack does not carry the original's catalog row, and opening the pack already left out
   * rows built against another original when one was there.
   */
  async function alignedRows(helps: { key: string; meta: Meta }, text: { key: string; meta: Meta }): Promise<Map<string, CachedAlignments>> {
    const out = new Map<string, CachedAlignments>()
    for (const row of await cache.getByPrefix(`helps-align:${helps.key}@`)) {
      const parts = row.key.split(':')
      if (parts.length !== 6) continue
      const book = parts[4]
      if (parts[1] !== `${helps.key}@${helpsBookStamp(helps.meta as BookStampSource, book)}`) continue
      if (parts[3] !== `${text.key}@${targetBookStamp(text.meta as BookStampSource, book)}`) continue
      const at = `${book.toUpperCase()}:${parts[5]}`
      out.set(at, { ...(out.get(at) ?? {}), ...(unwrapVersioned<CachedAlignments>(row.entry, HELPS_ALIGN_VERSION) ?? {}) })
    }
    return out
  }

  /** A title kept for an article (`helps-text:{kind}:{key}@{stamp}:{entry}`), else none. */
  async function titleOf(kind: 'ta-title' | 'tw-title', r: { key: string; meta: Meta } | undefined, entry: string): Promise<string | null> {
    if (!r || !entry) return null
    return unwrapVersioned<string>(await cache.get(`helps-text:${kind}:${r.key}@${stamp(r)}:${entry}`), HELPS_TEXT_VERSION)
  }

  const index: Record<string, { notes: number[]; wordLinks: number[]; questions: number[] }> = {}
  const chaptersOf = (book: string) => (index[book] ??= { notes: [], wordLinks: [], questions: [] })
  const counts = { notes: 0, notesLiteral: 0, notesSimple: 0, links: 0, linksLiteral: 0, linksSimple: 0, questions: 0 }

  if (notes) {
    const inLiteral = literal ? await alignedRows(notes, literal) : new Map()
    const inSimple = simple ? await alignedRows(notes, simple) : new Map()
    for (const { book, chapter, data } of await lightRows<NotesLightChapter>('notes', notes.key, NOTES_PREPARE_VERSION)) {
      const at = `${book}:${chapter}`
      const rows = []
      const kinds = introsOf(
        data.notes.filter((n) => n.isIntro).map((n) => n.note),
        chapter
      )
      let intro = 0
      for (const n of data.notes) {
        const path = n.supportReference.split('/ta/man/')[1] ?? ''
        const kind = n.isIntro ? kinds[intro++] : null
        // An intro's reference is the book's or the chapter's again, as the TSV has it.
        const reference = kind === 'book' ? 'front:intro' : kind === 'chapter' ? `${chapter}:intro` : n.reference
        const literalWords = n.isIntro ? null : textQuoteOf(inLiteral.get(at)?.[n.id])
        const simpleWords = n.isIntro ? null : textQuoteOf(inSimple.get(at)?.[n.id])
        if (!n.isIntro) {
          counts.notes++
          if (literalWords) counts.notesLiteral++
          if (simpleWords) counts.notesSimple++
        }
        rows.push({
          id: n.id,
          reference,
          ...versesOf(reference),
          intro: kind,
          quote: n.quote,
          occurrence: n.occurrence,
          note: unescape(n.note),
          tags: n.tags,
          supportReference: n.supportReference,
          supportReferenceTitle: await titleOf('ta-title', academy, path),
          aligned: { literal: literalWords, simple: simpleWords },
        })
      }
      write(`notes/${book}/${chapter}.json`, {
        schema: VIEWS_SCHEMA,
        language,
        book,
        chapter,
        sources: { notes: source(notes), literal: source(literal), simple: source(simple) },
        notes: rows,
      })
      chaptersOf(book).notes.push(chapter)
    }
  }

  if (wordLinks) {
    const inLiteral = literal ? await alignedRows(wordLinks, literal) : new Map()
    const inSimple = simple ? await alignedRows(wordLinks, simple) : new Map()
    for (const { book, chapter, data } of await lightRows<WordsLinksLightChapter>('words-links', wordLinks.key, WORDS_LINKS_PREPARE_VERSION)) {
      const at = `${book}:${chapter}`
      const rows = []
      for (const l of data.links) {
        const literalWords = textQuoteOf(inLiteral.get(at)?.[l.id])
        const simpleWords = textQuoteOf(inSimple.get(at)?.[l.id])
        counts.links++
        if (literalWords) counts.linksLiteral++
        if (simpleWords) counts.linksSimple++
        rows.push({
          id: l.id,
          reference: l.reference,
          ...versesOf(l.reference),
          origWords: l.origWords,
          occurrence: l.occurrence,
          tags: l.tags,
          twLink: l.twLink,
          articlePath: l.articlePath,
          title: await titleOf('tw-title', words, l.articlePath.replace(/^bible\//, '')),
          aligned: { literal: literalWords, simple: simpleWords },
        })
      }
      write(`word-links/${book}/${chapter}.json`, {
        schema: VIEWS_SCHEMA,
        language,
        book,
        chapter,
        sources: { wordLinks: source(wordLinks), words: source(words), literal: source(literal), simple: source(simple) },
        links: rows,
      })
      chaptersOf(book).wordLinks.push(chapter)
    }
  }

  if (questions) {
    type Q = { id: string; reference: string; question: string; response: string; quote?: string; occurrence?: string }
    for (const { book, chapter, data } of await lightRows<{ questions: Q[] }>('questions', questions.key, QUESTIONS_PREPARE_VERSION)) {
      counts.questions += data.questions.length
      write(`questions/${book}/${chapter}.json`, {
        schema: VIEWS_SCHEMA,
        language,
        book,
        chapter,
        sources: { questions: source(questions) },
        questions: data.questions.map((q) => ({ ...q, question: unescape(q.question), response: unescape(q.response), ...versesOf(q.reference) })),
      })
      chaptersOf(book).questions.push(chapter)
    }
  }

  for (const book of Object.values(index)) for (const list of Object.values(book)) list.sort((a, b) => a - b)
  const indexFile = {
    schema: VIEWS_SCHEMA,
    language,
    generatedAt: new Date().toISOString(),
    pack: { createdAt: imported.manifest.createdAt, versions: imported.manifest.versions ?? null },
    sources: {
      literal: source(literal),
      simple: source(simple),
      notes: source(notes),
      wordLinks: source(wordLinks),
      questions: source(questions),
      academy: source(academy),
      words: source(words),
    },
    books: index,
  }
  write('index.json', indexFile)

  const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)} %` : '—')
  say(`${language}: ${Object.keys(index).length} libros en ${((Date.now() - started) / 1000).toFixed(1)} s`)
  say(`  notas: ${counts.notes}; con sus palabras en el literal ${pct(counts.notesLiteral, counts.notes)}, en el simple ${pct(counts.notesSimple, counts.notes)}`)
  say(`  enlaces de palabras: ${counts.links}; en el literal ${pct(counts.linksLiteral, counts.links)}, en el simple ${pct(counts.linksSimple, counts.links)}`)
  say(`  preguntas: ${counts.questions}`)

  return { files, index: indexFile }
}
