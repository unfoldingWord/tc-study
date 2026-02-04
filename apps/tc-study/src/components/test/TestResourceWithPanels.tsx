/**
 * Test Resource using @bt-synergy/resource-panels high-level API
 * 
 * This is a refactored version showing how much cleaner the code is
 * compared to using low-level linked-panels API directly.
 */

import { useState, useCallback } from 'react'
import { useResourcePanel, useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import { Zap, Send, ArrowRight, CheckCircle } from 'lucide-react'
import type { TokenClickSignal, LinkClickSignal, NavigationRequestSignal } from '../../signals/testSignals'

// Sample words for token clicks
const SAMPLE_WORDS = [
  { word: 'בְּרֵאשִׁית', transliteration: 'bereshit', meaning: 'in the beginning', strongs: 'H7225', ref: 'GEN 1:1' },
  { word: 'בָּרָא', transliteration: 'bara', meaning: 'created', strongs: 'H1254', ref: 'GEN 1:1' },
  { word: 'אֱלֹהִים', transliteration: 'elohim', meaning: 'God', strongs: 'H430', ref: 'GEN 1:1' },
  { word: 'λόγος', transliteration: 'logos', meaning: 'word', strongs: 'G3056', ref: 'JHN 1:1' },
  { word: 'ἀγάπη', transliteration: 'agape', meaning: 'love', strongs: 'G26', ref: 'JHN 3:16' },
]

interface TestResourceWithPanelsProps {
  resourceId: string
  allResources: Array<{ id: string; title: string }>
  onNavigationRequest?: (targetPanelId: string, targetResourceId: string) => void
  onMessageLog?: (type: string, from: string, to: string, data: any, received: boolean) => void
}

export function TestResourceWithPanels({
  resourceId,
  allResources,
  onNavigationRequest,
  onMessageLog
}: TestResourceWithPanelsProps) {
  // ✨ HIGH-LEVEL API - No refs, no manual setup!
  useResourcePanel(resourceId, 'test-resource')
  
  // State
  const [sentCount, setSentCount] = useState(0)
  const [receivedCount, setReceivedCount] = useState(0)
  const [lastReceivedToken, setLastReceivedToken] = useState<any>(null)
  const [targetPanel, setTargetPanel] = useState<'panel-1' | 'panel-2'>('panel-2')
  const [targetMode, setTargetMode] = useState<'all' | 'panel' | 'resource'>('all')
  const [targetResourceId, setTargetResourceId] = useState(allResources[0]?.id || 'test-1')
  const [selectedWordIdx, setSelectedWordIdx] = useState(0)

  // ✨ SEND SIGNALS - Clean and typed!
  const sendTokenClick = useSignal<TokenClickSignal>('token-click', resourceId)
  const sendLinkClick = useSignal<LinkClickSignal>('link-click', resourceId)
  const sendNavigationRequest = useSignal<NavigationRequestSignal>('navigation-request', resourceId)

  // ✨ RECEIVE SIGNALS - Automatic handling!
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    useCallback((signal: TokenClickSignal) => {
      console.log(`📨 [${resourceId}] Received token-click:`, signal.token)
      setLastReceivedToken(signal.token)
      setReceivedCount(prev => prev + 1)
      
      if (onMessageLog) {
        onMessageLog('token-click', signal.sourceResourceId, resourceId, signal, true)
      }
    }, [resourceId, onMessageLog])
  )

  useSignalHandler<LinkClickSignal>(
    'link-click',
    resourceId,
    useCallback((signal: LinkClickSignal) => {
      console.log(`📨 [${resourceId}] Received link-click:`, signal.link)
      setReceivedCount(prev => prev + 1)
      
      if (onMessageLog) {
        onMessageLog('link-click', signal.sourceResourceId, resourceId, signal, true)
      }
    }, [resourceId, onMessageLog])
  )

  // ✨ HANDLE NAVIGATION REQUESTS
  useSignalHandler<NavigationRequestSignal>(
    'navigation-request',
    resourceId,
    useCallback((signal: NavigationRequestSignal) => {
      console.log(`📨 [${resourceId}] Received navigation-request:`, signal.navigation)
      
      if (onNavigationRequest) {
        onNavigationRequest(
          signal.navigation.targetPanelId,
          signal.navigation.targetResourceId
        )
      }
      
      if (onMessageLog) {
        onMessageLog('navigation-request', signal.sourceResourceId, resourceId, signal, true)
      }
    }, [resourceId, onNavigationRequest, onMessageLog])
  )

  // ✨ SEND TOKEN - Clean, no refs!
  const handleSendToken = useCallback(() => {
    const selectedWord = SAMPLE_WORDS[selectedWordIdx]
    
    switch (targetMode) {
      case 'all':
        // Broadcast to all
        sendTokenClick.sendSignal({
          token: {
            id: `token-${Date.now()}`,
            content: selectedWord.word,
            semanticId: selectedWord.strongs,
            verseRef: selectedWord.ref,
            position: selectedWordIdx + 1,
            transliteration: selectedWord.transliteration,
            meaning: selectedWord.meaning,
          }
        })
        break
      
      case 'panel':
        // Send to specific panel
        sendTokenClick.sendToPanel(targetPanel, {
          token: {
            id: `token-${Date.now()}`,
            content: selectedWord.word,
            semanticId: selectedWord.strongs,
            verseRef: selectedWord.ref,
            position: selectedWordIdx + 1,
            transliteration: selectedWord.transliteration,
            meaning: selectedWord.meaning,
          }
        })
        break
      
      case 'resource':
        // Send to specific resource
        sendTokenClick.sendToResource(targetResourceId, {
          token: {
            id: `token-${Date.now()}`,
            content: selectedWord.word,
            semanticId: selectedWord.strongs,
            verseRef: selectedWord.ref,
            position: selectedWordIdx + 1,
            transliteration: selectedWord.transliteration,
            meaning: selectedWord.meaning,
          }
        })
        break
    }
    
    setSentCount(prev => prev + 1)
    
    if (onMessageLog) {
      const target = targetMode === 'all' ? 'all' : targetMode === 'panel' ? targetPanel : targetResourceId
      onMessageLog('token-click', resourceId, target, { word: selectedWord.word }, false)
    }
  }, [selectedWordIdx, targetMode, targetPanel, targetResourceId, resourceId, sendTokenClick, onMessageLog])

  // ✨ SEND LINK - Simple!
  const handleSendLink = useCallback(() => {
    sendLinkClick.sendSignal({
      link: {
        url: 'https://example.com/word',
        text: 'testWord',
        resourceType: 'translation-words',
        resourceId: 'test-word-id',
      }
    })
    
    setSentCount(prev => prev + 1)
    
    if (onMessageLog) {
      onMessageLog('link-click', resourceId, 'all', {}, false)
    }
  }, [resourceId, sendLinkClick, onMessageLog])

  // ✨ SEND NAVIGATION - Typed and clean!
  const handleNavigate = useCallback((targetResourceId: string) => {
    sendNavigationRequest.sendSignal({
      navigation: {
        targetPanelId: targetPanel,
        targetResourceId
      }
    })
    
    setSentCount(prev => prev + 1)
    
    if (onMessageLog) {
      onMessageLog('navigation-request', resourceId, targetPanel, { targetResourceId }, false)
    }
  }, [targetPanel, resourceId, sendNavigationRequest, onMessageLog])

  const otherResources = allResources.filter(r => r.id !== resourceId)

  return (
    <div className="p-4 h-full flex flex-col overflow-auto bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <div className="mb-3 p-3 bg-white rounded-lg shadow-sm border-2 border-blue-200">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-bold text-gray-900">{resourceId}</h3>
        </div>
        <p className="text-xs text-gray-600 mt-1">Using @bt-synergy/resource-panels</p>
      </div>

      {/* Word Selector */}
      <div className="mb-3 p-3 bg-white rounded-lg shadow-sm border border-blue-200">
        <p className="text-xs font-semibold mb-2 text-blue-800 flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Select Word:
        </p>
        <select
          value={selectedWordIdx}
          onChange={(e) => setSelectedWordIdx(parseInt(e.target.value, 10))}
          className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          {SAMPLE_WORDS.map((word, idx) => (
            <option key={idx} value={idx}>
              {word.word} ({word.transliteration}) - {word.meaning}
            </option>
          ))}
        </select>
      </div>

      {/* Target Mode Selector */}
      <div className="mb-3 p-3 bg-white rounded-lg shadow-sm border border-purple-200">
        <p className="text-xs font-semibold mb-2 text-purple-800 flex items-center gap-2">
          <Send className="w-3 h-3" />
          Send To:
        </p>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setTargetMode('all')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              targetMode === 'all' 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'bg-white border-2 border-gray-300 hover:border-purple-400'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setTargetMode('panel')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              targetMode === 'panel' 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'bg-white border-2 border-gray-300 hover:border-purple-400'
            }`}
          >
            Panel
          </button>
          <button
            onClick={() => setTargetMode('resource')}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              targetMode === 'resource' 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'bg-white border-2 border-gray-300 hover:border-purple-400'
            }`}
          >
            Resource
          </button>
        </div>
        
        {targetMode === 'panel' && (
          <select
            value={targetPanel}
            onChange={(e) => setTargetPanel(e.target.value as any)}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            <option value="panel-1">Panel 1</option>
            <option value="panel-2">Panel 2</option>
          </select>
        )}
        
        {targetMode === 'resource' && (
          <select
            value={targetResourceId}
            onChange={(e) => setTargetResourceId(e.target.value)}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {otherResources.map(resource => (
              <option key={resource.id} value={resource.id}>
                {resource.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Received Token Display */}
      {lastReceivedToken && (
        <div className="mb-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-md border-2 border-green-400">
          <p className="text-xs font-semibold mb-2 text-green-800 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            📥 Received Token:
          </p>
          <div className="bg-white p-3 rounded-lg border border-green-300 shadow-sm">
            <p className="text-2xl font-bold text-gray-900 mb-1">{lastReceivedToken.content}</p>
            {lastReceivedToken.transliteration && (
              <p className="text-sm text-gray-600 italic">{lastReceivedToken.transliteration}</p>
            )}
            {lastReceivedToken.meaning && (
              <p className="text-sm text-gray-700 mt-2 font-medium">"{lastReceivedToken.meaning}"</p>
            )}
            <div className="flex gap-2 mt-3">
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                {lastReceivedToken.semanticId}
              </span>
              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                {lastReceivedToken.verseRef}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 mb-3">
        <button
          onClick={handleSendToken}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 text-sm font-bold shadow-lg hover:shadow-xl transition-all"
        >
          <Zap className="w-4 h-4" />
          Send Token
        </button>
        <button
          onClick={handleSendLink}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 text-sm font-bold shadow-lg hover:shadow-xl transition-all"
        >
          <Send className="w-4 h-4" />
          Link Click
        </button>
      </div>

      {/* Navigation Controls */}
      <div className="mb-3 p-3 bg-white rounded-lg shadow-sm border border-gray-200">
        <p className="text-xs font-semibold mb-2 text-gray-700">Switch {targetPanel}:</p>
        <div className="flex flex-col gap-2">
          {otherResources.slice(0, 3).map(resource => (
            <button
              key={resource.id}
              onClick={() => handleNavigate(resource.id)}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 text-xs font-semibold shadow hover:shadow-lg transition-all"
            >
              <ArrowRight className="w-3 h-3" />
              {resource.title}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-sm text-center border-2 border-blue-200">
          <p className="text-xs text-blue-700 font-semibold">Sent</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{sentCount}</p>
        </div>
        <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow-sm text-center border-2 border-green-200">
          <p className="text-xs text-green-700 font-semibold">Received</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{receivedCount}</p>
        </div>
      </div>
    </div>
  )
}
