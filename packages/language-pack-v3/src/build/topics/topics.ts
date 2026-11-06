/**
 * The topics of a language (`spec/cddl/topics.cddl`): what the language calls the topics of the common `xtopics`.
 *
 * - **alignment**: {@link alignedNames} over the TIPNR records and the aligned books of the language.
 * - **outline**: an entry of the language's own tN outline whose range makes the id of a `sec:` topic of the core gives that
 *   section a name; one that makes none becomes `{lang}:tema/{book}/{slug}` in `local`, with its range as `refs`.
 * - **obs**: the title of a story of the language names `obs:{n}` when the core has that story.
 *
 * Only topics the core has get names (no orphan). No versification conversion (English numbering is the UHB's). The part of a
 * book holds, per topic, the verses of the book its alignment names were taken from. No Node module is used.
 */
import { compareCodePoints } from '../../codec/columns'
import { BOOKS, bookNumber } from '../../ids'
import type { BookModel, OrigModel, TopicName, TopicsCore, TopicsPart, XtopicsCore } from '../../model'
import type { TipnrRecord } from '../../source/tipnr'
import { alignedNames } from './alignedNames'
import { sectionId } from './outline'

type Range = [number, number]
type Tally = Map<string, { count: number; books: Set<string> }>

const bookOf = (verse: number): string => BOOKS[Math.floor(verse / 1_000_000) - 1]

