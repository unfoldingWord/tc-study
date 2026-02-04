/**
 * NotesViewer - Displays translation notes
 * Receives token-click events, sends note-selection and highlighted-tokens
 */

import { useState } from 'react'
import { useResourceAPI, useEvents } from 'linked-panels'
import { useCurrentReference } from '../../contexts'
import type { TokenClickEvent, NoteSelectionEvent, HighlightedTokensState } from '../../plugins/types'

interface NotesViewerProps {
  resourceId: string
  resourceKey: string
  notesContent?: any[]
}

// Sample notes (will be replaced with real TSV data)
const SAMPLE_NOTES = [
  {
    id: 'note-1',
    reference: 'GEN 1:1',
    quote: 'beginning',
    occurrence: 1,
    note: 'This refers to the start of time and creation.',
  },
  {
    id: 'note-2',
    reference: 'GEN 1:1',
    quote: 'God',
    occurrence: 1,
    note: 'The Hebrew word is Elohim, indicating power and might.',
  },
  {
    id: 'note-3',
    reference: 'GEN 1:1',
    quote: 'created',
    occurrence: 1,
    note: 'Brought into existence from nothing.',
  },
]

export function NotesViewer({ resourceId, resourceKey, notesContent }: NotesViewerProps) {
  const api = useResourceAPI<HighlightedTokensState>(resourceId)
  const currentRef = useCurrentReference() // From NavigationContext!
  
  const [selectedNote, setSelectedNote] = useState<string | null>(null)
  const [filteredByToken, setFilteredByToken] = useState<string | null>(null)
  
  const notes = notesContent || SAMPLE_NOTES
  
  // Listen for token-click events from scripture
  useEvents<TokenClickEvent>(
    resourceId,
    ['token-click'],
    (event) => {
      console.log('📨 NotesViewer received token-click:', event.token.content)
      
      // Filter notes by clicked token
      setFilteredByToken(event.token.content.toLowerCase())
      setSelectedNote(null)
    }
  )
  
  // Filter notes
  const displayNotes = filteredByToken
    ? notes.filter(note =>
        note.quote.toLowerCase().includes(filteredByToken)
      )
    : notes
  
  // Handle note click
  const handleNoteClick = (note: typeof notes[0]) => {
    console.log('🖱️ Note clicked:', note.id)
    
    setSelectedNote(note.id)
    
    // Send note-selection event
    const selectionMessage: NoteSelectionEvent = {
      type: 'note-selection',
      lifecycle: 'event',
      note: {
        id: note.id,
        reference: note.reference,
        quote: note.quote,
        occurrence: note.occurrence,
      },
      sourceResourceId: resourceId,
      timestamp: Date.now(),
    }
    
    api.messaging.sendToAll(selectionMessage)
    
    // TODO: Send highlighted-tokens to highlight the note's quote in scripture
    // This would require matching tokens in scripture
  }
  
  return (
    <div className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{resourceKey}</h3>
        <p className="text-sm text-gray-500">
          {currentRef.book.toUpperCase()} {currentRef.chapter}:{currentRef.verse}
        </p>
      </div>
      
      {filteredByToken && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>Filtered by token:</strong> "{filteredByToken}"
            <button
              onClick={() => {
                setFilteredByToken(null)
                setSelectedNote(null)
              }}
              className="ml-2 text-blue-600 hover:text-blue-800 underline"
            >
              Clear filter
            </button>
          </p>
        </div>
      )}
      
      <div className="space-y-4">
        {displayNotes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No notes found for "{filteredByToken}"
          </div>
        ) : (
          displayNotes.map(note => (
            <div
              key={note.id}
              onClick={() => handleNoteClick(note)}
              className={`
                p-4 rounded-lg border cursor-pointer transition-all
                ${selectedNote === note.id
                  ? 'bg-green-50 border-green-300'
                  : 'bg-white border-gray-200 hover:border-gray-300'
                }
              `}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-mono text-gray-600">{note.reference}</span>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">{note.quote}</span>
              </div>
              <p className="text-gray-800">{note.note}</p>
            </div>
          ))
        )}
      </div>
      
      <div className="mt-6 p-3 bg-gray-50 rounded-lg text-sm">
        <strong>Interactive Features:</strong>
        <ul className="mt-2 space-y-1 text-gray-700">
          <li>• Click tokens in scripture to filter notes</li>
          <li>• Click notes to highlight in scripture</li>
          <li>• Showing {displayNotes.length} of {notes.length} notes</li>
        </ul>
      </div>
    </div>
  )
}
