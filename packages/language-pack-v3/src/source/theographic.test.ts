import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTheographic } from './theographic'
import { verseId } from '../ids'

const FIXTURE = join(import.meta.dir, '../../spec/tests/data/topics/theographic-subset')
const load = (dir: string) => ({
  events: readFileSync(join(dir, 'events.json'), 'utf8'),
  verses: readFileSync(join(dir, 'verses.json'), 'utf8'),
  people: readFileSync(join(dir, 'people.json'), 'utf8'),
  places: readFileSync(join(dir, 'places.json'), 'utf8'),
})

describe('parseTheographic (fixture)', () => {
  const issues: string[] = []
  const events = parseTheographic(load(FIXTURE), issues)
  const byNumber = (n: number) => events.find((e) => e.eventID === n)!

  test('reads the events without issues', () => {
    expect(issues).toEqual([])
    expect(events.map((e) => e.eventID)).toEqual([1, 71, 73, 74, 122, 125])
  })

  test('event 125 gives its id and its verses in the original numbering', () => {
    const e = byNumber(125)
    expect(e.id).toBe('ev:exodus-from-egypt')
    expect(e.title).toBe('Exodus from Egypt')
    expect(e.verses).toContain(verseId('exo', 12, 40))
    expect(e.verses).toContain(verseId('exo', 6, 7))
    expect(byNumber(1).verses).toContain(verseId('gen', 1, 1))
  })

  test('partOf and predecessor resolve to event numbers', () => {
    expect(byNumber(125).predecessor).toEqual([122])
    expect(byNumber(73).partOf).toEqual([74])
    expect(byNumber(73).predecessor).toEqual([71])
    expect(byNumber(1).partOf).toEqual([])
  })

  test('participants and places carry the names and the verses of the event', () => {
    const e = byNumber(73)
    expect(e.participants.map((p) => p.name)).toContain('Abraham')
    for (const p of e.participants) for (const v of p.verses) expect(e.verses).toContain(v)
    expect(e.participants.some((p) => p.verses.length > 0)).toBe(true)
    expect(e.places.length).toBe(1)
  })

  test('clashing titles take -2, -3 in the order of eventID; bad data goes to issues', () => {
    const rec = (n: number, t: string, extra = {}) => ({ id: `r${n}`, fields: { title: t, eventID: n, ...extra } })
    const bad: string[] = []
    const out = parseTheographic(
      {
        events: JSON.stringify([rec(5, 'The Flood'), rec(2, 'The flood', { verses: ['v1', 'v2'] })]),
        verses: JSON.stringify([
          { id: 'v1', fields: { osisRef: 'Gen.7.1' } },
          { id: 'v2', fields: { osisRef: 'Xxx.1.1' } },
        ]),
        people: '[]',
        places: '[]',
      },
      bad,
    )
    expect(out.map((e) => e.id)).toEqual(['ev:the-flood', 'ev:the-flood-2'])
    expect(out[0].verses).toEqual([verseId('gen', 7, 1)])
    expect(bad.length).toBe(2)
  })

  test('the result keeps nothing of the forbidden fields', () => {
    const forbidden = /startDate|duration|"lag|dictText|dictionaryText|birthYear|deathYear|eastons|Easton/
    expect(JSON.stringify(events)).not.toMatch(forbidden)
    for (const text of Object.values(load(FIXTURE))) expect(text).not.toMatch(forbidden)
  })
})

const SOURCES = process.env.LP3_SOURCES
const REAL = SOURCES === undefined ? '' : join(SOURCES, 'theographic')
const HAVE = SOURCES !== undefined && existsSync(REAL)
if (!HAVE) console.log('theographic real-source test skipped: LP3_SOURCES is unset or has no theographic folder')
describe.skipIf(!HAVE)('parseTheographic (real source)', () => {
  test('reads all the events', () => {
    const issues: string[] = []
    const events = parseTheographic(load(REAL), issues)
    console.log(`theographic: ${events.length} events, ${issues.length} issues`)
    expect(events.length).toBeGreaterThan(400)
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length)
    expect(events.find((e) => e.eventID === 125)?.id).toBe('ev:exodus-from-egypt')
  })
})
