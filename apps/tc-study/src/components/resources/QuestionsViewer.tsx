/**
 * QuestionsViewer - Displays translation questions
 * Receives verse-filter events, shows Q&A format
 * Helps translators check their understanding
 */

import { useState, useEffect } from 'react'
import { useResourceAPI, useEvents } from 'linked-panels'
import { useCurrentReference } from '../../contexts'
import type { TokenClickEvent, VerseReferenceFilterEvent } from '../../plugins/types'

interface QuestionsViewerProps {
  resourceId: string
  resourceKey: string
  questionsContent?: any[]
}

interface Question {
  id: string
  reference: string
  question: string
  answer: string
  chapter: number
  verse: number
}

// Sample questions (will be replaced with real TSV data)
const SAMPLE_QUESTIONS: Question[] = [
  {
    id: 'q-gen-1-1',
    reference: 'GEN 1:1',
    chapter: 1,
    verse: 1,
    question: 'What did God create in the beginning?',
    answer: 'In the beginning, God created the heavens and the earth.',
  },
  {
    id: 'q-gen-1-2',
    reference: 'GEN 1:2',
    chapter: 1,
    verse: 2,
    question: 'What was the condition of the earth at first?',
    answer: 'The earth was without form and empty, and darkness was upon the surface of the deep.',
  },
  {
    id: 'q-gen-1-2b',
    reference: 'GEN 1:2',
    chapter: 1,
    verse: 2,
    question: 'What was moving above the surface of the waters?',
    answer: 'The Spirit of God was moving above the surface of the waters.',
  },
  {
    id: 'q-gen-1-3',
    reference: 'GEN 1:3',
    chapter: 1,
    verse: 3,
    question: 'What did God say?',
    answer: 'God said, "Let there be light."',
  },
  {
    id: 'q-gen-1-3b',
    reference: 'GEN 1:3',
    chapter: 1,
    verse: 3,
    question: 'What happened when God commanded light to exist?',
    answer: 'There was light.',
  },
  {
    id: 'q-tit-1-1',
    reference: 'TIT 1:1',
    chapter: 1,
    verse: 1,
    question: 'What is Paul\'s role according to this verse?',
    answer: 'Paul is a servant of God and an apostle of Jesus Christ.',
  },
  {
    id: 'q-tit-1-2',
    reference: 'TIT 1:2',
    chapter: 1,
    verse: 2,
    question: 'What did God promise before all ages of time?',
    answer: 'God promised everlasting life before all ages of time.',
  },
]

