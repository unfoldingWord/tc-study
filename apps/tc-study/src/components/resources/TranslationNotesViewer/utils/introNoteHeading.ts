const HEADING_LINE = /^#{1,6}\s+(.+?)\s*#*\s*$/
const OPENS_WITH_HEADING = /^#{1,6}\s+\S/

/** Door43 notes store breaks as the two characters `\` + `n`. */
function noteLines(markdown: string): string[] {
  return markdown.replace(/\\n/g, '\n').replace(/\\r/g, '\r').split(/\r?\n/)
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim()
}

/** First markdown heading, or the first non-empty line when the note has none. */
export function introNoteHeading(markdown: string): string {
  const lines = noteLines(markdown)
  for (const raw of lines) {
    const heading = HEADING_LINE.exec(raw.trim())
    if (!heading) continue
    const plain = stripInlineMarkdown(heading[1] ?? '')
    if (plain) return plain
  }
  for (const raw of lines) {
    const plain = stripInlineMarkdown(raw.trim())
    if (plain) return plain
  }
  return ''
}

/**
 * Book/chapter intros are long, unquoted, and open with a heading.
 * `isIntro` is set at parse time; the heading check covers notes cached
 * before that flag existed (`2:intro` already rewritten to `2:1`).
 */
export function shouldCollapseIntroNote(note: {
  isIntro?: boolean
  note?: string
  quote?: string
}): boolean {
  if (note.isIntro) return true
  if (note.quote?.trim()) return false
  const body = note.note ?? ''
  if (body.length < 400) return false
  const first = noteLines(body).map((line) => line.trim()).find(Boolean) ?? ''
  return OPENS_WITH_HEADING.test(first)
}
