import 'fake-indexeddb/auto'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { partPath, partsListPath, readPart, serializePartsList, writePart, type PartsList } from '@bt-synergy/language-pack'
import { buildLanguageParts } from './buildLanguageParts'
import { compareParts, formatComparison, type PartsComparison } from './compareParts'
import { discover, fakeDoor43, GLT, LANG, MACULA_STAMP, maculaFolder, TN, wholePacks } from './partsFixture'

const dirs: string[] = []
const freshDir = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`))
  dirs.push(dir)
  return dir
}

let packs: { language: Uint8Array; originals: Uint8Array }
let built: string
let compat: string

beforeAll(async () => {
  const macula = maculaFolder(freshDir('macula'))
  packs = await wholePacks(macula)
  built = freshDir('parts')
  const { list, failures } = await buildLanguageParts({
    language: LANG,
    workDir: built,
    macula: { folder: macula, ...MACULA_STAMP },
    door43Client: fakeDoor43() as never,
    discover,
  })
  if (failures.length) throw new Error(`The parts build failed: ${JSON.stringify(failures)}`)
  compat = list.compat
}, 120_000)

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A copy of the parts build, to change one thing in. */
function copyOfBuild() {
  const dir = freshDir('parts-copy')
  cpSync(built, dir, { recursive: true })
  const listFile = join(dir, partsListPath(compat, LANG))
  const list = JSON.parse(readFileSync(listFile, 'utf8')) as PartsList
  return { dir, listFile, list }
}

/** Rewrites one part of the copy with `change` applied to its rows, and the list to name the new file. */
async function rewritePart(copy: ReturnType<typeof copyOfBuild>, which: (p: PartsList['parts'][number]) => boolean, change: (rows: Awaited<ReturnType<typeof readPart>>) => typeof rows) {
  const entry = copy.list.parts.find(which)!
  const rows = change(await readPart(new Uint8Array(readFileSync(join(copy.dir, partPath(entry.sha256))))))
  const { bytes, sha256, rows: n } = await writePart(rows)
  writeFileSync(join(copy.dir, partPath(sha256)), bytes)
  Object.assign(entry, { sha256, bytes: bytes.length, rows: n })
  writeFileSync(copy.listFile, serializePartsList(copy.list))
}

const compare = (workDir: string) => compareParts({ pack: packs.language, originals: packs.originals, workDir })
const bucket = (c: PartsComparison, resource: string, layer: string) => c.rows.find((r) => r.resource === resource && r.layer === layer)!
const tnRuthBook = (p: PartsList['parts'][number]) => p.kind === 'book' && p.resource === TN && p.book === 'rut'

describe('compareParts', () => {
  test('the real whole build and the real parts build of the fixture carry the same rows and catalog rows', async () => {
    const c = await compare(built)
    if (c.differences) console.error(formatComparison(c))
    expect(c.differences).toBe(0)
    expect(c.resources).toEqual([])
    expect(c.partFiles).toEqual([])
    expect(c.rows.reduce((n, r) => n + r.whole, 0)).toBeGreaterThan(150)
    // Receipts of every resource of both packs; parts never carry them.
    expect(c.ignored.receipts).toBeGreaterThanOrEqual(7)
    expect(c.rows.every((r) => r.layer !== 'receipt')).toBe(true)
    expect(formatComparison(c)).toContain('No differences')
  }, 60_000)

  test('a row whose value changed in a part is reported as differing', async () => {
    const copy = copyOfBuild()
    let changed = ''
    await rewritePart(copy, tnRuthBook, (rows) =>
      rows.map((r) => {
        if (changed || r.layer !== 'sot') return r
        changed = r.key
        return { ...r, value: { ...(r.value as object), content: 'otra nota' } }
      })
    )
    const c = await compare(copy.dir)
    expect(bucket(c, TN, 'sot').differ).toEqual([changed])
    expect(c.differences).toBe(1)
  }, 60_000)

  test('a row a part lost is reported as only in the whole pack, and one a part gained as only in the parts', async () => {
    const copy = copyOfBuild()
    let dropped = ''
    await rewritePart(copy, tnRuthBook, (rows) => {
      dropped = rows.find((r) => r.layer === 'prepared')!.key
      return [...rows.filter((r) => r.key !== dropped), { layer: 'prepared', key: `prepared:notes:${TN}:rut:99:full`, value: { content: [] } }]
    })
    const c = await compare(copy.dir)
    expect(bucket(c, TN, 'prepared').onlyInWhole).toEqual([dropped])
    expect(bucket(c, TN, 'prepared').onlyInParts).toEqual([`prepared:notes:${TN}:rut:99:full`])
    expect(c.differences).toBe(2)
    const text = formatComparison(c, 1)
    expect(text).toContain(`${TN} prepared, only in the whole pack (1):`)
    expect(text).toContain(dropped)
  }, 60_000)

  test('a part file missing, or not what its list entry says, is reported', async () => {
    const copy = copyOfBuild()
    const ruth = copy.list.parts.find((p) => p.kind === 'book' && p.resource === GLT && p.book === 'rut')!
    rmSync(join(copy.dir, partPath(ruth.sha256)))
    const jonah = copy.list.parts.find((p) => p.kind === 'book' && p.resource === GLT && p.book === 'jon')!
    jonah.rows += 1
    writeFileSync(copy.listFile, serializePartsList(copy.list))
    const c = await compare(copy.dir)
    expect(c.partFiles.map((p) => p.problem).sort()).toEqual([`${jonah.rows - 1} rows, the list says ${jonah.rows}`, 'missing'])
    // Ruth's rows of the text are gone from the parts with its file.
    expect(bucket(c, GLT, 'sot').onlyInWhole.every((k) => k.includes(':rut'))).toBe(true)
    expect(bucket(c, GLT, 'sot').onlyInWhole.length).toBeGreaterThan(0)
  }, 60_000)

  test('a catalog row that differs from the whole pack is reported with the fields that differ', async () => {
    const copy = copyOfBuild()
    const tn = copy.list.resources.find((r) => r.key === TN)!
    ;(tn.metadata as { title: string }).title = 'Otro título'
    writeFileSync(copy.listFile, serializePartsList(copy.list))
    const c = await compare(copy.dir)
    expect(c.resources).toEqual([{ resource: TN, problem: 'catalog row differs at title' }])
  }, 60_000)
})
