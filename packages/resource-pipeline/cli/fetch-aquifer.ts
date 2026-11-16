/**
 * Download one language of a BibleAquifer repository, pinned to a commit, for `build-patch-v3` (Task 4), which reads <out>/json/.
 *
 *   bun packages/resource-pipeline/cli/fetch-aquifer.ts --repo <Repo> --lang <iso3> --out <dir> [--commit <sha>] [--books gen,exo,...]
 *
 * Without `--commit` it takes the head of the default branch (GITHUB_TOKEN is used as a Bearer token when set); a given `--commit` must be a full
 * 40-hex sha. Writes <out>/json/*.content.json (<out>/json is emptied first), <out>/resource_metadata.json and <out>/manifest.json. The manifest
 * `path` is the path in the repo (`hin/json/NN.content.json`); the file is written flat as <out>/json/NN.content.json. `metadata.sha256` is that
 * of the 16 KB head of metadata.json that `resource_metadata` was cut from. With `--books`, 3-digit files (no book code) are skipped, with a note
 * on stderr. Prints one JSON line (the manifest). Exit 0 when written, 1 when a download fails, a size differs from the git tree or the tree is
 * truncated, 2 for bad arguments (also a short sha or an unknown book code).
 */
import { BOOKS, SHA40, fetchAquifer, type Bases } from '../src/aquifer/fetchAquifer'

type Io = { log: (line: string) => void; error: (line: string) => void }

export const USAGE = 'Usage: fetch-aquifer --repo <Repo> --lang <iso3> --out <dir> [--commit <sha>] [--books gen,exo,...]'

export async function main(args: string[], io: Io, bases?: Bases, token: string | undefined = process.env.GITHUB_TOKEN): Promise<number> {
  const opts: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]
    const value = args[i + 1]
    if (!['--repo', '--lang', '--out', '--commit', '--books'].includes(flag) || value === undefined || value.startsWith('--') || opts[flag.slice(2)] !== undefined) {
      io.error(`bad argument ${flag}\n${USAGE}`)
      return 2
    }
    opts[flag.slice(2)] = value
  }
  if (!opts.repo || !opts.lang || !opts.out) {
    io.error(`--repo, --lang and --out are required\n${USAGE}`)
    return 2
  }
  if (opts.commit !== undefined && !SHA40.test(opts.commit)) {
    io.error(`--commit must be a full 40-hex sha\n${USAGE}`)
    return 2
  }
  const books = opts.books?.split(',').map((b) => b.trim().toLowerCase())
  const unknown = books?.filter((b) => !BOOKS.includes(b))
  if (unknown?.length) {
    io.error(`unknown book code(s) in --books: ${unknown.join(', ')}\n${USAGE}`)
    return 2
  }
  try {
    const manifest = await fetchAquifer({
      repo: opts.repo,
      lang: opts.lang,
      out: opts.out,
      commit: opts.commit,
      books,
      bases,
      token: token || undefined,
      warn: io.error,
    })
    io.log(JSON.stringify(manifest))
    return 0
  } catch (e) {
    io.error(`fetch-aquifer: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  process.exit(await main(process.argv.slice(2), { log: (l) => console.log(l), error: (l) => console.error(l) }))
}
