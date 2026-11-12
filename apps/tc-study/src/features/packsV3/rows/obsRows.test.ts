import { describe, expect, it } from 'bun:test'
import { memoryStore } from '@bt-synergy/language-pack-client'
import { createPacksV3 } from '../client'
import { OBS_DOOR43, OBS_RES, buildSample, fakeFetch } from '../testing/sample'
import { obsRows } from './obsRows'
import type { Row } from './scriptureRows'

let cached: Promise<Row[]> | undefined
function rows(): Promise<Row[]> {
  cached ??= (async () => {
    const sample = await buildSample()
    const client = await createPacksV3({ fetch: fakeFetch(sample), store: memoryStore(), trustedKeys: { [sample.keyId]: sample.publicKey } })
    await client.install('es-419', { units: ['obs'] })
    return obsRows((await client.open('es-419'))!)
  })()
  return cached
}

const withoutStamps = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(withoutStamps)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'timestamp' && k !== 'processingDate').map(([k, x]) => [k, withoutStamps(x)]))
  return v
}
const byKey = (list: Row[]) => new Map(list.map((r) => [r.key, withoutStamps(r.value)]))

describe('obsRows', () => {
  it('has the stories exactly as ObsLoader stored them (timestamp aside)', async () => {
    const mine = (await rows()).filter((r) => r.key.startsWith('obs:'))
    const theirs = (await OBS_DOOR43()).stories
    expect(mine.map((r) => r.key).sort()).toEqual([`obs:${OBS_RES.stories}:01`, `obs:${OBS_RES.stories}:02`])
    expect(byKey(mine)).toEqual(byKey(theirs))
  })

  it('has the notes and questions chapters as the loaders wrote them, and a manifest under the book key', async () => {
    const all = await rows()
    const d = await OBS_DOOR43()
    for (const [prefix, res, theirs] of [['tn', OBS_RES.notes, d.notes], ['tq', OBS_RES.questions, d.questions]] as const) {
      const mine = all.filter((r) => r.key.startsWith(`${prefix}:${res}:obs`))
      const manifest = mine.find((r) => r.key === `${prefix}:${res}:obs`)
      expect((manifest?.value as { _chunkedBook?: boolean })._chunkedBook).toBe(true)
      expect(byKey(mine.filter((r) => r !== manifest))).toEqual(byKey(theirs))
    }
  })

  it('has the word links as one row of the book, as the loader wrote it', async () => {
    const mine = (await rows()).filter((r) => r.key.startsWith('twl:'))
    expect(byKey(mine)).toEqual(byKey((await OBS_DOOR43()).links))
  })

  it('is empty for a language without OBS', async () => {
    const sample = await buildSample()
    const client = await createPacksV3({ fetch: fakeFetch(sample), store: memoryStore(), trustedKeys: { [sample.keyId]: sample.publicKey } })
    await client.install('es-419', { units: ['obs'] })
    const reader = (await client.open('es-419'))!
    expect(await obsRows({ ...reader, segments: async () => undefined })).toEqual([])
  })
})
