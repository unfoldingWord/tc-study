/**
 * Write a language's build state to the packs bucket (status/<compat>/<lang>.json), for the workflow around
 * publish-language. See packages/resource-pipeline/src/language/packsStatus.ts.
 *
 *   bun packages/resource-pipeline/cli/packs-status.ts --lang es-419 --state running|ok|failed --run <url> [--compat <key>] [--parts]
 *   bun packages/resource-pipeline/cli/packs-status.ts --print-compat [--parts]
 *
 * --compat writes under another compat than the one this code builds (the workflow uses it to mark a dispatch for a
 * compat it cannot build as failed). --print-compat prints the compat this code builds, to stdout, and needs no bucket.
 * --parts: the compat of parts (PARTS_FORMAT_VERSION, f2.0-…) instead of whole packs' (f1.1-…), so a parts run writes
 * status/f2.0-…/<lang>.json and never touches the status the Worker reads.
 *
 * The bucket: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, all four. Exits 0 when written, 1 when
 * the write fails, 2 on bad arguments.
 */

import { compatKeyOf, PACK_FORMAT_VERSION, PARTS_FORMAT_VERSION } from '@bt-synergy/language-pack'
import { PACK_VERSIONS } from '../src/language/packVersions'
import { isCompatKey, packsStatus, type PackState } from '../src/language/packsStatus'
import { isLanguageCode, oneLine, r2Bucket } from '../src/language/publishLanguage'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function usage(why: string): never {
  console.error(why)
  console.error('Uso: packs-status --lang <código> --state running|ok|failed --run <url> [--compat <clave>] [--parts] | --print-compat [--parts]')
  process.exit(2)
}

const builtCompat = compatKeyOf(process.argv.includes('--parts') ? PARTS_FORMAT_VERSION : PACK_FORMAT_VERSION, PACK_VERSIONS)

if (process.argv.includes('--print-compat')) {
  console.log(builtCompat)
  process.exit(0)
}

const language = arg('lang')
if (!language || !isLanguageCode(language)) usage(`--lang no es un código de idioma: ${JSON.stringify(language ?? null)}`)
const state = arg('state')
if (state !== 'running' && state !== 'ok' && state !== 'failed') usage(`--state debe ser running, ok o failed: ${JSON.stringify(state ?? null)}`)
const run = arg('run')
if (!run) usage('Falta --run')
const compatArg = arg('compat')
if (compatArg !== undefined && !isCompatKey(compatArg)) usage('--compat no es una clave de compatibilidad')

const { R2_ENDPOINT: endpoint, R2_BUCKET: bucket, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = process.env
if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  usage('Faltan R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID o R2_SECRET_ACCESS_KEY')
}

try {
  const compat = compatArg ?? builtCompat
  await packsStatus({
    bucket: r2Bucket({ endpoint, bucket, accessKeyId, secretAccessKey, log: (line) => console.error(line) }),
    compat,
    language,
    state: state as PackState,
    run,
  })
  console.error(`status/${compat}/${language}.json: ${state}`)
  process.exit(0)
} catch (e) {
  console.error(oneLine(`packs-status ${language}: ${e instanceof Error ? e.message : String(e)}`))
  process.exit(1)
}
