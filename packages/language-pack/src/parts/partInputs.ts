/**
 * Which files a part and a unit are built from (spec §2): the inputs of their fingerprints. Files are mapped to parts
 * by the same group functions `slotOfRow` places rows with, so a file and the rows made from it are always in one part.
 * A file no rule maps counts for every part of its resource: a needless rebuild at worst, never a missed change.
 */

import { ORIGINAL_LANGUAGE_KEYS } from '../keys'
import { canonicalInputs, type FingerprintInputs } from './fingerprint'
import { familyOf, lexiconGroupOf, taGroupOf, twGroupOf, type PartSlot, type ResourceFamily } from './partSlots'
import { BOOK_KINDS, SHARED_UNIT, unitOfPart, type PartKind } from './partsList'

export type ResourceFiles = {
  key: string
  type?: string
  subject?: string
  /** `resourceContentStamp` of its catalog row. */
  stamp: string
  /** The normalized manifest's sha256 (`manifestFingerprint`); none for what is not a Door43 repository (MACULA). */
  manifest?: string
  /** Repository path (no top folder, no `./`) → git blob sha. */
  files: ReadonlyMap<string, string>
  /** Lowercase book → its file's path, for the books present in the release only. */
  books?: Readonly<Record<string, string>>
}

export type InputsContext = {
  resources: ReadonlyMap<string, ResourceFiles>
  /** The original-language resource whose book the helps of `book` quote. */
  originalOf(book: string): string | undefined
}

/** `book <b>` for a book's own parts; `shared` for the rest: the list's rule (`unitOfPart`), for a slot. */
export function unitOfSlot(slot: Pick<PartSlot, 'kind' | 'book'>): string {
  return unitOfPart(slot)
}

