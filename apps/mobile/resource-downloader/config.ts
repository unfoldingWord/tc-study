// Door43 Resource Downloader Configuration
// Edit this file to customize your download settings

export interface ResourceConfig {
  id: string;
  name: string;
  type: 'book' | 'entry';
  maxBooks?: number; // For book-organized resources (remove for all books)
  maxEntries?: number; // For entry-organized resources (remove for all entries)
  
  // Override global settings for this specific resource
  owner?: string; // Override global owner (e.g., 'unfoldingWord' for UHB/UGNT)
  language?: string; // Override global language (e.g., 'hbo' for UHB, 'el-x-koine' for UGNT)
}

export interface DownloadConfig {
  // Server and authentication
  server: string;
  owner: string;
  language: string;
  apiToken?: string; // Optional API token for authentication (increases rate limit from 60/hour to 1000+/hour)

  // Output directory
  outputDir: string;

  // Resources to download
  resources: ResourceConfig[];

  // Performance settings
  concurrency?: number;
  retryAttempts?: number;
  timeout?: number;

  // Resume/skip settings
  skipExisting?: boolean; // Skip already downloaded files (enables resume functionality)
}

// =============================================================================
// CONFIGURATION - Edit the values below to customize your download
// =============================================================================

export const downloadConfig: DownloadConfig = {
  // Door43 server settings
  server: 'git.door43.org',
  owner: 'unfoldingWord', // Change to: 'es-419_gl', 'fr_gl', etc.
  language: 'en', // Change to: 'es-419', 'fr', 'pt-br', etc.

  // API Authentication (OPTIONAL but RECOMMENDED)
  // Without token: 60 requests/hour (may hit rate limits)
  // With token: 1000+ requests/hour (much faster downloads)
  // Get token at: https://git.door43.org/user/settings/applications
  apiToken: undefined, // Set to your API token string: 'your_api_token_here'

  // Output directory name
  outputDir: 'uw-translation-resources',

  // Resources to download
  resources: [
    // Scripture Resources (book-organized)
    {
      id: 'ult',
      name: 'Unlocked Literal Translation',
      type: 'book',
      // maxBooks: 5,
    },
    {
      id: 'ust',
      name: 'Unlocked Simplified Translation',
      type: 'book',
      // maxBooks: 5,
    },
    {
      id: 'uhb',
      name: 'Hebrew Bible',
      type: 'book',
      owner: 'unfoldingWord',
      language: 'hbo', // Biblical Hebrew
      // maxBooks: 5,
    },
    {
      id: 'ugnt',
      name: 'Greek New Testament',
      type: 'book',
      owner: 'unfoldingWord',
      language: 'el-x-koine', // Koine Greek
      // maxBooks: 5,
    },

    // Translation Helps (book-organized)
    {
      id: 'tn',
      name: 'Translation Notes',
      type: 'book',
      // maxBooks: 3,
    },
    {
      id: 'tq',
      name: 'Translation Questions',
      type: 'book',
      // maxBooks: 3,
    },
    {
      id: 'twl',
      name: 'Translation Words Links',
      type: 'book',
      // maxBooks: 3,
    },

    // Reference Resources (entry-organized)
    {
      id: 'tw',
      name: 'Translation Words',
      type: 'entry',
      // maxEntries: 20,
    },
    {
      id: 'ta',
      name: 'Translation Academy',
      type: 'entry',
      // maxEntries: 10,
    },
  ],

  // Performance settings
  concurrency: 1,
  retryAttempts: 3,
  timeout: 30000,

  // Resume functionality
  skipExisting: true, // Skip already downloaded files (set to false to re-download everything)
};

// =============================================================================
// PRESET CONFIGURATIONS - Uncomment one to use
// =============================================================================

// Complete English Download (All Resources, No Limits)
// export const downloadConfig: DownloadConfig = {
//   server: 'git.door43.org',
//   owner: 'unfoldingWord',
//   language: 'en',
//   outputDir: 'complete-english-resources',
//   resources: [
//     { id: 'ult', name: 'Unlocked Literal Translation', type: 'book' },
//     { id: 'ust', name: 'Unlocked Simplified Translation', type: 'book' },
//     { id: 'uhb', name: 'Hebrew Bible', type: 'book' },
//     { id: 'ugnt', name: 'Greek New Testament', type: 'book' },
//     { id: 'tn', name: 'Translation Notes', type: 'book' },
//     { id: 'tq', name: 'Translation Questions', type: 'book' },
//     { id: 'twl', name: 'Translation Words Links', type: 'book' },
//     { id: 'tw', name: 'Translation Words', type: 'entry' },
//     { id: 'ta', name: 'Translation Academy', type: 'entry' },
//   ]
// };

// Spanish Gateway Language
// export const downloadConfig: DownloadConfig = {
//   server: 'git.door43.org',
//   owner: 'es-419_gl',
//   language: 'es-419',
//   outputDir: 'spanish-resources',
//   resources: [
//     { id: 'glt', name: 'Gateway Language Translation', type: 'book' },
//     { id: 'tn', name: 'Translation Notes', type: 'book' },
//     { id: 'tw', name: 'Translation Words', type: 'entry' },
//   ]
// };

// Test Download (Limited for Development)
// export const downloadConfig: DownloadConfig = {
//   server: 'git.door43.org',
//   owner: 'unfoldingWord',
//   language: 'en',
//   outputDir: 'test-resources',
//   resources: [
//     { id: 'ult', name: 'ULT Test', type: 'book', maxBooks: 2 },
//     { id: 'tw', name: 'TW Test', type: 'entry', maxEntries: 5 },
//   ]
// };

// =============================================================================
// AVAILABLE RESOURCE TYPES
// =============================================================================

/*
Scripture Resources (book-organized):
- ult: Unlocked Literal Translation (English)
- ust: Unlocked Simplified Translation (English)
- uhb: Hebrew Bible (Original Hebrew)
- ugnt: Greek New Testament (Original Greek)
- glt: Gateway Language Translation (Various languages)

Translation Helps (book-organized):
- tn: Translation Notes (verse-by-verse commentary)
- tq: Translation Questions (comprehension questions)
- twl: Translation Words Links (links to word definitions)

Reference Resources (entry-organized):
- tw: Translation Words (biblical term definitions)
- ta: Translation Academy (translation training articles)

Common Owner/Language Combinations:
- unfoldingWord/en: Primary English resources
- es-419_gl/es-419: Spanish Gateway Language
- fr_gl/fr: French Gateway Language
- pt-br_gl/pt-br: Portuguese Gateway Language
- ar_gl/ar: Arabic Gateway Language
*/
