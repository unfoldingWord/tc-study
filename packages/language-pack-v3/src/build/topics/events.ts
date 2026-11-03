/** Events that the builder adds to the ones of Theographic: ids, English titles and verse ranges (UHB numbering). */
import { verseId } from '../../ids'

export const BUILDER_EVENTS: readonly { id: string; title: string; ranges: [number, number][] }[] = Object.freeze([
  Object.freeze({
    id: 'ev:plagues-of-egypt',
    title: 'Plagues of Egypt',
    ranges: [[verseId('exo', 7, 14), verseId('exo', 12, 36)] as [number, number]],
  }),
])
