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

Every answer has `"kind"` (the query's kind) and, for the kinds that count, `"unit"` (the table's unit).

| Kind | Query | Answer |
| --- | --- | --- |
| `strong` | `{key}` | `{"kind": "strong", "key": k, "unit": "occurrences", "books": {book: cell}}`: one cell for each of the 66 books, for the `xmap` source(s) `coverage` lists; `key` is the key as asked, resolved by the lookup rule (`G5485` also tries `G54850`), written as found. A key the table does not have: every cell `zero` or `none` or `partial` by the rules above |
| `concept` | `{id}` | `{"kind": "concept", "id": id, "found": true, "concept": {"kind", "tw", "source"}, "names": [..], "relations": [{"from", "to", "type", "source", "confidence"}]}`. `relations` lists those where the concept is `from` or `to`, sorted by `(type, from, to)` by code point. An id that was moved answers with its new id as `id` and `"alias": old id`. An unknown id: `{"kind": "concept", "id": id, "found": false}` |
| `usage` | `{concept, source}` | `{"kind": "usage", "concept": c, "source": s, "unit": u, "books": {book: cell}}` for the 66 books. `source` is a res key; `xmap` `notes` (English) and `map` `usage` (a language) are never added together, so there is one table per source. A source with no table for the concept: every cell by the rules above |
| `book` | `{book}` | `{"kind": "book", "book": b, "coverage": {source: "whole" / "partial" / "none"}, "tables": {"strong": {"unit", "keys": n}, "links": ..., "notes": ...}}`: `keys` is the number of keys with a row in this book; a table the file lacks is absent |
| `keyterms` | `{book}` | `{"kind": "keyterms", "book": b, "candidates": [{"concept", "strongs": [..], "matched": [..]}]}`. A candidate is a `tw:` concept whose `strongs` list shares at least one key with the `strong` keys that have a row in the book; `matched` is that shared list. Candidates sorted by `(-len(matched), concept)`; `strongs` and `matched` sorted by code point. A book with none: `"candidates": []` |
| `revision` | `{concept, book}` | `{"kind": "revision", "concept": c, "book": b, "verses": [..], "sources": {source: cell}}`: `verses` the sorted verse ids from the parts of the book for the concept (empty when none); the cells are those of `links` (English) and `usage` where the sources have them. The revision number belongs to the catalog, not to a fixed answer, so it is not in `expected` |

An answer has no key that is `null` or empty standing for "absent".

The answers are computed by `answers.py` from the raw parts, not from the builders (Task 17). The TypeScript query
module (Task 15) must give the same answers (Task 18).
