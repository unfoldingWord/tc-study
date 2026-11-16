/**
 * The titles of the Door43 `unfoldingWord/en_ta` articles, pinned to a release tag, for the TA map of `aquiferHelps.ts` (`buildTaMap`).
 *
 *   bun packages/resource-pipeline/cli/fetch-en-ta-titles.ts --out <file.json> [--tag v91]
 *
 * Reads the git tree of the tag (`?recursive=1`, paged), then each `{manual}/{slug}/title.md` from raw, and writes
 * `{ repo, tag, titles: { "<title>": "ta:<manual>/<slug>" }, ambiguous: { "<title>": ["ta:…", …] } }`. The slug is lowercase (`spec/ids.md`).
 * A title two articles share keeps the first id (in path order) in `titles` and lists all of them in `ambiguous`. The default tag is `v91`, the
 * release the Aquifer UWTranslationManual was cut from (Nov 2026); `v91` is also the latest release at that date. Exit 0 when written, 1 on a
 * failed download, 2 for bad arguments.
 */
const BASE = 'https://git.door43.org'
const REPO = 'unfoldingWord/en_ta'
const MANUALS = ['translate', 'checking', 'process', 'intro']

type Io = { log: (line: string) => void; error: (line: string) => void }
export type TitlesFile = { repo: string; tag: string; titles: Record<string, string>; ambiguous: Record<string, string[]> }

async function getJson(fetcher: typeof fetch, url: string): Promise<any> {
  const response = await fetcher(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

/** The `{manual}/{slug}` of every `title.md` in the tree of `tag`, in path order. */
export async function listTitlePaths(tag: string, fetcher: typeof fetch = fetch, base = BASE): Promise<string[]> {
  const paths: string[] = []
  for (let page = 1; ; page++) {
    const tree = await getJson(fetcher, `${base}/api/v1/repos/${REPO}/git/trees/${encodeURIComponent(tag)}?recursive=1&per_page=10000&page=${page}`)
    for (const entry of tree.tree ?? []) {
      const match = entry.type === 'blob' ? /^([^/]+)\/([^/]+)\/title\.md$/.exec(entry.path) : null
      if (match !== null && MANUALS.includes(match[1])) paths.push(`${match[1]}/${match[2]}`)
    }
    if (!tree.truncated || (tree.tree ?? []).length === 0) break
  }
  return [...new Set(paths)].sort()
}

export async function fetchEnTaTitles(tag: string, fetcher: typeof fetch = fetch, base = BASE): Promise<TitlesFile> {
  const paths = await listTitlePaths(tag, fetcher, base)
  const found: [string, string][] = []
  for (let i = 0; i < paths.length; i += 16) {
    const batch = paths.slice(i, i + 16)
    const texts = await Promise.all(
      batch.map(async (path) => {
        const url = `${base}/${REPO}/raw/tag/${encodeURIComponent(tag)}/${path}/title.md`
        const response = await fetcher(url)
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
        return (await response.text()).trim()
      }),
    )
    batch.forEach((path, j) => found.push([texts[j], `ta:${path.toLowerCase()}`]))
  }
  const titles: Record<string, string> = {}
  const all = new Map<string, string[]>()
  for (const [title, id] of found) {
    if (title === '') continue
    all.set(title, [...(all.get(title) ?? []), id])
    if (!(title in titles)) titles[title] = id
  }
  const ambiguous = Object.fromEntries([...all].filter(([, ids]) => ids.length > 1))
  return { repo: REPO, tag, titles, ambiguous }
}

export async function main(args: string[], io: Io, fetcher: typeof fetch = fetch): Promise<number> {
  const opts: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]
    if (!['--out', '--tag'].includes(flag) || args[i + 1] === undefined || args[i + 1].startsWith('--')) {
      io.error(`bad argument ${flag}\nUsage: fetch-en-ta-titles --out <file.json> [--tag v91]`)
      return 2
    }
    opts[flag.slice(2)] = args[i + 1]
  }
  if (!opts.out) {
    io.error('--out is required\nUsage: fetch-en-ta-titles --out <file.json> [--tag v91]')
    return 2
  }
  try {
    const file = await fetchEnTaTitles(opts.tag ?? 'v91', fetcher)
    await Bun.write(opts.out, JSON.stringify(file, null, 1) + '\n')
    io.log(JSON.stringify({ tag: file.tag, titles: Object.keys(file.titles).length, ambiguous: Object.keys(file.ambiguous).length }))
    return 0
  } catch (error) {
    io.error(String((error as Error).message))
    return 1
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2), { log: console.log, error: console.error }))
