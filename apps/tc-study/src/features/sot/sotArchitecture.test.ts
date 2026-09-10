import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = (rel: string) => readFileSync(join(import.meta.dir, rel), 'utf8')

describe('SoT architecture wiring', () => {
  test('warm jobs stay local-only — no DCS fetch', () => {
    const jobs = src('../warm/warmJobs.ts')
    expect(jobs).toContain('getLocalSoT')
    expect(jobs).not.toContain('allowDcs: true')
    expect(jobs).not.toContain('fetchDcs')
    expect(jobs).not.toContain('fetchDcsViaLoader')
  })

  test('lane 1 scripture/helps resolve through getSoT', () => {
    const content = src('../../components/resources/ScriptureViewer/hooks/useContent.ts')
    const notes = src(
      '../../components/resources/TranslationNotesViewer/hooks/useTranslationNotesContent.ts'
    )
    const ol = src('../helps/olLoadCache.ts')
    expect(content).toContain('resolveLane1ScriptureViewModel')
    expect(notes).toContain('resolveLane1SoT')
    expect(ol).toContain('getSoT')
    expect(ol).toContain('allowDcs')
  })

  test('main-thread viewers do not import batchAlignLinks / prepareFull', () => {
    const content = src('../../components/resources/ScriptureViewer/hooks/useContent.ts')
    const helps = src('../../components/resources/CombinedHelpsViewer/index.tsx')
    expect(content).not.toContain('batchAlignLinks')
    expect(content).not.toContain('prepareFull')
    expect(helps).not.toContain('batchAlignLinks')
    expect(helps).not.toContain('prepareFull')
    expect(helps).not.toContain("from '../../../features/prepare/runPrepare'")
  })
})
