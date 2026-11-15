import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { extractObs, type Row, type RowFilter, type RowSource } from '@bt-synergy/language-pack-v3'
import { NotesProcessor, QuestionsProcessor } from '@bt-synergy/resource-parsers'
import { ResourceCompletenessChecker } from '../download/ResourceCompletenessChecker'
import JSZip from 'jszip'
import { isMarkdownHelps, markdownFilesOfZip, markdownHelpId, markdownObsHelps, withMarkdownObsHelps } from './markdownObsHelps'

const TN = 'Door43-Catalog/hi/obs-tn'
const TQ = 'Door43-Catalog/hi/obs-tq'
const sha4 = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 4)

const LINK = 'rc://*/ta/man/translate/figs-quotations'
const NOTE_A = `यह एक अलंकार है। (देखें: [[${LINK}]])`

const tnFiles = () =>
  new Map<string, string>([
    ['LICENSE.md', '# License\n\ntext'],
    ['README.md', '# hi_obs-tn\n\ntext'],
    ['content/01/00.md', '# The Creation\n\nThe title note.\n'],
    ['content/10/03.md', `# hardened his heart\n\n${NOTE_A}\n`],
    ['content/10/05.md', '# Pharaoh\n\nA king.\n'],
  ])

const tsvTn = [
  'Reference\tID\tTags\tSupportReference\tQuote\tOccurrence\tNote',
  `1:intro\t${sha4('1:0The Creation')}\t\t\tThe Creation\t1\tThe title note.`,
  `10:3\t${sha4('10:3hardened his heart')}\t\t${LINK}\thardened his heart\t1\t${NOTE_A}`,
  `10:5\t${sha4('10:5Pharaoh')}\t\t\tPharaoh\t1\tA king.`,
].join('\n')

const tqFiles = () =>
  new Map<string, string>([
    ['content/01/00.md', '# Who made the world?\n\nGod made it.\n'],
    ['content/10/03.md', '# What did God do?\n\nHe sent plagues.\n'],
  ])
const tsvTq = [
  'Reference\tID\tTags\tQuote\tOccurrence\tQuestion\tResponse',
  `1:intro\t${sha4('1:0Who made the world?')}\t\t\t\tWho made the world?\tGod made it.`,
  `10:3\t${sha4('10:3What did God do?')}\t\t\t\tWhat did God do?\tHe sent plagues.`,
].join('\n')

const withoutDate = (v: any) => ({ ...v, metadata: { ...v.metadata, processingDate: undefined } })

