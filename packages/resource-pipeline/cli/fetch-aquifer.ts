/**
 * Download one language of a BibleAquifer repository, pinned to a commit, for `build-patch-v3`.
 *
 *   bun packages/resource-pipeline/cli/fetch-aquifer.ts --repo <Repo> --lang <iso3> --out <dir> [--commit <sha>] [--books gen,exo,...]
 *
 * Without `--commit` it takes the head of the default branch (GITHUB_TOKEN is used as a Bearer token when set). Writes <out>/json/*.content.json,
 * <out>/resource_metadata.json and <out>/manifest.json. Prints one JSON line (the manifest). Exit 0 when written, 1 when a download fails or a size
 * differs from the git tree, 2 for bad arguments.
 */
import { fetchAquifer, type Bases } from '../src/aquifer/fetchAquifer'

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
  try {
    const manifest = await fetchAquifer({
      repo: opts.repo,
      lang: opts.lang,
      out: opts.out,
      commit: opts.commit,
      books: opts.books?.split(',').map((b) => b.trim().toLowerCase()),
      bases,
      token: token || undefined,
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
