/** Which aligned Bible is a language's literal text. Kept apart so discovery can use it without the stamps' imports. */

/**
 * Literal ("form-centric") texts whose id does not end in `lt`. Door43 marks the role only in the id (ult, glt, …) and in
 * the manifest's free-text description, so a language that names its literal text otherwise is listed here.
 * ar: BSOJ's `avd` (Van Dyke; its manifest says "intended to provide a 'form-centric' understanding", as the ULT's does).
 */
export const LITERAL_TEXT_IDS: Record<string, readonly string[]> = { ar: ['avd'] }

/** Whether an aligned Bible of `language` with this id is the language's literal text (the ULT/GLT role). */
export function isLiteralTextId(resourceId: unknown, language: unknown): boolean {
  const id = String(resourceId ?? '')
  return /lt$/.test(id) || (LITERAL_TEXT_IDS[String(language ?? '')] ?? []).includes(id)
}

/** The language's literal text, whose owner's lexicons go in the pack: its aligned Bible that `isLiteralTextId` names. */
export function literalTextOf<T extends { language?: unknown; subject?: unknown; resourceId?: unknown }>(rows: T[], language: string): T | undefined {
  return rows.find((m) => m.language === language && m.subject === 'Aligned Bible' && isLiteralTextId(m.resourceId, language))
}