/** Read as an input of nothing: only its normalized sha256 is (`ResourceFiles.manifest`). */
const MANIFEST = 'manifest.yaml'
const clean = (path: string) => path.replace(/^\.\//, '')

const SCRIPTURE_SUBJECTS = new Set(['Bible', 'Aligned Bible', 'Greek New Testament', 'Hebrew Old Testament'])
const isText = (r: ResourceFiles) => r.type === 'scripture' || SCRIPTURE_SUBJECTS.has(String(r.subject ?? ''))
const isOriginal = (key: string) => (ORIGINAL_LANGUAGE_KEYS as readonly string[]).includes(key)

const bookPath = (r: ResourceFiles, book: string): string | undefined => (r.books?.[book] !== undefined ? clean(r.books[book]) : undefined)

/** An article file's TW group: only the `.md` files under `bible/` the loader reads as articles. */
const twFileGroup = (path: string) => (path.startsWith('bible/') && path.endsWith('.md') ? twGroupOf(path) : null)
/** A file inside a TA article directory (`<manual>/<article>/…`) has that article's group. */
const taFileGroup = (path: string) => (path.split('/').length >= 3 ? taGroupOf(path) : null)
/** A manual's own file (`translate/toc.yaml`): the manual it belongs to, read by every group of it. */
const taManualOf = (path: string) => (path.split('/').length === 2 && taGroupOf(path) !== null ? path.split('/')[0] : null)
const isLexiconFile = (path: string) => /^(content|domains)\//.test(path)
const MACULA_FILE = /^(trees|referents)\/[1-3A-Z]{3}\.json$/

/** Whether some rule gives the file to particular parts; a file no rule maps goes to every part of its resource. */
function isMapped(r: ResourceFiles, family: ResourceFamily | null, path: string): boolean {
  switch (family) {
    case 'original':
    case 'book':
      return Object.values(r.books ?? {}).some((p) => clean(p) === path)
    case 'macula':
      return MACULA_FILE.test(path)
    case 'tw':
      return twFileGroup(path) !== null
    case 'ta':
      return taFileGroup(path) !== null || taManualOf(path) !== null
    case 'lexicon':
      return isLexiconFile(path)
    case 'obs':
      return true
    default:
      return false
  }
}

const KIND_FAMILIES: Record<PartKind, readonly ResourceFamily[]> = {
  book: ['book'],
  alignments: ['book'],
  original: ['original'],
  macula: ['macula'],
  tw: ['tw'],
  ta: ['ta'],
  titles: ['tw', 'ta'],
  lexicon: ['lexicon'],
  obs: ['obs'],
  // Not built yet: the builder makes no index part until it can place index rows.
  index: [],
}

function resourceOf(ctx: InputsContext, key: string): ResourceFiles {
  const r = ctx.resources.get(key)
  if (!r) throw new Error(`No files known for ${key}`)
  return r
}

class Collector {
  readonly inputs: FingerprintInputs = { files: [], manifests: [], stamps: [] }

  files(r: ResourceFiles, keep: (path: string) => boolean) {
    for (const [path, sha] of r.files) if (path !== MANIFEST && keep(path)) this.inputs.files.push([r.key, path, sha])
  }

  manifest(r: ResourceFiles) {
    if (r.manifest !== undefined) this.inputs.manifests.push([r.key, r.manifest])
  }

  stamp(r: ResourceFiles) {
    this.inputs.stamps.push([r.key, r.stamp])
  }

  /**
   * A resource's file of one book, and its manifest. A book whose catalog path no file of the release has (a loader
   * may still find it by the end of a path) gets no blob, so its keys carry the release stamp (`bookContentStamp`):
   * then that stamp is read too.
   */
  book(r: ResourceFiles, book: string) {
    const path = bookPath(r, book)
    if (path !== undefined) {
      this.files(r, (p) => p === path)
      if (!r.files.has(path)) this.stamp(r)
    }
    this.manifest(r)
  }

  /** The original the helps of `book` quote: its book file and its manifest. */
  original(ctx: InputsContext, book: string) {
    const key = ctx.originalOf(book)
    if (key !== undefined) this.book(resourceOf(ctx, key), book)
  }

  done(): FingerprintInputs {
    return canonicalInputs(this.inputs)
  }
}

/** The inputs of one part (spec §2, the table in the 2b-2 plan's Global Constraints). */
export function partInputs(slot: PartSlot, ctx: InputsContext): FingerprintInputs {
  const r = resourceOf(ctx, slot.resource)
  const family = familyOf(r)
  if (!family || !KIND_FAMILIES[slot.kind].includes(family)) throw new Error(`A ${slot.kind} part cannot be of ${r.key} (${family ?? 'no family'})`)
  const book = slot.book ?? ''
  const group = slot.group ?? ''
  if ((BOOK_KINDS.has(slot.kind) || slot.kind === 'macula') && !book) throw new Error(`A ${slot.kind} part of ${r.key} names no book`)
  if (['tw', 'ta', 'lexicon', 'obs'].includes(slot.kind) && !group) throw new Error(`A ${slot.kind} part of ${r.key} names no group`)
  const c = new Collector()
  c.files(r, (path) => !isMapped(r, family, path))
  c.manifest(r)
  switch (slot.kind) {
    case 'book':
      c.book(r, book)
      // Helps carry quotes of the original's book.
      if (!isText(r)) c.original(ctx, book)
      break
    case 'original':
      c.book(r, book)
      break
    case 'alignments':
      c.book(r, book)
      c.original(ctx, book)
      for (const text of ctx.resources.values()) {
        if (!isOriginal(text.key) && familyOf(text) === 'book' && isText(text) && bookPath(text, book) !== undefined) c.book(text, book)
      }
      break
    case 'macula': {
      const upper = book.toUpperCase()
      c.files(r, (path) => path === `trees/${upper}.json` || path === `referents/${upper}.json`)
      break
    }
    case 'tw':
      c.files(r, (path) => twFileGroup(path) === group)
      break
    case 'ta': {
      const manual = group.split(':')[0]
      c.files(r, (path) => taFileGroup(path) === group || taManualOf(path) === manual)
      break
    }
    case 'titles':
      // Their keys carry the release (`helps-text:{kind}:{key}@{stamp}:…`).
      c.files(r, () => true)
      c.stamp(r)
      break
    case 'lexicon':
      c.files(r, (path) => isLexiconFile(path) && lexiconGroupOf(path) === group)
      break
    case 'obs':
      c.files(r, () => true)
      break
  }
  return c.done()
}

/**
 * The inputs of a unit: `keys` are the resources it builds. `book <b>`: their files of b, their unmapped files and
 * manifests, and the original's book (and the release stamp of a book no file of its release has); `shared`: every file and manifest of them, and the TW and TA release stamps.
 */
export function unitInputs(unit: string, keys: readonly string[], ctx: InputsContext): FingerprintInputs {
  const c = new Collector()
  if (unit === SHARED_UNIT) {
    for (const key of keys) {
      const r = resourceOf(ctx, key)
      c.files(r, () => true)
      c.manifest(r)
      const family = familyOf(r)
      if (family === 'tw' || family === 'ta') c.stamp(r)
    }
    return c.done()
  }
  const book = unit.match(/^book (.+)$/)?.[1]
  if (!book) throw new Error(`No unit ${JSON.stringify(unit)}`)
  for (const key of keys) {
    const r = resourceOf(ctx, key)
    const family = familyOf(r)
    c.files(r, (path) => !isMapped(r, family, path))
    c.book(r, book)
  }
  c.original(ctx, book)
  return c.done()
}

/** What a part reads that its unit does not, as `file <resource> <path> <sha>`, `manifest …`, `stamp …`; empty when within. */
export function missingFromUnit(part: FingerprintInputs, unit: FingerprintInputs): string[] {
  const tagged = (o: FingerprintInputs) => [
    ...o.files.map((f) => ['file', ...f]),
    ...o.manifests.map((m) => ['manifest', ...m]),
    ...o.stamps.map((s) => ['stamp', ...s]),
  ]
  // Compared as JSON: a path may hold spaces.
  const has = new Set(tagged(unit).map((t) => JSON.stringify(t)))
  return tagged(part)
    .filter((t) => !has.has(JSON.stringify(t)))
    .map((t) => t.join(' '))
}
