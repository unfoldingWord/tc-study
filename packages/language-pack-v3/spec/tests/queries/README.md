# Fixed queries

A fixed query is a file `<name>.json`:

```json
{"query": {"kind": "strong", "key": "G54850"}, "expected": {...}}
```

`expected` is the answer, written as JSON in the same canonical text as reader output (`../README.md`, "Reader output":
integers, no `null`, keys sorted by code point). An answer that names a state uses one of these names: `count`, `zero`,
`none`, `partial`.

| Kind | Query | Asks |
| --- | --- | --- |
| `strong` | `{key}` | Where a Strong key appears: the books and the counts |
| `concept` | `{id}` | What the maps say of a concept: its kind, category, names, relations and counts |
| `usage` | `{concept, source}` | How a source uses a concept, per book (`source` is a res key: English notes and a language's notes are never added together) |
| `book` | `{book}` | What the maps say of a book: its coverage and its counts |
| `keyterms` | `{book}` | The key-term candidates of a book, found with `strongs` |
| `revision` | `{concept, book}` | The verses behind a concept in a book, and the revision the answer describes |

States, for the kinds that count: `count` (the source covers the book and has rows), `zero` (it covers the book and has
none), `none` (the source does not cover the book), `partial` (it covers the book only in part, so the count may be low).

The answers are computed by `answers.py` from the raw parts, not from the builders (Task 17). The TypeScript query
module (Task 15) must give the same answers (Task 18).
