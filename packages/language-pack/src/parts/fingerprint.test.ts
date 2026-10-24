import { describe, expect, test } from 'bun:test'
import { FINGERPRINT_VERSION, fingerprintOf, gitBlobSha, manifestFingerprint, normalizeManifest, type FingerprintInputs } from './fingerprint'

const utf8 = (text: string) => new TextEncoder().encode(text)

describe('a file’s git blob sha', () => {
  // Each value is what `git hash-object --no-filters` gives for the same bytes.
  test('is what git hash-object gives, for text, empty, non-ASCII, CRLF and binary bytes', async () => {
    expect(await gitBlobSha(utf8('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
    expect(await gitBlobSha(new Uint8Array())).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
    // The length in the header counts bytes, not characters.
    expect(await gitBlobSha(utf8('וַיְהִי'))).toBe('a4421f7588b769770e69f34b9baef03e686008d3')
    // CRLF stays as it is: the bytes are hashed, never the text.
    expect(await gitBlobSha(utf8('# Noemí\r\n\r\nSuegra de Rut.\r\n'))).toBe('bbd12cda1a558ce7e534075dd878f89967d28c57')
    expect(await gitBlobSha(new Uint8Array([0, 0xff, 1, ...utf8('binary')]))).toBe('1fb4642e1f5eed2ca814167bb3a2e0ddabe08fb2')
  })

  test('reads only the bytes of a view, not the rest of its buffer', async () => {
    const buffer = utf8('xxhello\nyy')
    expect(await gitBlobSha(buffer.subarray(2, 8))).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })
})

/** The rc0.2 manifest Door43 serves (en_tn's layout): what a release bump touches is version, modified, issued and `?v=`. */
const manifest = (o: { version?: string; date?: string; uhb?: string; title?: string; projects?: boolean; sourceVersion?: string } = {}) => `---
dublin_core:
  conformsto: 'rc0.2'
  contributor:
    - 'Abram Book'
    - 'Larry Sallee'
  creator: 'unfoldingWord'
  description: 'Open-licensed exegetical notes that provide historical, cultural, and linguistic information.'
  format: 'text/tsv'
  identifier: 'tn'
  issued: '${o.date ?? '2026-09-01'}'
  language:
    direction: 'ltr'
    identifier: 'en'
    title: 'English'
  modified: '${o.date ?? '2026-09-01'}'
  publisher: 'unfoldingWord'
  relation:
    - 'en/ult'
    - 'en/ust'
    - 'hbo/uhb?v=${o.uhb ?? '2.1.30'}'
    - 'el-x-koine/ugnt?v=0.34'
    - 'en/ta'
    - 'en/tw'
  rights: 'CC BY-SA 4.0'
  source:
    -
      identifier: 'tn'
      language: 'en'
      version: '${o.sourceVersion ?? '85'}'
  subject: 'TSV Translation Notes'
  title: '${o.title ?? 'unfoldingWord® Translation Notes'}'
  type: 'help'
  version: '${o.version ?? '86'}'

checking:
  checking_entity:
    - 'unfoldingWord'
  checking_level: '3'

projects:
  -
    title: 'Ruth'
    versification: 'ufw'
    identifier: 'rut'
    sort: 8
    path: './tn_RUT.tsv'
    categories: [ 'bible-ot' ]
${
  o.projects === false
    ? ''
    : `  -
    title: 'Jonah'
    versification: 'ufw'
    identifier: 'jon'
    sort: 32
    path: './tn_JON.tsv'
    categories: [ 'bible-ot' ]
`
}`

const crlf = (text: string) => text.replace(/\n/g, '\r\n')

describe('the normalized manifest', () => {
  test('is the same across a release bump: version, modified, issued, relation versions, CRLF, trailing spaces', () => {
    const before = normalizeManifest(manifest())
    const after = normalizeManifest(crlf(manifest({ version: '87', date: '2026-10-20', uhb: '2.1.31' })).replace(/'ltr'\r\n/, "'ltr'  \r\n"))
    expect(after).toBe(before)
    // What it keeps and what it drops, spelled out.
    expect(before).not.toMatch(/^ {2}(version|modified|issued):/m)
    expect(before).toContain("    - 'hbo/uhb'\n")
    expect(before).toContain("    - 'el-x-koine/ugnt'\n")
    expect(before).toContain("      version: '85'\n")
    expect(before).toContain("  title: 'unfoldingWord® Translation Notes'\n")
  })

  test('changes with the title, a removed book, or a version under source', () => {
    const base = normalizeManifest(manifest())
    expect(normalizeManifest(manifest({ title: 'Notas de traducción' }))).not.toBe(base)
    expect(normalizeManifest(manifest({ projects: false }))).not.toBe(base)
    expect(normalizeManifest(manifest({ sourceVersion: '86' }))).not.toBe(base)
  })

  test('keeps a version that is not directly under the top-level dublin_core', () => {
    const text = 'checking:\n  version: 3\ndublin_core:\n  title: x\n  language:\n    version: 2\n'
    expect(normalizeManifest(text)).toBe(text)
  })

  test('takes relation items unquoted, double-quoted, or at the key’s own indentation', () => {
    expect(normalizeManifest('dublin_core:\n  relation:\n    - hbo/uhb?v=2.1.30\n    - "en/ta?v=86"\n  title: x\n')).toBe(
      'dublin_core:\n  relation:\n    - hbo/uhb\n    - "en/ta"\n  title: x\n'
    )
    expect(normalizeManifest('dublin_core:\n  relation:\n  - en/ult?v=86\n  version: 86\n')).toBe('dublin_core:\n  relation:\n  - en/ult\n')
  })

  test('hashes an unexpected shape as it is: a rebuild too many, never a missed change', () => {
    const odd = [
      // No dublin_core at all.
      'title: x\nversion: 1\n',
      // A dropped key with a block value: dropping its first line would keep its body.
      'dublin_core:\n  version:\n    major: 1\n  title: x\n',
      'dublin_core:\n  modified: |\n    2026-09-01\n',
      // A scalar running on to the next line.
      "dublin_core:\n  issued: '2026-09-01\n    10:00'\n",
      // Relation in flow style, or an item that is not a plain scalar.
      "dublin_core:\n  relation: [ 'hbo/uhb?v=2.1.30' ]\n",
      "dublin_core:\n  relation:\n    - identifier: hbo/uhb?v=2\n",
      // Tabs, or a line indented less than the block's keys.
      'dublin_core:\n\tversion: 1\n',
      'dublin_core:\n    title: x\n  version: 1\n',
      // dublin_core twice, or with a value of its own.
      'dublin_core:\n  version: 1\ndublin_core:\n  version: 2\n',
      'dublin_core: { version: 1 }\n',
    ]
    for (const text of odd) {
      expect(normalizeManifest(text)).toBe(text)
      expect(normalizeManifest(crlf(text))).toBe(crlf(text))
    }
  })

  test('its fingerprint is the sha256 of the normalized text', async () => {
    expect(await manifestFingerprint(manifest())).toBe(await manifestFingerprint(crlf(manifest({ version: '99' }))))
    expect(await manifestFingerprint('dublin_core:\n  title: x\n  version: 3\n')).toBe(
      // sha256 of 'dublin_core:\n  title: x\n' (`printf … | sha256sum`).
      '2acd14c15af65b9062bf6a32dba51ec43828f8a7e835d4b473a73d46d4b86f85'
    )
  })
})

const INPUTS: FingerprintInputs = {
  files: [
    ['test_gl/es-419/tn', 'tn_RUT.tsv', 'ce013625030ba8dba906f756967f9e9ca394464a'],
    ['unfoldingWord/hbo/uhb', '08-RUT.usfm', 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'],
  ],
  manifests: [['test_gl/es-419/tn', '2acd14c15af65b9062bf6a32dba51ec43828f8a7e835d4b473a73d46d4b86f85']],
  stamps: [],
}
const CODE = 'f2.0-u2.3.0-p6000230-q9-a12-t1'
const ID = 'book:test_gl/es-419/tn:rut'

describe('a fingerprint', () => {
  test('is version 1', () => {
    expect(FINGERPRINT_VERSION).toBe(1)
  })

  test('does not depend on the order of its inputs or on duplicates', async () => {
    const shuffled: FingerprintInputs = {
      files: [INPUTS.files[1], INPUTS.files[0], INPUTS.files[1]],
      manifests: [INPUTS.manifests[0], INPUTS.manifests[0]],
      stamps: [],
    }
    expect(await fingerprintOf({ code: CODE, id: ID, inputs: shuffled })).toBe(await fingerprintOf({ code: CODE, id: ID, inputs: INPUTS }))
  })

  test('changes with the code, the id, any one blob, a manifest or a stamp', async () => {
    const base = await fingerprintOf({ code: CODE, id: ID, inputs: INPUTS })
    const others = [
      await fingerprintOf({ code: 'f2.1-u2.3.0-p6000230-q9-a12-t1', id: ID, inputs: INPUTS }),
      await fingerprintOf({ code: CODE, id: 'book:test_gl/es-419/tn:jon', inputs: INPUTS }),
      await fingerprintOf({ code: CODE, id: ID, inputs: { ...INPUTS, files: [INPUTS.files[0], ['unfoldingWord/hbo/uhb', '08-RUT.usfm', 'a4421f7588b769770e69f34b9baef03e686008d3']] } }),
      await fingerprintOf({ code: CODE, id: ID, inputs: { ...INPUTS, manifests: [['test_gl/es-419/tn', 'ff'.repeat(32)]] } }),
      await fingerprintOf({ code: CODE, id: ID, inputs: { ...INPUTS, stamps: [['test_gl/es-419/tn', 'v12#2026-09-01T00:00:00Z']] } }),
    ]
    for (const other of others) expect(other).not.toBe(base)
    expect(new Set(others).size).toBe(others.length)
  })

  test('is the sha256 of the stable JSON of its inputs, sorted', async () => {
    // Golden: the Worker (delivery 3) and tc-study's app must reach this same value from the same inputs.
    const golden = await fingerprintOf({ code: CODE, id: ID, inputs: INPUTS })
    expect(golden).toMatch(/^[0-9a-f]{64}$/)
    // `printf '%s' '{"code":…,"files":[…],"id":…,"manifests":[…],"stamps":[],"v":1}' | sha256sum`
    expect(golden).toBe('4234512231f52e21faca28991e5de566823401099ea2fd839f3bb7df64694723')
  })
})
