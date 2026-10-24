/**
 * The files of a resource and their git blob shas, from the bytes the build holds. The Worker will read the same shas
 * from Door43's tree, so every path and every sha must be what git itself says, or a part would be rebuilt forever.
 * Where the build can, it checks that against the tree.
 */
import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { storedZip } from '../download/zipFixture'
import { archiveCachingFetch, folderGitTree, folderInputs, lexiconInputs, treeCheck, zipInputs } from './inputFiles'
import { addLexicons } from '../../cli/companions'
import { fakeDoor43, lexiconFetch, maculaFolder, REPOS, tarGz, UHL_COMMIT } from './partsFixture'

const sha1Blob = (bytes: Uint8Array) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const text = (s: string) => new TextEncoder().encode(s)
const fresh = (name: string) => mkdtempSync(join(tmpdir(), `${name}-`))

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

/**
 * A repository made with git itself: its zip as `git archive` makes it (what Gitea serves as Door43's zipball), and
 * its tree as `git ls-tree` gives it (what Door43's `git/trees` answers).
 */
function gitRepo(files: Record<string, string | Uint8Array>, o: { symlinks?: Record<string, string> } = {}) {
  const dir = fresh('git-repo')
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q')
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  for (const [path, target] of Object.entries(o.symlinks ?? {})) symlinkSync(target, join(dir, path))
  git('add', '-A')
  git('commit', '-q', '-m', 'x')
  const zip = new Uint8Array(git('archive', '--format=zip', '--prefix=es-419_tn/', 'HEAD'))
  const tree = new Map(
    git('ls-tree', '-r', '-z', 'HEAD')
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const [meta, path] = line.split('\t')
        return [path, meta.split(' ')[2]] as [string, string]
      })
  )
  return { zip, tree }
}

describe('zipInputs', () => {
  test("the fixture's TN zip gives the paths and blob shas of its tree, without the zip's top folder", async () => {
    const door43 = fakeDoor43()
    const zip = await door43.downloadZipball('test_gl', 'es-419_tn', 'v12')
    const { files, manifest } = await zipInputs(zip)
    expect([...files.entries()].sort()).toEqual([...(await door43.fetchRepoTreeBlobs('test_gl', 'es-419_tn')).entries()].sort())
    expect(manifest).toBe(REPOS['test_gl/es-419_tn']['manifest.yaml'])
  })

  test('directory entries are skipped, deflated entries are read, bytes are hashed as stored (no text decoding)', async () => {
    const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x0d, 0x0a, 0xc3])
    const zip = new JSZip()
    const top = zip.folder('es-419_tw')!
    top.folder('bible')!.folder('kt')!.file('god.md', '# Dios\r\n\r\nEl creador. \r\n')
    top.file('media.bin', binary)
    top.file('empty.txt', '')
    top.file('manifest.yaml', 'dublin_core:\r\n  title: Palabras\r\n')
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    const { files, manifest } = await zipInputs(bytes)
    expect([...files.keys()].sort()).toEqual(['bible/kt/god.md', 'empty.txt', 'manifest.yaml', 'media.bin'])
    expect(files.get('bible/kt/god.md')).toBe(sha1Blob(text('# Dios\r\n\r\nEl creador. \r\n')))
    expect(files.get('media.bin')).toBe(sha1Blob(binary))
    expect(files.get('empty.txt')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
    expect(manifest).toBe('dublin_core:\r\n  title: Palabras\r\n')
  })

  test('an ArrayBuffer is read like its bytes', async () => {
    const zip = storedZip({ 'r/a.txt': 'a\n' })
    expect([...(await zipInputs(zip)).files]).toEqual([['a.txt', sha1Blob(text('a\n'))]])
  })

  test('a zip without one top folder is refused: its paths could not be the repository paths', async () => {
    await expect(zipInputs(storedZip({ 'a.txt': 'a' }))).rejects.toThrow('top folder')
    await expect(zipInputs(storedZip({ 'r/a.txt': 'a', 's/b.txt': 'b' }))).rejects.toThrow('top folder')
  })

  test('a zip whose bytes do not match their CRC is refused', async () => {
    const zip = new Uint8Array(storedZip({ 'r/a.txt': 'aaaa' }))
    zip[30 + 'r/a.txt'.length] = 'b'.charCodeAt(0)
    await expect(zipInputs(zip)).rejects.toThrow()
  })

  test.skipIf(!hasGit)("git archive's zip gives exactly git's tree: nested, CRLF, binary, empty, non-ASCII names, symlinks", async () => {
    const { zip, tree } = gitRepo(
      {
        'manifest.yaml': 'dublin_core:\n  version: 86\n',
        'tn_RUT.tsv': 'Reference\tID\r\n1:1\tab12\r\n',
        'bible/kt/god.md': '# Dios\n',
        'img/a.bin': new Uint8Array([0, 1, 2, 255, 254, 13, 10]),
        'empty.md': '',
        'notas/año.md': 'ñ\n',
      },
      { symlinks: { 'LICENSE.md': 'bible/kt/god.md' } }
    )
    const { files, manifest } = await zipInputs(zip)
    expect([...files.entries()].sort()).toEqual([...tree.entries()].sort())
    expect(manifest).toBe('dublin_core:\n  version: 86\n')
    expect(treeCheck(files, { blobs: tree, complete: true })).toEqual({ state: 'match', differing: [] })
  })

  test.skipIf(!hasGit)('files git archive changes (eol=crlf, export-subst) or leaves out (export-ignore) are a mismatch', async () => {
    const { zip, tree } = gitRepo({
      '.gitattributes': '*.tsv text eol=crlf\nVERSION export-subst\nnotes/ export-ignore\n',
      'tn_RUT.tsv': 'Reference\tID\n1:1\tab12\n',
      VERSION: '$Format:%H$\n',
      'notes/old.md': 'old\n',
      'README.md': 'same\n',
    })
    const { files } = await zipInputs(zip)
    expect(files.has('notes/old.md')).toBe(false)
    const check = treeCheck(files, { blobs: tree, complete: true })
    expect(check).toEqual({ state: 'mismatch', differing: ['VERSION', 'notes/old.md', 'tn_RUT.tsv'] })
  })
})

