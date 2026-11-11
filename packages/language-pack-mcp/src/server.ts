/**
 * The tools of the local MCP server, over a `LanguagePackClient`. Each tool answers in short plain text: small local models
 * (3B–8B) read a few lines better than a JSON envelope, and every line says where it comes from or what is missing.
 * No Node module here: the CLI (`cli.ts`) gives the client, its store and where to remember the last language.
 */
import type { LanguagePackClient, PackReader } from '@bt-synergy/language-pack-client'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { type AlignedText, alignIndex, quoteIn } from './align'
import { bookName, BOOK_NAMES, size } from './books'

/** The articles every install brings with the book: key terms and the Academy's translation manual. */
export const SHARED_UNITS = ['art:tw:kt', 'art:tw:names', 'art:tw:other', 'art:ta:translate']

export type PacksServerOptions = {
  client: LanguagePackClient
  /** The language a tool uses when the call names none. */
  loadLang?: () => Promise<string | undefined>
  saveLang?: (lang: string) => Promise<void>
  /** How long `install_language` waits before it answers that the download goes on in the background. */
  installWaitMs?: number
  version?: string
}

type Text = { content: { type: 'text'; text: string }[]; isError?: boolean }
const ok = (text: string): Text => ({ content: [{ type: 'text', text }] })
const fail = (text: string): Text => ({ content: [{ type: 'text', text }], isError: true })

/** A note or an article in plain text: no headings, no links the reader cannot follow. */
export function clean(md: unknown): string {
  return String(md ?? '')
    .replace(/^#+\s*/gm, '')
    .replace(/\((?:ver|see):\s*(?:\[\[[^\]]+\]\]|rc:\/\/[^)\s]+)\)/gi, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/[ \t]+\./g, '.')
    .replace(/(?<!\.)\.\.(?!\.)/g, '.')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const short = (res: string): string => String(res).split('/').pop()!.toUpperCase()
