/**
 * A tiny language for the parts tests, served by a fake Door43: ULT- and UST-like texts (the ULT with a front matter
 * book, FRT, outside the canon), TN (linking a TA article), TQ, TWL, TW, TA and two Open Bible Stories (no OBS helps)
 * of es-419 with Ruth and Jonah, the
 * Hebrew of both and the Greek of Titus, a Hebrew lexicon behind a fake HTTP; and today's whole build of it, through
 * prepareAndPack itself. Every repository has a `manifest.yaml`, and Door43's tree of each is the true one unless a
 * test says otherwise. The repositories, the catalog and the lexicon can be changed for a test (`fakeDoor43`'s
 * options, `discoverWith`, `lexiconFetchOf`).
 *
 * Kept apart from the tests, so each test file builds it without registering another file's tests.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { storedZip } from '../download/zipFixture'
import type { DiscoverInto } from './buildLanguageParts'
import { prepareAndPack } from './prepareAndPack'

export const MACULA_STAMP = { version: 'abc1234567', publishedAt: '2026-08-01T00:00:00.000Z' }

export const LANG = 'es-419'
export const GLT = 'test_gl/es-419/glt'
export const GST = 'test_gl/es-419/gst'
export const TN = 'test_gl/es-419/tn'
export const TWL = 'test_gl/es-419/twl'
export const TW = 'test_gl/es-419/tw'
export const TQ = 'test_gl/es-419/tq'
export const TA = 'test_gl/es-419/ta'
export const UHL = 'test_gl/es-419/uhl'
export const OBS = 'test_gl/es-419/obs'
export const UHB = 'unfoldingWord/hbo/uhb'
export const UGNT = 'unfoldingWord/el-x-koine/ugnt'

const HEBREW = (book: string) =>
  `\\id ${book}\n\\c 1\n\\p\n\\v 1 \\w וַיְהִי|lemma="הָיָה" strong="H1961" x-morph="He,Vqw3ms"\\w* \\w בִּימֵי|lemma="יוֹם" strong="b:H3117" x-morph="He,R:Ncmpc"\\w*\n\\c 2\n\\p\n\\v 1 \\w וּלְנָעֳמִי|lemma="נָעֳמִי" strong="c:l:H5281" x-morph="He,C:R:Np"\\w*\n`
const GREEK = `\\id TIT\n\\c 1\n\\p\n\\v 1 \\w Παῦλος|lemma="Παῦλος" strong="G39720" x-morph="Gr,N,,,,,NMS,"\\w*\n`
const aligned = (book: string, words: [string, string]) =>
  `\\id ${book}\n\\c 1\n\\p\n\\v 1 \\zaln-s |x-strong="H1961" x-lemma="הָיָה" x-morph="He,Vqw3ms" x-occurrence="1" x-occurrences="1" x-content="וַיְהִי"\\*\\w ${words[0]}|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\* \\zaln-s |x-strong="b:H3117" x-lemma="יוֹם" x-morph="He,R:Ncmpc" x-occurrence="1" x-occurrences="1" x-content="בִּימֵי"\\*\\w ${words[1]}|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*\n\\c 2\n\\p\n\\v 1 \\zaln-s |x-strong="c:l:H5281" x-lemma="נָעֳמִי" x-morph="He,C:R:Np" x-occurrence="1" x-occurrences="1" x-content="וּלְנָעֳמִי"\\*\\w Noemí|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*\n`
const TN_HEADER = 'Reference\tID\tTags\tSupportReference\tQuote\tOccurrence\tNote\n'
const TWL_HEADER = 'Reference\tID\tTags\tOrigWords\tOccurrence\tTWLink\n'
const TQ_HEADER = 'Reference\tID\tTags\tQuote\tOccurrence\tQuestion\tResponse\n'
const FRONT = '\\id FRT\n\\h Prefacio\n\\is Introducción\n\\ip Esta traducción es literal.\n'

// The TW loader trusts a catalog row only with more than ten articles; fewer, it asks Door43 for them.
const EXTRA_TW = ['faith', 'grace', 'love', 'sin', 'holy', 'lord', 'spirit', 'word']

// The same rule for TA; the first is the article TN links to.
const TA_ARTICLES = ['figs-idiom', 'figs-metaphor', 'figs-simile', 'figs-irony', 'figs-hyperbole', 'figs-litotes', 'figs-merism', 'figs-pastforfuture', 'figs-rquestion', 'figs-synecdoche', 'figs-metonymy']

/** Each repository's files, without its manifest (top folder `{repo}/` in the zip, as Door43 serves it). */
const FILES: Record<string, Record<string, string>> = {
  'test_gl/es-419_glt': { 'A0-FRT.usfm': FRONT, '08-RUT.usfm': aligned('RUT', ['Sucedió', 'en los días']), '32-JON.usfm': aligned('JON', ['Vino', 'palabra']) },
  'test_gl/es-419_gst': { '08-RUT.usfm': aligned('RUT', ['Pasó', 'cuando']), '32-JON.usfm': aligned('JON', ['Llegó', 'mensaje']) },
  'test_gl/es-419_tn': {
    'tn_RUT.tsv': `${TN_HEADER}1:1\tab12\t\trc://*/ta/man/translate/figs-idiom\tוַיְהִי\t1\tUna nota de Rut\n2:1\tcd34\t\t\tוּלְנָעֳמִי\t1\tNoemí\n`,
    'tn_JON.tsv': `${TN_HEADER}1:1\tef56\t\t\tוַיְהִי\t1\tUna nota de Jonás\n`,
  },
  'test_gl/es-419_twl': {
    'twl_RUT.tsv': `${TWL_HEADER}1:1\tgh78\t\tבִּימֵי\t1\trc://*/tw/dict/bible/other/day\n2:1\tij90\t\tוּלְנָעֳמִי\t1\trc://*/tw/dict/bible/names/naomi\n`,
    'twl_JON.tsv': `${TWL_HEADER}1:1\tkl12\t\tוַיְהִי\t1\trc://*/tw/dict/bible/kt/god\n`,
  },
  'test_gl/es-419_tw': {
    'bible/kt/god.md': '# Dios\n\nEl creador.\n',
    'bible/names/naomi.md': '# Noemí\n\nSuegra de Rut.\n',
    'bible/other/day.md': '# día\n\nUn día.\n',
    ...Object.fromEntries(EXTRA_TW.map((id) => [`bible/kt/${id}.md`, `# ${id}\n\nTérmino ${id}.\n`])),
  },
  'test_gl/es-419_tq': {
    'tq_RUT.tsv': `${TQ_HEADER}1:1\tmn34\t\t\t\t¿Cuándo pasó?\tEn los días de los jueces.\n2:1\top56\t\t\t\t¿Quién era Noemí?\tLa suegra de Rut.\n`,
    'tq_JON.tsv': `${TQ_HEADER}1:1\tqr78\t\t\t\t¿A quién vino la palabra?\tA Jonás.\n`,
  },
  'test_gl/es-419_ta': Object.fromEntries(
    TA_ARTICLES.flatMap((id) => [
      [`translate/${id}/title.md`, `Artículo ${id}\n`],
      [`translate/${id}/sub-title.md`, `¿Qué es ${id}?\n`],
      [`translate/${id}/01.md`, `Así se traduce ${id}.\n`],
    ])
  ),
  'test_gl/es-419_obs': {
    'content/01.md': '# 1. La creación\n\n![OBS Image](https://cdn.door43.org/obs/jpg/360px/obs-en-01-01.jpg)\n\nAl principio Dios creó todo.\n\n_Una historia bíblica de: Génesis 1-2_\n',
    'content/02.md': '# 2. El pecado entra al mundo\n\n![OBS Image](https://cdn.door43.org/obs/jpg/360px/obs-en-02-01.jpg)\n\nAdán y su esposa vivían en el jardín.\n\n_Una historia bíblica de: Génesis 3_\n',
  },
  'unfoldingWord/hbo_uhb': { '08-RUT.usfm': HEBREW('RUT'), '32-JON.usfm': HEBREW('JON') },
  'unfoldingWord/el-x-koine_ugnt': { '57-TIT.usfm': GREEK },
}

