/**
 * Translation Questions Viewer
 * 
 * Displays comprehension questions and answers for Bible passages.
 * Questions are organized by chapter and verse.
 */

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react'
import type { ResourceViewerProps } from '@bt-synergy/resource-types'
import type { ProcessedQuestions, TranslationQuestion } from '@bt-synergy/resource-parsers'
import { useCatalogManager, useCurrentReference } from '../../../contexts'

export function TranslationQuestionsViewer({ resourceKey, metadata }: ResourceViewerProps) {
  const [questions, setQuestions] = useState<ProcessedQuestions | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set())
  
  const catalogManager = useCatalogManager()
  const currentRef = useCurrentReference()
  
  const bookCode = currentRef.book || 'gen'
  const chapter = currentRef.chapter || 1

  // Load questions for current book
  useEffect(() => {
    if (!catalogManager || !resourceKey) return

    const loadQuestions = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const loader = catalogManager.getLoader(metadata?.type || 'questions')
        if (!loader) {
          throw new Error('Translation Questions loader not found')
        }

        const content = await loader.loadContent(resourceKey, bookCode)
        setQuestions(content)
      } catch (err) {
        console.error(`Failed to load questions for ${bookCode}:`, err)
        setError(err instanceof Error ? err.message : 'Failed to load questions')
      } finally {
        setLoading(false)
      }
    }

    loadQuestions()
  }, [resourceKey, bookCode, catalogManager, metadata])

  // Toggle answer visibility
  const toggleQuestion = (questionId: string) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev)
      if (next.has(questionId)) {
        next.delete(questionId)
      } else {
        next.add(questionId)
      }
      return next
    })
  }

  // Expand/collapse all
  const expandAll = () => {
    if (!questions) return
    const chapterQuestions = questions.questionsByChapter[chapter.toString()] || []
    setExpandedQuestions(new Set(chapterQuestions.map(q => q.id)))
  }

  const collapseAll = () => {
    setExpandedQuestions(new Set())
  }

  // Filter questions for current chapter
  const chapterQuestions = questions?.questionsByChapter[chapter.toString()] || []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading questions...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Questions</h3>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!questions || chapterQuestions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-md">
          <HelpCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Questions Available</h3>
          <p className="text-gray-600">
            No questions are available for this chapter.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {questions.bookName} {chapter} - Questions
            </h2>
            <p className="text-sm text-gray-600">
              {chapterQuestions.length} question{chapterQuestions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Questions List */}
      <div className="p-4 space-y-3">
        {chapterQuestions.map((question, index) => {
          const isExpanded = expandedQuestions.has(question.id)
          
          return (
            <div
              key={question.id}
              className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Question Header */}
              <button
                onClick={() => toggleQuestion(question.id)}
                className="w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-semibold mt-0.5">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-gray-900 font-medium leading-relaxed">
                      {question.question}
                    </p>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </div>
                  {question.reference && (
                    <p className="text-xs text-gray-500 mt-1">
                      {question.reference}
                      {question.quote && ` - "${question.quote}"`}
                    </p>
                  )}
                </div>
              </button>

              {/* Answer (Expanded) */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <div className="pt-3 pl-9">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700 mb-1">Answer:</p>
                        <p className="text-gray-900 leading-relaxed">{question.response}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