const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function createPacksServer(o: PacksServerOptions): McpServer {
  const { client } = o
  const server = new McpServer({ name: 'tc-language-packs', version: o.version ?? '0.1.0' })
  const readers = new Map<string, PackReader>()
  const aligned = new Map<string, AlignedText[]>()
  const titles = new Map<string, string | null>()
  const downloads = new Map<string, { done: number; total: number; bytes: number; finished: boolean; error?: string }>()

  async function langOf(asked?: string): Promise<string> {
    const lang = asked?.trim() || (await o.loadLang?.())
    if (!lang) throw new Error('No language yet. Call install_language first, for example with lang "es-419" and books ["tit"].')
    return lang
  }
  async function readerOf(lang: string): Promise<PackReader> {
    let r = readers.get(lang)
    if (r === undefined) {
      r = await client.open(lang)
      readers.set(lang, r)
    }
    return r
  }
  function forget(lang: string): void {
    readers.delete(lang)
    for (const k of [...aligned.keys()]) if (k.startsWith(lang + '|')) aligned.delete(k)
    for (const k of [...titles.keys()]) if (k.startsWith(lang + '|')) titles.delete(k)
  }
  async function alignedOf(lang: string, r: PackReader, book: string): Promise<AlignedText[]> {
    const key = `${lang}|${book}`
    let a = aligned.get(key)
    if (a === undefined) {
      a = alignIndex((await r.book(book)) as Parameters<typeof alignIndex>[0])
      aligned.set(key, a)
    }
    return a
  }
  async function titleOf(lang: string, r: PackReader, id: string): Promise<string | null> {
    const key = `${lang}|${id}`
    if (titles.has(key)) return titles.get(key)!
    let t: string | null = null
    try {
      t = ((await r.article(id)).data as { title?: string } | null)?.title ?? null
    } catch {
      t = null
    }
    titles.set(key, t)
    return t
  }
  function missing(answer: { notInstalled?: { book?: string; unit: string; bytes: number }[] }): string {
    const n = answer.notInstalled ?? []
    if (n.length === 0) return ''
    const books = [...new Set(n.map((x) => x.book).filter((b): b is string => !!b))]
    const bytes = n.reduce((s, x) => s + (x.bytes ?? 0), 0)
    return books.length
      ? `\nAlso in ${books.map(bookName).join(', ')}, not on this device (${size(bytes)}). install_language can add them.`
      : `\nNeeds ${n.map((x) => x.unit).join(', ')}, not on this device.`
  }
  const run = (f: (a: any) => Promise<string>) => async (a: any): Promise<Text> => {
    try {
      return ok(await f(a))
    } catch (e: any) {
      return fail(`${e?.code ? e.code + ': ' : ''}${e?.message ?? String(e)}`)
    }
  }
  const lang = z.string().optional().describe('Language code, for example "es-419" or "en". Defaults to the last one installed.')

  server.registerTool(
    'install_language',
    {
      title: 'Install a language',
      description:
        'Download a language pack to this computer so the other tools can answer offline: the chosen books with their notes, questions and key terms, plus the maps of the whole Bible, the topics and the articles. Do this once; later calls only fetch what changed.',
      inputSchema: {
        lang: z.string().describe('Language code, for example "es-419" (Latin American Spanish) or "en" (English)'),
        books: z.array(z.string()).optional().describe('Book codes, for example ["tit"] or ["rut", "jon"]. Leave out for the maps and articles only.'),
      },
    },
    run(async ({ lang, books }: { lang: string; books?: string[] }) => {
      const l = lang.trim()
      await client.refresh(l)
      const state = { done: 0, total: 0, bytes: 0, finished: false } as { done: number; total: number; bytes: number; finished: boolean; error?: string }
      downloads.set(l, state)
      const job = client
        .install(l, { books: (books ?? []).map((b) => b.toLowerCase()), defaults: true, units: SHARED_UNITS }, {
          onProgress: (p) => Object.assign(state, { done: p.done, total: p.total, bytes: p.bytes }),
        })
        .then((report) => {
          state.finished = true
          state.bytes = report.bytes ?? state.bytes
          forget(l)
          return report
        })
        .catch((e) => {
          state.finished = true
          state.error = `${e?.code ?? ''} ${e?.message ?? e}`.trim()
          throw e
        })
      await o.saveLang?.(l)
      const wait = new Promise<'waiting'>((res) => setTimeout(() => res('waiting'), o.installWaitMs ?? 50_000))
      const first = await Promise.race([job, wait])
      if (first === 'waiting') {
        job.catch(() => {})
        return `Still downloading ${l}: ${state.done} of ${state.total} pieces, ${size(state.bytes)} so far. It goes on in the background; call status to see when it is done.`
      }
      const names = (books ?? []).map((b) => bookName(b.toLowerCase())).join(', ')
      return `Installed ${l}${names ? `: ${names}` : ''}, with the maps of the whole Bible, the topics and the articles. ${size(state.bytes)} downloaded and checked against the publisher's signature. The other tools now answer offline.`
    }),
  )

  server.registerTool(
    'status',
    {
      title: 'What is on this computer',
      description: 'Which books of a language are on this computer, a download in progress, and whether the server has updates.',
      inputSchema: { lang },
    },
    run(async (a: { lang?: string }) => {
      const l = await langOf(a.lang)
      const d = downloads.get(l)
      const s = await client.status(l)
      const books = s.units.filter((u) => /\/book:/.test(u.key))
      const have = books.filter((u) => u.installed).map((u) => bookName(u.key.split('book:')[1]))
      const other = s.units.filter((u) => u.installed && !/\/(book|orig):/.test(u.key)).length
      const lines = [
        `${l}, revision ${s.active?.revision ?? s.published?.revision ?? '?'}.`,
        have.length ? `Books on this computer: ${have.join(', ')}.` : 'No book on this computer yet.',
        `Books on the server: ${books.length} (${books.map((u) => u.key.split('book:')[1]).join(' ')}).`,
        `Maps, topics and articles installed: ${other} units.`,
      ]
      if (d && !d.finished) lines.push(`Downloading now: ${d.done} of ${d.total} pieces, ${size(d.bytes)}.`)
      if (d?.error) lines.push(`The last download stopped: ${d.error}. What was complete is kept; call install_language again.`)
      if (s.updates.length) lines.push(`Updates on the server: ${s.updates.length}. install_language fetches them.`)
      return lines.join('\n')
    }),
  )

  server.registerTool(
    'lookup_term',
    {
      title: 'Find a key term, person or place by name',
      description:
        'Find the ids of key terms, Academy articles, people, places and events by a word in this language or in English, for example "gracia", "grace", "Abraham" or "metaphor". Use the ids with across_bible, article and passage tools.',
      inputSchema: { name: z.string().describe('A word or name'), lang },
    },
    run(async (a: { name: string; lang?: string }) => {
      const l = await langOf(a.lang)
      const r = await readerOf(l)
      const maps = await r.maps()
      const q = fold(a.name.trim())
      if (!q) throw new Error('Give a word to look for.')
      const found = new Map<string, { names: Set<string>; score: number }>()
      const add = (id: string, name: string): void => {
        const f = fold(name)
        if (!f.includes(q)) return
        const score = f === q ? 0 : f.startsWith(q) ? 1 : 2
        const e = found.get(id) ?? { names: new Set<string>(), score }
        e.names.add(name)
        e.score = Math.min(e.score, score)
        found.set(id, e)
      }
      for (const [id, names] of Object.entries(maps.map?.core.names ?? {})) for (const n of names) add(id, n)
      for (const [id, names] of Object.entries(maps.topics?.core.names ?? {})) for (const n of names) add(id, n[0])
      for (const [id, t] of maps.xtopics?.core.topics ?? []) if (t.title) add(id, t.title)
      for (const id of maps.xmap?.core.concepts?.keys?.() ?? []) add(id, id.split('/').pop()!.replace(/-/g, ' '))
      const rows = [...found].sort((x, y) => x[1].score - y[1].score || x[0].localeCompare(y[0])).slice(0, 15)
      if (rows.length === 0) return `Nothing named like "${a.name}" in ${l}. Try another spelling, or the English word.`
      return rows.map(([id, e]) => `${id} — ${[...e.names].join(', ')}`).join('\n')
    }),
  )

  server.registerTool(
    'passage',
    {
      title: 'A verse with its helps',
      description:
        'A Bible reference ("tit 2:11", "rut 1:1-3") in the installed language: the Bibles for translators, the translation notes with the words they explain, the questions, and the key terms with their articles.',
      inputSchema: { ref: z.string().describe('Book code, chapter and verse, for example "tit 2:11" or "psa 1:1-2"'), lang },
    },
    run(async (a: { ref: string; lang?: string }) => {
      const l = await langOf(a.lang)
      const r = await readerOf(l)
      const ans = await r.passage(a.ref.trim().toLowerCase())
      const d = ans.data as any
      if (!d) return `That book is not on this computer.${missing(ans)}`
      const al = await alignedOf(l, r, d.book)
      const out: string[] = [`${bookName(d.book)} ${d.ref} (${l})`]
      for (const t of d.texts ?? []) out.push(`${short(t.res)}: ${t.text}`)
      const terms = [...new Map((d.links ?? []).filter((x: any) => x.concept).map((x: any) => [x.concept, x])).values()] as any[]
      if (terms.length) {
        const parts = await Promise.all(
          terms.map(async (x) => {
            const said = quoteIn(al, x.quote)[0]?.text ?? x.cols?.origWords ?? ''
            const title = await titleOf(l, r, x.concept)
            return `«${said}» = ${x.concept}${title ? ` (${title})` : ''}`
          }),
        )
        out.push(`Key terms: ${parts.join('; ')}`)
      }
      const notes = (d.notes ?? []).filter((n: any) => clean(n.cols?.note))
      if (notes.length) {
        out.push('Notes:')
        for (const [i, n] of notes.entries()) {
          const quotes = quoteIn(al, n.quote)
          const said = quotes.map((q) => `«${q.text}»`).join(' / ')
          const orig = n.cols?.quote && !clean(n.cols?.note).startsWith(n.cols.quote) ? n.cols.quote : ''
          const title = n.concept ? await titleOf(l, r, n.concept) : null
          const head = [said, orig ? `(${orig})` : ''].filter(Boolean).join(' ')
          out.push(`${i + 1}. ${head ? head + ': ' : ''}${clean(n.cols?.note).replace(/\n+/g, ' ')}${n.concept ? ` [Academy: ${title ?? n.concept}, ${n.concept}]` : ''}`)
        }
      }
      for (const q of d.questions ?? []) out.push(`Question: ${q.cols?.question ?? ''} Answer: ${q.cols?.response ?? ''}`)
      return out.join('\n') + missing(ans)
    }),
  )

  server.registerTool(
    'across_bible',
    {
      title: 'A key term or article across the Bible',
      description:
        'Where a key term (tw:…), person or place (per:…, lug:…) or Academy article (ta:…) appears in each of the 66 books, counted by the maps even for books not downloaded. Get ids with lookup_term.',
      inputSchema: { id: z.string().describe('For example "tw:kt/grace" or "ta:translate/figs-metaphor"'), lang },
    },
    run(async (a: { id: string; lang?: string }) => {
      const l = await langOf(a.lang)
      const r = await readerOf(l)
      const id = a.id.trim()
      const isArticle = id.startsWith('ta:')
      const ans = await r.books(isArticle ? { article: id } : { concept: id })
      const d = ans.data as any
      if (!d || d.installed === false || !d.books) return `The map that answers this is not on this computer.${missing(ans)}`
      const cells = Object.entries(d.books as Record<string, any>)
      const withAny = cells.filter(([, c]) => (c.count ?? 0) > 0).sort((x, y) => y[1].count - x[1].count)
      const total = withAny.reduce((s, [, c]) => s + c.count, 0)
      const none = cells.filter(([, c]) => c.state === 'none').length
      const title = await titleOf(l, r, id)
      const what = isArticle ? 'notes of this language point to it' : 'links in the English word lists'
      const lines = [
        `${id}${title ? ` (${title})` : ''}: ${total} ${what}, in ${withAny.length} books.`,
        `On this computer: ${withAny.filter(([, c]) => c.installed).map(([b, c]) => `${bookName(b)} ${c.count}`).join(', ') || 'none of them'}.`,
        `Not downloaded: ${withAny.filter(([, c]) => !c.installed).map(([b, c]) => `${bookName(b)} ${c.count}`).join(', ') || 'none'}.`,
      ]
      if (none) lines.push(`${none} books have no source for this count (that is not zero).`)
      return lines.join('\n')
    }),
  )

  server.registerTool(
    'renderings',
    {
      title: 'How a word of the original was translated',
      description: 'The words this language’s Bibles for translators used for a Strong’s number (for example "G5485" or "H2580"), with counts and references, in the books on this computer.',
      inputSchema: { strong: z.string().describe('A Strong’s number, for example "G5485"'), lang },
    },
    run(async (a: { strong: string; lang?: string }) => {
      const l = await langOf(a.lang)
      const r = await readerOf(l)
      const ans = await r.renderings({ strong: a.strong.trim().toUpperCase() })
      const d = ans.data as any
      if (!d) return `The map that answers this is not on this computer.${missing(ans)}`
      const rows = (d.renderings ?? []) as { text: string; count: number; refs: string[] }[]
      if (rows.length === 0) return `${d.strong}: the books on this computer do not use it.${missing(ans)}`
      return [`${d.strong} in ${l}:`, ...rows.map((x) => `«${x.text}» ${x.count}× — ${x.refs.join(', ')}`)].join('\n') + missing(ans)
    }),
  )

  server.registerTool(
    'article',
    {
      title: 'A key-term or Academy article',
      description: 'The text of a Translation Words article (tw:…) or Translation Academy article (ta:…) in this language. Get ids with lookup_term or from passage.',
      inputSchema: { id: z.string().describe('For example "tw:kt/grace" or "ta:translate/figs-metaphor"'), lang },
    },
    run(async (a: { id: string; lang?: string }) => {
      const l = await langOf(a.lang)
      const r = await readerOf(l)
      const ans = await r.article(a.id.trim(), 'all')
      const d = ans.data as any
      if (!d) return `That article is not on this computer.${missing(ans)}`
      const body = (d.sections ?? []).map((s: any) => clean(s.md)).filter(Boolean).join('\n\n')
      // tA: the articles tied to this one, so the model can follow the family (Metaphor -> Simple Metaphor, Biblical Imagery…).
      const related = (d.related ?? []).map((x: { id: string; title?: string }) => (x.title ? `${x.title} (${x.id})` : x.id)).join('; ')
      const text = `${d.title ?? d.id}${related ? `\nRelated: ${related}` : ''}\n\n${body}`
      return text.length > 6000 ? text.slice(0, 6000) + '\n…' : text
    }),
  )

  server.registerTool(
    'topics',
    {
      title: 'People, places, events and stories',
      description:
        'The people, places, events and Bible stories of a book, with the names this language’s Bible gives them. Give a book code, or a category (person, place, event, story) for the whole list.',
      inputSchema: {
        book: z.string().optional().describe('A book code, for example "tit"'),
        category: z.enum(['person', 'place', 'event', 'story']).optional(),
        lang,
      },
    },
    run(async (a: { book?: string; category?: string; lang?: string }) => {
      const l = await langOf(a.lang)
      const r = await readerOf(l)
      if (a.category) {
        const ans = await r.topics({ category: a.category })
        const d = ans.data as any
        if (!d || d.installed === false) return `The topics are not on this computer.${missing(ans)}`
        const ids = (d.ids ?? []) as string[]
        return `${ids.length} ${a.category} topics. ${ids.slice(0, 150).join(', ')}${ids.length > 150 ? ', …' : ''}`
      }
      const book = (a.book ?? '').trim().toLowerCase()
      if (!BOOK_NAMES[book]) throw new Error('Give a book code such as "tit", or a category.')
      const ans = await r.topics({ book })
      const d = ans.data as any
      if (!d || d.installed === false) return `The topics are not on this computer.${missing(ans)}`
      const groups = new Map<string, string[]>()
      for (const t of d.topics ?? []) {
        const line = `${t.title ?? t.id} (${t.id}, ${t.verses} ${t.verses === 1 ? 'verse' : 'verses'})${t.names?.length ? ` — in this Bible: ${t.names.map((n: string) => `«${n}»`).join(', ')}` : ''}`
        const g = groups.get(t.kind) ?? []
        g.push(line)
        groups.set(t.kind, g)
      }
      if (groups.size === 0) return `No topics in ${bookName(book)}.`
      return [...groups].map(([k, lines]) => `${k}:\n${lines.map((x) => '- ' + x).join('\n')}`).join('\n')
    }),
  )

  server.registerTool(
    'search',
    {
      title: 'Search the installed books',
      description: 'Find words in the Bibles for translators, notes and questions of the books on this computer.',
      inputSchema: { text: z.string().describe('Words to find'), lang, limit: z.number().int().min(1).max(50).optional() },
    },
    run(async (a: { text: string; lang?: string; limit?: number }) => {
      const l = await langOf(a.lang)
      const r = await readerOf(l)
      const ans = await r.search(a.text)
      const hits = ((ans.data ?? []) as any[]).slice(0, a.limit ?? 20)
      if (hits.length === 0) return `No match for "${a.text}" in the books on this computer.`
      return hits.map((h) => `${bookName(h.book)} ${h.ref} [${h.kind}] ${String(h.snippet ?? '').replace(/\s+/g, ' ')}`).join('\n')
    }),
  )

  return server
}
