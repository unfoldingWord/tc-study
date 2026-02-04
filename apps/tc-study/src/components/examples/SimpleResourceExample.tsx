/**
 * Example: Simple Resource Viewer using @bt-synergy/resource-panels
 * 
 * This demonstrates the simplified API for building interactive resources
 * that communicate with other resources in the panel system.
 */

import { useState } from 'react'
import { 
  useSignal, 
  useSignalHandler,
  TokenClickSignal,
  LinkClickSignal,
  VerseNavigationSignal
} from '@bt-synergy/resource-panels'
import { Zap, Link as LinkIcon, BookOpen } from 'lucide-react'

interface SimpleResourceExampleProps {
  resourceId: string
  resourceTitle: string
}

/**
 * A simple resource viewer that demonstrates:
 * 1. Sending signals (token-click, link-click, verse-navigation)
 * 2. Receiving signals from other resources
 * 3. Type-safe signal handling with IntelliSense
 */
export function SimpleResourceExample({ resourceId, resourceTitle }: SimpleResourceExampleProps) {
  // State for displaying received data
  const [receivedToken, setReceivedToken] = useState<string | null>(null)
  const [receivedLink, setReceivedLink] = useState<string | null>(null)
  const [receivedVerse, setReceivedVerse] = useState<string | null>(null)

  // ==========================================
  // SENDING SIGNALS
  // ==========================================

  // Hook for sending token-click signals
  const { sendToAll: sendTokenClick } = useSignal<TokenClickSignal>('token-click', resourceId)

  // Hook for sending link-click signals
  const { sendToAll: sendLinkClick } = useSignal<LinkClickSignal>('link-click', resourceId)

  // Hook for sending verse-navigation signals
  const { sendToAll: sendVerseNavigation } = useSignal<VerseNavigationSignal>('verse-navigation', resourceId)

  // ==========================================
  // RECEIVING SIGNALS
  // ==========================================

  // Listen for token clicks from other resources
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    (signal) => {
      console.log(`✅ [${resourceId}] Received token:`, signal.token.content)
      setReceivedToken(`${signal.token.content} (${signal.token.semanticId})`)
    },
    { debug: true } // Enable debug logging during development
  )

  // Listen for link clicks
  useSignalHandler<LinkClickSignal>(
    'link-click',
    resourceId,
    (signal) => {
      console.log(`✅ [${resourceId}] Received link:`, signal.link.url)
      setReceivedLink(signal.link.url)
    },
    { debug: true }
  )

  // Listen for verse navigation
  useSignalHandler<VerseNavigationSignal>(
    'verse-navigation',
    resourceId,
    (signal) => {
      const { book, chapter, verse } = signal.reference
      console.log(`✅ [${resourceId}] Navigate to:`, `${book} ${chapter}:${verse}`)
      setReceivedVerse(`${book} ${chapter}:${verse}`)
    },
    { debug: true }
  )

  // ==========================================
  // EVENT HANDLERS
  // ==========================================

  const handleSendTokenClick = () => {
    sendTokenClick({
      lifecycle: 'event',
      token: {
        id: `token-${Date.now()}`,
        content: 'λόγος',
        semanticId: 'G3056',
        verseRef: 'JHN 1:1',
        position: 4,
        transliteration: 'logos',
        meaning: 'word'
      }
    })
  }

  const handleSendLinkClick = () => {
    sendLinkClick({
      lifecycle: 'event',
      link: {
        url: 'rc://en/tw/dict/bible/kt/love',
        text: 'love',
        resourceType: 'translation-words',
        resourceId: 'en_tw'
      }
    })
  }

  const handleSendVerseNavigation = () => {
    sendVerseNavigation({
      lifecycle: 'event',
      reference: {
        book: 'JHN',
        chapter: 3,
        verse: 16
      }
    })
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="p-4 h-full flex flex-col bg-white">
      {/* Header */}
      <div className="mb-4 pb-3 border-b">
        <h3 className="text-lg font-semibold text-gray-800">{resourceTitle}</h3>
        <p className="text-xs text-gray-500">{resourceId}</p>
      </div>

      {/* Send Signals Section */}
      <div className="mb-4">
        <h4 className="text-sm font-semibold mb-2 text-gray-700">📤 Send Signals</h4>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleSendTokenClick}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            <Zap className="w-4 h-4" />
            Send Token Click
          </button>
          
          <button
            onClick={handleSendLinkClick}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
          >
            <LinkIcon className="w-4 h-4" />
            Send Link Click
          </button>
          
          <button
            onClick={handleSendVerseNavigation}
            className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
          >
            <BookOpen className="w-4 h-4" />
            Send Verse Navigation
          </button>
        </div>
      </div>

      {/* Received Signals Section */}
      <div className="flex-1 min-h-0">
        <h4 className="text-sm font-semibold mb-2 text-gray-700">📥 Received Signals</h4>
        
        <div className="space-y-2">
          {receivedToken && (
            <div className="p-3 bg-blue-50 rounded border border-blue-200">
              <p className="text-xs font-semibold text-blue-800">Token Click:</p>
              <p className="text-sm text-blue-900">{receivedToken}</p>
            </div>
          )}
          
          {receivedLink && (
            <div className="p-3 bg-green-50 rounded border border-green-200">
              <p className="text-xs font-semibold text-green-800">Link Click:</p>
              <p className="text-sm text-green-900 break-all">{receivedLink}</p>
            </div>
          )}
          
          {receivedVerse && (
            <div className="p-3 bg-purple-50 rounded border border-purple-200">
              <p className="text-xs font-semibold text-purple-800">Verse Navigation:</p>
              <p className="text-sm text-purple-900">{receivedVerse}</p>
            </div>
          )}

          {!receivedToken && !receivedLink && !receivedVerse && (
            <div className="p-4 text-center text-gray-400 text-sm">
              No signals received yet
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-4 pt-3 border-t text-xs text-gray-500">
        <p><strong>How to use:</strong></p>
        <ul className="list-disc list-inside space-y-1">
          <li>Click buttons to send signals to other resources</li>
          <li>Open another instance in a different panel to test</li>
          <li>Check console for debug logs</li>
        </ul>
      </div>
    </div>
  )
}

