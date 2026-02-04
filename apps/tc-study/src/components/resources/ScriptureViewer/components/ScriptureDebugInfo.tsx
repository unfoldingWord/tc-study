/**
 * ScriptureDebugInfo - Debug panel showing internal state
 */

import type { ProcessedVerse } from '@bt-synergy/usfm-processor'
import type { BookInfo } from '../../../../contexts/types-only'

interface ScriptureDebugInfoProps {
  isLoading: boolean
  error: string | null
  loadedContent: any
  availableBooks: BookInfo[]
  currentChapter: any
  displayVerses: ProcessedVerse[]
  currentRef: any
}

export function ScriptureDebugInfo({
  isLoading,
  error,
  loadedContent,
  availableBooks,
  currentChapter,
  displayVerses,
  currentRef,
}: ScriptureDebugInfoProps) {
  return (
    <details className="mt-4">
      <summary className="cursor-pointer p-2 bg-yellow-50 rounded-lg text-xs font-semibold text-yellow-900 border border-yellow-200 hover:bg-yellow-100">
        🐛 Debug State
      </summary>
      <div className="mt-2 p-3 bg-yellow-50 rounded-lg text-xs border border-yellow-200">
        <ul className="space-y-1 text-yellow-800 font-mono">
          <li>• isLoading: {String(isLoading)}</li>
          <li>• error: {error || 'null'}</li>
          <li>• loadedContent: {loadedContent ? '✅' : '❌'}</li>
          <li>• availableBooks: {availableBooks.length}</li>
          <li>• currentChapter: {currentChapter ? `✅ (${currentChapter.verses.length} verses)` : '❌'}</li>
          <li>• displayVerses: {displayVerses.length}</li>
          <li>• currentRef: {JSON.stringify(currentRef)}</li>
          {displayVerses.length > 0 && (
            <>
              <li>• First verse number: {displayVerses[0].number}</li>
              <li>• First verse has wordTokens: {String(!!displayVerses[0].wordTokens)}</li>
              <li>• First verse wordTokens length: {displayVerses[0].wordTokens?.length || 0}</li>
              <li>• First verse has text: {String(!!displayVerses[0].text)}</li>
              <li>• First verse text preview: {displayVerses[0].text ? displayVerses[0].text.substring(0, 50) + '...' : 'null'}</li>
              <li>• First verse keys: {Object.keys(displayVerses[0]).join(', ')}</li>
            </>
          )}
        </ul>
      </div>
    </details>
  )
}


