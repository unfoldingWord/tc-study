/**
 * Panel System Test Page
 * 
 * Tests comprehensive two-way communication:
 * - Multiple resources per panel
 * - Resource switching via navigation signals
 * - Token and link click events
 * - Bidirectional signal propagation
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  LinkedPanelsContainer,
  LinkedPanel,
  createDefaultPluginRegistry,
  useResourceAPI,
  useMessaging,
  type LinkedPanelsConfig,
} from 'linked-panels'
import { Activity, Send, Eye, Zap, CheckCircle, Radio, ArrowRight, Shuffle } from 'lucide-react'
import { ScriptureViewer } from '../resources/ScriptureViewer'
import { WordsLinksViewer } from '../resources'
import { useCatalog } from '../../contexts/CatalogContext'
import type { TokenClickEvent, LinkClickEvent } from '../../plugins/types'
import { tokenClickPlugin, linkClickPlugin } from '../../plugins/messageTypePlugins'
import { TestResourceWithPanels } from './TestResourceWithPanels'
import type { NavigationRequestSignal } from '../../signals/testSignals'

// Create plugin registry ONCE at module level, not on every render
const pluginRegistry = createDefaultPluginRegistry()
pluginRegistry.register(tokenClickPlugin)
pluginRegistry.register(linkClickPlugin)
console.log('📦 Plugin registry initialized with custom plugins')

interface MessageLog {
  id: string
  timestamp: number
  type: string
  from: string
  to: string
  data: any
  received: boolean
}


// Note: Panel navigation is now inline in LinkedPanel render props, not a separate component

/**
 * Signal Monitor - Displays all messages between panels
 */
