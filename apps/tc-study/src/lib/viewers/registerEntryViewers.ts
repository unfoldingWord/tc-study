/**
 * Entry Viewer Registration
 * 
 * Register all entry viewers for the Entry Modal system.
 * Developers should add their entry viewer registrations here.
 */

import { TranslationWordsEntryViewer, TranslationAcademyEntryViewer } from '../../components/entryViewers'
import { createTypeMatcher, type EntryViewerRegistry } from './EntryViewerRegistry'

/**
 * Register all default entry viewers
 */
export function registerDefaultEntryViewers(registry: EntryViewerRegistry): void {
  console.log('[EntryViewers] Registering default entry viewers...')

  // Translation Words Entry Viewer
  registry.register({
    id: 'translation-words-entry',
    name: 'Translation Words Entry Viewer',
    viewer: TranslationWordsEntryViewer,
    matcher: createTypeMatcher('words'),
    priority: 100,
  })

  // Translation Academy Entry Viewer
  registry.register({
    id: 'translation-academy-entry',
    name: 'Translation Academy Entry Viewer',
    viewer: TranslationAcademyEntryViewer,
    matcher: createTypeMatcher('academy'),
    priority: 100,
  })

  // Future: Translation Questions Entry Viewer
  // registry.register({
  //   id: 'translation-questions-entry',
  //   name: 'Translation Questions Entry Viewer',
  //   viewer: TranslationQuestionsEntryViewer,
  //   matcher: createTypeMatcher('questions'),
  //   priority: 100,
  // })

  console.log('[EntryViewers] ✅ Default entry viewers registered')
}

/**
 * Example: Register a custom entry viewer
 * 
 * @example
 * ```ts
 * import { MyCustomEntryViewer } from './viewers/MyCustomEntryViewer'
 * 
 * registry.register({
 *   id: 'my-custom-entry',
 *   name: 'My Custom Entry Viewer',
 *   viewer: MyCustomEntryViewer,
 *   matcher: (metadata) => {
 *     return metadata.type === 'custom' && metadata.owner === 'myOrg'
 *   },
 *   priority: 150, // Higher priority = checked first
 * })
 * ```
 */
export function registerCustomEntryViewer(
  registry: EntryViewerRegistry,
  registration: {
    id: string
    name: string
    viewer: any
    matcher: (metadata: any) => boolean
    priority?: number
  }
): void {
  registry.register(registration)
}
