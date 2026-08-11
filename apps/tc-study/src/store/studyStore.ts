/**
 * @deprecated Import `useEntryModalStore` from `features/entries` instead.
 * Thin re-export kept for any lingering `store/studyStore` imports.
 */

export {
  useEntryModalStore as useStudyStore,
  type EntryModalStore as StudyStore,
  type EntryModalState as ModalState,
} from '../features/entries/entryModalStore'
