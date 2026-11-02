/**
 * The conformance cases of `spec/tests/README.md`: the files the cases freeze, what the TypeScript reader says of each, and the check
 * against the Python reader.
 *
 * - Every `.seg` and `.tcpack` under `spec/tests/` (not `data/`) has an `.expected.json` beside it, and `readerOutput` gives that, compared
 *   as the canonical text of the parsed values.
 * - `build-cases.ts` in check mode builds every case again and finds the frozen bytes. The cases are not rebuilt silently: a change of a
 *   builder that alters them fails here until somebody runs `bun spec/tests/build-cases.ts --refreeze`.
 * - The numbers of the table of cases (4, 5, 7, 8, 9, 10, 13) are asserted on the output.
 * - `compare.ts` runs both readers on every case file (and, with `--built`, on the big segments of the sample) and finds no difference. It
 *   needs Python 3.11 or later: `LP3_PYTHON` names the interpreter, else `python` is used when it is new enough, else the test is skipped.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bridgeBook, bridgeCatalog, buildFrozenCases, caseFilesOn, expectedText, runBuildCases, TESTS_DIR } from '../spec/tests/build-cases'
import { firstDifference } from '../spec/tests/compare'
import { canonicalJson, readerOutput } from './read/output'

type Out = Record<string, any>

const PACKAGE_DIR = join(import.meta.dir, '..')
const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(path))
const outputOf = async (name: string): Promise<Out> => (await readerOutput(bytesOf(join(TESTS_DIR, name)))) as Out
const expectedOf = (name: string): unknown => JSON.parse(readFileSync(join(TESTS_DIR, name.replace(/\.(seg|tcpack)$/, '.expected.json')), 'utf8'))

const FILES = caseFilesOn(TESTS_DIR)

describe('the case files', () => {
  test('are the ones of the table of cases (cases 6, 11 and 12, and the map half of case 5, come in phase 2)', () => {
    expect(FILES).toEqual([
      'articulo-mal-titulado/art.seg',
      'container/bad-id.seg',
      'container/minimal.seg',
      'container/truncated.seg',
      'nota-varios-versiculos/book.seg',
      'paquete-viejo/catalog.seg',
      'seccion-insertada/build1.seg',
      'seccion-insertada/build2.seg',
      'tabla-desconocida/future-x.seg',
      'tabla-desconocida/future-y.seg',
      'transferencia-cortada/cut.tcpack',
      'tito-es419/book.seg',
    ].sort())
  })

  test('each has an expected.json beside it, and every expected.json has its file', () => {
    for (const name of FILES) expect(existsSync(join(TESTS_DIR, name.replace(/\.(seg|tcpack)$/, '.expected.json')))).toBe(true)
    const expected = new Set(FILES.map((name) => name.replace(/\.(seg|tcpack)$/, '.expected.json')))
    const listed = caseFilesOn(TESTS_DIR, /\.expected\.json$/)
    expect(listed.filter((name) => !expected.has(name))).toEqual([])
  })

  for (const name of FILES) {
    test(`${name}: readerOutput is its expected.json`, async () => {
      const got = await readerOutput(bytesOf(join(TESTS_DIR, name)))
      expect(canonicalJson(got)).toBe(canonicalJson(expectedOf(name)))
    })
  }

  test('an expected.json is the canonical text indented by two spaces, an error on one line, with LF line ends', () => {
    for (const name of FILES) {
      const path = join(TESTS_DIR, name.replace(/\.(seg|tcpack)$/, '.expected.json'))
      const text = readFileSync(path, 'utf8')
      expect(text.includes('\r')).toBe(false)
      expect(text.endsWith('\n')).toBe(true)
      expect(text).toBe(expectedText(JSON.parse(text)))
    }
  })
})

describe('build-cases.ts', () => {
  let built: Map<string, Uint8Array>
  beforeAll(async () => {
    built = await buildFrozenCases()
  }, 120_000)

  test('builds every case file but the ones of container/, and gives the frozen bytes', () => {
    expect([...built.keys()].sort()).toEqual(FILES.filter((name) => !name.startsWith('container/')))
    for (const [name, bytes] of built) expect(Buffer.from(bytes).equals(Buffer.from(bytesOf(join(TESTS_DIR, name))))).toBe(true)
  })

  test('is deterministic: a second build gives the same bytes', async () => {
    const again = await buildFrozenCases()
    expect([...again.keys()]).toEqual([...built.keys()])
    for (const [name, bytes] of again) expect(Buffer.from(bytes).equals(Buffer.from(built.get(name)!))).toBe(true)
  }, 120_000)

  describe('in a folder of its own', () => {
    let root: string
    beforeAll(() => {
      root = mkdtempSync(join(tmpdir(), 'lp3-cases-'))
    })
    afterAll(() => rmSync(root, { recursive: true, force: true }))

    test('writes the cases, and a second run changes nothing', async () => {
      const first = await runBuildCases({ root })
      expect(first.problems).toEqual([])
      expect(first.written.length).toBe(2 * built.size)
      for (const name of built.keys()) expect(existsSync(join(root, name))).toBe(true)
      const stamp = (path: string) => statSync(join(root, path)).mtimeMs
      const before = first.written.map(stamp)
      const second = await runBuildCases({ root })
      expect(second.problems).toEqual([])
      expect(second.written).toEqual([])
      expect(first.written.map(stamp)).toEqual(before)
    }, 120_000)

    test('refuses to overwrite a frozen file that would change, and --refreeze overwrites it', async () => {
      const name = 'tito-es419/book.seg'
      const frozen = bytesOf(join(root, name))
      writeFileSync(join(root, name), new Uint8Array([1, 2, 3]))
      const refused = await runBuildCases({ root })
      expect(refused.problems.length).toBe(1)
      expect(refused.problems[0]).toContain(name)
      expect(refused.written).toEqual([])
      expect([...bytesOf(join(root, name))]).toEqual([1, 2, 3])

      const refrozen = await runBuildCases({ root, refreeze: true })
      expect(refrozen.problems).toEqual([])
      expect(refrozen.written).toEqual([name])
      expect(Buffer.from(bytesOf(join(root, name))).equals(Buffer.from(frozen))).toBe(true)
    }, 120_000)

    test('refuses an expected.json that would change', async () => {
      const name = 'seccion-insertada/build1.expected.json'
      writeFileSync(join(root, name), '{"error": "E_ID"}\n')
      const refused = await runBuildCases({ root })
      expect(refused.problems.length).toBe(1)
      expect(refused.problems[0]).toContain(name)
      expect(readFileSync(join(root, name), 'utf8')).toBe('{"error": "E_ID"}\n')
      expect((await runBuildCases({ root, refreeze: true })).problems).toEqual([])
    }, 120_000)

    test('check mode (no write) of the real folder finds nothing to say', async () => {
      const report = await runBuildCases({ check: true })
      expect(report.problems).toEqual([])
      expect(report.written).toEqual([])
    }, 120_000)
  })
})

describe('case 4: tito-es419, the real book', () => {
  let out: Out
  beforeAll(async () => {
    out = await outputOf('tito-es419/book.seg')
  })

  test('is the es-419 Titus of the sample: GLT, GST, notes, questions, links', () => {
    expect(out.h).toMatchObject({ class: 'book', lang: 'es-419', book: 'tit' })
    expect(out.texts.map((t: Out) => t.res)).toEqual(['es-419_gl/es-419/glt', 'es-419_gl/es-419/gst'])
    expect(out.notes.res).toBe('es-419_gl/es-419/tn')
    expect(out.questions.res).toBe('es-419_gl/es-419/tq')
    expect(out.links.res).toBe('es-419_gl/es-419/twl')
  })

  test('GLT has 1 913 pieces, 953 words, all aligned, 69 events; GST 3 471, 1 732, all aligned, 69', () => {
    const [glt, gst] = out.texts
    for (const [text, pieces, words] of [[glt, 1913, 953], [gst, 3471, 1732]] as const) {
      expect(text.pieces).toHaveLength(pieces)
      expect(text.pieces.filter((p: [string, boolean]) => p[1])).toHaveLength(words)
      expect(text.align).toHaveLength(words)
      expect(text.align.every((positions: number[]) => positions.length > 0)).toBe(true)
      expect(text.events).toHaveLength(69)
    }
  })

  test('216 notes (212 with quote text, 203 of them with positions found in the original), 36 questions, 223 links (all with quote text and positions)', () => {
    const quoted = out.notes.rows.filter((row: Out) => (row.cols.quote ?? '') !== '')
    expect(out.notes.rows).toHaveLength(216)
    expect(quoted).toHaveLength(212)
    expect(quoted.filter((row: Out) => row.quote.length > 0)).toHaveLength(203)
    expect(out.questions.rows).toHaveLength(36)
    expect(out.links.rows).toHaveLength(223)
    // A word link keeps the quote in the column origWords.
    expect(out.links.rows.filter((row: Out) => (row.cols.origWords ?? '') !== '')).toHaveLength(223)
    expect(out.links.rows.filter((row: Out) => row.quote.length > 0 && row.quote.every((p: number) => p >= 0))).toHaveLength(223)
  })

  test('is at most 40 KB', () => {
    expect(statSync(join(TESTS_DIR, 'tito-es419/book.seg')).size).toBeLessThanOrEqual(40 * 1024)
  })
})

describe('case 5: nota-varios-versiculos (the book half)', () => {
  test('Titus 1:1-4 in one text and one note on 1:2-4 that points to figs-metaphor', async () => {
    const out = await outputOf('nota-varios-versiculos/book.seg')
    expect(out.texts).toHaveLength(1)
    const verses = out.texts[0].events.filter((e: [number, string, string]) => e[1] === 'verse').map((e: [number, string, string]) => e[2])
    expect(verses).toEqual(['1', '2', '3', '4'])
    expect(out.notes.rows).toHaveLength(1)
    expect(out.notes.rows[0]).toMatchObject({ ref: '1:2-4', from: 56001002, to: 56001004, concept: 'ta:translate/figs-metaphor' })
    expect(out.questions).toBeUndefined()
    expect(out.links).toBeUndefined()
  })
})

describe('case 7: seccion-insertada', () => {
  test('first build: intro, definition, translation-suggestions; second: examples between, the first three unchanged', async () => {
    const [one, two] = [await outputOf('seccion-insertada/build1.seg'), await outputOf('seccion-insertada/build2.seg')]
    const sids = (out: Out) => out.articles[0].sections.map((s: Out) => s.sid)
    expect(sids(one)).toEqual(['intro', 'definition', 'translation-suggestions'])
    expect(sids(two)).toEqual(['intro', 'definition', 'examples', 'translation-suggestions'])
    expect(one.articles[0].id).toBe(two.articles[0].id)
    expect(one.id).not.toBe(two.id)
    // The definition heading was in English the first time, and is corrected the second time: the sid stays.
    expect(one.articles[0].sections[1]).toMatchObject({ role: 'definition', title: 'Definition', lang: 'en' })
    expect(two.articles[0].sections[1]).toMatchObject({ role: 'definition', title: 'Definición', lang: 'es-419' })
  })
})

describe('case 8: articulo-mal-titulado', () => {
  test('intro with role intro; s1 with role unknown; the English section with lang en; every section readable', async () => {
    const out = await outputOf('articulo-mal-titulado/art.seg')
    expect(out.h).toMatchObject({ class: 'art', lang: 'es-419' })
    const sections: Out[] = out.articles[0].sections
    expect(sections.map((s) => [s.sid, s.role, s.lang])).toEqual([
      ['intro', 'intro', 'es-419'],
      ['definition', 'definition', 'es-419'],
      ['s1', 'unknown', 'es-419'],
      ['translation-suggestions', 'translation-suggestions', 'en'],
    ])
    expect(sections[0].level).toBe(0)
    expect(sections[0].title).toBeUndefined()
    for (const s of sections) expect(typeof s.md).toBe('string')
  })
})

describe('case 9: tabla-desconocida', () => {
  test('an optional table the reader does not know is skipped: case 1 with the new h.tables and the new id', async () => {
    const [minimal, x] = [await outputOf('container/minimal.seg'), await outputOf('tabla-desconocida/future-x.seg')]
    expect(x.h.tables['future-x']).toEqual([1, false])
    expect(x.id).not.toBe(minimal.id)
    const { tables: ignoredX, ...hx } = x.h
    const { tables: ignored, ...hm } = minimal.h
    expect(ignoredX).toEqual({ ...ignored, 'future-x': [1, false] })
    expect({ ...x, id: minimal.id, h: hx }).toEqual({ ...minimal, h: hm })
  })

  test('a required table it does not know is E_TABLE', async () => {
    expect(await outputOf('tabla-desconocida/future-y.seg')).toEqual({ error: 'E_TABLE' })
  })
})

describe('case 10: transferencia-cortada', () => {
  test('the catalog and case 1 are ok, case 4 is missing; the catalog lists case 4 as book:tit', async () => {
    const out = await outputOf('transferencia-cortada/cut.tcpack')
    const book = (await outputOf('tito-es419/book.seg')).id
    const minimal = (await outputOf('container/minimal.seg')).id
    expect(out.index.mode).toBe('full')
    expect(out.entries.map((e: Out) => [e.class, e.status])).toEqual([['catalog', 'ok'], ['book', 'ok'], ['book', 'missing']])
    expect(out.entries.slice(1).map((e: Out) => e.id)).toEqual([minimal, book])
    expect(out.catalogs).toHaveLength(1)
    expect(out.catalogs[0].units.map((u: Out) => u.id)).toEqual(['book:tit'])
    expect(out.catalogs[0].segments.map((s: Out) => s.id)).toEqual([book])
    expect(out.index.made).toBe('2026-11-01T10:00:00Z')
    expect(typeof out.index.by).toBe('string')
  })
})

describe('case 13: paquete-viejo', () => {
  test('the bridge gives the same book segment as case 4, with the same id and the same bytes', async () => {
    const fromPack = await bridgeBook()
    const case4 = bytesOf(join(TESTS_DIR, 'tito-es419/book.seg'))
    expect(Buffer.from(fromPack.bytes).equals(Buffer.from(case4))).toBe(true)
    expect(fromPack.id).toBe((await outputOf('tito-es419/book.seg')).id)
  }, 60_000)

  test('the catalog is local, unsigned, and lists that book segment', async () => {
    const out = await outputOf('paquete-viejo/catalog.seg')
    expect(out.about).toMatchObject({ origin: 'local', publisher: 'local:test-device', catalog: 'es-419', revision: 1 })
    expect(out.h.lang).toBe('es-419')
    expect(out.segments.map((s: Out) => [s.class, s.book, s.id])).toEqual([['book', 'tit', (await outputOf('tito-es419/book.seg')).id]])
    expect(out.units.map((u: Out) => u.id)).toEqual(['book:tit'])
    const bytes = bytesOf(join(TESTS_DIR, 'paquete-viejo/catalog.seg'))
    expect(Buffer.from((await bridgeCatalog()).bytes).equals(Buffer.from(bytes))).toBe(true)
  }, 60_000)
})

// The cross-reader check

function pythonOf(command: string): { ok: boolean; reason: string } {
  const run = spawnSync(command, ['-X', 'utf8', '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], { encoding: 'utf8' })
  if (run.error !== undefined || run.status !== 0) return { ok: false, reason: `"${command}" does not run (${run.error?.message ?? run.stderr.trim()})` }
  const [major, minor] = run.stdout.trim().split('.').map(Number)
  if (major < 3 || (major === 3 && minor < 11)) return { ok: false, reason: `"${command}" is Python ${major}.${minor}, and the Python reader needs 3.11 or later` }
  return { ok: true, reason: '' }
}

const requested = process.env.LP3_PYTHON
const python = requested !== undefined && requested !== '' ? { ok: true, reason: '' } : pythonOf('python')
if (!python.ok) console.log(`conformance: the cross-reader check is skipped: ${python.reason}. Set LP3_PYTHON to a Python 3.11 or later.`)

function compare(...args: string[]): { status: number | null; text: string } {
  const run = spawnSync(process.execPath, [join(PACKAGE_DIR, 'spec', 'tests', 'compare.ts'), ...args], { cwd: PACKAGE_DIR, encoding: 'utf8', env: process.env })
  return { status: run.status, text: `${run.stdout}${run.stderr}` }
}

describe('the cross-reader check (compare.ts)', () => {
  test.skipIf(!python.ok)('the TypeScript reader and the Python reader agree on every case file', () => {
    const run = compare()
    expect(run.text).toMatch(/(^|[^0-9])0 mismatches/)
    expect(run.status).toBe(0)
  }, 300_000)

  test.skipIf(!python.ok)('and on the big segments of the sample, built now (--built)', () => {
    const run = compare('--built')
    expect(run.text).toMatch(/(^|[^0-9])0 mismatches/)
    expect(run.status).toBe(0)
  }, 600_000)

  test.skipIf(!python.ok)('finds a difference and prints one line for it: the file, the first path that differs, both values', () => {
    // A reader that is the real one, except for two files: a piece of case 1 has another text, and case 2 is rejected with another code.
    const folder = mkdtempSync(join(tmpdir(), 'lp3-stub-'))
    try {
      const stub = join(folder, 'stub.py')
      writeFileSync(
        stub,
        [
          'import sys',
          `sys.path.insert(0, ${JSON.stringify(join(PACKAGE_DIR, 'spec', 'reader-py'))})`,
          'from lp3read import read_file, canonical_text',
          'out = read_file(open(sys.argv[1], "rb").read())',
          'name = sys.argv[1].replace(chr(92), "/")',
          'if name.endswith("container/minimal.seg"):',
          '    out["texts"][0]["pieces"][0][0] += "x"',
          'elif name.endswith("container/truncated.seg"):',
          '    out = {"error": "E_ID"}',
          'sys.stdout.buffer.write(canonical_text(out).encode("utf-8"))',
          'sys.exit(1 if list(out) == ["error"] else 0)',
          '',
        ].join('\n'),
      )
      const run = compare('--reader', stub)
      expect(run.status).toBe(1)
      expect(run.text.trim().split('\n')).toEqual([
        'container/minimal.seg: $.texts[0].pieces[0][0]: TypeScript "Pablo" / Python "Pablox"',
        'container/truncated.seg: $.error: TypeScript "E_TRUNCATED" / Python "E_ID"',
        'compare: 12 files compared (12 cases), 2 mismatches',
      ])
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  }, 120_000)

  test('compare.ts exits 2 with a message when the interpreter is not there', () => {
    const run = compare('--python', join(tmpdir(), 'there-is-no-python-here'))
    expect(run.status).toBe(2)
    expect(run.text).toMatch(/python/i)
  }, 60_000)
})


describe('firstDifference', () => {
  test('is null for equal values and names the first path that differs, in the order of the file', () => {
    expect(firstDifference({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toBeNull()
    expect(firstDifference({ a: [1, { b: 'x' }], z: 1 }, { a: [1, { b: 'y' }], z: 2 })).toEqual(['$.a[1].b', 'x', 'y'])
    expect(firstDifference([1, 2, 3], [1, 2])).toEqual(['$[2]', 3, undefined])
    expect(firstDifference({ a: 1 }, { a: 1, b: 2 })).toEqual(['$.b', undefined, 2])
    expect(firstDifference({ 'h-1': 1 }, { 'h-1': 2 })).toEqual(['$["h-1"]', 1, 2])
    expect(firstDifference({ a: 1 }, [1])).toEqual(['$', { a: 1 }, [1]])
    expect(firstDifference({ a: {} }, { a: [] })).toEqual(['$.a', {}, []])
    expect(firstDifference('1', 1 as never)).toEqual(['$', '1', 1])
    // The keys are visited by code point: U+FFFF comes before U+1D538.
    expect(firstDifference({ '\u{1d538}': 1, '\uffff': 1 }, { '\u{1d538}': 2, '\uffff': 2 })).toEqual(['$["\uffff"]', 1, 2])
  })
})
