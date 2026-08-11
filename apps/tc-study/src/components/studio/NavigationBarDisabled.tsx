import { Book, ChevronLeft, ChevronRight } from 'lucide-react'
import { LanguagePicker } from '../LanguagePicker'

interface NavigationBarDisabledProps {
  isCompact: boolean
  showLanguagePicker?: boolean
  onLanguageSelected?: (languageCode: string) => void
  autoOpenLanguagePicker?: boolean
  languagePickerRequired?: boolean
}

export function NavigationBarDisabled({
  isCompact,
  showLanguagePicker = false,
  onLanguageSelected,
  autoOpenLanguagePicker = false,
  languagePickerRequired = false,
}: NavigationBarDisabledProps) {
  if (isCompact) {
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex items-center gap-1 flex-1 justify-center opacity-40">
          <button disabled className="p-1 rounded cursor-not-allowed" title="Navigation disabled">
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </button>
          <div className="px-2 py-1 bg-gray-100 rounded flex items-center gap-1">
            <Book className="w-3 h-3 text-gray-400" />
            <div className="w-16 h-3 bg-gray-200 rounded" />
          </div>
          <button disabled className="p-1 rounded cursor-not-allowed" title="Navigation disabled">
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        {showLanguagePicker && (
          <div className="flex items-center gap-1 shrink-0">
            <div className="w-px h-4 bg-gray-300" />
            <LanguagePicker
              onLanguageSelected={onLanguageSelected}
              compact
              autoOpen={autoOpenLanguagePicker}
              required={languagePickerRequired}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-center gap-4">
      <div className="flex items-center gap-2 opacity-40">
        <button
          disabled
          className="p-2 rounded cursor-not-allowed"
          title="Navigation disabled: Add scripture resource or load passage set"
        >
          <ChevronLeft className="w-5 h-5 text-gray-400" />
        </button>
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
          <Book className="w-4 h-4 text-gray-400" />
          <div className="w-24 h-4 bg-gray-200 rounded" title="No reference selected" />
        </div>
        <button
          disabled
          className="p-2 rounded cursor-not-allowed"
          title="Navigation disabled: Add scripture resource or load passage set"
        >
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </button>
      </div>
      {showLanguagePicker && (
        <LanguagePicker
          onLanguageSelected={onLanguageSelected}
          compact={false}
          autoOpen={autoOpenLanguagePicker}
          required={languagePickerRequired}
        />
      )}
    </div>
  )
}
