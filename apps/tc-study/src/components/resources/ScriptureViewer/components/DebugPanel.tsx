/**
 * DebugPanel - Combined debug info and metadata panel
 * Shows loading state, content info, metadata, and highlight state
 */

import type { ProcessedChapter, ProcessedScripture, ProcessedVerse } from '@bt-synergy/usfm-processor'
import { X } from 'lucide-react'
import type { ReferenceState } from '../../../../contexts/types-only'
import type { OriginalLanguageToken } from '../types'

type BookLike = string | { identifier?: string; code?: string; id?: string }
type LangLike = { title?: string; name?: string; identifier?: string; code?: string }

/** Debug-only metadata shape (catalog fields vary by resource). */
type DebugCatalogMetadata = {
  license?: unknown
  longDescription?: unknown
  licenseFile?: unknown
  contentMetadata?: {
    contentType?: unknown
    preloadedBundleFile?: unknown
    ingredients?: unknown[]
  }
  [key: string]: unknown
}

interface DebugPanelProps {
  isLoading: boolean
  error: Error | null
  loadedContent: ProcessedScripture | null
  catalogMetadata: DebugCatalogMetadata | null
  availableBooks: BookLike[]
  currentChapter: ProcessedChapter | null
  displayVerses: ProcessedVerse[]
  currentRef: ReferenceState
  highlightTarget: OriginalLanguageToken | null
  onClose: () => void
}

