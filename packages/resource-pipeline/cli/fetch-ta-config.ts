/**
 * Download the `config.yaml` of each tA manual that `build-v3 --ta-config` reads (the `related` of the tA articles), from the release
 * zip the parts list names for each Translation Academy resource, and write them under <out> (`src/language/taConfig.ts`).
 *
 *   bun packages/resource-pipeline/cli/fetch-ta-config.ts --list <lang list.json> --out <dir>
 *
 * `--out` must not exist or be empty (nothing is deleted); a failed run leaves it as it was. Exit 0 when written (one log line per resource), 1 when a release cannot be fetched or read, or the list
 * names a release other than the one of the stamp, 2 for bad arguments. A list with no tA resource writes an empty folder.
 */
import { fetchTaConfigs } from '../src/language/taConfig'

type Io = { log: (line: string) => void; error: (line: string) => void }

export const USAGE = 'Usage: fetch-ta-config --list <lang list.json> --out <dir>'

export async function main(args: string[], io: Io, fetchFn: typeof fetch = fetch): Promise<number> {
  const opts: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]
    const value = args[i + 1]
    if (!['--list', '--out'].includes(flag) || value === undefined || value.startsWith('--') || opts[flag.slice(2)] !== undefined) {
      io.error(`bad argument ${flag}\n${USAGE}`)
      return 2
    }
    opts[flag.slice(2)] = value
  }
  if (opts.list === undefined || opts.out === undefined) {
    io.error(`--list and --out are required\n${USAGE}`)
    return 2
  }
  // Source data, never uploaded: not under the folder publish-v3 uploads.
  if (opts.out.split(/[\\/]/).includes('v3-out')) {
    io.error(`--out ${opts.out} is under a folder named v3-out, which publish-v3 uploads`)
    return 2
  }
  try {
    const written = await fetchTaConfigs({ listFile: opts.list, out: opts.out, fetchFn, log: io.log })
    io.log(`${written.size} tA resource(s) written under ${opts.out}`)
    return 0
  } catch (e) {
    io.error(`fetch-ta-config: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}

// `main` is Bun's; this package's type check has no Bun types.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  process.exit(await main(process.argv.slice(2), { log: (l) => console.log(l), error: (l) => console.error(l) }))
}
