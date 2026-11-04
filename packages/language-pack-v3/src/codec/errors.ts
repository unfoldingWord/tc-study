/**
 * The errors a reader of format 3 gives (`spec/container.md`, "Errors").
 *
 * A reader that finds one of these rejects the whole file and uses nothing from it. Callers branch on
 * {@link FormatError.code} and nothing else: the message is for people and may change.
 */

/** The 14 codes of `container.md`, "Errors". The conformance cases expect exactly these strings. */
export const FORMAT_ERROR_CODES = [
  'E_MAGIC',
  'E_VERSION',
  'E_KIND',
  'E_TRUNCATED',
  'E_TRAILING',
  'E_HEADER',
  'E_CODEC',
  'E_INFLATE',
  'E_ID',
  'E_BODY',
  'E_HMISMATCH',
  'E_TABLE',
  'E_LIMIT',
  'E_SIGNATURE',
] as const

export type FormatErrorCode = (typeof FORMAT_ERROR_CODES)[number]

/** A file that a reader rejects. */
export class FormatError extends Error {
  readonly code: FormatErrorCode

  constructor(code: FormatErrorCode, message: string) {
    super(message)
    this.name = 'FormatError'
    this.code = code
  }
}
