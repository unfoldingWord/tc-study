import { useState, useCallback } from 'react'
import { useResourcePanel, useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import { BIBLICAL_CHARACTERS } from '../data/biblicalCharacters'
import { CharacterCard } from './CharacterCard'
import type { ActionSignal, CharacterSelectedSignal, ResponseSignal } from '../signals'
import { ACTIONS } from '../data/biblicalCharacters'

interface CharacterGridProps {
  resourceId: string
}

export function CharacterGrid({ resourceId }: CharacterGridProps) {
  useResourcePanel(resourceId, 'character-grid')
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null)
  const [targetCharacterId, setTargetCharacterId] = useState<number | 'all' | 'all-opponents' | null>(null)
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [highlightedCharacter, setHighlightedCharacter] = useState<number | null>(null)
  const [responses, setResponses] = useState<Array<{id: string, message: string, timestamp: number}>>([])
  const [score, setScore] = useState({ given: 0, received: 0 })

  // Derive panel ID from resource ID (player1-grid -> panel-1, player2-grid -> panel-2)
  const panelId = resourceId.startsWith('player1') ? 'panel-1' : 'panel-2'

  // Send action signal
  const sendAction = useSignal<ActionSignal>('action', resourceId)
  
  // Send character selection signal
  const sendCharacterSelected = useSignal<CharacterSelectedSignal>('character-selected', resourceId)

  // Send response signal
  const sendResponse = useSignal<ResponseSignal>('response', resourceId)

  // Handle incoming actions from other panels
  useSignalHandler<ActionSignal>(
    'action',
    resourceId,
    useCallback((signal: ActionSignal) => {
      const action = signal.action
      
      // Check if this action targets this panel
      if (action.targetPanelId !== panelId) return

      // Handle different target types
      if (action.targetCharacterId === 'all' || 
          action.targetCharacterId === 'all-opponents' ||
          typeof action.targetCharacterId === 'number') {
        
        // Highlight the receiving character
        if (typeof action.targetCharacterId === 'number') {
          setHighlightedCharacter(action.targetCharacterId)
          setTimeout(() => setHighlightedCharacter(null), 2000)
        }

        // Add response to feed
        const targetChar = typeof action.targetCharacterId === 'number' 
          ? BIBLICAL_CHARACTERS.find(c => c.id === action.targetCharacterId)
          : null

        const responseMsg = generateResponse(action.actionType)
        
        setResponses(prev => [{
          id: `${Date.now()}-${Math.random()}`,
          message: `Received ${action.actionType} from ${action.sourceCharacterName}`,
          timestamp: Date.now()
        }, ...prev].slice(0, 10))

        // Update score
        setScore(prev => ({ ...prev, received: prev.received + 1 }))

        // Send response back
        if (typeof action.targetCharacterId === 'number' && targetChar) {
          sendResponse.sendSignal({
            response: {
              characterId: targetChar.id,
              characterName: targetChar.name,
              originalAction: action.actionType,
              message: responseMsg,
              emoji: getResponseEmoji(action.actionType)
            }
          })
        }
      }
    }, [panelId, resourceId, sendResponse])
  )

  // Handle incoming responses
  useSignalHandler<ResponseSignal>(
    'response',
    resourceId,
    useCallback((signal: ResponseSignal) => {
      const response = signal.response
      setResponses(prev => [{
        id: `${Date.now()}-${Math.random()}`,
        message: `${response.emoji} ${response.characterName} responds: "${response.message}"`,
        timestamp: Date.now()
      }, ...prev].slice(0, 10))
    }, [])
  )

  // Handle character selection
  const handleCharacterClick = useCallback((characterId: number) => {
    setSelectedCharacterId(characterId)
    const character = BIBLICAL_CHARACTERS.find(c => c.id === characterId)
    if (character) {
      sendCharacterSelected.sendSignal({
        character: {
          id: character.id,
          name: character.name,
          panelId
        }
      })
    }
  }, [panelId, sendCharacterSelected])

  // Handle action execution
  const handleExecuteAction = useCallback(() => {
    if (!selectedCharacterId || !selectedAction || !targetCharacterId) return

    const sourceChar = BIBLICAL_CHARACTERS.find(c => c.id === selectedCharacterId)
    if (!sourceChar) return

    // Get the other panel ID
    const otherPanelId = panelId === 'panel-1' ? 'panel-2' : 'panel-1'

    // Send the action
    sendAction.sendSignal({
      action: {
        actionType: selectedAction as any,
        sourceCharacterId: selectedCharacterId,
        sourceCharacterName: sourceChar.name,
        targetCharacterId: targetCharacterId as any,
        targetPanelId: otherPanelId,
        virtue: selectedAction === 'virtue' ? sourceChar.virtues[0] : undefined
      }
    })

    // Update score
    setScore(prev => ({ ...prev, given: prev.given + 1 }))

    // Add to response feed
    const targetChar = targetCharacterId === 'all' ? 'All' : 
                      targetCharacterId === 'all-opponents' ? 'All Opponents' :
                      BIBLICAL_CHARACTERS.find(c => c.id === targetCharacterId)?.name || 'Unknown'
    
    const actionName = ACTIONS.find(a => a.id === selectedAction)?.name || selectedAction
    
    setResponses(prev => [{
      id: `${Date.now()}-${Math.random()}`,
      message: `${sourceChar.emoji} ${sourceChar.name} sent ${actionName} to ${targetChar}`,
      timestamp: Date.now()
    }, ...prev].slice(0, 10))

    // Reset selection
    setSelectedAction(null)
    setTargetCharacterId(null)
  }, [selectedCharacterId, selectedAction, targetCharacterId, panelId, sendAction])

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <div className="bg-white border-b-2 border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Biblical Virtues Exchange</h2>
            <p className="text-sm text-gray-600">Panel {panelId?.split('-')[1]}</p>
          </div>
          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{score.given}</div>
              <div className="text-xs text-gray-600">Given</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{score.received}</div>
              <div className="text-xs text-gray-600">Received</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Character Grid */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {BIBLICAL_CHARACTERS.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                selected={selectedCharacterId === character.id}
                onClick={() => handleCharacterClick(character.id)}
                highlight={highlightedCharacter === character.id ? 'receiving' : undefined}
                size="medium"
              />
            ))}
          </div>

          {/* Action Panel */}
          {selectedCharacterId && (
            <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-blue-200 mb-6">
              <h3 className="text-lg font-bold mb-4 text-gray-800">
                Choose Action for {BIBLICAL_CHARACTERS.find(c => c.id === selectedCharacterId)?.name}
              </h3>
              
              {/* Actions */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => setSelectedAction(action.id)}
                    className={`
                      p-4 rounded-lg border-2 transition-all
                      ${selectedAction === action.id 
                        ? 'border-blue-500 bg-blue-50 scale-105 shadow-lg' 
                        : 'border-gray-300 hover:border-gray-400 hover:scale-105'
                      }
                    `}
                  >
                    <div className="text-3xl mb-2">{action.icon}</div>
                    <div className="text-sm font-semibold">{action.name}</div>
                  </button>
                ))}
              </div>

              {/* Target Selection */}
              {selectedAction && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 text-gray-700">Select Target:</h4>
                  <div className="flex gap-3 mb-4">
                    <button
                      onClick={() => setTargetCharacterId('all')}
                      className={`
                        px-4 py-2 rounded-lg border-2 transition-all
                        ${targetCharacterId === 'all' 
                          ? 'border-purple-500 bg-purple-50' 
                          : 'border-gray-300 hover:border-gray-400'
                        }
                      `}
                    >
                      All Characters
                    </button>
                    <button
                      onClick={() => setTargetCharacterId('all-opponents')}
                      className={`
                        px-4 py-2 rounded-lg border-2 transition-all
                        ${targetCharacterId === 'all-opponents' 
                          ? 'border-purple-500 bg-purple-50' 
                          : 'border-gray-300 hover:border-gray-400'
                        }
                      `}
                    >
                      All Opponent Characters
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-6 gap-2">
                    {BIBLICAL_CHARACTERS.map((char) => (
                      <button
                        key={char.id}
                        onClick={() => setTargetCharacterId(char.id)}
                        className={`
                          p-2 rounded-lg border-2 transition-all text-center
                          ${targetCharacterId === char.id 
                            ? 'border-blue-500 bg-blue-50 scale-105' 
                            : 'border-gray-300 hover:border-gray-400'
                          }
                        `}
                      >
                        <div className="text-2xl">{char.emoji}</div>
                        <div className="text-xs mt-1">{char.name}</div>
                      </button>
                    ))}
                  </div>

                  {/* Execute Button */}
                  <button
                    onClick={handleExecuteAction}
                    disabled={!targetCharacterId}
                    className={`
                      w-full mt-4 py-3 rounded-lg font-bold text-white transition-all
                      ${targetCharacterId 
                        ? 'bg-green-500 hover:bg-green-600 hover:scale-105' 
                        : 'bg-gray-300 cursor-not-allowed'
                      }
                    `}
                  >
                    Send Action! 🚀
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Response Feed */}
          <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-gray-200">
            <h3 className="text-lg font-bold mb-4 text-gray-800">Activity Feed</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {responses.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No activity yet. Start sending blessings!</p>
              ) : (
                responses.map((response) => (
                  <div
                    key={response.id}
                    className="p-3 bg-gray-50 rounded-lg text-sm border border-gray-200"
                  >
                    {response.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper functions
function generateResponse(actionType: string): string {
  const responses = {
    blessing: [
      `May God's grace be upon you`,
      `You are blessed and highly favored`,
      `The Lord's blessing rests upon you`
    ],
    prayer: [
      `Lifting you up in prayer`,
      `Praying for strength and wisdom`,
      `God hears our prayers for you`
    ],
    encourage: [
      `You can do all things through Christ!`,
      `Be strong and courageous!`,
      `The Lord is with you, mighty warrior!`
    ],
    virtue: [
      `Sharing the gift of faithfulness`,
      `May this virtue strengthen you`,
      `Receive this blessing of wisdom`
    ]
  }
  
  const messages = responses[actionType as keyof typeof responses] || responses.blessing
  return messages[Math.floor(Math.random() * messages.length)]
}

function getResponseEmoji(actionType: string): string {
  const emojis = {
    blessing: '🙏',
    prayer: '🕊️',
    encourage: '💪',
    virtue: '✨'
  }
  return emojis[actionType as keyof typeof emojis] || '✨'
}

