/**
 * Configuration and constants for TC Study
 */

// Door43 API Configuration
export const DOOR43_API_BASE = 'https://git.door43.org/api/v1'

// API Filters for resources
export const API_FILTERS = {
  stage: 'prod',
  topic: 'tc-ready',
  subject: [
    'Bible',
    'Aligned Bible',
    'Greek New Testament',
    'Hebrew Old Testament',
    'Translation Words',
    'Translation Academy',
    'TSV Translation Notes',
    'TSV Translation Questions',
    'TSV Translation Words Links',
  ],
}

// Default subjects for quick filters
export const DEFAULT_SUBJECTS = [
  'Bible',
  'Aligned Bible',
  'Translation Words',
  'Translation Academy',
  'TSV Translation Notes',
  'TSV Translation Questions',
  'TSV Translation Words Links',
  'Greek New Testament',
  'Hebrew Old Testament',
]

// Resource type colors for UI
export const RESOURCE_TYPE_COLORS: Record<string, string> = {
  'Bible': 'bg-blue-100 text-blue-700',
  'Aligned Bible': 'bg-purple-100 text-purple-700',
  'Greek New Testament': 'bg-green-100 text-green-700',
  'Hebrew Old Testament': 'bg-amber-100 text-amber-700',
  'TSV Translation Notes': 'bg-orange-100 text-orange-700',
  'TSV Translation Questions': 'bg-pink-100 text-pink-700',
  'Translation Words': 'bg-indigo-100 text-indigo-700',
  'TSV Translation Words Links': 'bg-cyan-100 text-cyan-700',
  'Translation Academy': 'bg-emerald-100 text-emerald-700',
}

// Package storage configuration
export const PACKAGE_STORAGE_KEY = 'tc-study:packages'
export const ACTIVE_PACKAGE_KEY = 'tc-study:active-package'
