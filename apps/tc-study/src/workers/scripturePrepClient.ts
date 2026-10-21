/**
 * @deprecated Prefer prepareClient — kept as a thin re-export for transitional imports.
 */
export {
  batchQuotesInWorker,
  enqueuePrepareJob,
  enqueueScriptureBookPriority,
  cancelPrepareBook,
  subscribePrepareReady,
} from './prepareClient'

import type { UsjScriptureViewModel } from '@bt-synergy/scripture-loader'
import { markScripturePerfEnd, markScripturePerfStart } from '../features/perf/scripturePerf'
import { prepareViewModel } from '../features/scripture/scripturePrepCore'

/** Book-open fold (legacy). Prefer prepared full-tier matchKeys. */
export function prepViewModelForRead(
  viewModel: UsjScriptureViewModel
): UsjScriptureViewModel {
  markScripturePerfStart('book-load', 'fold-keys')
  try {
    return prepareViewModel(viewModel)
  } finally {
    markScripturePerfEnd('book-load', 'fold-keys')
  }
}
