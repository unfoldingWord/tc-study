/**
 * Predefined Resource Sets
 * 
 * Defines which resources to load for each language in the simplified Read page
 */

export interface PredefinedResourceSet {
  owner: string
  language: string
  resources: {
    resourceId: string
    resourceType: string
    label?: string
  }[]
}

/**
 * Default resource configurations for common languages
 * 
 * Each language gets a predefined set of resources loaded in order:
 * - Primary Bible translation (ULT/GLT/etc)
 * - Translation Notes (TN)
 * - Translation Words (TW)
 */
export const PREDEFINED_RESOURCE_SETS: Record<string, PredefinedResourceSet> = {
  // English - unfoldingWord
  'en': {
    owner: 'unfoldingWord',
    language: 'en',
    resources: [
      { resourceId: 'ult', resourceType: 'scripture', label: 'ULT - Literal Text' },
      { resourceId: 'tn', resourceType: 'notes', label: 'Translation Notes' },
      { resourceId: 'tw', resourceType: 'words', label: 'Translation Words' },
    ]
  },
  
  // Spanish (Latin America) - Gateway Language
  'es-419': {
    owner: 'es-419_gl',
    language: 'es-419',
    resources: [
      { resourceId: 'glt', resourceType: 'scripture', label: 'GLT - Gateway Language Translation' },
      { resourceId: 'tn', resourceType: 'notes', label: 'Translation Notes' },
      { resourceId: 'tw', resourceType: 'words', label: 'Translation Words' },
    ]
  },
  
  // French
  'fr': {
    owner: 'unfoldingWord',
    language: 'fr',
    resources: [
      { resourceId: 'ult', resourceType: 'scripture', label: 'ULT - Literal Text' },
      { resourceId: 'tn', resourceType: 'notes', label: 'Translation Notes' },
      { resourceId: 'tw', resourceType: 'words', label: 'Translation Words' },
    ]
  },
  
  // Portuguese (Brazil)
  'pt-br': {
    owner: 'unfoldingWord',
    language: 'pt-br',
    resources: [
      { resourceId: 'ult', resourceType: 'scripture', label: 'ULT - Literal Text' },
      { resourceId: 'tn', resourceType: 'notes', label: 'Translation Notes' },
    ]
  },
  
  // Swahili
  'sw': {
    owner: 'unfoldingWord',
    language: 'sw',
    resources: [
      { resourceId: 'ult', resourceType: 'scripture', label: 'ULT - Literal Text' },
    ]
  },
}

/**
 * Get predefined resources for a language
 * Returns null if no predefined set exists
 */
export function getPredefinedResourcesForLanguage(
  languageCode: string
): PredefinedResourceSet | null {
  return PREDEFINED_RESOURCE_SETS[languageCode] || null
}

/**
 * Get list of all languages that have predefined resource sets
 */
export function getAvailableLanguages(): string[] {
  return Object.keys(PREDEFINED_RESOURCE_SETS)
}

/**
 * Check if a language has predefined resources
 */
export function hasPredefinedResources(languageCode: string): boolean {
  return languageCode in PREDEFINED_RESOURCE_SETS
}