export function DebugPanel({
  isLoading,
  error,
  loadedContent,
  catalogMetadata,
  availableBooks,
  currentChapter,
  displayVerses,
  currentRef,
  highlightTarget,
  onClose,
}: DebugPanelProps) {
  return (
    <div className="fixed bottom-14 right-4 w-96 max-h-[70vh] bg-white border-2 border-gray-300 rounded-lg shadow-xl overflow-hidden z-50">
      {/* Header with close button */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-300">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Debug Panel</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded transition-colors"
          title="Close debug panel"
          aria-label="Close debug panel"
        >
          <X className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="overflow-y-auto max-h-[calc(70vh-3rem)] p-4 space-y-4">
        {/* Loading State */}
        <section>
          <h3 className="text-xs font-bold text-gray-600 mb-2">📊 Loading State</h3>
          <div className="text-xs space-y-1">
            <div>isLoading: {isLoading ? '⏳' : '✅'}</div>
            <div>error: {error ? '❌' : '✅'}</div>
            {error && <div className="text-red-600 text-xs">{error.message}</div>}
          </div>
        </section>

        {/* Content State */}
        <section>
          <h3 className="text-xs font-bold text-gray-600 mb-2">📖 Content State</h3>
          <div className="text-xs space-y-1">
            <div>loadedContent: {loadedContent ? '✅' : '❌'}</div>
            <div>availableBooks: {availableBooks.length}</div>
            <div>currentChapter: {currentChapter ? '✅' : '❌'}</div>
            <div>displayVerses: {displayVerses.length}</div>
          </div>
        </section>

        {/* Current Reference */}
        <section>
          <h3 className="text-xs font-bold text-gray-600 mb-2">📍 Current Reference</h3>
          <div className="text-xs space-y-1">
            <div>Book: {currentRef.book}</div>
            <div>Chapter: {currentRef.chapter}</div>
            <div>Verse: {currentRef.verse || 'all'}</div>
          </div>
        </section>

        {/* Catalog Entry (Door43 Manifest) */}
        {catalogMetadata && (
          <section>
            <h3 className="text-xs font-bold text-gray-600 mb-2">📦 Catalog Entry (Door43)</h3>
            <div className="text-xs space-y-1">
              {/* Display all top-level string fields */}
              {Object.entries(catalogMetadata).map(([key, value]) => {
                // Skip complex objects and undefined values
                if (value === undefined || value === null) return null
                if (typeof value === 'object') return null
                if (key === 'resourceKey' || key === 'resourceId' || key === 'server' || key === 'location') return null
                
                return (
                  <div key={key}>
                    <strong>{key.charAt(0).toUpperCase() + key.slice(1)}:</strong> {String(value)}
                  </div>
                )
              })}
              
              {/* Explicitly show license if present */}
              {catalogMetadata.license != null && (
                <div className="bg-yellow-50 p-1 rounded">
                  <strong>License:</strong> {String(catalogMetadata.license)}
                </div>
              )}
              
              {/* Long Description / README */}
              {catalogMetadata.longDescription != null && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-gray-600 hover:text-gray-800 font-semibold">
                    📖 README / Long Description
                  </summary>
                  <div className="mt-2 text-xs bg-gray-50 p-3 rounded max-h-60 overflow-y-auto whitespace-pre-wrap">
                    {String(catalogMetadata.longDescription)}
                  </div>
                </details>
              )}
              
              {/* LICENSE File */}
              {catalogMetadata.licenseFile != null && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-gray-600 hover:text-gray-800 font-semibold">
                    📜 LICENSE File
                  </summary>
                  <div className="mt-2 text-xs bg-gray-50 p-3 rounded max-h-60 overflow-y-auto whitespace-pre-wrap font-mono">
                    {String(catalogMetadata.licenseFile)}
                  </div>
                </details>
              )}
              
              {/* Show contentMetadata if present */}
              {catalogMetadata.contentMetadata && (
                <>
                  <div className="mt-2"><strong>Content Type:</strong> {String(catalogMetadata.contentMetadata.contentType ?? 'N/A')}</div>
                  {catalogMetadata.contentMetadata.preloadedBundleFile != null && (
                    <div><strong>Preloaded:</strong> ✅ Yes</div>
                  )}
                  {catalogMetadata.contentMetadata.ingredients && (
                    <div><strong>Ingredients:</strong> {catalogMetadata.contentMetadata.ingredients.length}</div>
                  )}
                </>
              )}
              
              {/* Raw catalog metadata */}
              <details className="mt-2">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                  Raw catalog metadata
                </summary>
                <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-x-auto max-h-40 overflow-y-auto">
                  {JSON.stringify(catalogMetadata, null, 2)}
                </pre>
              </details>
            </div>
          </section>
        )}

        {/* Available Books */}
        {availableBooks.length > 0 && (
          <section>
            <h3 className="text-xs font-bold text-gray-600 mb-2">📚 Available Books ({availableBooks.length})</h3>
            <div className="text-xs text-gray-700">
              <div className="max-h-20 overflow-y-auto mb-2">
                {availableBooks.map((book, idx) => {
                  // Handle both string and object formats
                  const bookCode =
                    typeof book === 'string'
                      ? book
                      : book.identifier || book.code || book.id || String(book)
                  return <span key={idx}>{bookCode}{idx < availableBooks.length - 1 ? ', ' : ''}</span>
                })}
              </div>
              {/* Show raw structure if it's objects */}
              {availableBooks.length > 0 && typeof availableBooks[0] === 'object' && (
                <details>
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700 text-xs">
                    Raw book structure
                  </summary>
                  <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-x-auto max-h-32 overflow-y-auto">
                    {JSON.stringify(availableBooks.slice(0, 3), null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </section>
        )}

        {/* USFM Metadata (from parsed content) */}
        {loadedContent && loadedContent.metadata && (
          <section>
            <h3 className="text-xs font-bold text-gray-600 mb-2">ℹ️ USFM Metadata (Parsed Content)</h3>
            <div className="text-xs space-y-1">
              {/* Try common field names */}
              {Object.entries(loadedContent.metadata).map(([key, value]) => {
                // Skip complex nested objects for now
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                  // Handle language object specially
                  if (key === 'language') {
                    const lang = value as LangLike
                    return (
                      <div key={key}>
                        <strong>Language:</strong> {lang.title || lang.name || lang.identifier || lang.code || 'N/A'}
                      </div>
                    )
                  }
                  return null
                }
                
                // Skip empty values
                if (!value) return null
                
                // Display simple values
                return (
                  <div key={key}>
                    <strong>{key.charAt(0).toUpperCase() + key.slice(1)}:</strong> {String(value)}
                  </div>
                )
              })}
              
              {/* Raw metadata for debugging (collapsed) */}
              <details className="mt-2">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                  Raw metadata (JSON)
                </summary>
                <pre className="text-xs bg-gray-50 p-2 rounded mt-1 overflow-x-auto max-h-40 overflow-y-auto">
                  {JSON.stringify(loadedContent.metadata, null, 2)}
                </pre>
              </details>
            </div>
          </section>
        )}

        {/* Book / chapter structure */}
        {loadedContent?.chapters && loadedContent.chapters.length > 0 && (
          <section>
            <h3 className="text-xs font-bold text-gray-600 mb-2">📋 Book structure</h3>
            <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
              <div className="flex justify-between">
                <span>{(loadedContent.book || loadedContent.bookCode || '').toUpperCase()}</span>
                <span className="text-gray-500">{loadedContent.chapters.length} ch</span>
              </div>
            </div>
          </section>
        )}

        {/* Alignment Info */}
        {loadedContent?.alignments && loadedContent.alignments.length > 0 && (
          <section>
            <h3 className="text-xs font-bold text-gray-600 mb-2">🔗 Alignments</h3>
            <div className="text-xs">
              <div>Total alignments: {loadedContent.alignments.length}</div>
            </div>
          </section>
        )}

        {/* Highlight State */}
        {highlightTarget && (
          <section>
            <h3 className="text-xs font-bold text-gray-600 mb-2">🎯 Highlight Target</h3>
            <div className="text-xs space-y-1">
              <div><strong>Content:</strong> {highlightTarget.content}</div>
              <div><strong>Semantic ID:</strong> {highlightTarget.semanticId}</div>
              <div><strong>Verse:</strong> {highlightTarget.verseRef}</div>
              {highlightTarget.strong && (
                <div><strong>Strong's:</strong> {highlightTarget.strong}</div>
              )}
              {highlightTarget.lemma && (
                <div><strong>Lemma:</strong> {highlightTarget.lemma}</div>
              )}
              {highlightTarget.morph && (
                <div><strong>Morph:</strong> {highlightTarget.morph}</div>
              )}
              {highlightTarget.alignedSemanticIds && highlightTarget.alignedSemanticIds.length > 0 && (
                <div>
                  <strong>Aligned IDs:</strong> {highlightTarget.alignedSemanticIds.length}
                  <div className="text-xs text-gray-500 max-h-20 overflow-y-auto mt-1">
                    {highlightTarget.alignedSemanticIds.join(', ')}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Current Verses */}
        {displayVerses.length > 0 && (
          <section>
            <h3 className="text-xs font-bold text-gray-600 mb-2">📝 Current Verses</h3>
            <div className="text-xs">
              <div>Rendering {displayVerses.length} verse(s)</div>
              <div className="text-gray-500">
                {displayVerses.map(v => v.number).join(', ')}
              </div>
            </div>
          </section>
        )}

        {/* Raw Content Structure */}
        {loadedContent && (
          <section>
            <details>
              <summary className="text-xs font-bold text-gray-600 cursor-pointer hover:text-gray-800">
                🔍 Raw Content Structure
              </summary>
              <div className="mt-2">
                <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto max-h-60 overflow-y-auto">
                  {JSON.stringify({
                    metadata: loadedContent.metadata,
                    book: loadedContent.book,
                    chapterCount: loadedContent.chapters?.length ?? 0,
                    hasAlignments: loadedContent.alignments && loadedContent.alignments.length > 0,
                    alignmentCount: loadedContent.alignments?.length || 0,
                  }, null, 2)}
                </pre>
              </div>
            </details>
          </section>
        )}
      </div>
    </div>
  )
}
