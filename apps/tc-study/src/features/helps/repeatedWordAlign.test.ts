/**
 * Warm-align positions on a verse where a target word repeats across groups.
 *
 * es-419 GLT v42 Titus 1:1 has six «de», two «de Dios» groups (Θεοῦ ×2) and
 * two «y» groups. The helps-align row for TN fyf8 (τῆς κατ’ εὐσέβειαν) marked
 * position 20 («de la verdad») instead of 25 («de acuerdo») because the second
 * «de Dios» group was deduped away before ids were attached to tokens.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { semanticIdFor } from '@bt-synergy/scripture-loader'
import { USJProcessor } from '@bt-synergy/usj-processor'
import { extractPreparedBroadcastTokens } from '../scripture/extractPreparedBroadcastTokens'
import { prepareViewModel } from '../scripture/scripturePrepCore'
import { buildFullChapter } from '../scripture/scripturePreparer'
import { findAlignedTokens } from './findAlignedTokens'
import { compactAlignRow } from './reconstructAlignFromPositions'

const FIXTURE = join(
  import.meta.dir,
  '../../../../../packages/usj-processor/fixtures/es-419_glt_TIT1-1.usfm'
)

async function preparedTokens() {
  const usfm = readFileSync(FIXTURE, 'utf8')
  const { viewModel } = await new USJProcessor().processUSFM(usfm, 'tit', 'Tito')
  const full = buildFullChapter(prepareViewModel(viewModel), 1)
  return extractPreparedBroadcastTokens('tit', 1, full, 1, 999)
}

function alignRow(tokens: Awaited<ReturnType<typeof preparedTokens>>, olWords: string[]) {
  const ids = olWords.map((w) => semanticIdFor('tit 1:1', w, 1))
  const aligned = findAlignedTokens(tokens as never, ids, 'tit', 1, 1)
  return compactAlignRow({ alignedTokens: aligned, method: 1 })
}

describe('helps-align positions with repeated target words (es-419 Titus 1:1)', () => {
  test('fyf8 τῆς κατ’ εὐσέβειαν marks «de acuerdo», not «de la verdad»', async () => {
    const tokens = await preparedTokens()
    expect(tokens[20]?.text).toBe('de')
    expect(tokens[25]?.text).toBe('de')
    expect(alignRow(tokens, ['τῆς', 'κατ’', 'εὐσέβειαν'])).toEqual({
      p: [23, 24, 25, 26, 27, 28, 29],
      m: 1,
      t: ['que', 'es', 'de', 'acuerdo', 'con', 'la', 'piedad'],
    })
  })

  test('ἀληθείας marks «de la verdad», not the «de» of the second «de Dios»', async () => {
    const tokens = await preparedTokens()
    expect(alignRow(tokens, ['ἀληθείας'])).toEqual({
      p: [20, 21, 22],
      m: 1,
      t: ['de', 'la', 'verdad'],
    })
  })
})
