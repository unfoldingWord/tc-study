/**
 * Node-only helper of the tests: builds the common topics of the phase 0 sample (`LP3_SAMPLE`) from the sources of part B
 * (`LP3_SOURCES`), in memory, and gives them as a {@link MapSet}. It lives next to the tests and is not part of the package.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCommon, BUILDER } from '../build/language'
import { partsSource } from '../node/partsSource'
import type { XtopicsCore, XtopicsPart } from '../model'
import { xtopicsView } from '../read/topics'
import type { MapSet } from './maps'

export const SAMPLE = process.env.LP3_SAMPLE
export const SOURCES = process.env.LP3_SOURCES

export async function sampleTopics(sample: string, sources: string): Promise<{ maps: MapSet; report: string[] }> {
  const obs = new Map<number, string>()
  const dir = join(sources, 'en_obs', 'obs-repo', 'content')
  for (const f of readdirSync(dir)) if (/^\d\d\.md$/.test(f)) obs.set(Number(f.slice(0, 2)), readFileSync(join(dir, f), 'utf8'))
  const theo = (name: string): string => readFileSync(join(sources, 'theographic', `${name}.json`), 'utf8')
  const tipnrDir = join(sources, 'tipnr')
  const tipnr = readFileSync(join(tipnrDir, readdirSync(tipnrDir).find((f) => f.endsWith('.txt'))!), 'utf8')
  // The sample's English list names parts the sample does not carry (alignments of most books): keep the ones it has.
  const list = JSON.parse(readFileSync(join(sample, 'en', 'list.json'), 'utf8')) as { parts: { sha256: string }[] }
  list.parts = list.parts.filter((p) => existsSync(join(sample, 'parts', `${p.sha256}.part.gz`)))
  const kept = join(mkdtempSync(join(tmpdir(), 'lp3-p13-')), 'list.json')
  writeFileSync(kept, JSON.stringify(list))
  const source = await partsSource({ list: kept, partsDir: join(sample, 'parts'), originals: join(sample, 'originals', 'list.json') })
  const about = { format: '3.0' as const, publisher: 'unfoldingWord', origin: 'published' as const, revision: 1, built: '2026-11-03T10:00:00Z', builder: BUILDER }
  const built = await buildCommon({
    source,
    about,
    mapLang: 'en',
    topics: { tipnr, theographic: { events: theo('events'), verses: theo('verses'), people: theo('people'), places: theo('places') }, obs },
  })
  let core: XtopicsCore | undefined
  const parts = new Map<string, XtopicsPart>()
  for (const s of built.segments) {
    if (s.seg.h.class !== 'xtopics') continue
    const view = xtopicsView(s.seg)
    if (view.part === 'core') core = view as XtopicsCore
    else parts.set(view.part, view as XtopicsPart)
  }
  if (core === undefined) throw new Error('the build has no xtopics core')
  return { maps: { xtopics: { core, parts }, revision: 1 }, report: built.report }
}
