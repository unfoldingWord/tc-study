/**
 * Example: Resource Type Filtering
 * 
 * Demonstrates how to use resource types to control which resources receive signals.
 */

import { useState } from 'react'
import {
  useSignal,
  useSignalHandler,
  TokenClickSignal,
  VerseNavigationSignal,
  ResourceType,
} from '@bt-synergy/resource-panels'
import { BookOpen, Library, FileText, MessageSquare } from 'lucide-react'

interface ResourceTypeFilteringExampleProps {
  resourceId: string
  resourceTitle: string
  resourceType: ResourceType
}

export function ResourceTypeFilteringExample({
  resourceId,
  resourceTitle,
  resourceType,
}: ResourceTypeFilteringExampleProps) {
  const [receivedSignals, setReceivedSignals] = useState<string[]>([])

  // Hooks for sending different signal types
  const { sendToAll, sendToResourceType: sendTokenToType } = useSignal<TokenClickSignal>(
    'token-click',
    resourceId,
    resourceType
  )
  const { sendToResourceType: sendVerseToType } = useSignal<VerseNavigationSignal>(
    'verse-navigation',
    resourceId,
    resourceType
  )

  // Handle token clicks (with type filtering)
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    (signal) => {
      setReceivedSignals((prev) => [
        `✅ Token: "${signal.token.content}" from ${signal.sourceResourceType || 'unknown'}`,
        ...prev.slice(0, 9),
      ])
    },
    {
      resourceType,
      debug: true,
    }
  )

  // Handle verse navigation (with type filtering)
  useSignalHandler<VerseNavigationSignal>(
    'verse-navigation',
    resourceId,
    (signal) => {
      const ref = signal.reference
      setReceivedSignals((prev) => [
        `✅ Verse: ${ref.book} ${ref.chapter}:${ref.verse} from ${signal.sourceResourceType || 'unknown'}`,
        ...prev.slice(0, 9),
      ])
    },
    {
      resourceType,
      debug: true,
    }
  )

  // Icon for resource type
  const getIcon = () => {
    switch (resourceType) {
      case 'scripture':
        return <BookOpen className="w-5 h-5 text-blue-600" />
      case 'translation-words':
        return <Library className="w-5 h-5 text-green-600" />
      case 'translation-notes':
        return <FileText className="w-5 h-5 text-purple-600" />
      case 'commentary':
        return <MessageSquare className="w-5 h-5 text-orange-600" />
      default:
        return <FileText className="w-5 h-5 text-gray-600" />
    }
  }

  // Color for resource type
  const getColor = () => {
    switch (resourceType) {
      case 'scripture':
        return 'bg-blue-50 border-blue-200'
      case 'translation-words':
        return 'bg-green-50 border-green-200'
      case 'translation-notes':
        return 'bg-purple-50 border-purple-200'
      case 'commentary':
        return 'bg-orange-50 border-orange-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  // Sample actions based on resource type
  const getSendActions = () => {
    if (resourceType === 'scripture') {
      return (
        <div className="space-y-2">
          <button
            onClick={() => {
              sendTokenToType(['translation-words', 'lexicon'], {
                lifecycle: 'event',
                token: {
                  id: `token-${Date.now()}`,
                  content: 'λόγος',
                  semanticId: 'G3056',
                  verseRef: 'JHN 1:1',
                  position: 1,
                  transliteration: 'logos',
                  meaning: 'word',
                },
              })
            }}
            className="w-full px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
          >
            Send Word to Lexical Resources
          </button>

          <button
            onClick={() => {
              sendVerseToType(
                ['translation-notes', 'translation-questions', 'commentary'],
                {
                  lifecycle: 'event',
                  reference: { book: 'JHN', chapter: 3, verse: 16 },
                }
              )
            }}
            className="w-full px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
          >
            Send Verse to Study Resources
          </button>

          <button
            onClick={() => {
              sendToAll({
                lifecycle: 'event',
                token: {
                  id: `token-${Date.now()}`,
                  content: 'broadcast',
                  semanticId: 'G0000',
                  verseRef: 'JHN 1:1',
                  position: 0,
                },
              })
            }}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
          >
            Broadcast to All (No Filter)
          </button>
        </div>
      )
    } else if (resourceType === 'translation-words') {
      return (
        <div className="space-y-2">
          <button
            onClick={() => {
              sendVerseToType(['scripture'], {
                lifecycle: 'event',
                reference: { book: 'JHN', chapter: 1, verse: 1 },
              })
            }}
            className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Navigate Scripture to Verse
          </button>

          <button
            onClick={() => {
              sendTokenToType(['translation-notes'], {
                lifecycle: 'event',
                token: {
                  id: `token-${Date.now()}`,
                  content: 'love',
                  semanticId: 'G0026',
                  verseRef: 'JHN 3:16',
                  position: 5,
                  transliteration: 'agape',
                  meaning: 'love',
                },
              })
            }}
            className="w-full px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
          >
            Send Word to Notes
          </button>
        </div>
      )
    } else {
      return (
        <div className="space-y-2">
          <button
            onClick={() => {
              sendToAll({
                lifecycle: 'event',
                token: {
                  id: `token-${Date.now()}`,
                  content: 'test',
                  semanticId: 'TEST',
                  verseRef: 'GEN 1:1',
                  position: 1,
                },
              })
            }}
            className="w-full px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
          >
            Send Test Token
          </button>
        </div>
      )
    }
  }

  return (
    <div className={`p-4 h-full flex flex-col border-2 rounded-lg ${getColor()}`}>
      {/* Header */}
      <div className="mb-4 pb-3 border-b border-gray-300">
        <div className="flex items-center gap-2 mb-2">
          {getIcon()}
          <h3 className="text-lg font-semibold text-gray-800">{resourceTitle}</h3>
        </div>
        <div className="text-xs space-y-1">
          <div className="text-gray-600">
            <span className="font-semibold">ID:</span> {resourceId}
          </div>
          <div className="text-gray-600">
            <span className="font-semibold">Type:</span>{' '}
            <code className="px-1 py-0.5 bg-white rounded text-xs">{resourceType}</code>
          </div>
        </div>
      </div>

      {/* Send Actions */}
      <div className="mb-4">
        <h4 className="text-sm font-semibold mb-2 text-gray-700">📤 Send Signals</h4>
        {getSendActions()}
      </div>

      {/* Received Signals */}
      <div className="flex-1 flex flex-col">
        <h4 className="text-sm font-semibold mb-2 text-gray-700">📨 Received Signals</h4>
        <div className="flex-1 p-3 bg-white rounded border border-gray-300 overflow-y-auto min-h-[120px]">
          {receivedSignals.length > 0 ? (
            <div className="space-y-1">
              {receivedSignals.map((msg, idx) => (
                <div key={idx} className="text-xs text-gray-800 font-mono">
                  {msg}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic">No signals received yet</div>
          )}
        </div>
      </div>

      {/* Help Text */}
      <div className="mt-3 pt-3 border-t border-gray-300 text-xs text-gray-600">
        <p className="font-semibold mb-1">How it works:</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Signals sent to specific types only reach those types</li>
          <li>Broadcast signals reach everyone</li>
          <li>Check console for filtering logs (debug mode on)</li>
        </ul>
      </div>
    </div>
  )
}

