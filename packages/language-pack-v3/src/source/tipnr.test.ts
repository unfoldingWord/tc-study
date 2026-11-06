import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { verseId } from '../ids'
import { parseTipnr, type TipnrRecord } from './tipnr'

// The fixture is 11 records of the real file (spec/tests/data/README.md).
const FIXTURE = [import.meta.dir, '..', '..', 'spec', 'tests', 'data', 'topics', 'tipnr-subset.txt'].join('/')
const text = readFileSync(FIXTURE, 'utf8')

describe('parseTipnr (fixture)', () => {
  const issues: string[] = []
  const records = parseTipnr(text, issues)
  const byId = (id: string) => records.find((r) => r.id === id)

  test('the records of the fixture, by kind', () => {
    expect(records.filter((r) => r.kind === 'person')).toHaveLength(7)
    expect(records.filter((r) => r.kind === 'place')).toHaveLength(5)
    expect(issues).toEqual([])
  })

  test('Abraham', () => {
    const abraham = byId('per:abraham') as TipnrRecord
    expect(abraham.kind).toBe('person')
    expect(abraham.uStrong).toBe('H0085')
    expect(abraham.unique).toBe('Abraham@Gen.11.26-1Pe')
    expect(abraham.names.map((n) => n.dStrong)).toEqual(['H0085', 'H0087', 'G0011'])
    expect(abraham.names.map((n) => n.name)).toEqual(['Abraham', 'Abram', 'Abraham'])
    const v = verseId('gen', 17, 23)
    expect(abraham.names[0].refs.filter((r) => r.verse === v)).toEqual([
      { verse: v, letter: 'a' },
      { verse: v, letter: 'b' },
    ])
    expect(abraham.names[0].refs[0]).toEqual({ verse: verseId('gen', 17, 5) })
    expect(abraham.relations).toContainEqual({ type: 'parent', unique: 'Terah@Gen.11.24-Luk' })
    expect(abraham.relations).toContainEqual({ type: 'partner', unique: 'Sarah@Gen.11.29-1Pe' })
    expect(abraham.relations).toContainEqual({ type: 'child', unique: 'Isaac@Gen.17.19-Jas' })
    expect(byId('per:isaac')?.uStrong).toBe('H3327')
  })

  test('two Zechariahs get two ids with the reference suffix', () => {
    const ids = records.filter((r) => r.unique.startsWith('Zechariah@')).map((r) => r.id)
    expect(ids).toEqual(['per:zechariah-2ki-14-29', 'per:zechariah-luk-1-5'])
  })

  test('places take lug: and the same slug takes suffixes', () => {
    expect(byId('lug:jerusalem')?.kind).toBe('place')
    expect(byId('lug:jerusalem')?.uStrong).toBe('H3389')
    expect(byId('lug:egypt')?.relations).toContainEqual({ type: 'founder', unique: 'Egypt@Gen.10.6-1Ch' })
    expect(byId('lug:ur')?.uStrong).toBe('H0218B')
    expect(byId('lug:bethlehem-gen-35-16')).toBeDefined()
    expect(byId('lug:bethlehem-jos-19-15')).toBeDefined()
  })

  test('Psa.3.0 is the verse 0 of the chapter, in the original numbering', () => {
    const absalom = byId('per:absalom') as TipnrRecord
    expect(absalom.names[0].refs).toContainEqual({ verse: verseId('psa', 3, 0) })
  })

  test('no description text is read', () => {
    // A synthetic record: its description, summary, @Brief, @Short, @Article and translated name must not reach the result.
    const synthetic = [
      '$========== PERSON(s)',
      'Zed@Gen.1.1=H9999	ZED-DESCRIPTION						#ZED-SUMMARY	Male',
      '– Named	Zed@Gen.1.1	H9999«H9999=א	ZED-TRANSLATED =ESV	Gen.1.1',
      '– Total	Zed	Zed	H9999	Gen.1.1	1',
      '@Briefest= ZED-BRIEFEST',
      '@Brief= ZED-BRIEF',
      '@Short= ZED-SHORT	& @Article= ZED-ARTICLE',
      '@Ambiguity=',
    ].join('\n')
    const got = parseTipnr(synthetic, [])
    expect(got).toHaveLength(1)
    expect(got[0].id).toBe('per:zed')
    expect(JSON.stringify(got)).not.toContain('ZED-')
    expect(/^@(Briefest|Brief|Short|Article)=[ ]*[^\s&]/m.test(text)).toBe(false)
    expect(text).not.toContain('first mentioned at')
  })

  test('references keep the numbering of the file, which is the UHB numbering: no conversion', () => {
    const T = '\t'
    const line = (refs: string) =>
      [
        '$========== PERSON(s)',
        ['Zed@Gen.1.1=H9999', '', '', '', '', '', '', '', 'Male'].join(T),
        ['– Named', 'Zed@Gen.1.1', 'H9999«H9999=x', '', refs].join(T),
      ].join('\n')
    const issues: string[] = []
    const [zed] = parseTipnr(line('Exo.8.5; Jon.1.17; Mal.4.1; Psa.51.0; Psa.3.0'), issues)
    expect(zed.names[0].refs.map((r) => r.verse)).toEqual([
      verseId('exo', 8, 5),
      verseId('jon', 1, 17),
      verseId('mal', 4, 1),
      verseId('psa', 51, 0),
      verseId('psa', 3, 0),
    ])
    expect(issues).toEqual([])
  })

  test('unusable references are listed in issues', () => {
    const bad: string[] = []
    const bent = text.replace('Gen.17.5;', 'Xyz.1.1; Gen.17.5; Gen.1000.1;')
    parseTipnr(bent, bad)
    expect(bad.length).toBe(2)
  })

  test('a record line that cannot be read is listed and takes no name lines from the previous record', () => {
    const bad: string[] = []
    const lines = text.split(String.fromCharCode(10))
    const i = lines.findIndex((l) => l.startsWith('Abraham@Gen.11.26'))
    const j = lines.findIndex((l, k) => k > i && l.includes('@') && l.includes('=') && !l.startsWith('–') && !l.startsWith('@'))
    lines[j] = lines[j].replace('=', '=?')
    const out = parseTipnr(lines.join(String.fromCharCode(10)), bad)
    expect(bad.length).toBeGreaterThanOrEqual(1)
    const len = (r: TipnrRecord[]) => r.find((x) => x.id === 'per:abraham')?.names.length
    expect(len(out)).toBe(len(parseTipnr(text, [])))
  })
})

