/**
 * The verses of each frame of Open Bible Stories, from bible-story-builder (`bcv-commons/bible-story-builder`, MIT,
 * unfoldingWord Box3): its `templates/OBS/<category>/<story>.md` files, where each frame is the picture
 * `![Image](obs-en-SS-FF.jpg)` followed by one or more `[[ref:BOOK C:V-V, ...]]` tags (`docs/template-format.md`). The
 * table `obs-frames` of the xtopics core is built from them. English books and numbering, those of the UHB: no conversion.
 * No Node module is used.
 *
 * ## The grammar of a tag
 *
 * Pieces separated by `,` or `;`. A piece may start with a book code (`[1-3]?[A-Z]{2,3}` and a space), which holds until
 * the next one. Then `C:V`, `C:V-V`, `C:V-C:V`, or `V` / `V-V`, which keep the chapter of the piece before. A number with no
 * chapter before it is the whole chapter. An empty tag (`[[ref:]]`) is skipped.
 *
 * ## What fails the build
 *
 * Only a change of the source's shape: a story whose frame count is not {@link OBS_FRAMES_PER_STORY}, a picture twice or of story or
 * frame 0, a tag before any picture, a book code that is neither a format 3 book nor in {@link BOOK_FIXES}, a piece that cannot be read.
 *
 * ## What is reported and left out
 *
 * A piece whose verses do not hold with the chapter lengths `lastVerse` gives (a verse past the end of its chapter, a range that runs
 * backwards), or that needs a length the build does not have (a whole chapter, or a range across chapters, of a book it did not
 * build): that piece is left out and named in the report, like the story references of `parseObsRefs`. A range across chapters is
 * split at each chapter's end, so every range of the table is within one chapter. A frame left with no verse is left out and reported;
 * so is every fix of {@link BOOK_FIXES}.
 */
import { OBS_FRAMES_PER_STORY } from '../build/obsimg'
import { BOOKS, verseId } from '../ids'

/** The book codes of bible-story-builder that are not format 3 codes, with the code they mean. A fix is reported each time. */
export const BOOK_FIXES: ReadonlyMap<string, string> = new Map([['joh', 'jhn']])

const PICTURE = /!\[[^\]]*\]\(obs-en-(\d\d)-(\d\d)\.jpg\)|\[\[ref:([^\]]*)\]\]/g
const BOOK_PIECE = /^([1-3]?[A-Za-z]{2,3})\s+(.+)$/
const PLACE = /^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/

/**
 * The ranges of every frame of the files (`files`: path to text; only `*.md`), by frame key `"N:F"`, in story and frame order.
 * `lastVerse(book, chapter)` gives a chapter's last verse, or undefined when the build does not know it (a book it did not build).
 */
export function parseObsFrames(
  files: Map<string, string>,
  report: string[],
  lastVerse: (book: string, chapter: number) => number | undefined,
): Map<string, [number, number][]> {
  const frames = new Map<number, [number, number][]>() // story * 100 + frame
  let unchecked = 0
  const fixes = new Map<string, number>()
  const dropped: string[] = []
  for (const [path, text] of [...files].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (!path.endsWith('.md')) continue
    let current: number | undefined
    for (const m of text.matchAll(PICTURE)) {
      if (m[1] !== undefined) {
        if (Number(m[1]) < 1 || Number(m[2]) < 1) throw new Error(`obs-frames: ${path}: the picture obs-en-${m[1]}-${m[2]}.jpg is not a frame (story and frame start at 1)`)
        current = Number(m[1]) * 100 + Number(m[2])
        if (frames.has(current)) throw new Error(`obs-frames: ${path}: the picture of ${key(current)} is there twice`)
        frames.set(current, [])
        continue
      }
      const tag = m[3].trim()
      if (tag === '') continue
      if (current === undefined) throw new Error(`obs-frames: ${path}: [[ref:${tag}]] comes before any frame picture`)
      const where = `${path}, ${key(current)}, [[ref:${tag}]]`
      frames.get(current)!.push(...rangesOf(tag, where, lastVerse, fixes, () => unchecked++, dropped))
    }
  }
  // The shape: every story with the frames OBS has
  for (let s = 1; s <= OBS_FRAMES_PER_STORY.length; s++) {
    const have = [...frames.keys()].filter((k) => Math.floor(k / 100) === s).sort((a, b) => a - b)
    const want = OBS_FRAMES_PER_STORY[s - 1]
    if (have.length !== want || have.some((k, i) => k % 100 !== i + 1)) {
      throw new Error(`obs-frames: story ${s} has the frames ${have.map((k) => k % 100).join(', ') || 'none'}, OBS has 1 to ${want}`)
    }
  }
  const extra = [...frames.keys()].filter((k) => Math.floor(k / 100) > OBS_FRAMES_PER_STORY.length)
  if (extra.length > 0) throw new Error(`obs-frames: frames of a story OBS does not have: ${extra.map(key).join(', ')}`)

  const out = new Map<string, [number, number][]>()
  const empty: string[] = []
  for (const k of [...frames.keys()].sort((a, b) => a - b)) {
    const list = frames.get(k)!
    if (list.length === 0) empty.push(key(k))
    else out.set(key(k), list)
  }
  for (const line of dropped) report.push(`obs-frames: left out: ${line}`)
  if (empty.length > 0) report.push(`obs-frames: ${empty.length} frames tell no verse and are left out: ${empty.join(', ')}`)
  for (const [from, n] of fixes) report.push(`obs-frames: the book code ${from.toUpperCase()} was read as ${BOOK_FIXES.get(from)} (${n} times)`)
  if (unchecked > 0) report.push(`obs-frames: ${unchecked} range ends are in chapters this build has no length for; they were not checked`)
  return out
}

