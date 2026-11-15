import 'fake-indexeddb/auto'
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serializePartsList } from '@bt-synergy/language-pack'
import { BUILDER, buildLanguage, catalogView, hex, obsView, type BuiltSegment } from '@bt-synergy/language-pack-v3'
import { partsSource } from '@bt-synergy/language-pack-v3/node/partsSource'
import { buildLanguageParts } from './buildLanguageParts'
import { discover, fakeDoor43, LANG, LEXICONS_REF, lexiconFetch, maculaFolder, MACULA_STAMP } from './partsFixture'

// The parts fixture (es-419 with OBS) built as parts, then as a v3 language: the obs unit of Task 6.

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

const about = { format: '3.0' as const, publisher: 'unfoldingWord', origin: 'published' as const, revision: 1, built: '2026-11-01T10:00:00Z', builder: BUILDER }

async function languageOf(obs: boolean) {
  const dir = mkdtempSync(join(tmpdir(), `obs-unit-${obs ? 'on' : 'off'}-`))
  dirs.push(dir)
  const workDir = join(dir, 'work')
  const macula = join(dir, 'macula')
  mkdirSync(macula)
  const { list, originals, failures } = await buildLanguageParts({
    language: LANG,
    workDir,
    macula: { folder: maculaFolder(macula), ...MACULA_STAMP },
    lexiconsRef: LEXICONS_REF,
    fetch: lexiconFetch,
    door43Client: fakeDoor43() as never,
    discover,
    obs,
  })
  if (failures.length) throw new Error(`the parts fixture did not build: ${JSON.stringify(failures)}`)
  writeFileSync(join(dir, 'list.json'), serializePartsList(list))
  writeFileSync(join(dir, 'originals.json'), serializePartsList(originals))
  const source = await partsSource({ list: join(dir, 'list.json'), partsDir: join(workDir, 'parts'), originals: join(dir, 'originals.json') })
  return buildLanguage({ source, lang: LANG, registry: {}, about })
}

const bytesOf = (built: { segments: BuiltSegment[] }, keep: (s: BuiltSegment) => boolean) => built.segments.filter(keep).map((s) => `${s.id}:${hex(s.bytes)}`)

describe('the obs unit built from the parts fixture', () => {
  test('with OBS rows the obs unit needs the map and obsView reads 2 stories, notes and questions; without them there is no obs unit and the other units are the same bytes', async () => {
    const on = await languageOf(true)
    const off = await languageOf(false)

    const catalog = catalogView(on.catalog.seg)
    const unit = catalog.units.find((u) => u.id === 'obs')!
    expect(unit).toBeDefined()
    expect(unit.needs).toEqual(['map'])
    const seg = on.segments.find((s) => s.seg.h.class === 'obs')!
    expect(unit.segments.map((i) => hex(catalog.segments[i].id))).toEqual([seg.id])
    const view = obsView(seg.seg)
    expect(view.stories).toHaveLength(2)
    expect(view.notes!.rows.length).toBeGreaterThan(0)
    expect(view.questions!.rows.length).toBeGreaterThan(0)

    expect(catalogView(off.catalog.seg).units.some((u) => u.id === 'obs')).toBe(false)
    expect(off.segments.some((s) => s.seg.h.class === 'obs')).toBe(false)
    // The book, article and lexicon segments do not depend on OBS (the map and topics carry its titles and coverage).
    const other = (s: BuiltSegment) => ['book', 'art', 'lex'].includes(s.seg.h.class)
    expect(bytesOf(on, other)).toEqual(bytesOf(off, other))
  }, 180_000)
})
