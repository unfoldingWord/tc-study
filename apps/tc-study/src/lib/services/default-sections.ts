/**
 * Default Sections Service
 * Provides default section handling for USFM processing
 */

import {
  getDefaultSections,
  getDefaultSectionsMetadata,
  hasDefaultSections,
  type BookMetadata,
  type TranslatorSection,
} from '../data/default-sections'
import { knownChapterCount } from '../../features/nav/bookChapterCounts'

export interface SectionInfo {
  start: {
    chapter: number
    verse: number
    reference: { chapter: string; verse: string }
  }
  end: {
    chapter: number
    verse: number
    reference: { chapter: string; verse: string }
  }
}

export class DefaultSectionsService {
  /**
   * Get default sections for a book (async)
   * Uses the comprehensive default sections data when available,
   * falls back to chapter-based sections if not
   */
  async getDefaultSections(bookCode: string): Promise<SectionInfo[]> {
    if (hasDefaultSections(bookCode)) {
      const defaultSections = (await getDefaultSections(bookCode)) as TranslatorSection[]
      return defaultSections.map((section) => ({
        start: {
          chapter: section.start.chapter,
          verse: section.start.verse,
          reference: section.start.reference,
        },
        end: {
          chapter: section.end.chapter,
          verse: section.end.verse,
          reference: section.end.reference,
        },
      }))
    }

    console.warn(`No default sections found for book ${bookCode}, using chapter-based fallback`)
    return this.getChapterBasedSections(bookCode)
  }

  /**
   * Get metadata for default sections
   */
  async getDefaultSectionsMetadata(bookCode: string): Promise<BookMetadata | null> {
    return getDefaultSectionsMetadata(bookCode)
  }

  /**
   * Check if comprehensive default sections are available for a book
   */
  hasDefaultSections(bookCode: string): boolean {
    return hasDefaultSections(bookCode)
  }

  private getChapterBasedSections(bookCode: string): SectionInfo[] {
    const chapterCount = this.getChapterCount(bookCode)
    const sections: SectionInfo[] = []

    for (let i = 1; i <= chapterCount; i++) {
      sections.push({
        start: {
          chapter: i,
          verse: 1,
          reference: { chapter: i.toString(), verse: '1' },
        },
        end: {
          chapter: i,
          verse: 999,
          reference: { chapter: i.toString(), verse: '999' },
        },
      })
    }

    return sections
  }

  private getChapterCount(bookCode: string): number {
    return knownChapterCount(bookCode)
  }
}

export const defaultSectionsService = new DefaultSectionsService()
