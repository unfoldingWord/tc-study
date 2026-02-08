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
    const chapterCounts: Record<string, number> = {
      gen: 50, exo: 40, lev: 27, num: 36, deu: 34,
      jos: 24, jdg: 21, rut: 4, '1sa': 31, '2sa': 24,
      '1ki': 22, '2ki': 25, '1ch': 29, '2ch': 36, ezr: 10,
      neh: 13, est: 10, job: 42, psa: 150, pro: 31,
      ecc: 12, sng: 8, isa: 66, jer: 52, lam: 5,
      ezk: 48, dan: 12, hos: 14, jol: 3, amo: 9,
      oba: 1, jon: 4, mic: 7, nam: 3, hab: 3,
      zep: 3, hag: 2, zec: 14, mal: 4,
      mat: 28, mrk: 16, luk: 24, jhn: 21, act: 28,
      rom: 16, '1co': 16, '2co': 13, gal: 6, eph: 6,
      php: 4, col: 4, '1th': 5, '2th': 3, '1ti': 6,
      '2ti': 4, tit: 3, phm: 1, heb: 13, jas: 5,
      '1pe': 5, '2pe': 3, '1jn': 5, '2jn': 1, '3jn': 1,
      jud: 1, rev: 22,
    }
    return chapterCounts[bookCode.toLowerCase()] ?? 1
  }
}

export const defaultSectionsService = new DefaultSectionsService()
