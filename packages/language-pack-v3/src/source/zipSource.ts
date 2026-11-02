/**
 * A row source over a format 1.1 language pack (a zip): `manifest.json` and `rows/{layer}/{resource}.jsonl`, one
 * `{"key", "entry"}` per line. A browser or a Worker can run it: jszip and pako only. The order of the rows, the filters
 * and `lang` are in `rows.ts`.
 *
 * The rows are the pack's own: an entry keeps the dates a cache sets (`timestamp`, `expiresAt`, `processingDate`) that
 * a part leaves out; the rest of an entry is what the part holds for the same key.
 */

import JSZip from 'jszip'
import { LAYERS, ORIGINALS, lines, type ResourceRef, type Row, type RowFilter, type RowSource } from './rows'

const PACK_FORMAT = 'bt-synergy-language-pack'

type ManifestResource = {
  key: string
  role?: string
  stamp: string
  subject?: string
  title?: unknown
  rows?: Record<string, number>
  books?: string[]
}
type Manifest = { format: string; formatVersion: string; language: string; kind?: string; books?: string[]; resources: ManifestResource[] }

/** A file name for a resource key, as the pack writes it (`es-419_gl/es-419/tn` is `es-419_gl~2Fes-419~2Ftn`). */
const fileSafe = (resourceKey: string): string => encodeURIComponent(resourceKey).replace(/%/g, '~')

/** The Door43 subjects whose rows are kept book by book (`isBookScoped` of the packs, for a pack that has no `books`). */
const BOOK_SCOPED_SUBJECTS = new Set([
  'Bible',
  'Aligned Bible',
  'Greek New Testament',
  'Hebrew Old Testament',
  'TSV Translation Notes',
  'TSV Translation Questions',
  'TSV Translation Words Links',
])

const SOT_PREFIXES = ['scripture-usj:', 'tn:', 'twl:', 'tq:', 'obs:']

/**
 * The book a row of a book-scoped resource is about (lowercase), or undefined. A 1.1 pack does not say it per row, so it
 * is read from the key the way the cache writes it: source rows right after the resource key (`tn:{key}:{book}[:{chapter}]`),
 * prepared rows in their fourth part (`prepared:{type}:{key}:{book}:…`), quotes and aligned quotes before the chapter
 * (`…:{book}:{chapter}`), index rows last (`index:…:{book}`).
 */
function bookOfRow(key: string, layer: string, resourceKey: string): string | undefined {
  let book: string | undefined
  if (layer === 'sot') {
    for (const prefix of SOT_PREFIXES) {
      const head = `${prefix}${resourceKey}:`
      if (key.startsWith(head)) book = key.slice(head.length).split(':')[0]
    }
  } else if (layer === 'prepared') {
    book = key.split(':')[3]
  } else if (layer === 'quote' || layer === 'align') {
    const parts = key.split(':')
    book = parts.length >= 2 ? parts[parts.length - 2] : undefined
  } else if (layer === 'index') {
    book = key.slice(key.lastIndexOf(':') + 1)
  }
  return book ? book.toLowerCase() : undefined
}

/** Resources of tW, tA, OBS and the lexicons are not about one book: their keys (`prepared:words:…:bible/kt/grace`) are not read for one. */
const isBookScoped = (resource: ManifestResource): boolean => resource.books !== undefined || BOOK_SCOPED_SUBJECTS.has(resource.subject ?? '')

/**
 * The books the pack has rows for in a resource. The manifest's `books` of a resource are the books the store had, whether
 * or not the pack carries them: a book pack carries those of its own `books`, a base pack carries none, any other pack
 * carries them all. A resource with no source rows has none. (A 1.0 pack has no `books`: this says none.)
 */
function carriedBooks(manifest: Manifest, resource: ManifestResource): string[] {
  if (!resource.books || !resource.rows?.sot) return []
  const wanted = manifest.kind === 'book' && manifest.books ? new Set(manifest.books) : undefined
  return [...new Set(resource.books)].filter((book) => !wanted || wanted.has(book)).sort()
}

/** A source over a pack, which also says the pack's own language (`manifest.language`). */
export type ZipSource = RowSource & { language: string }

/**
 * `zip`: the bytes of a format 1.1 pack. `originals`: the source for `lang: 'originals'`; without it the pack answers for
 * the original languages with the resources it carries itself as `role: 'original'` (a pack of the originals, or a 1.0
 * pack), if any.
 *
 * The pack's own language is `manifest.language`, and the source's `language` says it. Receipts (`rows/receipt/`) are not
 * rows of a source and are not read. The `kind` of a resource is its manifest `subject`; its `stamp` is the manifest's
 * `stamp`; its `title` is the manifest's `title` when it has one (the manifest has no license, rights or credit line).
 */
export async function zipSource(zip: Uint8Array, originals?: RowSource): Promise<ZipSource> {
  const archive = await JSZip.loadAsync(zip)
  const file = archive.file('manifest.json')
  if (!file) throw new Error('This is not a language pack: it has no manifest.json')
  const manifest = JSON.parse(await file.async('string')) as Manifest
  if (manifest.format !== PACK_FORMAT) throw new Error(`This is not a language pack: its format is ${JSON.stringify(manifest.format)}, not ${PACK_FORMAT}`)
  if (Number(String(manifest.formatVersion).split('.')[0]) !== 1) throw new Error(`Only format 1 packs are read here, not ${manifest.formatVersion}`)
  if (!Array.isArray(manifest.resources)) throw new Error('The manifest of the pack lists no resources')

  /** The resources of the pack that answer for `lang`: the originals it carries, or the rest if it is the pack's language. */
  const resourcesOf = (lang: string): ManifestResource[] => {
    if (lang === ORIGINALS) return manifest.resources.filter((resource) => resource.role === 'original')
    if (lang === manifest.language) return manifest.resources.filter((resource) => resource.role !== 'original')
    return []
  }

  async function* rowsOf(resource: ManifestResource, f: RowFilter): AsyncGenerator<Row> {
    const scoped = isBookScoped(resource)
    for (const layer of LAYERS) {
      if (f.layer !== undefined && f.layer !== layer) continue
      if (!resource.rows?.[layer]) continue
      const entry = archive.file(`rows/${layer}/${fileSafe(resource.key)}.jsonl`)
      if (!entry) throw new Error(`The pack lacks ${layer} of ${resource.key}`)
      for (const line of lines(await entry.async('string'))) {
        const row = JSON.parse(line) as { key?: unknown; entry?: unknown }
        if (typeof row.key !== 'string') throw new Error(`A row of ${layer} of ${resource.key} has no key`)
        if (f.book !== undefined && (!scoped || bookOfRow(row.key, layer, resource.key) !== f.book)) continue
        yield { layer, key: row.key, value: row.entry }
      }
    }
  }

  async function* rows(f: RowFilter): AsyncGenerator<Row> {
    if (f.lang === ORIGINALS && originals) {
      yield* originals.rows(f)
      return
    }
    for (const resource of resourcesOf(f.lang)) {
      if (f.resource !== undefined && resource.key !== f.resource) continue
      yield* rowsOf(resource, f)
    }
  }

  return {
    language: manifest.language,
    rows,
    async resources(lang) {
      if (lang === ORIGINALS && originals) return originals.resources(lang)
      return resourcesOf(lang).map((resource): ResourceRef => {
        const ref: ResourceRef = { key: resource.key, stamp: resource.stamp, kind: resource.subject ?? '', books: carriedBooks(manifest, resource) }
        if (typeof resource.title === 'string' && resource.title.trim() !== '') ref.title = resource.title
        return ref
      })
    },
  }
}
