/**
 * Whole-sample check of the blanks of the bridge texts: builds every ULT/UST (or GLT/GST) text of a phase 0 sample and counts
 * the pieces that still show a lost blank (`LOST_SPACE`, the pattern that the MCP scripture adapter falls back on), and compares
 * the text without blanks with the text of the rows (the builder only adds blanks).
 *
 *   bun scripts/check-whitespace.ts <sample folder> <language> <resource>...
 *   bun scripts/check-whitespace.ts C:/.../fase0-paquetes/muestra en unfoldingWord/en/ult unfoldingWord/en/ust
 *
 * The sample folder has `{language}/list.json`, `parts/` (or the folder in the environment variable PARTS_DIR) and
 * `originals/list.json`. A text whose part is not in the folder is left out and counted.
 */
import { extractText } from '../src/build/bookTexts'
import { extractOrig, OrigIndex } from '../src/build/orig'
import { partsSource } from '../src/node/partsSource'
import type { Row } from '../src/source/rows'

const LOST_SPACE = /[\p{L}\p{N}]\{|\}[\p{L}\p{N}]|[.,;:!?][\p{L}{]/u

const [folder, lang, ...resources] = process.argv.slice(2)
if (folder === undefined || lang === undefined || resources.length === 0) {
  console.error('usage: bun scripts/check-whitespace.ts <sample folder> <language> <resource>...')
  process.exit(2)
}

/** The text of a USJ node as the rows have it, with no blank added: the strings and the words, milestones left out. */
function raw(node: unknown): string {
  if (typeof node === 'string') return node
  const n = node as { content?: unknown[] }
  return (n.content ?? []).map(raw).join('')
}

const source = await partsSource({ list: `${folder}/${lang}/list.json`, partsDir: process.env.PARTS_DIR ?? `${folder}/parts`, originals: `${folder}/originals/list.json` })
const books = new Set<string>()
const list = JSON.parse(await Bun.file(`${folder}/${lang}/list.json`).text()) as { parts: { book?: string; resource: string }[] }
for (const part of list.parts) if (resources.includes(part.resource) && part.book !== undefined) books.add(part.book)

let skipped = 0
const totals = new Map<string, { texts: number; pieces: number; lost: number; changed: number; suffixes: number; examples: string[] }>()
for (const book of [...books].sort()) {
  let index: OrigIndex
  try {
    index = new OrigIndex(await extractOrig(source, book))
  } catch (error) {
    console.log(`${book}: no original (${(error as Error).message.slice(0, 80)}), left out`)
    continue
  }
  for (const resource of resources) {
    const rows: Row[] = []
    try {
      for await (const row of source.rows({ lang, book, resource, layer: 'sot' })) rows.push(row)
    } catch (error) {
      console.log(`${book} ${resource}: the part is not in the folder, left out`)
      skipped++
      continue
    }
    if (!rows.some((row) => row.key.startsWith(`scripture-usj:${resource}:${book}:`))) continue
    const text = extractText(rows, book, resource, index)
    const total = totals.get(resource) ?? { texts: 0, pieces: 0, lost: 0, changed: 0, suffixes: 0, examples: [] }
    total.texts++
    total.pieces += text.pieces.length
    const joined = text.pieces.map(([t]) => t).join('')
    // The match is looked for in the joined text of each piece pair, so a lost blank between two pieces shows.
    // A note that starts right after a punctuation mark is not text of the verse: the adapter does not use units with notes.
    const noteAt = new Set(text.events.filter(([, kind, value]) => kind === 'open' && value.startsWith('note')).map(([at]) => at))
    text.pieces.forEach(([t], i) => {
      if (noteAt.has(i)) return
      const around = (text.pieces[i - 1]?.[0].slice(-1) ?? '') + t
      if (LOST_SPACE.test(around)) {
        total.lost++
        // A suffix in braces right after a word, "bird{s}", has no blank in the USFM either: told apart for the count.
        const suffix = /[\p{L}\p{N}]\{$/u.test(around) && text.pieces[i + 1]?.[1] === true
        if (suffix) total.suffixes++
        else if (total.examples.length < 8) total.examples.push(`${book} ${JSON.stringify(around)} ${JSON.stringify(text.pieces.slice(Math.max(0, i - 2), i + 3))}`)
      }
    })
    const rawText = rows
      .filter((row) => /:\d+$/.test(row.key))
      .sort((a, b) => Number(a.key.split(':').pop()) - Number(b.key.split(':').pop()))
      .map((row) => raw(((row.value as { content: { usj: unknown } }).content.usj as { content: unknown[] }).content.map(raw).join('')))
      .join('')
    if (joined.replace(/\s/g, '') !== rawText.replace(/\s/g, '')) total.changed++
    totals.set(resource, total)
  }
}
console.log(`${skipped} texts left out because their part is not in the folder`)
for (const [resource, t] of totals) {
  console.log(`${resource}: ${t.texts} texts, ${t.pieces} pieces, LOST_SPACE ${t.lost} (of them ${t.suffixes} are a suffix in braces right after a word, "bird{s}", with no blank in the USFM either), texts that differ from the rows apart from blanks ${t.changed}`)
  for (const example of t.examples) console.log(`  ${example}`)
}
