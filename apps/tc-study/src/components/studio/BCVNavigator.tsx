/**
 * BCVNavigator - Book-Chapter-Verse, Section, or Open Bible Stories selection modal
 *
 * Scripture: (1) pick book → (2) verses or preset sections
 * OBS: (1) pick story → (2) pick frame
 *
 * Presentational pickers live under `features/nav/*`.
 * Orchestration: `features/nav/useBcvNavigatorController`.
 */

import { BookMarked, BookOpen, Hash, List } from 'lucide-react'
import {
  BcvNavigatorEmpty,
  BcvNavigatorShell,
  BookPicker,
  ChapterVersePicker,
  ObsFrameRangePicker,
  ObsModeTabs,
  ObsStoryPicker,
  ScopeTabs,
  SectionPicker,
  useBcvNavigatorController,
} from '../../features/nav'

interface BCVNavigatorProps {
  onClose: () => void
  mode?: 'verse' | 'section'
}

export function BCVNavigator({ onClose, mode = 'verse' }: BCVNavigatorProps) {
  const c = useBcvNavigatorController({ onClose, mode })

  if (!c.hasObsLoaded && c.availableBooks.length === 0) {
    return <BcvNavigatorEmpty onClose={onClose} />
  }

  const headerIcon =
    c.step === 1 ? (
      c.pickerScope === 'obs' ? (
        <BookMarked className="w-5 h-5 text-blue-600" />
      ) : (
        <BookOpen className="w-5 h-5 text-blue-600" />
      )
    ) : c.pickerScope === 'obs' ? (
      <BookMarked className="w-5 h-5 text-blue-600" />
    ) : c.scripturePickerMode === 'section' ? (
      <List className="w-5 h-5 text-blue-600" />
    ) : (
      <Hash className="w-5 h-5 text-blue-600" />
    )

  return (
    <BcvNavigatorShell onClose={onClose} headerIcon={headerIcon}>
      {c.step === 1 && (
        <ScopeTabs
          pickerScope={c.pickerScope}
          hasObsLoaded={c.hasObsLoaded}
          obsResourceTitle={c.obsResourceTitle}
          onSelectScripture={() => {
            c.setPickerScope('scripture')
            c.setStep(1)
          }}
          onSelectObs={() => {
            const fromScripture = c.pickerScope === 'scripture'
            c.setPickerScope('obs')
            if (fromScripture) c.setPickerObsMode('chapter')
            c.setStep(1)
            c.setSelectedObsStory(c.currentRef.book === 'obs' ? c.currentRef.chapter : null)
          }}
        />
      )}

      {c.step === 1 && c.pickerScope === 'obs' && (
        <ObsModeTabs
          pickerObsMode={c.pickerObsMode}
          onSelectChapter={() => c.setPickerObsMode('chapter')}
          onSelectVerse={() => c.setPickerObsMode('verse')}
        />
      )}

      <div className="flex-1 flex flex-col min-h-0">
        {c.step === 1 && c.pickerScope === 'scripture' && (
          <BookPicker
            books={c.availableBooks}
            selectedBook={c.selectedBook}
            selectedBookRef={c.selectedBookRef}
            bookTitleSource={c.bookTitleSource}
            onSelectBook={(code) => {
              c.setSelectedBook(code)
              c.setStep(2)
            }}
          />
        )}

        {c.step === 1 && c.pickerScope === 'obs' && c.pickerObsMode === 'chapter' && (
          <ObsStoryPicker
            obsStoryIds={c.obsStoryIds}
            selectedObsStory={c.selectedObsStory}
            currentRef={c.currentRef}
            selectedObsStoryRef={c.selectedObsStoryRef}
            onSelectStory={c.setSelectedObsStory}
            onApply={c.handleObsStoryApply}
          />
        )}

        {c.pickerScope === 'obs' && c.pickerObsMode === 'verse' && (
          <ObsFrameRangePicker
            obsStoryIds={c.obsStoryIds}
            frameCountByStory={c.navigation.obsFrameCountByStory}
            loadingStories={c.obsLoadingStories}
            currentRef={c.currentRef}
            obsRangeStart={c.obsRangeStart}
            obsRangeEnd={c.obsRangeEnd}
            selectedObsStoryRef={c.selectedObsStoryRef}
            startVerseRef={c.startVerseRef}
            onStoryHeaderClick={c.handleObsStoryHeaderClick}
            onFrameClick={c.handleObsRangeClick}
            onApply={c.handleObsRangeApply}
          />
        )}

        {c.step === 2 && c.pickerScope === 'scripture' && c.scripturePickerMode === 'section' && (
          <SectionPicker
            selectedBook={c.selectedBook}
            bookTitleSource={c.bookTitleSource}
            sections={c.sections}
            pickedSectionIdx={c.pickedSectionIdx}
            currentSectionRef={c.currentSectionRef}
            onBack={() => c.setStep(1)}
            onPickSection={c.setPickedSectionIdx}
            onApply={c.applySectionSelection}
          />
        )}

        {c.step === 2 && c.pickerScope === 'scripture' && c.scripturePickerMode !== 'section' && (
          <ChapterVersePicker
            selectedBook={c.selectedBook}
            bookTitleSource={c.bookTitleSource}
            chapters={c.chapters}
            versesByChapter={c.versesByChapter}
            startVerse={c.startVerse}
            endVerse={c.endVerse}
            selectionCount={c.selectionCount}
            startVerseRef={c.startVerseRef}
            onBack={() => c.setStep(1)}
            onChapterClick={c.handleChapterClick}
            onVerseClick={c.handleVerseClick}
            onApply={c.handleApply}
          />
        )}
      </div>
    </BcvNavigatorShell>
  )
}
