# Question sets of the language-pack assistant

Files: `*-tune.jsonl` (tuning sets, 100 questions in es and pt, 60 in en) and `*-test.jsonl` (held-out test sets, 150 questions each).

## Who wrote them, and when

The test sets were written on 2026-11-12 by Claude, as an implementer subagent per language, in parallel and with no access to the C0
questions (the C0 phase-0 files, the tune sets, the templates and the phrase tables were not opened). The questions are typed the way
translators and consultants type: short, sometimes without accents or question marks, with abbreviations and number words.

- `es-test.jsonl`: Spanish, asked about the `es-419` packs.
- `en-test.jsonl`: English, asked about the `en` packs.
- `pt-test.jsonl`: Portuguese, asked about the `es-419` packs (reader `es-419`, Portuguese book and concept names; the expected calls use
  ids, which are language neutral).

Only books and articles that the cached staging packs have are asked about, except the 5 "no answer" questions. Note for `es-419`: the
installed `neh` text holds only 1:1 in staging, so the Nehemiah passage question asks for 1:1.

## Line shape

One JSON object per line:

```
{ "q": string, "expect": { "call": Call } | { "choose": Call[] } | { "search": true }, "pieces": string[], "note"?: string }
```

`Call = { query, args }` with `passage {ref}`, `concept {id}`, `article {id, section?}`, `renderings {strong}`, `search {text}`,
`topics {category? | book?}` (never both), `books {article} | {concept}`, `context {ref}`.

## The mix (150 per language)

| Query | n | Notes |
|---|---|---|
| passage | 30 | 8 with number words or abbreviations, 2 chapter-only |
| concept | 25 | people, places and key terms (tW) |
| article | 15 | asked the way the tA subtitle puts it |
| renderings | 15 | 3 Strong numbers as written, 4 single-key, 5 multi-key (`choose`), 3 no-key (`choose` concept + search) |
| books | 15 | 10 by concept, 5 by article |
| topics | 10 | 5 by book, 5 by category |
| context | 5 | |
| search | 20 | phrases and stories, `{ search: true }` |
| choose | 10 | ambiguous names: 5 book + person, 5 person only |
| no answer | 5 | resources the packs do not have: `pieces: []`, `note: "no answer"` |

The mix as it really is, per language, by the shape of `expect` (the table above is the plan; these are the files):

- `es-test.jsonl`: renderings 15 = 7 `call`, 5 `choose` of renderings and 3 `choose` of concept and search; ambiguous names 10 = 5 book + person, 5 persons only
  (150 lines: 112 `call`, 18 `choose`, 20 `search`). Topics are 6 by book and 4 by category (107 is by book). Line 131 («el hijo pródigo») is a search
  no answer (es-419 has no Luke) and lines 146-150 are no answers too, so the file holds 6 no-answer lines, not 5.
- `en-test.jsonl`: the 15 renderings lines are all `call` (single Strong key, as written; padded keys in the pieces where the reader resolves them,
  lines 73 and 75); `choose` is 10 = 8 ambiguous names (book + persons, 5 of them with the tW article id where it exists) and 2 `choose` of renderings
  (144-145). Topics are 6 by book and 4 by category (108 is Romans by sections).
- `pt-test.jsonl`: renderings 15 = 5 `call` and 10 `choose` (8 of renderings, 2 of concept and search); `choose` is 20 = those 10 plus 10 ambiguous names
  (5 book + person, 5 persons only). The 20 search lines have the shape `{ search: true }` (R15). Topics are 6 by book and 4 by category (110 is Tito by sections).

## Rulings used

- R5: an ambiguous book name alone: `choose` with `passage {ref: '<code> front:intro'}` and `concept {id}` of each person of that name. Names of
  persons whose book is not installed (Juan, Santiago, María, Herodes, Zacarías) are `choose` of their `concept` options only.
- R6: a chapter-only reference: `passage {ref: '<code> <c>:1-<last>'}`, `last` the real last verse of the chapter in the installed book
  (999 if the book is not installed).
- R10/R10b: "how was <tW word> translated": `strongsOf(reader, conceptId)` from `eval/check-ids.ts`: 1 key is `renderings {strong}`; 2 or more
  keys is `choose` of `renderings {strong}` for the first 3; 0 keys is `choose` of `concept {id}` and `search {text: q}`. A question that
  names a Strong number is `renderings {strong}` as written (upper case).
- R11: Strong keys as written (`G5485`), upper case.
- R14: in an ambiguous-name `choose` (R5) the book option (`passage <code> front:intro`) is offered only when the catalogs of the language list that
  book; otherwise the `choose` holds the persons only (es-419 lists no `jhn`, `jas`, `jud`, `zec`: es 141-142, 145 and pt 136-138, 145).
- R15: pt search lines are `{ search: true }` with `pieces: []` and note "pieces unreachable: pt words, es index" (Portuguese words against the Spanish
  index): they leave the top-3 metric.
- R16: every `choose` line has `pieces: []` (a choose card has no pieces).
- R17: a person in a call or a `choose` uses the `tw:names/*` id when a tW names article exists for that person, else the `per:*` id.
- R18: `topics {book}` pieces are ordered by verse count (most first); for a question that asks for people and places, only person and place topics.
- `search {text}`: the text is the question as typed.

## Expected pieces (best first, 1 to 5)

Found with the reader's own queries. The id grammar:

`verse:<res> <book> <c>:<v>`, `note:<book>/<rowid>`, `question:<book>/<rowid>`, `link:<book>/<rowid>`, `section:<article id>#<sid>`,
`concept:<id>`, `rendering:<strong>/<form>`, `book:<code>`, `topic:<id>`.

- passage and context: the verse of the main text (`glt`) first, then notes (non-introduction first), then one question.
- concept: `section:<id>#<default section>` first, then `concept:<id>`. article: the default section.
- renderings: the most frequent form of each key. books: the 3 books with the highest count. topics: for a book, the person, place and event
  topics of the most verses; for a category, the first ids.
- search: the top hits of the reader's search (the generic book introduction note was dropped from the top when other hits exist).
- choose: no pieces (R16).

`LP3_STAGING=1 bun eval/check-ids.ts --lang <lang> --file eval/questions/<lang>-test.jsonl` checks that every piece id and every call exists.

## Freeze rule

The test sets are frozen by the freeze commit (`eval: question sets, frozen before tuning`). After it, no question, expectation or piece of a
`*-test.jsonl` file changes to make a rule pass: the rules are tuned on the `*-tune.jsonl` sets only. A wrong expectation found later is
reported to the controller, fixed in a separate commit that says why, and the gate is run again on the corrected set.
