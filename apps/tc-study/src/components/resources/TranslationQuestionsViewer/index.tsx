/**
 * Translation Questions Viewer
 * 
 * Displays comprehension questions and answers for Bible passages.
 * Questions are filtered by the current verse range.
 */

import type { ProcessedQuestions } from '@bt-synergy/resource-parsers'
import type { ResourceViewerProps } from '@bt-synergy/resource-types'
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, HelpCircle, MessageCircleQuestion } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useCurrentReference } from '../../../contexts'
import { useLoaderRegistry } from '../../../contexts/CatalogContext'
import { ResourceViewerHeader } from '../common/ResourceViewerHeader'

export function TranslationQuestionsViewer({ resourceKey, resource }: ResourceViewerProps & { resource: any }) {
  const [questions, setQuestions] = useState<ProcessedQuestions | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set())
  
  const loaderRegistry = useLoaderRegistry()
  const currentRef = useCurrentReference()
  
  const bookCode = currentRef.book || 'gen'

  // Load questions for current book
  useEffect(() => {
    if (!loaderRegistry || !resourceKey) return

    let cancelled = false

    const loadQuestions = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const loader = loaderRegistry.getLoader('questions')
        if (!loader) {
          throw new Error('Translation Questions loader not found')
        }

        console.log(`📖 Loading translation questions for: ${resourceKey}/${bookCode}`)
        const content = await loader.loadContent(resourceKey, bookCode)
        
        if (cancelled) return

        setQuestions(content)
      } catch (err) {
        if (cancelled) return

        console.error(`Failed to load questions for ${bookCode}:`, err)
        setError(err instanceof Error ? err.message : 'Failed to load questions')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadQuestions()

    return () => {
      cancelled = true
    }
  }, [resourceKey, bookCode, loaderRegistry])

  // Filter questions for current chapter/verse range
  const relevantQuestions = useMemo(() => {
    if (!questions || !questions.questions || questions.questions.length === 0) return []

    const startChapter = currentRef.chapter
    const startVerse = currentRef.verse
    const endChapter = currentRef.endChapter || startChapter
    const endVerse = currentRef.endVerse || startVerse

    return questions.questions.filter(question => {
      // Parse reference (format: "1:1" or "1:2-3")
      const [questionChapterStr, questionVerseRange] = question.reference.split(':')
      const questionChapter = parseInt(questionChapterStr)

      // Check if question's chapter is within range
      if (questionChapter < startChapter || questionChapter > endChapter) {
        return false
      }

      // Parse verse range (could be single verse or range like "1-3")
      let questionStartVerse: number
      let questionEndVerse: number

      if (questionVerseRange.includes('-')) {
        const [start, end] = questionVerseRange.split('-').map(v => parseInt(v))
        questionStartVerse = start
        questionEndVerse = end
      } else {
        questionStartVerse = parseInt(questionVerseRange)
        questionEndVerse = questionStartVerse
      }

      // If this is the start chapter, check if question's end verse is >= start verse
      if (questionChapter === startChapter && questionEndVerse < startVerse) {
        return false
      }

      // If this is the end chapter, check if question's start verse is <= end verse
      if (questionChapter === endChapter && questionStartVerse > endVerse) {
        return false
      }

      return true
    })
  }, [questions, currentRef.chapter, currentRef.verse, currentRef.endChapter, currentRef.endVerse])

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

  if (!questions || relevantQuestions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-md">
          <HelpCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Questions Available</h3>
          <p className="text-gray-600">
            No questions are available for this verse range.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <ResourceViewerHeader 
        title={resource.title}
        icon={MessageCircleQuestion}
        subtitle={resource.languageTitle}
      />
      
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-3">
        {relevantQuestions.map((question, index) => {
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
                    <p className="text-gray-900 leading-relaxed flex-1">{question.response}</p>
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
