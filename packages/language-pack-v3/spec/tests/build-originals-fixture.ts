/**
 * Builds `data/originals-tit.langpack.zip`: a format 1.1 pack of the originals with Titus of the UGNT, shaped like the
 * `originals.langpack.zip` that `prepare-language` writes (`kind: "originals"`, resources with `role: "original"`, `rows`
 * counts, and no `books`). The rows are those of the UGNT part in `data/parts/` (source rows and prepared rows of Titus);
 * the real pack also has index rows, which the parts do not carry and the bridge does not need.
 *
 * Run: `bun spec/tests/build-originals-fixture.ts`. The zip is deterministic (fixed dates), so a second run changes nothing.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { partsSource } from '../../src/node/partsSource'

const DATA = join(import.meta.dir, 'data')
const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const FIXED = new Date('2026-10-29T17:59:54.331Z')
const LAYERS = ['sot', 'prepared'] as const

export async function buildOriginalsFixture(): Promise<Uint8Array> {
  const source = await partsSource({ list: join(DATA, 'originals', 'list.json'), partsDir: join(DATA, 'parts') })
  const [ref] = (await source.resources('originals')).filter((r) => r.key === UGNT)
  if (!ref) throw new Error(`The test data has no ${UGNT}`)
  const zip = new JSZip()
  const counts: Record<string, number> = { receipt: 1 }
  const put = (path: string, text: string): void => void zip.file(path, text, { date: FIXED })
  const name = encodeURIComponent(UGNT).replace(/%/g, '~')
  put(`rows/receipt/${name}.jsonl`, JSON.stringify({ key: `resource:${UGNT}`, entry: { content: { downloaded: true }, metadata: { downloadComplete: true, releaseStamp: ref.stamp } } }) + '\n')
  for (const layer of LAYERS) {
    const rows: string[] = []
    for await (const row of source.rows({ lang: 'originals', resource: UGNT, layer })) rows.push(JSON.stringify({ key: row.key, entry: row.value }))
    counts[layer] = rows.length
    put(`rows/${layer}/${name}.jsonl`, rows.join('\n') + '\n')
  }
  const manifest = {
    format: 'bt-synergy-language-pack',
    formatVersion: '1.1.0',
    language: 'es-419',
    kind: 'originals',
    createdAt: FIXED.toISOString(),
    app: { name: 'resource-pipeline cli' },
    layers: ['receipt', ...LAYERS],
    versions: { sot: { usjProcessing: '2.3.0-usj' }, prepared: { scripturePrepare: 6000230 } },
    resources: [{ key: UGNT, role: 'original', stamp: ref.stamp, subject: ref.kind, title: ref.title, rows: { receipt: counts.receipt, sot: counts.sot, prepared: counts.prepared } }],
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2) + '\n', { date: FIXED })
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } })
}

if (import.meta.main) {
  const bytes = await buildOriginalsFixture()
  writeFileSync(join(DATA, 'originals-tit.langpack.zip'), bytes)
  console.log(`originals-tit.langpack.zip: ${bytes.length} bytes`)
}
