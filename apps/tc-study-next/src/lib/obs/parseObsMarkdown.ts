/**
 * OBS story markdown parsing (aligned with my-expo-app ZipProcessingUtils).
 * Stories are Markdown files with image+text frames.
 */

export interface ObsFrame {
  frameNumber: number
  imageUrl: string
  /** Absolute URL for <img src> (set by ObsLoader when resolving relative paths) */
  resolvedSrc?: string
  text: string
}

export interface ParsedObsStory {
  storyNumber: number
  title: string
  sourceReference: string | null
  frames: ObsFrame[]
}

/**
 * Extract source reference from story content (trailing _ref_ line).
 */
export function extractSourceReference(content: string): {
  sourceReference: string | null
  cleanedContent: string
} {
  const lines = content.split('\n')
  let sourceReference: string | null = null
  let lastNonBlankLineIndex = -1

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line) {
      lastNonBlankLineIndex = i
      const sourceReferenceMatch = line.match(/_([^_]+)_/)
      if (sourceReferenceMatch) {
        sourceReference = sourceReferenceMatch[1].trim()
      }
      break
    }
  }

  let cleanedContent = content
  if (sourceReference !== null && lastNonBlankLineIndex >= 0) {
    const modifiedLines = [...lines]
    modifiedLines[lastNonBlankLineIndex] = ''
    cleanedContent = modifiedLines.join('\n').trim()
  }

  return { sourceReference, cleanedContent }
}

const FRAME_PARSE_REGEX =
  /!\[[^\]]*?\]\(([^)]+?)\)\s*([\s\S]*?)(?=(?:!\[[^\]]*?\]\([^)]+?\))|$)/g

/**
 * Parse a single OBS story markdown file into title and frames.
 */
export function parseObsStoryMarkdown(
  storyNumber: number,
  rawMarkdown: string
): ParsedObsStory {
  const contentLines = rawMarkdown.split('\n')
  let titleFromContent = ''
  if (contentLines.length > 0) {
    const firstLine = contentLines[0].trim()
    if (firstLine.startsWith('# ')) {
      titleFromContent = firstLine.slice(2).trim()
    }
  }

  const title = titleFromContent || `Story ${storyNumber}`
  const { sourceReference, cleanedContent } = extractSourceReference(rawMarkdown)

  const frames: ObsFrame[] = []
  let frameNumber = 0
  let match: RegExpExecArray | null
  FRAME_PARSE_REGEX.lastIndex = 0
  while ((match = FRAME_PARSE_REGEX.exec(cleanedContent)) !== null) {
    frameNumber++
    const imageUrl = match[1].trim()
    const text = match[2].trim()
    if (!imageUrl || !text) {
      continue
    }
    frames.push({ frameNumber, imageUrl, text })
  }

  return {
    storyNumber,
    title,
    sourceReference,
    frames,
  }
}

/** Normalize story id from URL or UI to padded two-digit string for ingredients */
export function normalizeObsStoryId(storyId: string): string {
  const n = parseInt(storyId, 10)
  if (Number.isNaN(n) || n < 1) return '01'
  return n.toString().padStart(2, '0')
}