describe('lexiconInputs', () => {
  test("the fixture's lexicon archive keeps its entries by row path and leaves manifest.yaml out of the files", async () => {
    const res = await lexiconFetch('https://git.door43.org/test_gl/es-419_uhl/archive/0123456789abcdef0123456789abcdef01234567.tar.gz')
    const { files, manifest } = await lexiconInputs(new Uint8Array(await res.arrayBuffer()))
    expect([...files.keys()].sort()).toEqual(['content/H1961.json', 'content/H5281.json'])
    expect(files.get('content/H1961.json')).toBe(sha1Blob(text(JSON.stringify({ brief: 'ser, estar' }))))
    expect(manifest).toBe('dublin_core:\n  title: Léxico hebreo\n')
  })

  test('two files with one row path: the sha is of the file whose row the store keeps (the last in the archive)', async () => {
    for (const order of [['content', 'nested'], ['nested', 'content']] as const) {
      const bodies = { content: JSON.stringify({ brief: 'en la raíz' }), nested: JSON.stringify({ brief: 'en v0' }) }
      const paths = { content: 'es-419_uhl/content/H1961.json', nested: 'es-419_uhl/uhl/v0/content/H1961.json' }
      const archive = tarGz(Object.fromEntries(order.map((which) => [paths[which], bodies[which]])))
      const rows = new Map<string, unknown>()
      const store = { set: async () => {}, putRawMany: async (batch: Array<{ key: string; entry: unknown }>) => batch.forEach((r) => rows.set(r.key, r.entry)) }
      const fetchFn = async (url: string) => {
        if (url.includes('/commits')) return Response.json([UHL_COMMIT])
        if (url.includes('/archive/')) return new Response(archive)
        return url.endsWith('_uhl') ? Response.json({}) : new Response('', { status: 404 })
      }
      await addLexicons(store, { set: async () => {} }, 'es-419', 'test_gl', 'master', fetchFn)
      const last = order[1]
      expect(rows.get('test_gl/es-419/uhl/content/H1961.json')).toEqual(JSON.parse(bodies[last]))
      const { files } = await lexiconInputs(archive)
      expect(files.get('content/H1961.json')).toBe(sha1Blob(text(bodies[last])))
    }
  })
})

describe('folderInputs', () => {
  test("MACULA's trees and referents, keyed as the rows are, with the blob sha of each file", async () => {
    const dir = maculaFolder(fresh('macula'))
    writeFileSync(join(dir, 'trees', 'notes.txt'), 'not a book')
    const files = await folderInputs(dir, ['trees', 'referents'])
    expect([...files.keys()].sort()).toEqual(['referents/RUT.json', 'trees/RUT.json', 'trees/TIT.json'])
    expect(files.get('trees/RUT.json')).toBe(sha1Blob(readFileSync(join(dir, 'trees', 'RUT.json'))))
  })

  test('a missing folder throws, as reading MACULA does', async () => {
    const dir = fresh('macula')
    mkdirSync(join(dir, 'trees'))
    await expect(folderInputs(dir, ['trees', 'referents'])).rejects.toThrow()
  })
})

