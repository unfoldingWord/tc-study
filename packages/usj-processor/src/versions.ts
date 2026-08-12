/**
 * P2 content processing version for USJ SoT cache entries.
 * Refuse mismatched versions on read (treat as cache miss / reprocess).
 */
export const USJ_PROCESSING_VERSION = '2.0.0-usj'

/** Embedded tool versions written into USJ cache metadata. */
export const USJ_TOOL_VERSIONS = {
  parser: '0.1.0',
  usjCore: '0.1.0',
} as const

export type UsjToolVersions = {
  parser: string
  usjCore: string
}