/** The release tag of a fixture repository, as its catalog row names it. */
const tagOf = (repo: string) => (/_(uhb|ugnt)$/.test(repo) ? 'v2.1.30' : 'v12')

/**
 * A Door43 manifest (rc0.2) as releases carry them: `version`, `modified`, `issued` and the relation's `?v=` move with
 * every release, the rest only when someone edits it.
 */
export function manifestOf(repo: string, o: { title?: string; version?: string; date?: string } = {}): string {
  const [, name] = repo.split('/')
  const [language, id] = name.split('_')
  const version = o.version ?? tagOf(repo).replace(/^v/, '')
  const date = o.date ?? '2026-09-01'
  return [
    'dublin_core:',
    "  conformsto: 'rc0.2'",
    `  identifier: '${id}'`,
    `  issued: '${date}'`,
    '  language:',
    `    identifier: '${language}'`,
    `  modified: '${date}'`,
    '  relation:',
    `    - 'hbo/uhb?v=${version}'`,
    `  title: '${o.title ?? `${id} (${language})`}'`,
    `  version: '${version}'`,
    'checking:',
    "  checking_level: '3'",
    'projects: []',
    '',
  ].join('\n')
}

/** Each repository's release zip (top folder `{repo}/`, as Door43 serves it): its files and its `manifest.yaml`. */
export const REPOS: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(FILES).map(([repo, files]) => [repo, { ...files, 'manifest.yaml': manifestOf(repo) }])
)