const key = (k: number): string => `${Math.floor(k / 100)}:${k % 100}`

function rangesOf(
  tag: string,
  where: string,
  lastVerse: (book: string, chapter: number) => number | undefined,
  fixes: Map<string, number>,
  uncheckedOne: () => void,
  dropped: string[],
): [number, number][] {
  const out: [number, number][] = []
  let book: string | undefined
  let chapter: number | undefined
  pieces: for (const raw of tag.split(/[,;]/)) {
    let piece = raw.trim()
    if (piece === '') throw new Error(`obs-frames: ${where}: an empty piece`)
    const b = BOOK_PIECE.exec(piece)
    if (b !== null && !/^\d+$/.test(b[1])) {
      let code = b[1].toLowerCase()
      const fixed = BOOK_FIXES.get(code)
      if (fixed !== undefined) {
        fixes.set(code, (fixes.get(code) ?? 0) + 1)
        code = fixed
      }
      if (!BOOKS.includes(code)) throw new Error(`obs-frames: ${where}: ${b[1]} is not a book code`)
      book = code
      chapter = undefined
      piece = b[2].trim()
    }
    if (book === undefined) throw new Error(`obs-frames: ${where}: "${piece}" names no book`)
    const p = PLACE.exec(piece.replace(/\s+/g, ''))
    if (p === null) throw new Error(`obs-frames: ${where}: cannot read "${piece}"`)
    const [, n1, n2, n3, n4] = p
    let from: [number, number]
    let to: [number, number]
    if (n2 !== undefined) {
      // C:V, C:V-V, C:V-C:V
      chapter = Number(n1)
      from = [chapter, Number(n2)]
      if (n3 === undefined) to = from
      else if (n4 === undefined) to = [chapter, Number(n3)]
      else {
        to = [Number(n3), Number(n4)]
        chapter = to[0]
      }
    } else if (chapter !== undefined) {
      // V or V-V in the chapter before (a "C-C:V" form is not in the source)
      if (n4 !== undefined) throw new Error(`obs-frames: ${where}: cannot read "${piece}"`)
      from = [chapter, Number(n1)]
      to = [chapter, Number(n3 ?? n1)]
    } else {
      // a whole chapter, or chapters C-C
      if (n4 !== undefined) throw new Error(`obs-frames: ${where}: cannot read "${piece}"`)
      const c1 = Number(n1)
      const c2 = Number(n3 ?? n1)
      const last = lastVerse(book, c2)
      chapter = c2
      if (last === undefined) {
        dropped.push(`${where}: the whole chapter ${book} ${c2} needs its length, which this build does not have`)
        continue
      }
      from = [c1, 1]
      to = [c2, last]
    }
    for (const [c, v] of [from, to]) {
      if (c < 1 || v < 1 || c > 999 || v > 999) {
        dropped.push(`${where}: ${book} ${c}:${v} is not a verse`)
        continue pieces
      }
      const last = lastVerse(book, c)
      if (last === undefined) uncheckedOne()
      else if (v > last) {
        dropped.push(`${where}: ${book} ${c}:${v} is past the end of the chapter (${last})`)
        continue pieces
      }
    }
    if (verseId(book, from[0], from[1]) > verseId(book, to[0], to[1])) {
      dropped.push(`${where}: "${piece}" runs backwards`)
      continue
    }
    // A range across chapters is split at each chapter's end, so every range of the table is within one chapter
    const split: [number, number][] = []
    for (let c = from[0]; c <= to[0]; c++) {
      const v1 = c === from[0] ? from[1] : 1
      let v2 = to[1]
      if (c < to[0]) {
        const last = lastVerse(book, c)
        if (last === undefined) {
          dropped.push(`${where}: "${piece}" crosses the end of ${book} ${c}, whose length this build does not have`)
          continue pieces
        }
        v2 = last
      }
      split.push([verseId(book, c, v1), verseId(book, c, v2)])
    }
    out.push(...split)
  }
  return out
}
