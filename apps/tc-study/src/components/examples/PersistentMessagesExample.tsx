/**
 * Example: Persistent vs Ephemeral Messages
 * 
 * This demonstrates the difference between:
 * - Ephemeral messages (cleared on navigation)
 * - Persistent messages (stay until manually cleared)
 */

import { useState } from 'react'
import {
  useSignal,
  useSignalHandler,
  useSignalStore,
  useSignalCleanup,
  TokenClickSignal,
  VerseNavigationSignal,
} from '@bt-synergy/resource-panels'
import { Zap, BookOpen, Trash2, RefreshCw } from 'lucide-react'

interface PersistentMessagesExampleProps {
  resourceId: string
  resourceTitle: string
}

export function PersistentMessagesExample({
  resourceId,
  resourceTitle,
}: PersistentMessagesExampleProps) {
  const [simulateNavigation, setSimulateNavigation] = useState(false)

  // Signal store for managing persistent messages
  const {
    getLatestSignal,
    getSignalsOfType,
    getSignalCount,
    clearAllSignals,
    clearSignalsOfType,
    clearSignal,
  } = useSignalStore(resourceId)

  // Auto-cleanup ephemeral messages on navigation
  useSignalCleanup(resourceId)

  // Hooks for sending signals
  const { sendToAll: sendTokenClick } = useSignal<TokenClickSignal>('token-click', resourceId)
  const { sendToAll: sendVerseNav } = useSignal<VerseNavigationSignal>(
    'verse-navigation',
    resourceId
  )

  // State for displaying received messages
  const [ephemeralMessages, setEphemeralMessages] = useState<string[]>([])

  // Handle ephemeral token-click messages
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    (signal) => {
      if (!signal.persistent) {
        setEphemeralMessages((prev) => [
          `Token: ${signal.token.content} (${signal.token.semanticId})`,
          ...prev.slice(0, 4),
        ])
      }
    },
    { debug: true }
  )

  // Handle persistent verse-navigation messages (automatically stored)
  useSignalHandler<VerseNavigationSignal>(
    'verse-navigation',
    resourceId,
    (signal) => {
      console.log('📖 Verse navigation received:', signal.reference)
    },
    { debug: true }
  )

  // Get persistent verse history
  const verseHistory = getSignalsOfType<VerseNavigationSignal>('verse-navigation')
  const currentVerse = getLatestSignal<VerseNavigationSignal>('verse-navigation')
  const verseCount = getSignalCount('verse-navigation')

  // Send ephemeral token-click
  const handleSendEphemeral = () => {
    sendTokenClick({
      lifecycle: 'event',
      // persistent: false (default - will be cleared on navigation)
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
  }

  // Send persistent verse navigation
  const handleSendPersistent = () => {
    const verses = [
      { book: 'JHN', chapter: 1, verse: 1 },
      { book: 'JHN', chapter: 3, verse: 16 },
      { book: 'GEN', chapter: 1, verse: 1 },
      { book: 'REV', chapter: 22, verse: 21 },
    ]
    const randomVerse = verses[Math.floor(Math.random() * verses.length)]

    sendVerseNav({
      lifecycle: 'event',
      persistent: true, // Will stay until cleared
      id: 'current-verse', // Consistent ID replaces previous verse
      reference: randomVerse,
    })
  }

  // Simulate navigation (clears ephemeral messages)
  const handleSimulateNavigation = () => {
    setSimulateNavigation(true)
    setEphemeralMessages([]) // Clear ephemeral messages
    setTimeout(() => setSimulateNavigation(false), 1000)
  }

  return (
    <div className="p-4 h-full flex flex-col bg-white">
      {/* Header */}
      <div className="mb-4 pb-3 border-b">
        <h3 className="text-lg font-semibold text-gray-800">{resourceTitle}</h3>
        <p className="text-xs text-gray-500">{resourceId}</p>
      </div>

      {/* Send Messages */}
      <div className="mb-4">
        <h4 className="text-sm font-semibold mb-2 text-gray-700">📤 Send Messages</h4>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleSendEphemeral}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            <Zap className="w-4 h-4" />
            Send Ephemeral (Token Click)
          </button>

          <button
            onClick={handleSendPersistent}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
          >
            <BookOpen className="w-4 h-4" />
            Send Persistent (Verse Navigation)
          </button>
        </div>
      </div>

      {/* Ephemeral Messages */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700">
            ⚡ Ephemeral Messages (Auto-Cleared)
          </h4>
          <button
            onClick={handleSimulateNavigation}
            className="flex items-center gap-1 px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-xs"
            disabled={simulateNavigation}
          >
            <RefreshCw className={`w-3 h-3 ${simulateNavigation ? 'animate-spin' : ''}`} />
            Simulate Navigation
          </button>
        </div>

        <div className="p-3 bg-blue-50 rounded border border-blue-200 min-h-[80px]">
          {ephemeralMessages.length > 0 ? (
            <div className="space-y-1">
              {ephemeralMessages.map((msg, idx) => (
                <div key={idx} className="text-xs text-blue-900">
                  {msg}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-blue-400 italic">
              No ephemeral messages (cleared on navigation)
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          These messages disappear when you click "Simulate Navigation"
        </p>
      </div>

      {/* Persistent Messages */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-700">
            💾 Persistent Messages ({verseCount})
          </h4>
          <div className="flex gap-1">
            <button
              onClick={() => clearSignal('verse-navigation', 'current-verse')}
              className="flex items-center gap-1 px-2 py-1 bg-yellow-100 rounded hover:bg-yellow-200 text-xs"
              disabled={verseCount === 0}
            >
              <Trash2 className="w-3 h-3" />
              Clear Latest
            </button>
            <button
              onClick={() => clearSignalsOfType('verse-navigation')}
              className="flex items-center gap-1 px-2 py-1 bg-red-100 rounded hover:bg-red-200 text-xs"
              disabled={verseCount === 0}
            >
              <Trash2 className="w-3 h-3" />
              Clear All
            </button>
          </div>
        </div>

        <div className="p-3 bg-green-50 rounded border border-green-200 min-h-[80px]">
          {currentVerse ? (
            <div>
              <div className="text-sm font-semibold text-green-900 mb-2">
                Current Verse: {currentVerse.reference.book} {currentVerse.reference.chapter}:
                {currentVerse.reference.verse}
              </div>
              {verseHistory.length > 1 && (
                <div className="text-xs text-green-700">
                  History ({verseHistory.length} verses):
                  <div className="mt-1 space-y-0.5">
                    {verseHistory.slice(-5).map((signal, idx) => (
                      <div key={idx}>
                        • {signal.reference.book} {signal.reference.chapter}:
                        {signal.reference.verse}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-green-400 italic">No persistent messages stored</div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          These messages survive navigation and must be manually cleared
        </p>
      </div>

      {/* Explanation */}
      <div className="mt-auto pt-3 border-t text-xs text-gray-500">
        <p className="font-semibold mb-2">How it works:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Ephemeral:</strong> Token clicks are cleared when you navigate (temporary
            actions)
          </li>
          <li>
            <strong>Persistent:</strong> Verse navigation stays until you clear it (current
            context)
          </li>
          <li>Use "Simulate Navigation" to see ephemeral messages disappear</li>
          <li>Open another instance in a different panel to test</li>
        </ul>
      </div>
    </div>
  )
}

