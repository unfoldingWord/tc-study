/** The committed complement files of a language (`complements/<lang>.*.json`) as bytes, for Node callers of `createAssistant`. Eval only. */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'complements')

export function committedComplements(lang: string): Uint8Array[] {
  return readdirSync(DIR)
    .filter((f) => f.startsWith(`${lang}.`) && f.endsWith('.json'))
    .sort()
    .map((f) => new Uint8Array(readFileSync(join(DIR, f))))
}
