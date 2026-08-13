import type { BCVReference, NavigationMode } from '../../contexts/types'
import { getBookTitle } from '../../utils/bookNames'

export interface ReferenceDisplayParts {
  bookPart: string
  numberPart: string
}

/** LTR: { book } { chapter:verse }; RTL: reversed numberPart for bidi-safe render. */
export function formatReferenceParts(
  ref: BCVReference,
  navigationMode: NavigationMode,
  isRtl: boolean,
  bookTitleSource: Parameters<typeof getBookTitle>[0]
): ReferenceDisplayParts {
  if (ref.book === 'obs') {
    if (navigationMode === 'chapter') {
      return { bookPart: 'OBS', numberPart: `${ref.chapter}` }
    }
    let numberPart = `${ref.chapter} · ${ref.verse}`
    if (ref.endChapter && ref.endChapter !== ref.chapter) {
      numberPart += ` – ${ref.endChapter} · ${ref.endVerse ?? 1}`
    } else if (ref.endVerse && ref.endVerse !== ref.verse) {
      numberPart += ` – ${ref.chapter} · ${ref.endVerse}`
    }
    return { bookPart: 'OBS', numberPart }
  }
  const bookName = getBookTitle(bookTitleSource, ref.book)
  if (!isRtl) {
    let numberPart = `${ref.chapter}:${ref.verse}`
    if (ref.endChapter && ref.endChapter !== ref.chapter) {
      numberPart += `-${ref.endChapter}:${ref.endVerse || 1}`
    } else if (ref.endVerse && ref.endVerse !== ref.verse) {
      numberPart += `-${ref.endVerse}`
    }
    return { bookPart: bookName, numberPart }
  }
  let numberPart = `${ref.verse}:${ref.chapter}`
  if (ref.endChapter && ref.endChapter !== ref.chapter) {
    numberPart = `${ref.endVerse ?? 1}:${ref.endChapter}-${numberPart}`
  } else if (ref.endVerse && ref.endVerse !== ref.verse) {
    numberPart = `${ref.endVerse}-${ref.verse}:${ref.chapter}`
  }
  return { bookPart: bookName, numberPart }
}

export function getNavigationModeLabel(
  currentRef: BCVReference,
  navigationMode: NavigationMode
): string {
  if (currentRef.book === 'obs') {
    return navigationMode === 'chapter' ? 'Story' : 'Frame'
  }
  switch (navigationMode) {
    case 'verse':
      return 'Range'
    case 'chapter':
      return 'Chapter'
    case 'section':
      return 'Section'
    case 'passage-set':
      return 'Passage'
    default:
      return ''
  }
}
