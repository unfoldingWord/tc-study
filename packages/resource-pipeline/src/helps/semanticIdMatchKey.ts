/**
 * Linked-panels match key for quote / underline semantic IDs: a word's identity
 * as Door43 writes it. NFC, case-insensitive (Greek), and without Unicode
 * format chars (esp. U+2060 word joiner: UHB `\w` surfaces often insert it
 * between morphs, `לְ⁠דָ֫וִ֥ד`, while some ULT `\zaln` x-content omit it).
 *
 * Combining marks are KEPT. Door43's alignments count a word's occurrence on
 * its whole written form, accents included, so two words that differ only by
 * their accents are each the first of its kind: Jonah 1:3 יְהוָ֑ה and יְהוָֽה,
 * Ruth 1:1 וַיְהִ֗י and וַיְהִ֥י, Titus 3:12 πρὸς and πρός. Folding the marks
 * gave both the same key (`יהוה:1`), and a note on one marked the other too:
 * 54 words of Jonah, 129 of Ruth, 738 of Psalms. Every \zaln x-content of
 * es-419 GLT and en ULT in Jonah, Psalms and Titus finds its word as written.
 */
export function semanticIdMatchKey(semanticId: string): string {
  return semanticId.normalize('NFC').replace(/\p{Cf}/gu, '').toLowerCase()
}

/**
 * The same with every combining mark folded away (pointed Hebrew to its
 * consonants, Greek without accents). Never a word's identity: only for
 * finding a word written another way than the text (a quote typed without
 * accents, an alignment made against another edition of the original).
 */
export function foldedMatchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\p{Cf}/gu, '')
    .toLowerCase()
}
