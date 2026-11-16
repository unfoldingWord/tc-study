# Notes for Servos (and Worker, C4) on using the assistant

What an app that embeds `@bt-synergy/language-pack-assistant` should know, from the staging run of 2026-11-15.

- **One reader, one assistant.** `createAssistant` builds the lexicon, the last verses and the names once; create it per language
  and keep it. Open one reader at a time on a device.
  `createAssistant` opens every installed book once (to read `lastVerses`), so creating it costs a pass over the books.
- **First open after the update.** The client index version changed (section roles, stems), so the first open re-indexes every
  book; on a phone this may take long. Do it in the background, with progress, not in the first screen.
- **Search index.** Use the client's `sqlIndex` over the device's SQLite. The memory index over all the English books ran out of
  memory in the evaluation (R30): Worker and C4 should take this as a client finding, not an assistant one.
- **Complements** are bytes you pass in (`complements/<lang>.numbers.json`, `<lang>.classifier.json`); the assistant does not read
  files. A bad or foreign (`for` not `queries/1`) file is listed in `assistant.problems` and the chain runs without it.
- **Portuguese has no map.** `pt-BR` is read against the `es-419` packs; Portuguese names of books and concepts come from the
  `es-419` maps, matched by stems (not from the complements). Until a Portuguese pack exists, expect more questions to fall to search (tune: 26 of 100).
- **Spanish book names.** Staging `es-419` (revision 7) names all 66 books (61 from the pipeline's name list, 5 from text), so a
  reference to any book resolves. This replaces the C2 limit (5 of 66, R24).
- **Time.** Cards are quick when warm (median 3 to 5 ms with the SQL index). The slow tail is `renderings` for very frequent
  Strong keys (G5485 among them) and some searches on `en`. On the test sets, run 2 (desktop): `es` p95 190 ms, `en` 1228 ms
  (19 of 150 over 300 ms), `pt` 864 ms. Show the interpretation line first and the pieces when they arrive; do not block the UI on the card.
- **`choose` decisions.** An ambiguous name (a book that is also a person, such as Juan) keeps every option: the book's introduction when listed, then every person (R27). Other chooses (renderings by several Strong keys, the classifier's two best) hold up to 3 (`MAX_OPTIONS`). Show them as buttons and send the one chosen to `assistant.run(call)`.

## What changed in C2.1 (gate on the second held-out sets, 2026-11-16)

- **Chain fixes.** A name inside a free description goes to search; question words are not content words. Gate (test2): calls correct
  es 83 %, en 75 %, pt 59 %; no accuracy target is met (see `eval/RESULTS.md`, C2.1).
- **Cards.** A concept or article card shows every section of the article, not only the default one. OBS (Bible stories) fragments
  and ids exist in the card (frame references are padded on both sides); the staging packs hold no OBS yet.
- **Faster renderings.** The client builds an index of aligned words once per book and text, so the slow `renderings` tail is gone.
  Test2, desktop, warm, SQL index: p50 1.0 to 3.7 ms; p95 33 ms (es), 105 ms (en), 220 ms (pt). The earlier `en` p95 of 1228 ms no longer applies.
- **Book names.** `es-419` revision 7 names all 66 books.
- Portuguese still runs on the Spanish packs and falls to search often (63 of 150 on test2).