function SignalMonitor({ messages }: { messages: MessageLog[] }) {
  return (
    <div className="w-80 border-l border-gray-300 bg-gray-50 p-4 overflow-y-auto">
      <div className="flex items-center gap-2 mb-4">
        <Radio className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-gray-900">Signal Monitor</h3>
      </div>
      <p className="text-xs text-gray-600 mb-4">
        {messages.length} message{messages.length !== 1 ? 's' : ''} logged
      </p>
      
      <div className="space-y-2">
        {messages.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-8">
            <Activity className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            No messages yet
          </div>
        ) : (
          messages.slice(0, 20).map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded border-l-4 ${
                msg.received
                  ? 'border-green-500 bg-green-50'
                  : 'border-blue-500 bg-blue-50'
              }`}
            >
              <div className="flex items-start gap-2">
                {msg.received ? (
                  <CheckCircle className="w-3 h-3 text-green-600 mt-0.5" />
                ) : (
                  <Send className="w-3 h-3 text-blue-600 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-semibold text-gray-900">
                      {msg.type}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">
                    {msg.from} → {msg.to}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Sample words for token clicks
const SAMPLE_WORDS = [
  { word: 'בְּרֵאשִׁית', transliteration: 'bereshit', meaning: 'in the beginning', strongs: 'H7225', ref: 'GEN 1:1' },
  { word: 'בָּרָא', transliteration: 'bara', meaning: 'created', strongs: 'H1254', ref: 'GEN 1:1' },
  { word: 'אֱלֹהִים', transliteration: 'elohim', meaning: 'God', strongs: 'H430', ref: 'GEN 1:1' },
  { word: 'λόγος', transliteration: 'logos', meaning: 'word', strongs: 'G3056', ref: 'JHN 1:1' },
  { word: 'ἀγάπη', transliteration: 'agape', meaning: 'love', strongs: 'G26', ref: 'JHN 3:16' },
]

/**
 * Test Resource Component with navigation controls
 */
interface TestResourceProps {
  resourceId: string
  allResources: Array<{ id: string; title: string }>
  onNavigateRequest?: (targetPanelId: string, targetResourceId: string) => void
  onMessageLog?: (type: string, from: string, to: string, data: any, received: boolean) => void
}

function TestResource({ resourceId, allResources, onNavigateRequest, onMessageLog }: TestResourceProps) {
  console.log(`🎨 [TestResource] Component rendering with resourceId: ${resourceId}`)
  
  // Use linked-panels API with ref pattern (mobile app pattern)
  const linkedPanelsAPI = useResourceAPI(resourceId)
  const linkedPanelsAPIRef = useRef(linkedPanelsAPI)
  linkedPanelsAPIRef.current = linkedPanelsAPI
  
  const [sentCount, setSentCount] = useState(0)
  const [receivedMessages, setReceivedMessages] = useState<any[]>([])
  const [lastReceivedToken, setLastReceivedToken] = useState<any>(null)
  const [targetPanel, setTargetPanel] = useState<'panel-1' | 'panel-2'>('panel-2')
  const [targetMode, setTargetMode] = useState<'all' | 'panel' | 'resource'>('all')
  const [targetResourceId, setTargetResourceId] = useState(allResources[0]?.id || 'test-1')
  const [selectedWordIdx, setSelectedWordIdx] = useState(0)

  // Set up event listener using useMessaging (like mobile app)
  // IMPORTANT: No code should run before useMessaging call (React Rules of Hooks)
  useMessaging({
    resourceId,
    eventTypes: ['token-click', 'link-click'],
    onEvent: (message: any) => {
      console.log(`📨 [${resourceId}] ✨✨✨ useMessaging callback FIRED!`, message)
      console.log(`📨 [${resourceId}] Message type:`, message.type)
      console.log(`📨 [${resourceId}] Message token:`, message.token)
      
      setReceivedMessages(prev => [{ ...message, timestamp: Date.now() }, ...prev].slice(0, 10))
      
      // If it's a token-click event, extract and display the token
      if (message.type === 'token-click' && message.token) {
        console.log(`✅ [${resourceId}] Setting lastReceivedToken to:`, message.token)
        setLastReceivedToken(message.token)
      }
      
      // Log to signal monitor
      if (onMessageLog) {
        onMessageLog(message.type, message.sourceResourceId || 'unknown', resourceId, message, true)
      }
    }
  })
  
  // Debug logging in useEffect to avoid breaking hook rules
  useEffect(() => {
    console.log(`👂 [${resourceId}] useMessaging listener registered`)
  }, [resourceId])

  const sendTokenClick = () => {
    // Safety check before sending (mobile app pattern)
    if (!linkedPanelsAPIRef.current?.messaging?.sendToAll) {
      console.warn(`⚠️ [${resourceId}] Linked panels messaging API not available`)
      return
    }
    
    const selectedWord = SAMPLE_WORDS[selectedWordIdx]
    const event: TokenClickEvent = {
      type: 'token-click',
      lifecycle: 'event',
      token: {
        id: `token-${Date.now()}`,
        content: selectedWord.word,
        semanticId: selectedWord.strongs,
        verseRef: selectedWord.ref,
        position: selectedWordIdx + 1,
        transliteration: selectedWord.transliteration,
        meaning: selectedWord.meaning,
      },
      sourceResourceId: resourceId,
      timestamp: Date.now(),
    }
    
    let targetDesc = 'all resources'
    
    // Send based on target mode using ref pattern
    switch (targetMode) {
      case 'all':
        (linkedPanelsAPIRef.current.messaging as any).sendToAll(event)
        targetDesc = 'all resources'
        break
      case 'panel':
        (linkedPanelsAPIRef.current.messaging as any).sendToPanel(targetPanel, event)
        targetDesc = `panel ${targetPanel}`
        break
      case 'resource':
        // Note: sendToResource doesn't exist in linked-panels API yet
        (linkedPanelsAPIRef.current.messaging as any).sendToAll({ ...event, intendedTarget: targetResourceId })
        targetDesc = `resource ${targetResourceId} (via broadcast)`
        break
    }
    
    console.log(`📤 [${resourceId}] Sending "${selectedWord.word}" to ${targetDesc}`)
    setSentCount(prev => prev + 1)
    
    // Log to signal monitor
    if (onMessageLog) {
      onMessageLog('token-click', resourceId, targetDesc, event, false)
    }
  }

  const sendLinkClick = () => {
    // Safety check before sending (mobile app pattern)
    if (!linkedPanelsAPIRef.current?.messaging?.sendToAll) {
      console.warn(`⚠️ [${resourceId}] Linked panels messaging API not available`)
      return
    }
    
    const event: LinkClickEvent = {
      type: 'link-click',
      lifecycle: 'event',
      link: {
        url: 'https://example.com/word',
        text: 'testWord',
        resourceType: 'translation-words',
        resourceId: 'test-word-id',
      },
      sourceResourceId: resourceId,
      timestamp: Date.now(),
    }
    
    console.log('🚀 [TestResource] Sending link-click event:', JSON.stringify(event, null, 2))
    console.log('🚀 [TestResource] Event keys:', Object.keys(event))
    ;(linkedPanelsAPIRef.current.messaging as any).sendToAll(event)
    setSentCount(prev => prev + 1)
    
    // Log to signal monitor
    if (onMessageLog) {
      onMessageLog('link-click', resourceId, 'all', event, false)
    }
  }

  const sendNavigate = (targetResourceId: string) => {
    if (onNavigateRequest) {
      onNavigateRequest(targetPanel, targetResourceId)
      setSentCount(prev => prev + 1)
      console.log(`📤 [${resourceId}] Requesting navigation of ${targetPanel} to ${targetResourceId}`)
      
      // Log to signal monitor
      if (onMessageLog) {
        onMessageLog('navigate', resourceId, targetPanel, { targetResourceId }, false)
      }
    }
  }

  const otherResources = allResources.filter(r => r.id !== resourceId)

  return (
    <div className="p-4 h-full flex flex-col overflow-auto">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{resourceId}</h3>
      </div>

      {/* Word Selector */}
      <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-200">
        <p className="text-xs font-semibold mb-2 text-blue-800">Select Word:</p>
        <select
          value={selectedWordIdx}
          onChange={(e) => setSelectedWordIdx(parseInt(e.target.value, 10))}
          className="w-full px-2 py-1 text-xs border rounded"
        >
          {SAMPLE_WORDS.map((word, idx) => (
            <option key={idx} value={idx}>
              {word.word} ({word.transliteration}) - {word.meaning}
            </option>
          ))}
        </select>
      </div>

      {/* Target Mode Selector */}
      <div className="mb-3 p-2 bg-purple-50 rounded border border-purple-200">
        <p className="text-xs font-semibold mb-2 text-purple-800">Send To:</p>
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setTargetMode('all')}
            className={`flex-1 px-2 py-1 rounded text-xs ${targetMode === 'all' ? 'bg-purple-600 text-white' : 'bg-white border border-gray-300'}`}
          >
            All
          </button>
          <button
            onClick={() => setTargetMode('panel')}
            className={`flex-1 px-2 py-1 rounded text-xs ${targetMode === 'panel' ? 'bg-purple-600 text-white' : 'bg-white border border-gray-300'}`}
          >
            Panel
          </button>
          <button
            onClick={() => setTargetMode('resource')}
            className={`flex-1 px-2 py-1 rounded text-xs ${targetMode === 'resource' ? 'bg-purple-600 text-white' : 'bg-white border border-gray-300'}`}
          >
            Resource
          </button>
        </div>
        
        {/* Conditional selectors based on mode */}
        {targetMode === 'panel' && (
          <select
            value={targetPanel}
            onChange={(e) => setTargetPanel(e.target.value)}
            className="w-full px-2 py-1 text-xs border rounded"
          >
            <option value="panel-1">Panel 1</option>
            <option value="panel-2">Panel 2</option>
          </select>
        )}
        
        {targetMode === 'resource' && (
          <select
            value={targetResourceId}
            onChange={(e) => setTargetResourceId(e.target.value)}
            className="w-full px-2 py-1 text-xs border rounded"
          >
            {allResources.filter(r => r.id !== resourceId).map(resource => (
              <option key={resource.id} value={resource.id}>
                {resource.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Received Token Display */}
      {lastReceivedToken && (
        <div className="mb-3 p-3 bg-green-50 rounded border-2 border-green-500">
          <p className="text-xs font-semibold mb-2 text-green-800">📥 Received Token:</p>
          <div className="bg-white p-2 rounded border border-green-200">
            <p className="text-lg font-bold text-gray-900 mb-1">{lastReceivedToken.content}</p>
            {lastReceivedToken.transliteration && (
              <p className="text-xs text-gray-600 italic">{lastReceivedToken.transliteration}</p>
            )}
            {lastReceivedToken.meaning && (
              <p className="text-xs text-gray-700 mt-1">"{lastReceivedToken.meaning}"</p>
            )}
            <div className="flex gap-2 mt-2 text-xs">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{lastReceivedToken.semanticId}</span>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">{lastReceivedToken.verseRef}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 mb-3">
        <button
          onClick={sendTokenClick}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-semibold"
        >
          <Zap className="w-3 h-3" />
          Send Token
        </button>
        <button
          onClick={sendLinkClick}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-xs"
        >
          <Send className="w-3 h-3" />
          Link Click
        </button>
      </div>

      <div className="mb-3">
        <p className="text-xs font-semibold mb-2">Switch {targetPanel}:</p>
        <div className="flex flex-col gap-1">
          {otherResources.slice(0, 3).map(resource => (
            <button
              key={resource.id}
              onClick={() => sendNavigate(resource.id)}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-xs"
            >
              <ArrowRight className="w-3 h-3" />
              {resource.title}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 bg-blue-50 rounded text-center">
          <p className="text-xs text-gray-600">Sent</p>
          <p className="text-lg font-bold text-blue-600">{sentCount}</p>
        </div>
        <div className="p-2 bg-green-50 rounded text-center">
          <p className="text-xs text-gray-600">Received</p>
          <p className="text-lg font-bold text-green-600">{receivedMessages.length}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 border-t pt-2">
        <p className="text-xs font-semibold mb-1">Recent:</p>
        <div className="space-y-1 overflow-auto max-h-32">
          {receivedMessages.map((msg, idx) => (
            <div key={idx} className="text-xs p-2 bg-gray-50 rounded">
              <span className="font-semibold">{msg.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function PanelSystemTest() {
  const { catalogManager } = useCatalog()
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [testMode, setTestMode] = useState<'mock' | 'real'>('mock')
  const [apiMode, setApiMode] = useState<'low-level' | 'high-level'>('high-level')
  const [availableResources, setAvailableResources] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Track current resource index for each panel
  const [panel1ResourceIdx, setPanel1ResourceIdx] = useState(0)
  const [panel2ResourceIdx, setPanel2ResourceIdx] = useState(1) // Start with a different resource

  // Message logger for signal monitor
  const logMessage = useCallback((type: string, from: string, to: string, data: any, received: boolean) => {
    const log: MessageLog = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      type,
      from,
      to,
      data,
      received,
    }
    setMessages(prev => [log, ...prev].slice(0, 50))
  }, [])

  useEffect(() => {
    const loadResources = async () => {
      try {
        setLoading(true)
        const allResourceKeys = await catalogManager.catalogAdapter.getAll()
        const downloaded: ResourceMetadata[] = []
        
        for (const key of allResourceKeys) {
          const metadata = await catalogManager.catalogAdapter.get(key)
          if (metadata?.availability?.offline === true) {
            downloaded.push(metadata)
          }
        }
        
        console.log('📦 Downloaded resources:', downloaded.length)
        setAvailableResources(downloaded)
      } catch (error) {
        console.error('❌ Failed to load:', error)
      } finally {
        setLoading(false)
      }
    }
    loadResources()
  }, [catalogManager])

  // Build test resources (4 mock resources minimum)
  const mockResources = useMemo(() => [
    { id: 'test-1', title: 'Test Resource 1', category: 'test' },
    { id: 'test-2', title: 'Test Resource 2', category: 'test' },
    { id: 'test-3', title: 'Test Resource 3', category: 'test' },
    { id: 'test-4', title: 'Test Resource 4', category: 'test' },
  ], [])

  const realResources = useMemo(() => 
    availableResources.slice(0, 4).map((resource, idx) => ({
      id: `real-${resource.key.replace(/\//g, '-')}`,
      title: resource.title || resource.key,
      category: resource.subject,
      resourceKey: resource.key,
      subject: resource.subject,
    }))
  , [availableResources])

  const resources = useMemo(() => 
    testMode === 'mock' ? mockResources : realResources
  , [testMode, mockResources, realResources])
  
  // Handle navigation requests from test resources
  const handleNavigateRequest = useCallback((targetPanelId: string, targetResourceId: string) => {
    const targetIndex = resources.findIndex(r => r.id === targetResourceId)
    if (targetIndex === -1) {
      console.warn(`Resource ${targetResourceId} not found`)
      return
    }
    
    console.log(`🔀 Switching ${targetPanelId} to resource ${targetResourceId} (index ${targetIndex})`)
    
    if (targetPanelId === 'panel-1') {
      setPanel1ResourceIdx(targetIndex)
    } else if (targetPanelId === 'panel-2') {
      setPanel2ResourceIdx(targetIndex)
    }
  }, [resources])

  const config: LinkedPanelsConfig = useMemo(() => {
    // Get currently active resources for each panel
    const panel1Resource = resources[panel1ResourceIdx]
    const panel2Resource = resources[panel2ResourceIdx]
    
    console.log(`🔧 Creating config for panel-1: ${panel1Resource?.id}, panel-2: ${panel2Resource?.id}`)
    
    // Only include the currently active resources (like the spike does)
    const activeResources = [panel1Resource, panel2Resource].filter(Boolean).map((resource) => {
      console.log(`🔧 Creating component for resource: ${resource.id}`)
      
      // Create component with explicit resourceId prop (like spike)
      const component = testMode === 'mock' ? (
        apiMode === 'high-level' ? (
          <TestResourceWithPanels
            resourceId={resource.id}
            allResources={resources}
            onNavigationRequest={handleNavigateRequest}
            onMessageLog={logMessage}
          />
        ) : (
          <TestResource
            resourceId={resource.id}
            allResources={resources}
            onNavigateRequest={handleNavigateRequest}
            onMessageLog={logMessage}
          />
        )
      ) : resource.subject === 'Bible' || resource.subject === 'Aligned Bible' ? (
        <ScriptureViewer
          resourceId={resource.id}
          resourceKey={resource.resourceKey}
          isAnchor={false}
        />
      ) : (
        <div className="p-4">
          <p className="text-sm font-semibold">{resource.title}</p>
          <p className="text-xs text-gray-500">{resource.subject}</p>
        </div>
      )
      
      return {
        ...resource,
        component,
      }
    })
    
    return {
      resources: activeResources,
      panels: {
        'panel-1': {
          resourceIds: panel1Resource ? [panel1Resource.id] : [],
        },
        'panel-2': {
          resourceIds: panel2Resource ? [panel2Resource.id] : [],
        },
      }
    }
  }, [resources, testMode, apiMode, panel1ResourceIdx, panel2ResourceIdx, handleNavigateRequest, logMessage])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Activity className="w-12 h-12 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold mb-2">Panel Communication Test</h1>
        <p className="text-sm text-gray-600 mb-4">
          Test two-way resource switching and signal propagation
        </p>

        {testMode === 'real' && availableResources.length > 0 && (
          <div className="mb-3 p-3 bg-blue-50 rounded">
            <CheckCircle className="w-4 h-4 text-blue-600 inline mr-2" />
            <span className="text-sm font-semibold text-blue-900">
              {availableResources.length} resource{availableResources.length !== 1 ? 's' : ''} available
            </span>
          </div>
        )}

        <div className="flex items-center gap-4 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setTestMode('mock')}
              className={`px-4 py-2 rounded text-sm font-medium ${
                testMode === 'mock' ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}
            >
              Mock Resources (4)
            </button>
            <button
              onClick={() => setTestMode('real')}
              disabled={realResources.length === 0}
              className={`px-4 py-2 rounded text-sm font-medium ${
                testMode === 'real' ? 'bg-green-600 text-white' : 'bg-gray-200'
              } ${realResources.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Real Resources ({realResources.length})
            </button>
          </div>
          
          <div className="h-8 w-px bg-gray-300" />
          
          <div className="flex gap-2">
            <button
              onClick={() => setApiMode('high-level')}
              className={`px-4 py-2 rounded text-sm font-medium ${
                apiMode === 'high-level' ? 'bg-purple-600 text-white' : 'bg-gray-200'
              }`}
            >
              ✨ High-Level API
            </button>
            <button
              onClick={() => setApiMode('low-level')}
              className={`px-4 py-2 rounded text-sm font-medium ${
                apiMode === 'low-level' ? 'bg-orange-600 text-white' : 'bg-gray-200'
              }`}
            >
              ⚙️ Low-Level API
            </button>
          </div>
          
          <div className="ml-auto text-sm text-gray-600">
            <Activity className="w-4 h-4 inline mr-1" />
            {messages.length} messages
          </div>
        </div>
        
        <div className="p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
          <p className="text-sm font-semibold text-purple-900 mb-1">
            {apiMode === 'high-level' ? '✨ Using @bt-synergy/resource-panels' : '⚙️ Using linked-panels directly'}
          </p>
          <p className="text-xs text-gray-700">
            {apiMode === 'high-level' 
              ? 'Clean, typed hooks with automatic setup - useSignal() & useSignalHandler()'
              : 'Low-level useResourceAPI() & useMessaging() with manual refs'}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex gap-4 p-4">
          <LinkedPanelsContainer config={config} plugins={pluginRegistry}>
            {/* Panel 1 */}
            <div className="flex-1 flex flex-col bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-blue-600 text-white px-4 py-2 font-semibold">
                Panel 1
              </div>
              <LinkedPanel id="panel-1">
                {({ current }) => (
                  <>
                    {/* Inline Navigation UI */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b">
                      <button
                        onClick={() => setPanel1ResourceIdx(prev => Math.max(0, prev - 1))}
                        disabled={panel1ResourceIdx <= 0}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Previous resource"
                      >
                        <ArrowRight className="w-4 h-4 rotate-180" />
                      </button>
                      
                      <select
                        value={panel1ResourceIdx.toString()}
                        onChange={(e) => setPanel1ResourceIdx(parseInt(e.target.value, 10))}
                        className="flex-1 text-sm border rounded px-2 py-1"
                      >
                        {resources.map((resource, idx) => (
                          <option key={resource.id} value={idx.toString()}>
                            {resource.title || resource.id}
                          </option>
                        ))}
                      </select>
                      
                      <button
                        onClick={() => setPanel1ResourceIdx(prev => Math.min(resources.length - 1, prev + 1))}
                        disabled={panel1ResourceIdx >= resources.length - 1}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Next resource"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      
                      <span className="text-xs text-gray-500 ml-2">
                        {panel1ResourceIdx + 1}/{resources.length}
                      </span>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 overflow-auto">
                      {current.resource?.component}
                    </div>
                  </>
                )}
              </LinkedPanel>
            </div>

            {/* Panel 2 */}
            <div className="flex-1 flex flex-col bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-green-600 text-white px-4 py-2 font-semibold">
                Panel 2
              </div>
              <LinkedPanel id="panel-2">
                {({ current }) => (
                  <>
                    {/* Inline Navigation UI */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b">
                      <button
                        onClick={() => setPanel2ResourceIdx(prev => Math.max(0, prev - 1))}
                        disabled={panel2ResourceIdx <= 0}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Previous resource"
                      >
                        <ArrowRight className="w-4 h-4 rotate-180" />
                      </button>
                      
                      <select
                        value={panel2ResourceIdx.toString()}
                        onChange={(e) => setPanel2ResourceIdx(parseInt(e.target.value, 10))}
                        className="flex-1 text-sm border rounded px-2 py-1"
                      >
                        {resources.map((resource, idx) => (
                          <option key={resource.id} value={idx.toString()}>
                            {resource.title || resource.id}
                          </option>
                        ))}
                      </select>
                      
                      <button
                        onClick={() => setPanel2ResourceIdx(prev => Math.min(resources.length - 1, prev + 1))}
                        disabled={panel2ResourceIdx >= resources.length - 1}
                        className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Next resource"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      
                      <span className="text-xs text-gray-500 ml-2">
                        {panel2ResourceIdx + 1}/{resources.length}
                      </span>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 overflow-auto">
                      {current.resource?.component}
                    </div>
                  </>
                )}
              </LinkedPanel>
            </div>
          </LinkedPanelsContainer>
        </div>

        {/* Signal Monitor */}
        <SignalMonitor messages={messages} />
      </div>
    </div>
  )
}