// The whole file is not in the repository: LP3_SOURCES names the folder of the sources (the sources worktree).
const SOURCES = process.env.LP3_SOURCES
const real = (() => {
  if (!SOURCES || !existsSync(`${SOURCES}/tipnr`)) return null
  const name = readdirSync(`${SOURCES}/tipnr`).find((f) => f.startsWith('TIPNR') && f.endsWith('.txt'))
  return name === undefined ? null : `${SOURCES}/tipnr/${name}`
})()

describe('parseTipnr (the whole file)', () => {
  if (real === null) {
    test.skip('LP3_SOURCES is not set or has no tipnr folder: the whole-file check is skipped', () => {})
    return
  }
  test('counts and unique ids', () => {
    const issues: string[] = []
    const records = parseTipnr(readFileSync(real, 'utf8'), issues)
    const ids = new Set(records.map((r) => r.id))
    console.log(
      `TIPNR: records ${records.length}, persons ${records.filter((r) => r.kind === 'person').length}, ` +
        `places ${records.filter((r) => r.kind === 'place').length}, issues ${issues.length}`,
    )
    expect(records.length).toBeGreaterThan(3500)
    expect(ids.size).toBe(records.length)
    for (const r of records) expect(r.id).toMatch(/^(per|lug):[a-z0-9-]+$/)
    expect(records.filter((r) => r.names.length === 0)).toHaveLength(0)
  })
})
