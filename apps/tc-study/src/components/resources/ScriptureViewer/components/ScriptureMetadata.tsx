/**
 * ScriptureMetadata - Metadata panel showing book and chapter information
 */

import type { ProcessedScripture } from '@bt-synergy/usfm-processor'
import type { OriginalLanguageToken } from '../types'
import { useCurrentReference } from '../../../../contexts'

interface ScriptureMetadataProps {
  loadedContent: ProcessedScripture | null
  displayVerses: any[]
  highlightTarget: OriginalLanguageToken | null
}

export function ScriptureMetadata({
  loadedContent,
  displayVerses,
  highlightTarget,
}: ScriptureMetadataProps) {
  const currentRef = useCurrentReference()

  return (
    <details className="mt-2">
      <summary className="cursor-pointer p-2 bg-blue-50 rounded-lg text-xs font-semibold text-blue-900 border border-blue-200 hover:bg-blue-100">
        📊 Book Metadata
      </summary>
      <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm border border-blue-200">
        <strong className="text-blue-900">📊 Current View:</strong>
        <ul className="mt-2 space-y-1 text-gray-700 text-xs">
          <li>• Book: {currentRef.book.toUpperCase()}</li>
          <li>• Chapter: {currentRef.chapter}</li>
          <li>• Verses displayed: {displayVerses.length}</li>
          <li>• Highlighted: {highlightTarget ? highlightTarget.content : 'None'}</li>
        </ul>

        {loadedContent?.metadata && (
          <>
            <strong className="text-blue-900 mt-3 block">📖 Book Metadata:</strong>
            <ul className="mt-2 space-y-1 text-gray-700 text-xs">
              <li>• Book: {loadedContent.metadata.bookName} ({loadedContent.metadata.bookCode})</li>
              <li>• Total Chapters: {loadedContent.metadata.totalChapters}</li>
              <li>• Total Verses: {loadedContent.metadata.totalVerses}</li>
              <li>• Total Paragraphs: {loadedContent.metadata.totalParagraphs}</li>
              <li>• Alignments: {loadedContent.alignments?.length || 0}</li>
              <li>• Translator Sections: {loadedContent.translatorSections?.length || 0}</li>
            </ul>

            <strong className="text-blue-900 mt-3 block">🗺️ Chapter-Verse Map:</strong>
            <div className="mt-2 text-xs text-gray-600 max-h-20 overflow-auto">
              {Object.entries(loadedContent.metadata.chapterVerseMap).slice(0, 10).map(([ch, count]) => (
                <span key={ch} className="inline-block mr-2">
                  {ch}:{count}
                </span>
              ))}
              {Object.keys(loadedContent.metadata.chapterVerseMap).length > 10 && (
                <span className="text-gray-400">
                  ... +{Object.keys(loadedContent.metadata.chapterVerseMap).length - 10} more
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  )
}


