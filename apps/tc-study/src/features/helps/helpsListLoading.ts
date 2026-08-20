/**
 * CombinedHelps well pending vs empty. Membership (the HELPS tab) can exist
 * before TN/TWL content starts — do not treat that as a settled empty list.
 */

export function isHelpsContentPending(options: {
  tnKey: string
  twlKey: string
  tnLoading: boolean
  twlLoading: boolean
  catalogLoading?: boolean
}): boolean {
  if (options.catalogLoading) return true
  const hasTn = Boolean(options.tnKey)
  const hasTwl = Boolean(options.twlKey)
  if (!hasTn && !hasTwl) return false
  return (hasTn && options.tnLoading) || (hasTwl && options.twlLoading)
}
