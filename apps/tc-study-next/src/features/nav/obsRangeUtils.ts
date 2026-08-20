export type ObsRangePos = { story: number; frame: number }

export const obsPos = (story: number, frame: number) => story * 10000 + frame

export function sortObsRange(
  a: ObsRangePos,
  b: ObsRangePos
): [ObsRangePos, ObsRangePos] {
  return obsPos(a.story, a.frame) <= obsPos(b.story, b.frame) ? [a, b] : [b, a]
}

export function isObsFrameSelected(
  story: number,
  frame: number,
  obsRangeStart: ObsRangePos | null,
  obsRangeEnd: ObsRangePos | null
): boolean {
  if (!obsRangeStart) return false
  if (!obsRangeEnd) return obsRangeStart.story === story && obsRangeStart.frame === frame
  const [s, e] = sortObsRange(obsRangeStart, obsRangeEnd)
  const pos = obsPos(story, frame)
  return pos >= obsPos(s.story, s.frame) && pos <= obsPos(e.story, e.frame)
}

export function getObsSelectionCount(
  obsRangeStart: ObsRangePos | null,
  obsRangeEnd: ObsRangePos | null,
  frameCountByStory: Record<string, number>
): number {
  if (!obsRangeStart) return 0
  if (!obsRangeEnd) return 1
  const [s, e] = sortObsRange(obsRangeStart, obsRangeEnd)
  let count = 0
  for (let story = s.story; story <= e.story; story++) {
    const frameCount = frameCountByStory[String(story)] ?? 0
    const startFrame = story === s.story ? s.frame : 1
    const endFrame = story === e.story ? e.frame : frameCount
    if (endFrame >= startFrame) count += endFrame - startFrame + 1
  }
  return count
}