/** `{lang}:tema/` slug of a title: lowercase, diacritics dropped, runs of other characters to one hyphen. */
function slugOf(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildTopics(o: {
  lang: string
  /** The common topics this is built against: only its topics get names. */
  xtopics: XtopicsCore
  records: TipnrRecord[]
  books: BookModel[]
  origs: Map<string, OrigModel>
  /** The language's own tN outlines, by book, and the key of the tN they come from. */
  outlines: Map<string, { title: string; from: number; to: number }[]>
  outlineRes?: string
  lastVerse: (book: string, chapter: number) => number | undefined
  /** The stories of the language: number and title. */
  obs: { n: number; title: string }[]
  obsRes?: string[]
  /** The release of each resource the names come from (key, release). */
  releases: Map<string, string>
}): { core: TopicsCore; parts: TopicsPart[]; report: string[] } {
  const report: string[] = []
  const { lang, xtopics } = o
  const known = (id: string): boolean => xtopics.topics.has(id)
  const used = new Map<string, Set<string>>()
  const touch = (key: string | undefined, books: Iterable<string>): void => {
    if (key === undefined) return
    let set = used.get(key)
    if (set === undefined) used.set(key, (set = new Set()))
    for (const b of books) set.add(b)
  }
  const names: Record<string, TopicName[]> = {}
  const tallies = new Map<string, Tally>()
  const add = (id: string, name: string, source: TopicName[1], count: number, books: Iterable<string>): void => {
    let tally = tallies.get(id)
    if (tally === undefined) tallies.set(id, (tally = new Map()))
    const key = `${source}\0${name}`
    let t = tally.get(key)
    if (t === undefined) tally.set(key, (t = { count: 0, books: new Set() }))
    t.count += count
    for (const b of books) t.books.add(b)
  }

  // Alignment
  const issues: string[] = []
  const aligned = alignedNames({ records: o.records, books: o.books, origs: o.origs, lang }, issues)
  report.push(...issues.map((line) => `alignment: ${line}`))
  const named = new Set<string>()
  const partNames = new Map<string, Map<string, number[]>>()
  for (const [id, list] of aligned) {
    if (!known(id)) {
      report.push(`alignment: ${id} is not a topic of the xtopics: ${list.length} name(s) left out`)
      continue
    }
    for (const n of list) {
      add(id, n.name, 'alignment', n.count, n.books)
      for (const b of n.books) named.add(b)
      for (const v of n.verses) {
        const book = bookOf(v)
        let byId = partNames.get(book)
        if (byId === undefined) partNames.set(book, (byId = new Map()))
        const verses = byId.get(id)
        if (verses === undefined) byId.set(id, [v])
        else verses.push(v)
      }
    }
  }
  for (const b of o.books) {
    if (b.lang !== lang) continue
    if (!named.has(b.book)) continue
    for (const t of b.texts) if (t.align !== undefined) touch(t.res, [b.book])
  }

  // Outlines
  const local: NonNullable<TopicsCore['local']> = {}
  const rangeOfLocal = new Map<string, string>()
  for (const book of [...o.outlines.keys()].sort((a, b) => bookNumber(a) - bookNumber(b))) {
    for (const raw of o.outlines.get(book)!) {
      const entry = { ...raw, title: raw.title.normalize('NFC') } // names are stored in NFC (topics.cddl)
      let id: string
      try {
        id = sectionId(book, entry.from, entry.to, o.lastVerse)
      } catch (e) {
        report.push(`outline ${book}: ${(e as Error).message}: ${JSON.stringify(entry.title)} left out`)
        continue
      }
      if (entry.title === '') {
        report.push(`outline ${book}: ${id}: no title: left out`)
        continue
      }
      touch(o.outlineRes, [book])
      if (xtopics.topics.get(id)?.kind === 'section') {
        add(id, entry.title, 'outline', 1, [book])
        continue
      }
      const range = `${entry.from}-${entry.to}`
      const base = `${lang}:tema/${book}/${slugOf(entry.title) || `${entry.from}`}`
      let key = base
      for (let n = 2; local[key] !== undefined && rangeOfLocal.get(key) !== range; n++) key = `${base}-${n}`
      if (local[key] === undefined) {
        local[key] = { names: [entry.title], refs: [[entry.from, entry.to]] }
        rangeOfLocal.set(key, range)
      } else if (!local[key].names.includes(entry.title)) local[key].names.push(entry.title)
    }
  }

  // Stories
  for (const story of o.obs) {
    const id = `obs:${story.n}`
    if (!known(id)) {
      report.push(`obs: ${id} is not a topic of the xtopics: ${JSON.stringify(story.title)} left out`)
      continue
    }
    if (story.title.trim() === '') continue
    const books = [...new Set((xtopics.ranges?.[id] ?? []).flatMap(([a, z]) => [bookOf(a), bookOf(z)]))].sort((a, b) => bookNumber(a) - bookNumber(b))
    add(id, story.title.normalize('NFC'), 'obs', 1, books)
    touch(o.obsRes?.[0], books)
    for (const key of o.obsRes?.slice(1) ?? []) touch(key, books)
  }

  for (const [id, tally] of tallies) {
    names[id] = [...tally]
      .map(([key, t]): TopicName => {
        const [source, name] = [key.slice(0, key.indexOf('\0')), key.slice(key.indexOf('\0') + 1)]
        return [name, source as TopicName[1], t.count, [...t.books].sort((a, b) => bookNumber(a) - bookNumber(b))]
      })
      .sort((a, b) => b[2] - a[2] || compareCodePoints(a[0], b[0]) || compareCodePoints(a[1], b[1]))
  }

  const res = [...used.keys()].sort(compareCodePoints).map((key): [string, string] => [key, o.releases.get(key) ?? ''])
  const order = (list: Iterable<string>): string[] => [...list].sort((a, b) => bookNumber(a) - bookNumber(b))
  const coverage: TopicsCore['coverage'] = new Map(res.map(([key]) => [key, { whole: order(used.get(key)!), partial: [] }]))
  const core: TopicsCore = { lang, part: 'core', res, names, coverage }
  if (Object.keys(local).length > 0) core.local = local
  const parts: TopicsPart[] = []
  for (const book of order(partNames.keys())) {
    const lists = new Map<string, number[]>()
    for (const [id, verses] of [...partNames.get(book)!].sort((a, b) => compareCodePoints(a[0], b[0]))) lists.set(id, [...new Set(verses)].sort((a, b) => a - b))
    parts.push({ lang, part: book, names: lists })
  }
  return { core, parts, report }
}
