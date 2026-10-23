/**
 * Compare a parts build with today's whole build of the same language (a check, not shipped in packs):
 *
 *   bun packages/resource-pipeline/cli/compare-parts.ts --pack <work-a>/es-419.langpack.zip \
 *     --originals <work-a>/originals.langpack.zip --parts <work-b> [--examples 10]
 *
 * `--pack` and `--originals` come from `publish-language --no-upload` (the whole build), `--parts` is the `--work`
 * folder of `publish-language --no-upload --parts`. Prints, per resource and layer, the rows only in the whole packs,
 * only in the parts, and those whose values differ without their volatile fields; then each resource's catalog row,
 * stamp and books, and every part file against its list entry (src/language/compareParts.ts). Up to `--examples`
 * keys of each bucket are shown.
 *
 * Exits 0 when there is no difference, 1 when there is any, 2 on bad arguments.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { requireFreshBuilds } from './freshBuilds'

// readPack lives in language-pack's dist/: a stale build would read packs with older code.
requireFreshBuilds(['@bt-synergy/language-pack'])
const { compareParts, formatComparison } = await import('../src/language/compareParts')

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function usage(why: string): never {
  console.error(why)
  console.error('Usage: compare-parts --pack <lang>.langpack.zip --originals originals.langpack.zip --parts <work> [--examples N]')
  process.exit(2)
}

const pack = arg('pack')
const originals = arg('originals')
const parts = arg('parts')
if (!pack || !originals || !parts) usage('--pack, --originals and --parts are required')
for (const path of [pack, originals, parts]) if (!existsSync(path)) usage(`${path} does not exist`)
const examples = Number(arg('examples') ?? 10)
if (!Number.isInteger(examples) || examples < 0) usage(`--examples is not a whole number: ${arg('examples')}`)

try {
  const result = await compareParts({
    pack: new Uint8Array(readFileSync(pack)),
    originals: new Uint8Array(readFileSync(originals)),
    workDir: resolve(parts),
  })
  console.log(formatComparison(result, examples))
  process.exit(result.differences ? 1 : 0)
} catch (e) {
  console.error(`compare-parts: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}