describe('markdownObsHelps', () => {
  test('the markdown rows equal the TSV loader rows (keys and values, ids aside)', async () => {
    const issues: string[] = []
    const tn = markdownObsHelps(tnFiles(), 'tn', TN, issues)
    expect([...tn.keys()]).toEqual([`tn:${TN}:obs`])
    const tsv: any = await new NotesProcessor().processNotes(tsvTn, 'obs', 'obs')
    const md: any = tn.get(`tn:${TN}:obs`)
    // The TSV loader reads `1:intro` as `1:1` (isIntro); the converter keeps `1:intro` so the row lands on frame 0.
    const fix = (n: any) => (n.isIntro ? { ...n, reference: '1:intro' } : n)
    const expected = { ...tsv, notes: tsv.notes.map(fix), notesByChapter: { '1': tsv.notesByChapter['1'].map(fix), '10': tsv.notesByChapter['10'] } }
    expect(withoutDate(md).notes).toEqual(withoutDate(expected).notes)
    expect(withoutDate(md).notesByChapter).toEqual(withoutDate(expected).notesByChapter)
    expect(Object.keys(md).sort()).toEqual(Object.keys(tsv).sort())
    expect(Object.keys(md.metadata).sort()).toEqual(Object.keys(tsv.metadata).sort())
    expect(md.metadata.totalNotes).toBe(3)
    expect(md.metadata.chaptersWithNotes).toEqual([1, 10])
    expect(md.metadata.statistics).toEqual(tsv.metadata.statistics)
    expect(issues).toEqual([])

    const tq = markdownObsHelps(tqFiles(), 'tq', TQ, issues)
    const tsvQ: any = await new QuestionsProcessor().processQuestions(tsvTq, 'obs', 'obs')
    const mdQ: any = tq.get(`tq:${TQ}:obs`)
    const fixQ = (q: any) => (q.reference === '1:intro' ? q : q)
    expect(mdQ.questions.map(fixQ)).toEqual(tsvQ.questions)
    expect(mdQ.questionsByChapter).toEqual(tsvQ.questionsByChapter)
    expect(withoutDate(mdQ).metadata).toEqual(withoutDate(tsvQ).metadata)
    expect(Object.keys(mdQ).sort()).toEqual(Object.keys(tsvQ).sort())
  })

  test('the ids are the first four hex digits of sha256 of N:F and the heading, and the rows are the same bytes every time', () => {
    expect(markdownHelpId(10, 3, 'hardened his heart')).toBe(sha4('10:3hardened his heart'))
    expect(markdownHelpId(1, 0, '')).toBe(sha4('1:0'))
    const a = markdownObsHelps(tnFiles(), 'tn', TN, [])
    const b = markdownObsHelps(tnFiles(), 'tn', TN, [])
    expect(JSON.stringify([...a])).toBe(JSON.stringify([...b]))
  })

  test('SupportReference is the first tA link of the note, or empty', () => {
    const rows = (markdownObsHelps(tnFiles(), 'tn', TN, []).get(`tn:${TN}:obs`) as any).notes
    expect(rows.map((r: any) => r.supportReference)).toEqual(['', LINK, ''])
    const two = new Map([['content/02/01.md', '# a\n\nsee [[rc://*/ta/man/translate/first]] and [[rc://*/ta/man/checking/second]]']])
    expect((markdownObsHelps(two, 'tn', TN, []).get(`tn:${TN}:obs`) as any).notes[0].supportReference).toBe('rc://*/ta/man/translate/first')
  })

  test('title.md, intro.md and 00.md are frame 0', () => {
    const files = new Map([
      ['content/03/title.md', '# t\n\nx'],
      ['content/03/intro.md', '# i\n\ny'],
      ['content/03/00.md', '# z\n\nw'],
    ])
    const notes = (markdownObsHelps(files, 'tn', TN, []).get(`tn:${TN}:obs`) as any).notes
    expect(notes.map((n: any) => n.reference)).toEqual(['3:intro', '3:intro', '3:intro'])
    expect(notes.every((n: any) => n.isIntro)).toBe(true)
  })

  test('a frame file with no heading gives an issue line, no row', () => {
    const issues: string[] = []
    const files = new Map([...tnFiles(), ['content/10/07.md', 'Just text, no heading.\n'], ['content/10/08.md', '']])
    const out = markdownObsHelps(files, 'tn', TN, issues)
    expect((out.get(`tn:${TN}:obs`) as any).notes).toHaveLength(3)
    expect(issues.filter((i) => i.includes('no heading')).map((i) => i.split(':')[0])).toEqual(['content/10/07.md', 'content/10/08.md'])
  })

  test('a story-level content/NN.md and other stray files give an issue line, no row, and never throw', () => {
    const issues: string[] = []
    const files = new Map([
      ...tnFiles(),
      ['content/10.md', '# story\n\ntext'],
      ['content/front/intro.md', '# front\n\ntext'],
      ['content/10/120.md', '# far\n\ntext'],
      ['manifest.yaml', 'x'],
    ])
    const out = markdownObsHelps(files, 'tn', TN, issues)
    expect((out.get(`tn:${TN}:obs`) as any).notes).toHaveLength(3)
    expect(issues).toHaveLength(3)
    expect(issues.some((i) => i.startsWith('content/10.md') && i.includes('story-level'))).toBe(true)
  })

  test('a heading with no text keeps the quote with an empty note; an empty heading with no text gives no row', () => {
    const issues: string[] = []
    const files = new Map([
      ['content/04/02.md', '# kept quote\n'],
      ['content/04/03.md', '#\n'],
      ['content/04/04.md', '#\n\ntext without a heading text\n'],
    ])
    const notes = (markdownObsHelps(files, 'tn', TN, issues).get(`tn:${TN}:obs`) as any).notes
    expect(notes.map((n: any) => [n.reference, n.quote, n.note])).toEqual([
      ['4:2', 'kept quote', ''],
      ['4:4', '', 'text without a heading text'],
    ])
    expect(notes.some((n: any) => n.quote === '' && n.note === '')).toBe(false)
  })

  test('a closing run of # needs a space before it; the # of C# stays in the heading', () => {
    const files = new Map([
      ['content/05/01.md', '# C#\n\na'],
      ['content/05/02.md', '## x ##\n\nb'],
      ['content/05/03.md', '# a #b\n\nc'],
    ])
    const notes = (markdownObsHelps(files, 'tn', TN, []).get(`tn:${TN}:obs`) as any).notes
    expect(notes.map((n: any) => n.quote)).toEqual(['C#', 'x', 'a #b'])
  })

  test('nothing in the files gives an empty map and a line', () => {
    const issues: string[] = []
    expect(markdownObsHelps(new Map([['README.md', 'x']]), 'tq', TQ, issues).size).toBe(0)
    expect(issues).toHaveLength(1)
  })

  test('extractObs reads the converted rows (the note on 10:3 at frame 1003)', async () => {
    const OBS = 'Door43-Catalog/hi/obs'
    const rows: Row[] = [
      {
        layer: 'sot',
        key: `obs:${OBS}:10`,
        value: { content: { storyNumber: 10, title: '10. T', sourceReference: null, frames: [{ frameNumber: 3, imageUrl: '', text: 'x' }] }, timestamp: 1, resourceKey: OBS, storyId: '10' },
      },
    ]
    const tn = markdownObsHelps(tnFiles(), 'tn', TN, [])
    const refs = [
      { key: OBS, stamp: 'v1#2026-01-01T00_00_00Z', kind: 'Open Bible Stories', books: [] },
      { key: TN, stamp: 'v11#2026-01-01T00_00_00Z', kind: 'TSV OBS Translation Notes', books: [] },
    ]
    const source: RowSource = {
      async resources() {
        return refs
      },
      async *rows(f: RowFilter) {
        if (f.resource === OBS) yield* rows
        if (f.resource === TN) for (const [key, value] of tn) yield { layer: 'sot', key, value }
      },
    }
    const issues: string[] = []
    const model = await extractObs(source, 'hi', issues)
    const table = model!.notes!
    const row = table.rows.find((r) => r.frame === 1003)!
    expect(row.ref).toBe('10:3')
    expect(row.concept).toBe('ta:translate/figs-quotations')
    expect(row.cols.quote).toBe('hardened his heart')
    expect(table.rows.map((r) => r.frame)).toEqual([100, 1003, 1005])
  })
})

