import type { PackReader } from '@bt-synergy/language-pack-client'
import type { HelpRow } from '@bt-synergy/language-pack-v3'
import { NotesProcessor, QuestionsProcessor, WordsLinksProcessor } from '@bt-synergy/resource-parsers'
import type { Row } from './scriptureRows'

/** The marker the cache adapter puts on the manifest of a book it split into chapter rows. */
const CHUNKED = '_chunkedBook'

/** What the three writers read of a table: the rows of a book's helps and of the OBS helps (`ObsHelpRow`) both have it. */
export type Table = { res: string; rows: Pick<HelpRow, 'id' | 'ref' | 'concept' | 'cols'>[] }

const cell = (value: string | boolean | undefined): string => (typeof value === 'string' ? value : '')
/** A TSV cell: a line break is written `\n` (a backslash and an n), as the Door43 sources have it. */
const tsvCell = (text: string): string => text.replace(/\r?\n/g, '\\n').replace(/\t/g, ' ')

/**
 * The text of a note, question or response as the source TSV has it. The segment keeps the text with its line breaks and
 * with the links of the format (`[[ta:translate/x]]`, `[[tw:kt/god]]`, `[text](ref:tit 1:2)`); the `rc://` addresses the
 * source wrote are put back, with the language of the resource (the segment does not keep the language of an address in a text). A `<br>` the source had comes back as `\n`, and a link with a capital in its slug comes back in
 * lowercase: the segment does not keep either.
 */
function sourceText(md: string, lang: string): string {
  const text = md
    .replace(/\[\[ta:([a-z0-9_-]+)\/([A-Za-z0-9_-]+)\]\]/g, `[[rc://${lang}/ta/man/$1/$2]]`)
    .replace(/\[\[tw:([a-z0-9_-]+)\/([A-Za-z0-9_-]+)\]\]/g, `[[rc://${lang}/tw/dict/bible/$1/$2]]`)
    .replace(/\]\(ref:([a-z0-9]{3}) (\d+):(\d+)\)/g, (_all, book: string, chapter: string, verse: string) => `](rc://${lang}/tn/help/${book}/${chapter.padStart(2, '0')}/${verse.padStart(2, '0')})`)
  return tsvCell(text)
}

/** `ta:translate/figs-metaphor` as the SupportReference column writes it; any other form was kept as it was in `cols`. */
function supportReferenceOf(row: Table['rows'][number]): string {
  const concept = /^ta:([^/]+)\/(.+)$/.exec(row.concept ?? '')
  return concept ? `rc://*/ta/man/${concept[1]}/${concept[2]}` : cell(row.cols.supportReference)
}

/** `tw:kt/grace` as the TWLink column writes it. */
function twLinkOf(row: Table['rows'][number]): string {
  const concept = /^tw:([^/]+)\/(.+)$/.exec(row.concept ?? '')
  return concept ? `rc://*/tw/dict/bible/${concept[1]}/${concept[2]}` : cell(row.cols.twLink)
}

/**
 * The reference column of a note. A book or chapter introduction has `isIntro`: the segment keeps it at verse 1 of its chapter
 * (`front:intro` and `1:intro` are both chapter 1), and the parser puts it there again.
 */
const noteReference = (row: Table['rows'][number]): string => (row.cols.isIntro === true ? `${row.ref.split(':')[0]}:intro` : row.ref)

const tsv = (header: string[], rows: string[][]): string => [header.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n')

/**
 * The adapter's split of a book row into a manifest and a row per chapter (`splitNotesEntry` and `splitQuestionsEntry` of
 * `cache-adapter-indexeddb`, which the package does not export). `field` is `notes` or `questions`.
 */
function chunked(key: string, field: 'notes' | 'questions', processed: object): Row[] {
  const entry = processed as Record<string, unknown>
  const byChapter = entry[`${field}ByChapter`] as Record<string, unknown[]>
  const rest = Object.fromEntries(Object.entries(entry).filter(([k]) => k !== `${field}ByChapter` && k !== field))
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>
  const manifest = { content: {}, ...rest, [`${field}ByChapter`]: {}, [field]: [], metadata: { ...metadata, [CHUNKED]: true }, [CHUNKED]: true }
  return [
    { key, value: manifest },
    ...Object.entries(byChapter).map(([chapter, list]) => ({ key: `${key}:${chapter}`, value: { content: { [field]: list }, metadata: entry.metadata } })),
  ]
}

export async function notesRows(table: Table, book: string, lang: string): Promise<Row[]> {
  const tsvText = tsv(
    ['Reference', 'ID', 'Tags', 'SupportReference', 'Quote', 'Occurrence', 'Note'],
    table.rows.map((r) => [noteReference(r), r.id, cell(r.cols.tags), supportReferenceOf(r), tsvCell(cell(r.cols.quote)), cell(r.cols.occurrence), sourceText(cell(r.cols.note), lang)]),
  )
  const processed = await new NotesProcessor().processNotes(tsvText, book, book)
  return chunked(`tn:${table.res}:${book}`, 'notes', processed)
}

export async function questionsRows(table: Table, book: string, lang: string): Promise<Row[]> {
  const tsvText = tsv(
    ['Reference', 'ID', 'Tags', 'Quote', 'Occurrence', 'Question', 'Response'],
    table.rows.map((r) => [r.ref, r.id, cell(r.cols.tags), tsvCell(cell(r.cols.quote)), cell(r.cols.occurrence), sourceText(cell(r.cols.question), lang), sourceText(cell(r.cols.response), lang)]),
  )
  const processed = await new QuestionsProcessor().processQuestions(tsvText, book, book)
  return chunked(`tq:${table.res}:${book}`, 'questions', processed)
}

/** One row for the whole book: the adapter does not split `twl:`. */
export async function linksRows(table: Table, book: string): Promise<Row[]> {
  const tsvText = tsv(
    ['Reference', 'ID', 'Tags', 'OrigWords', 'Occurrence', 'TWLink'],
    table.rows.map((r) => [r.ref, r.id, cell(r.cols.tags), tsvCell(cell(r.cols.origWords)), cell(r.cols.occurrence), twLinkOf(r)]),
  )
  return [{ key: `twl:${table.res}:${book}`, value: await new WordsLinksProcessor().processWordsLinks(tsvText, book, book) }]
}

/**
 * The `tn:`, `tq:` and `twl:` rows of a book, as the Door43 loaders write them: the rows of the book segment become the TSV
 * lines of the source and go through the loaders' own parsers, so the shapes (and the introductions at chapter 1) cannot
 * drift. `tn:` and `tq:` are split into a manifest and a row per chapter the way the cache adapter splits them. Empty when
 * the language has no such book; a resource the book lacks gives no rows.
 */
export async function helpsRows(reader: PackReader, book: string): Promise<Row[]> {
  const model = await reader.book(book)
  if (!model) return []
  const code = model.book.toLowerCase()
  const rows: Row[] = []
  if (model.notes) rows.push(...(await notesRows(model.notes, code, model.lang)))
  if (model.questions) rows.push(...(await questionsRows(model.questions, code, model.lang)))
  if (model.links) rows.push(...(await linksRows(model.links, code)))
  return rows
}