/**
 * A Taller-like checkout: MACULA under `public/`, committed, then the app changed in a later commit, as the workflow's
 * clone has it. The commit that touched `trees/` and `referents/` last, and the `public/` folder.
 */
function tallerClone() {
  const dir = fresh('taller')
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString('utf8')
      .trim()
  git('init', '-q')
  mkdirSync(join(dir, 'public'))
  maculaFolder(join(dir, 'public'))
  writeFileSync(join(dir, 'public', 'trees', 'README.md'), 'not a book')
  git('add', '-A')
  git('commit', '-q', '-m', 'macula')
  const commit = git('rev-parse', 'HEAD')
  writeFileSync(join(dir, 'app.ts'), 'later')
  git('add', '-A')
  git('commit', '-q', '-m', 'app')
  return { folder: join(dir, 'public'), commit, git }
}

describe('folderGitTree', () => {
  test.skipIf(!hasGit)("MACULA's files in git at its commit, selected as folderInputs selects them: they match", async () => {
    const { folder, commit } = tallerClone()
    const got = folderGitTree(folder, commit, ['trees', 'referents'])
    expect(got.tree).not.toBeNull()
    expect([...got.tree!.blobs.keys()].sort()).toEqual(['referents/RUT.json', 'trees/RUT.json', 'trees/TIT.json'])
    expect(treeCheck(await folderInputs(folder, ['trees', 'referents']), got.tree)).toEqual({ state: 'match', differing: [] })
    // An abbreviated commit, as the stamp keeps it, names the same tree.
    expect(folderGitTree(folder, commit.slice(0, 10), ['trees', 'referents']).tree).toEqual(got.tree)
  })

  test.skipIf(!hasGit)('a file changed in the checkout, or one the commit lacks, is a mismatch naming it', async () => {
    const { folder, commit } = tallerClone()
    writeFileSync(join(folder, 'trees', 'RUT.json'), '{"edited":true}')
    writeFileSync(join(folder, 'referents', 'TIT.json'), '{}')
    const check = treeCheck(await folderInputs(folder, ['trees', 'referents']), folderGitTree(folder, commit, ['trees', 'referents']).tree)
    expect(check).toEqual({ state: 'mismatch', differing: ['referents/TIT.json', 'trees/RUT.json'] })
  })

  test.skipIf(!hasGit)('a commit that changed MACULA after the one named is a mismatch: the files are not that commit\'s', async () => {
    const { folder, commit, git } = tallerClone()
    writeFileSync(join(folder, 'trees', 'RUT.json'), '{"newer":true}')
    git('commit', '-q', '-am', 'newer macula')
    const check = treeCheck(await folderInputs(folder, ['trees', 'referents']), folderGitTree(folder, commit, ['trees', 'referents']).tree)
    expect(check).toEqual({ state: 'mismatch', differing: ['trees/RUT.json'] })
  })

  test('no repository, an unknown commit or no git: no tree, and why', () => {
    const plain = maculaFolder(fresh('macula'))
    const none = folderGitTree(plain, 'abc1234567', ['trees', 'referents'])
    expect(none.tree).toBeNull()
    expect(none.why).toBeTruthy()
    if (hasGit) {
      const { folder } = tallerClone()
      const unknown = folderGitTree(folder, 'ffffffffffffffffffffffffffffffffffffffff', ['trees', 'referents'])
      expect(unknown.tree).toBeNull()
      expect(unknown.why).toContain('ffffffffff')
    }
    const noGit = folderGitTree(plain, 'abc1234567', ['trees', 'referents'], { git: 'no-such-git-binary' })
    expect(noGit.tree).toBeNull()
    expect(noGit.why).toBeTruthy()
  })
})

