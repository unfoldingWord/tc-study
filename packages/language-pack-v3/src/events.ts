/**
 * The events of a text and their codes (`spec/cddl/book.cddl`, "Texts"). The book segment and the original segment write
 * the same events, so their builders and readers share this one table:
 *
 * | Code | Kind | Argument |
 * | ---: | --- | --- |
 * | 0 | `chapter` | the chapter's number as published |
 * | 1 | `verse` | the verse's number as published |
 * | 2 | `open` | `"type:marker"` as in USJ |
 * | 3 | `close` | none: 0 in a segment, `""` in a model |
 */
import { hasOwn } from './codec/values'
import type { Event } from './model'

export type EventKind = Event[1]

/** The kinds, by code: `EVENT_KINDS[code]` is the kind. */
export const EVENT_KINDS: readonly EventKind[] = ['chapter', 'verse', 'open', 'close']

/** The codes, by kind. */
export const EVENT_CODES: Readonly<Record<EventKind, number>> = { chapter: 0, verse: 1, open: 2, close: 3 }

/** The code of a kind, or `undefined` when `kind` is not one of the four. */
export function eventCode(kind: string): number | undefined {
  return hasOwn(EVENT_CODES, kind) ? EVENT_CODES[kind as EventKind] : undefined
}

/** The kind of a code, or `undefined` when `code` is not 0 to 3. */
export function eventKind(code: number): EventKind | undefined {
  return Number.isInteger(code) ? EVENT_KINDS[code] : undefined
}
