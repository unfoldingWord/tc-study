# Fixed queries

A fixed query is a file `<name>.json`:

```json
{"query": {"kind": "strong", "key": "G54850"}, "expected": {...}}
```

`expected` is the answer, written as JSON in the same canonical text as reader output (`../README.md`, "Reader output":
integers, no `null`, keys sorted by code point, an absent value is an absent key). Lists are in the order written below;
none is left to the implementation. A book is its code; a verse id is the full `LLCCCVVV`.

## States

A **cell** is the answer for one key, one source and one book. Its `state` is one of `count`, `zero`, `none`, `partial`,
decided in this order (counts.md):

1. The source's `coverage` lists the book as `partial`: `partial`, with `count` and `verses` (0 and 0 when there are no
   rows). This comes first: a partial source never gives `zero`, and its rows are "at least".
2. The book is in neither `whole` nor `partial`: `none` (no source), with no `count` or `verses`.
3. The book is whole and the key has rows there: `count`, with `count` and `verses`.
4. The book is whole and the key has no row: `zero`, with `count` 0 and `verses` 0.

A cell is `{"state": s, "count": n, "verses": v}`; for `none` only `{"state": "none"}`.

## Kinds

Every answer has `"kind"` (the query's kind) and, for the kinds that count, `"unit"` (the table's unit). A book key of
`books` is a code (`ids.md`). Lists that can be empty are always written, as `[]`.

| Kind | Query | Answer |
| --- | --- | --- |
| `strong` | `{key}` | `{"kind": "strong", "key": k, "unit": "occurrences", "books": {book: cell}}`: one cell for each of the 66 books. `key` is the key resolved by the lookup rule (the key as asked when the table has it, else the key with a `0` added if the table has that one: `G5485` gives `G54850`), and the key as asked when the table has neither. The cells of a book come from **exactly one source**, the original that covers the book: `unfoldingWord/hbo/uhb` for the 39 books of the Old Testament (numbers 1 to 39), `unfoldingWord/el-x-koine/ugnt` for the 27 of the New (40 to 66), as the `coverage` of the `xmap` lists them. Cells are never added over sources: a book is in one of them, and a book the one that covers it does not list is `none`. A key the table does not have: every cell `zero` or `none` or `partial` by the rules above |
| `concept` | `{id}` | `{"kind": "concept", "id": id, "found": true, "concept": {"kind", "tw", "source"}, "names": [..], "relations": [{"from", "to", "type", "source", "confidence"}]}`. `concept.kind` is one of `none person place event topic story` and `concept.tw` one of `none kt names other` (as text), `concept.source` the res key. `names` is the list of the language map for the id, the title first (`[]` when the map has none). `relations` lists those where the concept is `from` or `to` (`from` and `to` concept ids, `type` text, `source` res key, `confidence` an integer 0 to 100), sorted by `(type, from, to)` by code point, `[]` when none. An id that was moved answers with its new id as `id` and `"alias": old id` (the key is absent otherwise). An unknown id: `{"kind": "concept", "id": id, "found": false}` |
| `usage` | `{concept, source}` | `{"kind": "usage", "concept": c, "source": s, "unit": u, "books": {book: cell}}` for the 66 books. `source` is a res key: `unfoldingWord/en/twl` reads the `xmap` `links` table (unit `links`), `unfoldingWord/en/tn` the `xmap` `notes` table (unit `notes`), a language's `tn` its `map` `usage` (unit `notes`). `xmap` `notes` (English) and `map` `usage` (a language) are never added together, so there is one table per source. A source with a table but no row for the concept: every cell by the rules above. A source that no `coverage` lists: every cell `none` and no `unit` |
| `book` | `{book}` | `{"kind": "book", "book": b, "coverage": {source: "whole" / "partial" / "none"}, "tables": {table: {"unit": u, "keys": n}}}`. `coverage` has one entry for every source any `coverage` of the maps lists (the originals `unfoldingWord/hbo/uhb` and `unfoldingWord/el-x-koine/ugnt`, `unfoldingWord/en/twl`, `unfoldingWord/en/tn`, and the language's own), `none` when the source does not list the book. `tables` has one entry for each table the files have, of `strong`, `links`, `notes` (the `xmap`) and `usage` (the `map`); a table the files lack is absent. `keys` is the number of keys of that table with a row in this book (0 when no source covers the book) |
| `keyterms` | `{book}` | `{"kind": "keyterms", "book": b, "candidates": [{"concept", "strongs": [..], "matched": [..]}]}`. A candidate is a `tw:` concept that has an entry in `strongs` (`xmap`), whose list shares at least one key with the `strong` keys that have a row in the book; `strongs` is the concept's whole list and `matched` the shared one. Candidates sorted by `(-len(matched), concept)`; `strongs` and `matched` sorted by code point. A book with none: `"candidates": []`. The `strongs` of a concept (`answers.py` derives it so): for each link of the English word links to the concept, in any book, the words of its quote (`origWords`, split at spaces) are looked up in the original verse of the link (the first verse of its reference; the verse after the title for `N:front` is verse 0), as a run of consecutive words, the `occurrence`th time the run appears (all runs when `occurrence` is `-1`); text is compared without the word joiner and the `/`; a link whose quote is not found gives no key; every word of the run gives its Strong key |
| `revision` | `{concept, book}` | `{"kind": "revision", "concept": c, "book": b, "revision": n, "verses": [..], "sources": {source: cell}}`: `revision` is the revision of the `map` the usage cells come from (`catalog.md`, "Published against installed": an answer from the map names the revision it describes; the catalog's revision, an integer). `verses` are the sorted verse ids of the book for the concept, without repeats, taken from the parts of the tables of `sources` (`[]` when none). `sources` has one cell for each source whose table can hold the concept: `links` (`unfoldingWord/en/twl`) for a `tw:` concept, `notes` (`unfoldingWord/en/tn`) and the language's `usage` for a `ta:` concept |

No answer has a key whose value is `null`. The rule is about absent values: a value that is absent is an absent key (the
`alias` of an id that did not move, the `count` of a `none` cell), never `null`, `""` or a stand-in. A list that is truly
empty (`relations`, `names`, `candidates`, `verses`, `books`, `strongs`) is a valid answer and is written `[]`; an object
that is truly empty is `{}`. An empty list never stands for "absent".

The answers are computed by `answers.py` from the raw parts, not from the builders (Task 17). The TypeScript query
module (Task 15) must give the same answers (Task 18). `answers.py <sample> <queries dir>` writes `expected` into each
query file there; it computes the kinds `strong`, `usage`, `book` and `keyterms` (the sample has no TIPNR, aliases or
relations, so `concept` and `revision` have no fixed query yet).
