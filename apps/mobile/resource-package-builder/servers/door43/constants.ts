/**
 * Door43 Server Constants
 * 
 * Reusable constants and configuration for Door43 server operations
 */

export const DOOR43_CONSTANTS = {
  // Server Information
  SERVER_NAME: 'Door43 Content Server',
  BASE_URL: 'https://content.bibletranslationtools.org',
  API_VERSION: 'v1',
  
  // API Endpoints
  ENDPOINTS: {
    CATALOG_SEARCH: '/api/v1/catalog/search',
    REPOSITORY_INFO: '/api/v1/repos/{owner}/{repo}',
    RELEASES: '/api/v1/repos/{owner}/{repo}/releases',
    TARBALL: '/api/v1/repos/{owner}/{repo}/archive/{ref}.tar.gz',
    ZIPBALL: '/api/v1/repos/{owner}/{repo}/archive/{ref}.zip'
  },
  
  // Rate Limiting
  RATE_LIMIT: {
    REQUESTS: 1000,
    WINDOW: 'hour' // 1000 requests per hour
  },
  
  // Authentication
  AUTH: {
    REQUIRED: false,
    TYPE: 'token', // 'token', 'basic', 'bearer'
    HEADER: 'Authorization'
  },
  
  // Resource Types Mapping
  RESOURCE_TYPES: {
    'ult': 'scripture',
    'ust': 'scripture', 
    'uhb': 'scripture',
    'ugnt': 'scripture',
    'glt': 'scripture',
    'tn': 'notes',
    'tq': 'questions',
    'twl': 'words-links',
    'tw': 'words',
    'ta': 'academy'
  },
  
  // File Patterns
  FILE_PATTERNS: {
    SCRIPTURE: '*.usfm',
    NOTES: '*.tsv',
    QUESTIONS: '*.tsv', 
    WORDS_LINKS: '*.tsv',
    WORDS: '*.md',
    ACADEMY: '*.md'
  },
  
  // Archive Settings
  ARCHIVE: {
    PREFERRED_FORMAT: 'tarball', // 'tarball' or 'zipball'
    EXTRACT_FILTER: {
      EXCLUDE: ['LICENSE', 'README', '.git', 'manifest.yaml'],
      INCLUDE: {
        SCRIPTURE: ['*.usfm'],
        NOTES: ['*.tsv'],
        QUESTIONS: ['*.tsv'],
        WORDS_LINKS: ['*.tsv'],
        WORDS: ['*.md'],
        ACADEMY: ['*.md']
      }
    }
  },
  
  // Default Parameters
  DEFAULTS: {
    OWNER: 'unfoldingWord',
    LANGUAGE: 'en',
    STAGE: 'prod',
    VERSION: 'latest' // Default version when not specified
  },
  
  // Error Messages
  ERRORS: {
    RESOURCE_NOT_FOUND: 'Resource not found on Door43',
    INVALID_OWNER: 'Invalid owner specified',
    INVALID_LANGUAGE: 'Invalid language code',
    DOWNLOAD_FAILED: 'Failed to download archive',
    EXTRACTION_FAILED: 'Failed to extract archive',
    API_ERROR: 'Door43 API error'
  }
} as const;

export type Door43ResourceType = keyof typeof DOOR43_CONSTANTS.RESOURCE_TYPES;
export type Door43Endpoint = keyof typeof DOOR43_CONSTANTS.ENDPOINTS;
