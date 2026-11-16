/**
 * Scores stored decisions again with the current scorer: no chain run, no packs, no network. For each language it loads
 * `eval/results/<lang>-<set>[-<suffix>].json`, applies `scoreQuestion` to each row's stored decision and top 3 piece ids against the
 * question set's expectation (matched by position, and checked by the question text), and prints the summary row.
 *   `bun eval/rescore.ts [--set test] [--suffix run2] [--lang es]`   (no suffix: run 1)
 * It shows how much of a later run's gain is the scorer and how much is the chain. Node and Bun only.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { summarize } from './run'
import { type Item, scoreQuestion } from './score'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

type Stored = Parameters<typeof summarize>[2][number] & { q: string; top3: string[] }

export function rescore(lang: string, set: string, suffix?: string) {
  const items = readFileSync(join(ROOT, 'eval/questions', `${lang}-${set}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Item)
  const file = join(ROOT, 'eval/results', `${lang}-${set}${suffix ? `-${suffix}` : ''}.json`)
  const stored = (JSON.parse(readFileSync(file, 'utf8')) as { questions: Stored[] }).questions
  if (stored.length !== items.length) throw new Error(`${file}: ${stored.length} rows for ${items.length} questions`)
  const rows = stored.map((r, i) => {
    if (r.q !== items[i]!.q) throw new Error(`${file}: row ${i} is another question`)
    return { ...r, score: scoreQuestion(items[i]!, r.decision as never, r.top3) }
  })
  return summarize(lang, set, rows)
}

if (process.argv[1]?.endsWith('rescore.ts')) {
  const arg = (k: string): string | undefined => {
    const i = process.argv.indexOf(k)
    return i < 0 ? undefined : process.argv[i + 1]
  }
  for (const lang of arg('--lang') ? [arg('--lang')!] : ['es', 'en', 'pt']) console.log(JSON.stringify(rescore(lang, arg('--set') ?? 'test', arg('--suffix'))))
}
