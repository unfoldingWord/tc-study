/**
 * Resource Helper Utilities
 * Shared utilities for working with resources
 */

import { Book, FileText, Languages, HelpCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Get icon component for a resource subject
 */
export function getSubjectIcon(subject: string): LucideIcon {
  const lowerSubject = subject.toLowerCase()
  
  if (lowerSubject.includes('bible')) return Book
  if (lowerSubject.includes('notes')) return FileText
  if (lowerSubject.includes('words')) return Languages
  
  return HelpCircle
}

/**
 * Check if a resource is an original language resource
 */
export function isOriginalLanguageResource(language: string, subject: string): boolean {
  return (
    language === 'el-x-koine' ||
    language === 'hbo' ||
    subject === 'Greek New Testament' ||
    subject === 'Hebrew Old Testament'
  )
}

/**
 * Filter supported subjects to exclude original language subjects
 */
export function excludeOriginalLanguageSubjects(subjects: string[]): string[] {
  return subjects.filter(
    subject => subject !== 'Greek New Testament' && subject !== 'Hebrew Old Testament'
  )
}



