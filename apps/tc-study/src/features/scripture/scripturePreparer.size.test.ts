/**
 * Light vs full prepared JSON size compare using real ULT Titus fixture.
 * Writes artifacts under apps/tc-study/tmp/prepared-size/.
 */

import { describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { USJProcessor } from '@bt-synergy/usj-processor'
import {
  buildFullChapter,
  buildLightChapter,
  plainTextFromLightBlocks,
} from './scripturePreparer'

const FIXTURE = join(
  import.meta.dir,
  '../../../../../packages/usj-processor/fixtures/en_ult_TIT.usfm'
)
const OUT_DIR = join(import.meta.dir, '../../../tmp/prepared-size')

describe('scripturePreparer size compare (ULT Titus)', () => {
  test('TIT 3 light < full; spaces + verse markers; write JSON artifacts', async () => {
    const usfm = await Bun.file(FIXTURE).text()
    const { viewModel } = await new USJProcessor().processUSFM(usfm, 'TIT', 'Titus', {
      language: 'en',
      includeWordTokens: true,
      includeAlignments: true,
    })

    const light3 = buildLightChapter(viewModel, 3)
    const full3 = buildFullChapter(viewModel, 3)
    const lightJson = JSON.stringify(light3)
    const fullJson = JSON.stringify(full3)
    const lightBytes = lightJson.length
    const fullBytes = fullJson.length

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(join(OUT_DIR, 'tit-3.light.json'), lightJson)
    writeFileSync(join(OUT_DIR, 'tit-3.full.json'), fullJson)

    const plain = plainTextFromLightBlocks(light3.blocks)
    expect(plain).toContain('Remind them')
    expect(plain).not.toContain('Remindthem')
    expect(light3.blocks.some((b) => b.inline.some((i) => i.kind === 'verse'))).toBe(true)
    expect(lightBytes).toBeLessThan(fullBytes)

    let bookLight = 0
    let bookFull = 0
    let matchKeysTotal = 0
    let tokenCount = 0
    for (const ch of viewModel.chapters) {
      if (ch.number < 1) continue
      const light = buildLightChapter(viewModel, ch.number)
      const full = buildFullChapter(viewModel, ch.number)
      bookLight += JSON.stringify(light).length
      bookFull += JSON.stringify(full).length
      matchKeysTotal += full.matchKeys.length
      for (const b of full.blocks) {
        for (const item of b.inline) {
          if (item.kind === 'token') tokenCount += 1
        }
      }
    }

    expect(bookLight).toBeLessThan(bookFull)

    // eslint-disable-next-line no-console
    console.log(
      [
        '[scripturePreparer size]',
        `TIT 3 light=${lightBytes}B full=${fullBytes}B ratio=${(lightBytes / fullBytes).toFixed(3)}`,
        `matchKeys=${full3.matchKeys.length}`,
        `TIT book light=${bookLight}B full=${bookFull}B ratio=${(bookLight / bookFull).toFixed(3)}`,
        `tokens=${tokenCount} matchKeysTotal=${matchKeysTotal}`,
        `artifacts=${OUT_DIR}`,
      ].join(' ')
    )
  }, 60_000)
})
