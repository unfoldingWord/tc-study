/**
 * Write a language's build state to the packs bucket (status/<compat>/<lang>.json), for the workflow around
 * publish-language. See packages/resource-pipeline/src/language/packsStatus.ts.
 *
 *   bun packages/resource-pipeline/cli/packs-status.ts --lang es-419 --state running|ok|failed --run <url>
 *
 * The bucket: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, all four. Exits 0 when written, 1 when
 * the write fails, 2 on bad arguments.
 */

import { compatKeyOf, PACK_FORMAT_VERSION } from '@bt-synergy/language-pack'
import { PACK_VERSIONS } from '../src/language/packVersions'
import { packsStatus, type PackState } from '../src/language/packsStatus'
import { isLanguageCode, oneLine, r2Bucket } from '../src/language/publishLanguage'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function usage(why: string): never {
  console.error(why)
  console.error('Uso: packs-status --lang <código> --state running|ok|failed --run <url>')
  process.exit(2)
}

const language = arg('lang')
if (!language || !isLanguageCode(language)) usage(`--lang no es un código de idioma: ${JSON.stringify(language ?? null)}`)
const state = arg('state')
if (state !== 'running' && state !== 'ok' && state !== 'failed') usage(`--state debe ser running, ok o failed: ${JSON.stringify(state ?? null)}`)
const run = arg('run')
if (!run) usage('Falta --run')

const { R2_ENDPOINT: endpoint, R2_BUCKET: bucket, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = process.env
if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  usage('Faltan R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID o R2_SECRET_ACCESS_KEY')
}

try {
  const compat = compatKeyOf(PACK_FORMAT_VERSION, PACK_VERSIONS)
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
