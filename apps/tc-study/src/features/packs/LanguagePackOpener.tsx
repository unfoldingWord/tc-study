import { PackageOpen } from 'lucide-react'
import { useRef } from 'react'
import { LanguagePackResult } from './LanguagePackResult'
import { useOpenLanguagePacks } from './useOpenLanguagePacks'

const OPEN_LABEL = 'Open a language pack'

export function LanguagePackOpener() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { open, busy, progress, opened } = useOpenLanguagePacks()

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="p-2 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
        title={OPEN_LABEL}
        aria-label={OPEN_LABEL}
        data-testid="open-language-pack-btn"
      >
        <PackageOpen className="w-5 h-5" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        multiple
        className="hidden"
        data-testid="open-language-pack-input"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          void open(files)
        }}
      />
      <LanguagePackResult progress={progress} opened={opened} />
    </div>
  )
}
