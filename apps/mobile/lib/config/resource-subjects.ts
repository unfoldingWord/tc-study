/**
 * Resource Subjects Configuration
 * 
 * Defines the list of subjects used for filtering Door43 API calls.
 * This list is used consistently across all API calls (languages, organizations, resources).
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
] as const;

export type ResourceSubject = typeof DEFAULT_SUBJECTS[number];

/**
 * Get the current active subjects list
 * Can be extended to read from settings/config
 */
export function getActiveSubjects(): string[] {
  // For now, return default subjects
  // In the future, this could read from user settings/preferences
  return [...DEFAULT_SUBJECTS];
}

/**
 * API filter configuration
 */
export const API_FILTERS = {
  subjects: DEFAULT_SUBJECTS as unknown as string[],
  stage: 'prod' as const,
  topic: 'tc-ready' as const,
};

/**
 * All supported resource subjects for taxonomy and filtering
 */
export const ALL_RESOURCE_SUBJECTS = DEFAULT_SUBJECTS;
