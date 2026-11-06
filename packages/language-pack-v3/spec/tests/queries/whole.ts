/**
 * The answers of the `phrase` queries of a build, as JSON, to compare with `answers.py --whole`:
 *     bun spec/tests/queries/whole.ts <en out dir> <es-419 out dir> <answers.py --whole file>
 * Prints one line per query: `ok` or the two answers. Exit 1 when one differs.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { phrase } from '../../../src/query/aligned'
import { canonicalJson, type Json, sortKeys } from '../../../src/read/output'
import { loadAlignedSet } from './run'

const [enOut, esOut, file] = process.argv.slice(2)
const independent = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
let bad = 0
for (const name of readdirSync(import.meta.dir).filter((f) => f.startsWith('phrase-') && f.endsWith('.json')).sort()) {
  const q = JSON.parse(readFileSync(join(import.meta.dir, name), 'utf8')).query as { lang: string; text: string }
  const set = await loadAlignedSet(q.lang === 'en' ? enOut : esOut, q.lang)
  if (set === undefined) throw new Error(`${name}: no aligned index of ${q.lang}`)
  const mine = canonicalJson(sortKeys(phrase(set, q.lang, q.text) as Json))
  const theirs = canonicalJson(sortKeys(independent[name.replace(/\.json$/, '')] as Json))
  if (mine === theirs) console.log(`${name.replace(/\.json$/, '')}: whole ok ${mine}`)
  else {
    bad++
    console.log(`${name.replace(/\.json$/, '')}: MISMATCH builder ${mine} / answers.py ${theirs}`)
  }
}
process.exit(bad === 0 ? 0 : 1)
