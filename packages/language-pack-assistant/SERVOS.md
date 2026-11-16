# Notes for Servos (and Worker, C4) on using the assistant

What an app that embeds `@bt-synergy/language-pack-assistant` should know, from the staging run of 2026-11-15.

- **One reader, one assistant.** `createAssistant` builds the lexicon, the last verses and the names once; create it per language
  and keep it. Open one reader at a time on a device.
- **Search index.** Use the client's `sqlIndex` over the device's SQLite. The memory index over all the English books ran out of
  memory in the evaluation (R30): Worker and C4 should take this as a client finding, not an assistant one.
- **Complements** are bytes you pass in (`complements/<lang>.numbers.json`, `<lang>.classifier.json`); the assistant does not read
  files. A bad or foreign (`for` not `queries/1`) file is listed in `assistant.problems` and the chain runs without it.
- **Portuguese has no map.** `pt-BR` is read against the `es-419` packs; Portuguese names of books and concepts come only from the
  complements and stems. Until a Portuguese pack exists, expect more questions to fall to search (tune: 26 of 100).
- **Spanish book names.** The staging `es-419` map names only 5 of 66 books (R24); the pipeline takes `--book-names`, but no list
  exists and staging was built without one. A question that names another book resolves no reference and goes to search. The fix
  is a 66-name list per language in the pipeline and a staging rebuild (outside this package).
- **Time.** Cards are quick when warm (median 3 to 8 ms with the SQL index). The slow tail is `renderings` for very frequent
  Strong keys (G5485 among them) and some searches on `en` (p95 about 2.9 s on the tune set, 6 of 60 cards over 300 ms); `es` p95
  is 218 ms, `pt` 429 ms. Show the interpretation line first and the pieces when they arrive; do not block the UI on the card.
- **`choose` decisions** hold up to three calls: show them as buttons and send the one chosen to `assistant.run(call)`.
- **Query names stay English;** people-facing labels come from `schemas.json` of the client.