describe('treeCheck', () => {
  const files = new Map([
    ['tn_RUT.tsv', 'a'.repeat(40)],
    ['tn_JON.tsv', 'b'.repeat(40)],
  ])

  test('the same paths and shas → match', () => {
    expect(treeCheck(files, { blobs: new Map(files), complete: true })).toEqual({ state: 'match', differing: [] })
  })

  test('one changed sha → mismatch naming the path', () => {
    const blobs = new Map(files).set('tn_JON.tsv', 'c'.repeat(40))
    expect(treeCheck(files, { blobs, complete: true })).toEqual({ state: 'mismatch', differing: ['tn_JON.tsv'] })
    expect(treeCheck(files, { blobs, complete: false })).toEqual({ state: 'mismatch', differing: ['tn_JON.tsv'] })
  })

  test('no tree → unverified', () => {
    expect(treeCheck(files, null)).toEqual({ state: 'unverified', differing: [] })
  })

  test('a file the zip has and a complete tree lacks → mismatch; an incomplete tree may just not have reached it', () => {
    const blobs = new Map([['tn_RUT.tsv', 'a'.repeat(40)]])
    expect(treeCheck(files, { blobs, complete: true })).toEqual({ state: 'mismatch', differing: ['tn_JON.tsv'] })
    expect(treeCheck(files, { blobs, complete: false })).toEqual({ state: 'unverified', differing: [] })
  })

  test('a file the tree has and the zip lacks → mismatch, complete or not: the Worker would count it', () => {
    const blobs = new Map(files).set('README.md', 'd'.repeat(40))
    expect(treeCheck(files, { blobs, complete: true })).toEqual({ state: 'mismatch', differing: ['README.md'] })
    expect(treeCheck(files, { blobs, complete: false })).toEqual({ state: 'mismatch', differing: ['README.md'] })
  })

  test('a tree entry without a sha confirms nothing: unverified, not a mismatch', () => {
    const blobs = new Map(files).set('tn_JON.tsv', '')
    expect(treeCheck(files, { blobs, complete: true })).toEqual({ state: 'unverified', differing: [] })
  })
})

describe('archiveCachingFetch', () => {
  const ARCHIVE = 'https://git.door43.org/test_gl/es-419_uhl/archive/0123456789abcdef0123456789abcdef01234567.tar.gz'

  function counting() {
    const asked: string[] = []
    const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
      asked.push(`${init?.method ?? 'GET'} ${String(input)}`)
      return lexiconFetch(String(input))
    }
    return { asked, fetchFn }
  }

  test('an archive is fetched once for two reads, with the same bytes, and kept in the folder', async () => {
    const dir = fresh('archives')
    const { asked, fetchFn } = counting()
    const cached = archiveCachingFetch(fetchFn, dir)
    const first = new Uint8Array(await (await cached(ARCHIVE)).arrayBuffer())
    const second = new Uint8Array(await (await cached(ARCHIVE)).arrayBuffer())
    expect(asked).toEqual([`GET ${ARCHIVE}`])
    expect(second).toEqual(first)
    expect(readdirSync(dir)).toHaveLength(1)
    // A later run over the same folder reads the file.
    const again = counting()
    await (await archiveCachingFetch(again.fetchFn, dir)(ARCHIVE)).arrayBuffer()
    expect(again.asked).toEqual([])
  })

  test('two reads at once share one download', async () => {
    const { asked, fetchFn } = counting()
    const cached = archiveCachingFetch(fetchFn, fresh('archives'))
    await Promise.all([cached(ARCHIVE), cached(ARCHIVE)])
    expect(asked).toHaveLength(1)
  })

  test('what is not an archive GET (the API, a HEAD) goes to Door43 every time', async () => {
    const { asked, fetchFn } = counting()
    const cached = archiveCachingFetch(fetchFn, fresh('archives'))
    const api = 'https://git.door43.org/api/v1/repos/test_gl/es-419_uhl/commits?sha=master'
    await cached(api)
    await cached(api)
    await cached(ARCHIVE, { method: 'HEAD' })
    expect(asked).toEqual([`GET ${api}`, `GET ${api}`, `HEAD ${ARCHIVE}`])
  })

  test('a failed answer is passed on and not kept', async () => {
    const dir = fresh('archives')
    const { asked, fetchFn } = counting()
    const cached = archiveCachingFetch(fetchFn, dir)
    const missing = 'https://git.door43.org/test_gl/es-419_ugl/archive/abc.tar.gz'
    expect((await cached(missing)).status).toBe(404)
    expect((await cached(missing)).status).toBe(404)
    expect(asked).toHaveLength(2)
    expect(readdirSync(dir)).toEqual([])
  })

  test('a saved file that is not a whole archive is downloaded again', async () => {
    const dir = fresh('archives')
    const { fetchFn } = counting()
    await (await archiveCachingFetch(fetchFn, dir)(ARCHIVE)).arrayBuffer()
    const [name] = readdirSync(dir)
    writeFileSync(join(dir, name), 'cut short')
    const again = counting()
    const bytes = new Uint8Array(await (await archiveCachingFetch(again.fetchFn, dir)(ARCHIVE)).arrayBuffer())
    expect(again.asked).toHaveLength(1)
    expect((await lexiconInputs(bytes)).files.size).toBe(2)
  })
})
