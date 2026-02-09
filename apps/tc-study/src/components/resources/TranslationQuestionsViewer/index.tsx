/**
 * Translation Questions Viewer
 *
 * Displays comprehension questions and answers for Bible passages.
 * Questions are filtered by the current verse range.
 * Results are cached by resourceKey+book so switching tabs doesn't re-fetch.
 */

import type { ProcessedQuestions } from '@bt-synergy/resource-parsers'
import type { ResourceViewerProps } from '@bt-synergy/resource-types'
import { AlertCircle, BookOpen, CheckCircle, ChevronDown, ChevronUp, HelpCircle, MessageCircleQuestion } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useCurrentReference } from '../../../contexts'
import { useAppStore, useBookTitleSource } from '../../../contexts/AppContext'
import { useLoaderRegistry } from '../../../contexts/CatalogContext'
import { getBookTitleWithFallback } from '../../../utils/bookNames'
import { ResourceViewerHeader } from '../common/ResourceViewerHeader'
import type { ResourceInfo } from '../../../contexts/types'

const TQ_CACHE_MAX = 50
const questionsCache = new Map<string, ProcessedQuestions>()

function tqCacheKey(resourceKey: string, bookCode: string) {
  return `tq:${resourceKey}:${bookCode}`
}

export function TranslationQuestionsViewer({ resourceKey, resource }: ResourceViewerProps & { resource: ResourceInfo }) {
  const loaderRegistry = useLoaderRegistry()
  const currentRef = useCurrentReference()
  const bookTitleSource = useBookTitleSource()
  const bookCode = currentRef.book || 'gen'
  const resourceFromStore = useAppStore((s) => (resource?.id ? s.loadedResources[resource.id] : undefined))
  const effectiveResource = resourceFromStore ?? resource

  const cached = resourceKey && bookCode ? questionsCache.get(tqCacheKey(resourceKey, bookCode)) : undefined
  const [questions, setQuestions] = useState<ProcessedQuestions | null>(cached ?? null)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set())

  // Load questions for current book
  useEffect(() => {
    if (!loaderRegistry || !resourceKey) return

    const key = tqCacheKey(resourceKey, bookCode)
    const hit = questionsCache.get(key)
    if (hit !== undefined) {
      setQuestions(hit)
      setLoading(false)
      return
    }

    let cancelled = false

    const loadQuestions = async () => {
      setLoading(true)
      setError(null)

      try {
        const loader = loaderRegistry.getLoader('questions')
        if (!loader) {
          throw new Error('Translation Questions loader not found')
        }

        const content = await loader.loadContent(resourceKey, bookCode)

        if (cancelled) return
        if (questionsCache.size >= TQ_CACHE_MAX) questionsCache.delete(questionsCache.keys().next().value!)
        questionsCache.set(key, content)
        setQuestions(content)
      } catch (err) {
        if (cancelled) return
        console.error(`Failed to load questions for ${bookCode}:`, err)
        setError(err instanceof Error ? err.message : 'Failed to load questions')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadQuestions()
    return () => { cancelled = true }
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

  // Group questions by verse for display
  const questionsByVerse = useMemo(() => {
    const grouped: Record<string, typeof relevantQuestions> = {}
    for (const question of relevantQuestions) {
      const ref = question.reference
      if (!grouped[ref]) {
        grouped[ref] = []
      }
      grouped[ref].push(question)
    }
    return grouped
  }, [relevantQuestions])

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
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <ResourceViewerHeader 
          title={resource.title}
          icon={MessageCircleQuestion}
        />
        <div className="p-4 space-y-4">
        {Object.entries(questionsByVerse).map(([verse, verseQuestions]) => (
          <div key={verse} className="space-y-3">
            {/* Verse Header */}
            <div className="px-2.5 py-1.5 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-lg">
              <div className="flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                <h3 className="text-xs font-semibold text-gray-700">
                  {getBookTitleWithFallback(effectiveResource, bookTitleSource, currentRef.book)} {verse}
                </h3>
                <span className="ml-auto px-2 py-0.5 bg-blue-100/50 text-blue-700 rounded-full text-[10px] font-medium">
                  {verseQuestions.length}
                </span>
              </div>
            </div>

            {/* Questions for this verse */}
            {verseQuestions.map((question, index) => {
              const isExpanded = expandedQuestions.has(question.id)
              
              return (
                <div
                  key={question.id}
                  className={`
                    group rounded-lg p-3 transition-all duration-150 border
                    ${isExpanded
                      ? 'bg-gradient-to-br from-green-50 via-green-50 to-emerald-50 shadow-sm border-green-200' 
                      : 'bg-white hover:shadow-sm hover:border-gray-200 border-gray-100'
                    }
                  `}
                >
                  {/* Question Header */}
                  <button
                    onClick={() => toggleQuestion(question.id)}
                    className="w-full text-left flex items-start gap-3"
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold mt-0.5">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-base text-gray-900 font-medium leading-relaxed">
                          {question.question}
                        </p>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0 mt-1" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                        )}
                      </div>
                      {question.quote && (
                        <p className="text-sm text-gray-600 italic mt-1.5">
                          "{question.quote}"
                        </p>
                      )}
                    </div>
                  </button>

                  {/* Answer (Expanded) */}
                  {isExpanded && (
                    <div className="mt-2.5 pt-2.5 border-t border-gray-100/50">
                      <div className="pl-9">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-1" />
                          <p className="text-base text-gray-700 leading-relaxed flex-1">{question.response}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        </div>
      </div>
    </div>
  )
}
