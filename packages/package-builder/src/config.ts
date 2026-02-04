/**
 * Default configuration for package builder
 */

export const DEFAULT_SUBJECTS = [
  'Bible',
  'Aligned Bible',
  'Greek New Testament',
  'Hebrew Old Testament',
  'Translation Words',
  'Translation Academy',
  'TSV Translation Notes',
  'TSV Translation Questions',
  'TSV Translation Words Links',
] as const

export type ResourceSubject = typeof DEFAULT_SUBJECTS[number]

export const DEFAULT_API_FILTERS = {
  subjects: DEFAULT_SUBJECTS as unknown as string[],
  stage: 'prod' as const,
  topic: 'tc-ready' as const,
}

export const DEFAULT_PACKAGE_CONFIG = {
  defaultServer: 'https://git.door43.org',
}

export const ORIGINAL_LANGUAGE_RESOURCES = {
  greek: {
    organization: 'unfoldingWord',
    language: 'el-x-koine',
    resourceId: 'ugnt',
  },
  hebrew: {
    organization: 'unfoldingWord',
    language: 'hbo',
    resourceId: 'uhb',
  },
} as const
