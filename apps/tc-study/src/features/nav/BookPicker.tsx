import type { RefObject } from 'react'
import type { BookInfo } from '../../contexts'
import type { ResourceInfo } from '../../contexts/types'
import { getBookTitle, getBookTitleStatic } from '../../utils/bookNames'

interface BookPickerProps {
  books: BookInfo[]
  selectedBook: string
  selectedBookRef: RefObject<HTMLButtonElement | null>
  bookTitleSource: ResourceInfo | null | undefined
  onSelectBook: (bookCode: string) => void
}

export function BookPicker({
  books,
  selectedBook,
  selectedBookRef,
  bookTitleSource,
  onSelectBook,
}: BookPickerProps) {
  if (books.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col items-center justify-center py-12 text-gray-500 text-sm">
          No Bible books found in any loaded scripture resource.
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {books.map((book) => {
          const isSelected = selectedBook === book.code
          const resolvedName = getBookTitle(bookTitleSource, book.code)
          const fullBookName =
            resolvedName !== book.code.toUpperCase()
              ? resolvedName
              : getBookTitleStatic(book.code) || book.name || book.code.toUpperCase()
          return (
            <button
              key={book.code}
              ref={isSelected ? selectedBookRef : null}
              onClick={() => onSelectBook(book.code)}
              className={`
                p-3 rounded-lg border transition-all text-left hover:shadow-sm
                ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                }
              `}
            >
              <div className="font-semibold text-gray-900">{fullBookName}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">
                {book.code}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
