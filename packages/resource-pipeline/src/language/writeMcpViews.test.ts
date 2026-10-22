import 'fake-indexeddb/auto'
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildLanguagePack, type CacheRow, type PackSource } from '@bt-synergy/language-pack'
import {
  expectedIngestReleaseStamp,
  ingestSchemaForResourceType,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { wrapVersioned } from '../cache/versionedEnvelope'
import { HELPS_ALIGN_VERSION, helpsAlignKey, targetBookStamp } from '../helps/helpsAlignCache'
import { helpsBookStamp, olBookStamp } from '../helps/helpsQuoteCache'
import { NOTES_PREPARE_VERSION, type NotesLightChapter } from '../notes/notesPreparer'
import { PACK_VERSIONS } from './packVersions'
import { writeMcpViews } from './writeMcpViews'

const TN = 'es-419_gl/es-419/tn'
const GLT = 'es-419_gl/es-419/glt'
const UHB = 'unfoldingWord/hbo/uhb'

/** A catalog row whose release recorded each book's blob at its tag. */
const meta = (key: string, subject: string, type: string, tag: string, blobs: Record<string, string>): ResourceMetadata =>
  ({
    resourceKey: key,
    owner: key.split('/')[0],
    language: key.split('/')[1],
    resourceId: key.split('/')[2],
    subject,
    type,
    title: key,
    version: tag,
    release: { tag_name: tag, published_at: '2026-10-01T00:00:00Z' },
    contentMetadata: { bookBlobs: blobs, bookBlobsRef: tag },
  }) as unknown as ResourceMetadata

const TN_META = meta(TN, 'TSV Translation Notes', 'notes', 'v80', { rut: '1111111111aa', jon: '2222222222bb' })
const GLT_META = meta(GLT, 'Aligned Bible', 'scripture', 'v45', { rut: '3333333333cc', jon: '4444444444dd' })
const UHB_META = meta(UHB, 'Hebrew Old Testament', 'scripture', 'v2.1.30', { rut: '5555555555ee', jon: '6666666666ff' })

const receipt = (m: ResourceMetadata): CacheRow => ({
  key: `resource:${m.resourceKey}`,
  entry: {
    content: {},
    metadata: {
      downloadComplete: true,
      releaseStamp: expectedIngestReleaseStamp(m),
      ingestSchema: ingestSchemaForResourceType(String(m.type), USJ_PROCESSING_VERSION),
    },
  },
})

/** One note in chapter 1 of `book`, and its words in the GLT under the keys warm writes for that book. */
function bookRows(book: string, noteId: string, words: string[]): CacheRow[] {
  const light: NotesLightChapter = {
    version: NOTES_PREPARE_VERSION,
    unit: 1,
    notes: [
      { id: noteId, reference: '1:1', quote: 'x', body: '', note: 'una nota', supportReference: '', tags: '', occurrence: '1' },
    ],
  }
  const alignKey = helpsAlignKey({
    helpsKey: TN,
    helpsStamp: helpsBookStamp(TN_META, book),
    olKey: UHB,
    olStamp: olBookStamp(UHB_META, book),
    targetKey: GLT,
    targetStamp: targetBookStamp(GLT_META, book),
    book,
    chapter: 1,
  })
  return [
    { key: `tn:${TN}:${book}`, entry: { content: {}, timestamp: 1, version: 1 } },
    { key: `prepared:notes:${TN}:${book}:1:light`, entry: wrapVersioned(light, NOTES_PREPARE_VERSION) },
    { key: alignKey, entry: wrapVersioned({ [noteId]: { p: [0, 1], m: 1, t: words } }, HELPS_ALIGN_VERSION) },
  ]
}

test('notes views read alignments whose stamps are per book', async () => {
  const rows: CacheRow[] = [
    receipt(TN_META),
    receipt(GLT_META),
    { key: `scripture-usj:${GLT}:rut`, entry: { content: {}, timestamp: 1, version: 1 } },
    ...bookRows('rut', 'r001', ['Rut', 'dijo']),
    ...bookRows('jon', 'j001', ['Jonás', 'huyó']),
  ]
  const catalog = new Map<string, ResourceMetadata>([
    [TN, TN_META],
    [GLT, GLT_META],
    [UHB, UHB_META],
  ])
  const source: PackSource = {
    rowsByPrefix: async (prefix) => rows.filter((r) => r.key >= prefix && r.key <= prefix + '￿'),
    catalogRow: async (key) => catalog.get(key) ?? null,
    catalogRows: async () => [...catalog.values()],
  }
  const { bytes } = await buildLanguagePack({ source, language: 'es-419', resourceKeys: [TN, GLT], versions: PACK_VERSIONS })
  const outDir = mkdtempSync(join(tmpdir(), 'mcp-views-'))
  try {
    await writeMcpViews({ pack: bytes, outDir })
    const view = (book: string) =>
      JSON.parse(readFileSync(join(outDir, `v1/es-419/notes/${book}/1.json`), 'utf8')) as {
        notes: Array<{ id: string; aligned: { literal: string | null } }>
      }
    expect(view('RUT').notes.map((n) => [n.id, n.aligned.literal])).toEqual([['r001', 'Rut dijo']])
    expect(view('JON').notes.map((n) => [n.id, n.aligned.literal])).toEqual([['j001', 'Jonás huyó']])
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
})
