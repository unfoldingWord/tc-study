/** Test helper: a signed `hi-x-aquifer` patch catalog on top of the sample (it requires the sample's common catalog). */
import { bookSegment, bookView, buildCatalog, builtSegment, KNOWN, readSegment, signCatalog, type BookModel, type HelpRow } from '@bt-synergy/language-pack-v3'
import { bookSet } from '../../language-pack-v3/src/ids'
import { verifyCatalogFile } from '../src/verify'
import type { WithCatalogs } from './fakeServer'
import type { Sample } from './sample'

export const PATCH = 'hi-x-aquifer'
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const fingerprint = (n: number) => n.toString(16).padStart(64, '0')

/** A book of the sample's language catalog, as a model. */
export async function bookOf(sample: Sample, book: string): Promise<BookModel> {
  const cat = await verifyCatalogFile(sample.langCatalog, {}, { from: 'store' })
  const unit = cat.catalog.units.find((u) => u.id === `book:${book}`)!
  const id = hex(cat.catalog.segments[unit.segments[0]!]!.id)
  const { seg } = await readSegment(sample.segments.get(id)!, { known: KNOWN.book!, expectedId: id })
  return bookView(seg)
}

export const aquiferRow = (id: string, from: number, concept?: string): HelpRow => ({
  id,
  ref: '1:1',
  from,
  to: from,
  ...(concept !== undefined ? { concept } : {}),
  cols: { quote: 'ग्रीक', note: `parche ${id}` },
})

/** The sample with a patch catalog `hi-x-aquifer`: the notes and questions of Titus (`texts: []`), served beside `es-419`. */
export async function withPatch(sample: Sample): Promise<WithCatalogs> {
  const base = await bookOf(sample, 'tit')
  const model: BookModel = {
    lang: PATCH,
    book: 'tit',
    orig: base.orig,
    res: [
      ['aquifer/hi/tn', 'UWTranslationNotes@abc123'],
      ['aquifer/hi/tq', 'UWTranslationQuestions@abc123'],
    ],
    texts: [],
    notes: { res: 'aquifer/hi/tn', rows: [aquiferRow('aq-n1', 56001001, 'ta:translate/figs-metaphor')] },
    questions: { res: 'aquifer/hi/tq', rows: [aquiferRow('aq-q1', 56001001)] },
  }
  const seg = await builtSegment(bookSegment(model), fingerprint(7))
  const common = await verifyCatalogFile(sample.commonCatalog, {}, { from: 'store' })
  const res = (key: string, release: string, review: 'professional' | 'community') => ({
    key,
    title: key,
    subject: 'TSV Translation Notes',
    release,
    license: 'CC-BY-SA-4.0',
    rights: '© 2022 unfoldingWord; adapted by Mission Mutual',
    attribution: `Adapted by Mission Mutual (${key})`,
    source: 'aquifer',
    review,
    books: bookSet(['tit']),
  })
  const catalog = await buildCatalog({
    about: { format: '3.0', catalog: PATCH, publisher: 'unfoldingWord', origin: 'published', revision: 1, built: '2026-11-01T10:00:00Z', builder: 'test' },
    resources: [res('aquifer/hi/tn', 'UWTranslationNotes@abc123', 'professional'), res('aquifer/hi/tq', 'UWTranslationQuestions@abc123', 'community')],
    segments: [seg],
    requires: [['common', common.revision, common.id]],
    needs: () => ['orig:tit'],
    patch: true,
  })
  const segments = new Map(sample.segments)
  segments.set(seg.id, seg.bytes)
  return { ...sample, segments, catalogs: { [PATCH]: await signCatalog(catalog.bytes, sample.keys.privateKey) } }
}