describe('the switch', () => {
  test('a row is markdown when its ingredients name no TSV file and its format is not TSV', () => {
    const row = (format: string | undefined, paths: string[]) =>
      ({ format, contentMetadata: { ingredients: paths.map((path) => ({ path })) } }) as any
    expect(isMarkdownHelps(row('markdown', ['./content']))).toBe(true)
    expect(isMarkdownHelps(row(undefined, ['./content/01.md']))).toBe(true)
    // No positive evidence: stays TSV.
    expect(isMarkdownHelps(row(undefined, ['./content']))).toBe(false)
    expect(isMarkdownHelps(row(undefined, [undefined as any]))).toBe(false)
    expect(isMarkdownHelps({ contentMetadata: { ingredients: [{ identifier: 'obs' }] } } as any)).toBe(false)
    expect(isMarkdownHelps(row('tsv', ['./tn_OBS.tsv']))).toBe(false)
    expect(isMarkdownHelps(row('markdown', ['./tn_OBS.tsv']))).toBe(false)
    expect(isMarkdownHelps(row('text/tsv', []))).toBe(false)
    expect(isMarkdownHelps({} as any)).toBe(false)
  })

  test('the zip reader removes the top folder, and the markdown loader writes the converted row from the release zip', async () => {
    const zip = new JSZip()
    for (const [path, text] of tnFiles()) zip.file(`hi_obs-tn/${path}`, text)
    zip.file('hi_obs-tn/manifest.yaml', 'dublin_core: {}')
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    expect([...(await markdownFilesOfZip(bytes)).keys()]).toContain('content/10/03.md')

    class Base {
      cacheAdapter: any
      door43Client: any
      constructor(config: any) {
        Object.assign(this, config)
      }
      async getMetadata() {
        return { format: 'markdown', release: { tag_name: 'v11.2' }, contentMetadata: { ingredients: [{ path: './content' }] } }
      }
      async loadContent() {
        return 'tsv path'
      }
      async downloadResource() {}
    }
    const store = new Map<string, unknown>()
    const calls: unknown[][] = []
    const Loader = withMarkdownObsHelps(Base as any, 'tn')
    const loader: any = new Loader({
      cacheAdapter: { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => void store.set(k, v) },
      door43Client: { downloadZipball: async (...a: unknown[]) => (calls.push(a), bytes) },
    })
    await loader.downloadResource(TN)
    expect(calls).toEqual([['Door43-Catalog', 'hi_obs-tn', 'v11.2']])
    expect((store.get(`tn:${TN}:obs`) as any).notes).toHaveLength(3)
    await loader.downloadResource(TN)
    expect(calls).toHaveLength(1)
  })

  test('after a markdown download the completeness checker says complete, for notes and for questions', async () => {
    const zip = new JSZip()
    for (const [path, text] of tnFiles()) zip.file(`hi_obs-tn/${path}`, text)
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    for (const [kind, type] of [['tn', 'obs-notes'], ['tq', 'obs-questions']] as const) {
      const key = `Door43-Catalog/hi/obs-${kind}`
      const meta = {
        resourceKey: key,
        type,
        format: 'text/markdown',
        version: 'v11.2',
        release: { tag_name: 'v11.2', published_at: '2026-01-02T03:04:05Z' },
        contentMetadata: { ingredients: [{ identifier: 'obs', path: './content', isDir: true }, { identifier: 'x', path: './content/01/00.md' }] },
      }
      class Base {
        cacheAdapter: any
        door43Client: any
        constructor(config: any) {
          Object.assign(this, config)
        }
        async getMetadata() {
          return meta
        }
      }
      const store = new Map<string, any>()
      const cache = { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: unknown) => void store.set(k, v) }
      const loader: any = new (withMarkdownObsHelps(Base as any, kind))({ cacheAdapter: cache, door43Client: { downloadZipball: async () => bytes } })
      const checker = new ResourceCompletenessChecker({ catalogManager: { getResourceMetadata: async () => meta } as any, cacheAdapter: cache as any })
      expect((await checker.checkResource(key)).isComplete).toBe(false)
      await loader.downloadResource(key)
      expect((await checker.checkResource(key)).status).toBe('complete')
      expect(store.get(`resource:${key}`).metadata.downloadComplete).toBe(true)
    }
  })

  test('a listed resource whose markdown gives no row fails and writes no receipt', async () => {
    const zip = new JSZip()
    zip.file('hi_obs-tn/README.md', 'x')
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    class Base {
      cacheAdapter: any
      door43Client: any
      constructor(config: any) {
        Object.assign(this, config)
      }
      async getMetadata() {
        return { format: 'markdown', release: { tag_name: 'v1' }, contentMetadata: { ingredients: [{ path: './content' }] } }
      }
    }
    const store = new Map<string, any>()
    const loader: any = new (withMarkdownObsHelps(Base as any, 'tn'))({
      cacheAdapter: { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => void store.set(k, v) },
      door43Client: { downloadZipball: async () => bytes },
    })
    await expect(loader.downloadResource(TN)).rejects.toThrow()
    expect(store.size).toBe(0)
  })
})