export function QuestionsViewer({ 
  resourceId, 
  resourceKey, 
  questionsContent 
}: QuestionsViewerProps) {
  const api = useResourceAPI(resourceId)
  const currentRef = useCurrentReference()
  
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null)
  const [filteredByVerse, setFilteredByVerse] = useState<number | null>(null)
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set())
  
  const questions = questionsContent || SAMPLE_QUESTIONS
  
  // Listen for verse-filter events (from clicking verse numbers)
  useEvents<VerseReferenceFilterEvent>(
    resourceId,
    ['verse-filter'],
    (event) => {
      console.log('📨 QuestionsViewer received verse-filter:', event.verseRef)
      setFilteredByVerse(event.verseRef.verse)
      setSelectedQuestion(null)
    }
  )
  
  // Listen for token-click events (alternative filtering)
  useEvents<TokenClickEvent>(
    resourceId,
    ['token-click'],
    (event) => {
      console.log('📨 QuestionsViewer received token-click, filtering by verse:', event.token.verseRef)
      // Extract verse number from verseRef (e.g., "GEN 1:2" -> 2)
      const match = event.token.verseRef.match(/:(\d+)/)
      if (match) {
        const verseNum = parseInt(match[1])
        setFilteredByVerse(verseNum)
      }
    }
  )
  
  // Auto-filter by current reference
  useEffect(() => {
    // Reset filters when reference changes
    setFilteredByVerse(null)
    setSelectedQuestion(null)
    setExpandedQuestions(new Set())
  }, [currentRef.book, currentRef.chapter])
  
  // Filter questions by current reference and optional verse filter
  const displayQuestions = questions.filter((q) => {
    // Match current book and chapter
    const bookMatch = q.reference.toLowerCase().startsWith(currentRef.book.toLowerCase())
    const chapterMatch = q.chapter === currentRef.chapter
    
    if (!bookMatch || !chapterMatch) return false
    
    // If verse filter active, match specific verse
    if (filteredByVerse !== null) {
      return q.verse === filteredByVerse
    }
    
    // Otherwise, show questions in current verse range
    const startVerse = currentRef.verse
    const endVerse = currentRef.endVerse || startVerse
    return q.verse >= startVerse && q.verse <= endVerse
  })
  
  // Toggle answer visibility
  const toggleQuestion = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions)
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId)
    } else {
      newExpanded.add(questionId)
    }
    setExpandedQuestions(newExpanded)
    setSelectedQuestion(questionId)
  }
  
  // Clear verse filter
  const clearFilter = () => {
    setFilteredByVerse(null)
    setSelectedQuestion(null)
  }
  
  // Format reference for display
  const refString = `${currentRef.book.toUpperCase()} ${currentRef.chapter}:${currentRef.verse}${
    currentRef.endVerse ? `-${currentRef.endVerse}` : ''
  }`
  
  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{resourceKey}</h3>
        <p className="text-sm text-gray-500">{refString}</p>
      </div>
      
      {/* Verse Filter Banner */}
      {filteredByVerse !== null && (
        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-sm text-purple-900">
            <strong>Filtered by verse:</strong> {filteredByVerse}
            <button
              onClick={clearFilter}
              className="ml-2 text-purple-600 hover:text-purple-800 underline"
            >
              Clear filter
            </button>
          </p>
        </div>
      )}
      
      {/* Questions List - scrolling handled by parent container */}
      <div className="flex-1 space-y-3">
        {displayQuestions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">No questions available</p>
            <p className="text-sm">
              {filteredByVerse !== null
                ? `No questions found for verse ${filteredByVerse}`
                : `No questions found for ${refString}`}
            </p>
          </div>
        ) : (
          displayQuestions.map((q) => {
            const isExpanded = expandedQuestions.has(q.id)
            const isSelected = selectedQuestion === q.id
            
            return (
              <div
                key={q.id}
                className={`
                  rounded-lg border transition-all
                  ${isSelected
                    ? 'bg-purple-50 border-purple-300 shadow-md'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                {/* Question Header (clickable) */}
                <button
                  onClick={() => toggleQuestion(q.id)}
                  className="w-full text-left p-4 flex items-start justify-between gap-3"
                >
                  <div className="flex-1">
                    {/* Reference Badge */}
                    <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-mono rounded mb-2">
                      {q.reference} (v{q.verse})
                    </span>
                    
                    {/* Question Text */}
                    <p className="text-gray-900 font-medium">
                      Q: {q.question}
                    </p>
                  </div>
                  
                  {/* Expand/Collapse Icon */}
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${
                      isExpanded ? 'transform rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                
                {/* Answer (collapsible) */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-gray-200">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Answer:</p>
                    <p className="text-gray-800 leading-relaxed">{q.answer}</p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
      
      {/* Info Panel */}
      <div className="mt-4 p-3 bg-purple-50 rounded-lg text-sm">
        <strong className="text-purple-900">Interactive Features:</strong>
        <ul className="mt-2 space-y-1 text-purple-800">
          <li>• Click questions to reveal answers</li>
          <li>• Click verse numbers in scripture to filter</li>
          <li>• Questions update with navigation</li>
          <li>• Showing {displayQuestions.length} of {questions.length} questions</li>
        </ul>
      </div>
    </div>
  )
}
