/**
 * Resource Subjects Configuration
 * 
 * Re-exports shared configuration from @bt-synergy/package-builder
 */

export {
  DEFAULT_SUBJECTS,
  DEFAULT_API_FILTERS as API_FILTERS,
  type ResourceSubject,
} from '@bt-synergy/package-builder'

import { DEFAULT_SUBJECTS } from '@bt-synergy/package-builder'

/**
 * Get the current active subjects list
 * Can be extended to read from settings/config
 */
export function getActiveSubjects(): string[] {
  // For now, return default subjects
  // In the future, this could read from localStorage or user settings
  return [...DEFAULT_SUBJECTS]
}