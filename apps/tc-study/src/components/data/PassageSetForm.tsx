/**
 * Passage Set Form - Create/Edit passage sets
 */

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Save } from 'lucide-react'
import type { PassageSet, BCVReference } from '@bt-synergy/passage-sets'

interface PassageSetFormProps {
  passageSet?: PassageSet | null
  onSave: (passageSet: PassageSet) => void
  onCancel: () => void
}

const BOOKS = [
  // OT
  { code: 'gen', name: 'Genesis' },
  { code: 'exo', name: 'Exodus' },
  { code: 'lev', name: 'Leviticus' },
  { code: 'num', name: 'Numbers' },
  { code: 'deu', name: 'Deuteronomy' },
  { code: 'jos', name: 'Joshua' },
  { code: 'jdg', name: 'Judges' },
  { code: 'rut', name: 'Ruth' },
  { code: '1sa', name: '1 Samuel' },
  { code: '2sa', name: '2 Samuel' },
  { code: '1ki', name: '1 Kings' },
  { code: '2ki', name: '2 Kings' },
  { code: '1ch', name: '1 Chronicles' },
  { code: '2ch', name: '2 Chronicles' },
  { code: 'ezr', name: 'Ezra' },
  { code: 'neh', name: 'Nehemiah' },
  { code: 'est', name: 'Esther' },
  { code: 'job', name: 'Job' },
  { code: 'psa', name: 'Psalms' },
  { code: 'pro', name: 'Proverbs' },
  { code: 'ecc', name: 'Ecclesiastes' },
  { code: 'sng', name: 'Song of Solomon' },
  { code: 'isa', name: 'Isaiah' },
  { code: 'jer', name: 'Jeremiah' },
  { code: 'lam', name: 'Lamentations' },
  { code: 'ezk', name: 'Ezekiel' },
  { code: 'dan', name: 'Daniel' },
  { code: 'hos', name: 'Hosea' },
  { code: 'jol', name: 'Joel' },
  { code: 'amo', name: 'Amos' },
  { code: 'oba', name: 'Obadiah' },
  { code: 'jon', name: 'Jonah' },
  { code: 'mic', name: 'Micah' },
  { code: 'nam', name: 'Nahum' },
  { code: 'hab', name: 'Habakkuk' },
  { code: 'zep', name: 'Zephaniah' },
  { code: 'hag', name: 'Haggai' },
  { code: 'zec', name: 'Zechariah' },
  { code: 'mal', name: 'Malachi' },
  // NT
  { code: 'mat', name: 'Matthew' },
  { code: 'mrk', name: 'Mark' },
  { code: 'luk', name: 'Luke' },
  { code: 'jhn', name: 'John' },
  { code: 'act', name: 'Acts' },
  { code: 'rom', name: 'Romans' },
  { code: '1co', name: '1 Corinthians' },
  { code: '2co', name: '2 Corinthians' },
  { code: 'gal', name: 'Galatians' },
  { code: 'eph', name: 'Ephesians' },
  { code: 'php', name: 'Philippians' },
  { code: 'col', name: 'Colossians' },
  { code: '1th', name: '1 Thessalonians' },
  { code: '2th', name: '2 Thessalonians' },
  { code: '1ti', name: '1 Timothy' },
  { code: '2ti', name: '2 Timothy' },
  { code: 'tit', name: 'Titus' },
  { code: 'phm', name: 'Philemon' },
  { code: 'heb', name: 'Hebrews' },
  { code: 'jas', name: 'James' },
  { code: '1pe', name: '1 Peter' },
  { code: '2pe', name: '2 Peter' },
  { code: '1jn', name: '1 John' },
  { code: '2jn', name: '2 John' },
  { code: '3jn', name: '3 John' },
  { code: 'jud', name: 'Jude' },
  { code: 'rev', name: 'Revelation' },
]

export function PassageSetForm({ passageSet, onSave, onCancel }: PassageSetFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [passages, setPassages] = useState<BCVReference[]>([])

  useEffect(() => {
    if (passageSet) {
      setName(passageSet.name)
      setDescription(passageSet.description || '')
      setPassages(passageSet.passages)
    }
  }, [passageSet])

  const addPassage = () => {
    setPassages([...passages, { book: 'gen', chapter: 1, verse: 1 }])
  }

  const removePassage = (index: number) => {
    setPassages(passages.filter((_, i) => i !== index))
  }

  const updatePassage = (index: number, field: keyof BCVReference, value: string | number) => {
    const updated = [...passages]
    if (field === 'book') {
      updated[index][field] = value as string
    } else {
      updated[index][field] = Number(value)
    }
    setPassages(updated)
  }

  const handleSave = () => {
    if (!name.trim() || passages.length === 0) {
      alert('Please enter a name and at least one passage')
      return
    }

    const saved: PassageSet = {
      id: passageSet?.id || `ps-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      passages,
    }

    onSave(saved)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900">
            {passageSet ? 'Edit Passage Set' : 'New Passage Set'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
            data-testid="form-close-btn"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Romans Road to Salvation"
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                data-testid="passage-set-name-input"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                data-testid="passage-set-description-input"
              />
            </div>

            {/* Passages */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Passages <span className="text-red-500">*</span>
                </label>
                <button
                  onClick={addPassage}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  data-testid="add-passage-btn"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Passage</span>
                </button>
              </div>

              {passages.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 text-sm">No passages yet. Click "Add Passage" to start.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {passages.map((passage, index) => (
                    <div key={index} className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1 grid grid-cols-3 gap-3">
                        {/* Book */}
                        <select
                          value={passage.book}
                          onChange={(e) => updatePassage(index, 'book', e.target.value)}
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          data-testid={`passage-${index}-book`}
                        >
                          {BOOKS.map(book => (
                            <option key={book.code} value={book.code}>{book.name}</option>
                          ))}
                        </select>

                        {/* Chapter */}
                        <input
                          type="number"
                          value={passage.chapter}
                          onChange={(e) => updatePassage(index, 'chapter', e.target.value)}
                          placeholder="Chapter"
                          min="1"
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          data-testid={`passage-${index}-chapter`}
                        />

                        {/* Verse */}
                        <input
                          type="number"
                          value={passage.verse}
                          onChange={(e) => updatePassage(index, 'verse', e.target.value)}
                          placeholder="Verse"
                          min="1"
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          data-testid={`passage-${index}-verse`}
                        />
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => removePassage(index)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove passage"
                        aria-label="Remove passage"
                        data-testid={`remove-passage-${index}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0 bg-gray-50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            data-testid="cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || passages.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="save-btn"
          >
            <Save className="w-4 h-4" />
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  )
}
