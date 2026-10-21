/**
 * Warm cancel on pane-language change.
 *
 * Download isolation already keeps a mixed text+helps zip queue alive.
 * Warm used to cancel *every* job for the dropped language, which also
 * killed the other pane when both panes shared that language.
 */

export function shouldCancelWarmJobsForLanguage(options: {
  previousLanguage: string
  nextTextLanguage: string
  nextHelpsLanguage: string
}): boolean {
  const prev = options.previousLanguage.toLowerCase()
  if (!prev) return false
  const nextText = options.nextTextLanguage.toLowerCase()
  const nextHelps = options.nextHelpsLanguage.toLowerCase()
  return prev !== nextText && prev !== nextHelps
}