/** A copy of REPOS to change, for a test that builds a changed fixture. */
export const reposCopy = (): Record<string, Record<string, string>> => structuredClone(REPOS)

const blobSha = (content: string) => {
  const bytes = Buffer.from(content)
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

/** Door43's tree of a repository: every file's blob sha, all of it. */
export type FakeTree = { blobs: Map<string, string>; complete: boolean }

export type FakeDoor43Options = {
  /** May make a zip download throw: given the repository and how many times it was asked for, 1 the first. */
  fail?: (repo: string, attempt: number) => Error | undefined
  /** The repositories' files (default REPOS). */
  repos?: Record<string, Record<string, string>>
  /** The lexicon repository's files (default LEXICON_FILES), for its tree. */
  lexicon?: Record<string, string>
  /** The tree Door43 answers, given the repository and the true one; it may throw. Default: the true one. */
  tree?: (repo: string, truth: FakeTree) => FakeTree
  /** The catalog the OBS loader's repository lookups read (default: catalogRows()). */
  catalog?: CatalogOverrides
}

export function fakeDoor43(o: FakeDoor43Options = {}) {
  const repos = o.repos ?? REPOS
  const downloads: string[] = []
  const trees: string[] = []
  const asked = new Map<string, number>()
  const filesOf = (owner: string, repo: string) =>
    `${owner}/${repo}` === LEXICON_REPO ? (o.lexicon ?? LEXICON_FILES) : repos[`${owner}/${repo}`]
  const truthOf = (owner: string, repo: string): FakeTree => ({
    blobs: new Map(Object.entries(filesOf(owner, repo) ?? {}).map(([path, content]) => [path, blobSha(content)])),
    complete: true,
  })
  const fetchRepoTree = async (owner: string, repo: string, ref = ''): Promise<FakeTree> => {
    trees.push(`${owner}/${repo}@${ref}`)
    const truth = truthOf(owner, repo)
    return o.tree ? o.tree(`${owner}/${repo}`, truth) : truth
  }
  return {
    downloads,
    /** The trees asked for, `{owner}/{repo}@{ref}`. */
    trees,
    async downloadZipball(owner: string, repo: string, ref: string) {
      const attempt = (asked.get(`${owner}/${repo}`) ?? 0) + 1
      asked.set(`${owner}/${repo}`, attempt)
      const failure = o.fail?.(`${owner}/${repo}`, attempt)
      if (failure) throw failure
      downloads.push(`${owner}/${repo}@${ref}`)
      const files = repos[`${owner}/${repo}`]
      if (!files) throw new Error(`404 ${owner}/${repo}`)
      return storedZip(Object.fromEntries(Object.entries(files).map(([path, content]) => [`${repo}/${path}`, content])))
    },
    fetchRepoTree,
    async fetchRepoTreeBlobs(owner: string, repo: string, ref = '') {
      return (await fetchRepoTree(owner, repo, ref)).blobs
    },
    // Which files a release has (the whole download's completeness), not the tree `tree` changes.
    async fetchRepoTreePaths(owner: string, repo: string) {
      return new Set(truthOf(owner, repo).blobs.keys())
    },
    // What the OBS loader reads, story by story.
    async findRepository(owner: string, repo: string) {
      const row = catalogRows(o.catalog).find((r) => repoOf(r.resourceKey) === `${owner}/${repo}`)
      return row ? { release: row.release } : null
    },
    async fetchTextContent(owner: string, repo: string, path: string) {
      const text = repos[`${owner}/${repo}`]?.[path.replace(/^\.\//, '')]
      if (text === undefined) throw new Error(`404 ${owner}/${repo}/${path}`)
      return text
    },
  }
}

const repoOf = (key: string) => {
  const [owner, language, id] = key.split('/')
  return `${owner}/${language}_${id}`
}

export type CatalogRow = ReturnType<typeof row>

/** Changes to the catalog discovery finds: another release tag for some resources, or any edit of a row. */
export type CatalogOverrides = { tags?: Readonly<Record<string, string>>; edit?: (row: CatalogRow) => void }

function row(key: string, subject: string, type: string, ingredients: Array<{ identifier: string; path: string; title?: string }>) {
  const [owner, language, resourceId] = key.split('/')
  const tag = tagOf(repoOf(key))
  return {
    resourceKey: key,
    server: 'git.door43.org',
    owner,
    language,
    resourceId,
    subject,
    type,
    title: `${resourceId} (${language})`,
    version: tag,
    format: 'usfm',
    availability: { online: true, offline: false, bundled: false, partial: false },
    locations: [],
    catalogedAt: new Date().toISOString(),
    release: {
      tag_name: tag,
      published_at: '2026-09-01T00:00:00Z',
      zipball_url: `https://git.door43.org/${owner}/${language}_${resourceId}/archive/${tag}.zip`,
    },
    contentMetadata: { ingredients, books: ingredients.map((i) => i.identifier) },
  }
}

const book = (id: string, file: string) => ({ identifier: id, path: `./${file}` })

/** What discovery would have put in the catalog: GST's catalog lists Genesis, which its release lacks. */
export function catalogRows(o: CatalogOverrides = {}): CatalogRow[] {
  const rows = baseRows()
  for (const r of rows) {
    const tag = o.tags?.[r.resourceKey]
    if (tag) {
      r.version = tag
      r.release.tag_name = tag
      r.release.zipball_url = r.release.zipball_url.replace(/[^/]+\.zip$/, `${tag}.zip`)
    }
    o.edit?.(r)
  }
  return rows
}

const baseRows = () => [
    row(GLT, 'Aligned Bible', 'scripture', [book('frt', 'A0-FRT.usfm'), book('rut', '08-RUT.usfm'), book('jon', '32-JON.usfm')]),
    row(GST, 'Aligned Bible', 'scripture', [book('gen', '01-GEN.usfm'), book('rut', '08-RUT.usfm'), book('jon', '32-JON.usfm')]),
    row(TN, 'TSV Translation Notes', 'notes', [book('rut', 'tn_RUT.tsv'), book('jon', 'tn_JON.tsv')]),
    row(TWL, 'TSV Translation Words Links', 'words-links', [book('rut', 'twl_RUT.tsv'), book('jon', 'twl_JON.tsv')]),
    row(TW, 'Translation Words', 'words', [
      { identifier: 'bible/kt/god', path: './bible/kt/god.md', title: 'Dios' },
      { identifier: 'bible/names/naomi', path: './bible/names/naomi.md', title: 'Noemí' },
      { identifier: 'bible/other/day', path: './bible/other/day.md', title: 'día' },
      ...EXTRA_TW.map((id) => ({ identifier: `bible/kt/${id}`, path: `./bible/kt/${id}.md`, title: id })),
    ]),
    row(TQ, 'TSV Translation Questions', 'questions', [book('rut', 'tq_RUT.tsv'), book('jon', 'tq_JON.tsv')]),
    row(TA, 'Translation Academy', 'academy', TA_ARTICLES.map((id) => ({ identifier: `translate/${id}`, path: `./translate/${id}`, title: `Artículo ${id}` }))),
    row(OBS, 'Open Bible Stories', 'obs', [
      { identifier: '01', path: './content/01.md' },
      { identifier: '02', path: './content/02.md' },
    ]),
    row(UHB, 'Hebrew Old Testament', 'scripture', [book('rut', '08-RUT.usfm'), book('jon', '32-JON.usfm')]),
    row(UGNT, 'Greek New Testament', 'scripture', [book('tit', '57-TIT.usfm')]),
  ]

/** Discovery of the fixture's catalog, changed by `o`. */
export function discoverWith(o: CatalogOverrides = {}): DiscoverInto {
  return async ({ catalogManager }) => {
    const rows = catalogRows(o)
    for (const r of rows) await catalogManager.catalogAdapter.set(r.resourceKey, r as never)
    return { resources: rows.filter((r) => r.language === LANG).map((r) => r.resourceKey), originals: [UHB, UGNT] }
  }
}

export const discover: DiscoverInto = discoverWith()

export function maculaFolder(dir: string) {
  for (const part of ['trees', 'referents']) mkdirSync(join(dir, part))
  writeFileSync(join(dir, 'trees', 'RUT.json'), JSON.stringify({ sentences: ['Rut 1:1'] }))
  writeFileSync(join(dir, 'referents', 'RUT.json'), JSON.stringify({ naomi: ['Rut 2:1'] }))
  writeFileSync(join(dir, 'trees', 'TIT.json'), JSON.stringify({ sentences: ['Tito 1:1'] }))
  return dir
}

/** A `.tar.gz` (ustar) of the files given, as Door43 serves an archive. */
export function tarGz(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const blocks: Uint8Array[] = []
  for (const [path, body] of Object.entries(files)) {
    const bytes = new TextEncoder().encode(body)
    const header = new Uint8Array(512)
    header.set(new TextEncoder().encode(path), 0)
    header.set(new TextEncoder().encode(bytes.length.toString(8).padStart(11, '0')), 124)
    header.set(new TextEncoder().encode('0'), 156)
    blocks.push(header, bytes, new Uint8Array((512 - (bytes.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  return new Uint8Array(gzipSync(Buffer.concat(blocks)))
}

export const UHL_COMMIT = { sha: '0123456789abcdef0123456789abcdef01234567', created: '2026-07-01T00:00:00Z' }

const LEXICON_REPO = 'test_gl/es-419_uhl'

/** The Hebrew lexicon's repository files: two entries and its manifest. */
export const LEXICON_FILES: Readonly<Record<string, string>> = {
  'content/H1961.json': JSON.stringify({ brief: 'ser, estar' }),
  'content/H5281.json': JSON.stringify({ brief: 'Noemí' }),
  'manifest.yaml': 'dublin_core:\n  title: Léxico hebreo\n',
}

/**
 * Door43's HTTP for the lexicons: es-419_gl has a Hebrew lexicon (`files`, default LEXICON_FILES, at `commit`), and
 * no Greek one.
 */
export function lexiconFetchOf(o: { files?: Readonly<Record<string, string>>; commit?: { sha: string; created: string } } = {}) {
  const files = o.files ?? LEXICON_FILES
  const commit = o.commit ?? UHL_COMMIT
  return async (url: string): Promise<Response> => {
    const u = new URL(url)
    const repo = LEXICON_REPO
    if (u.pathname === `/api/v1/repos/${repo}`) return Response.json({ full_name: repo })
    if (u.pathname === `/api/v1/repos/${repo}/commits`) return Response.json([commit])
    if (u.pathname === `/${repo}/archive/${commit.sha}.tar.gz`) {
      return new Response(tarGz(Object.fromEntries(Object.entries(files).map(([path, body]) => [`es-419_uhl/${path}`, body]))))
    }
    return new Response('not found', { status: 404 })
  }
}

export const lexiconFetch = lexiconFetchOf()

export const LEXICONS_REF = 'master'

/**
 * Today's whole build of the fixture: prepareAndPack itself (discovery, every resource downloaded whole, the
 * language's and both originals' jobs, the lexicons, MACULA), with the fake Door43 and HTTP. Its language pack and
 * originals pack.
 */
export async function wholePacks(macula: string, o: { obs?: boolean } = {}): Promise<{ language: Uint8Array; originals: Uint8Array }> {
  const outDir = mkdtempSync(join(tmpdir(), 'whole-packs-'))
  try {
    const built = await prepareAndPack({
      language: LANG,
      outDir,
      originals: true,
      macula,
      maculaStamp: MACULA_STAMP,
      lexicons: { ref: LEXICONS_REF },
      obs: o.obs ?? false,
      door43Client: fakeDoor43(),
      discover,
      fetch: lexiconFetch,
      databases: { cache: 'whole-cache', catalog: 'whole-catalog' },
    })
    for (const pack of [built.language, built.originals]) {
      if (!pack) throw new Error('prepareAndPack gave no originals pack')
      if (pack.skipped.length) throw new Error(`The whole ${pack.file} skipped ${JSON.stringify(pack.skipped)}`)
    }
    return { language: built.language.bytes, originals: built.originals!.bytes }
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}
