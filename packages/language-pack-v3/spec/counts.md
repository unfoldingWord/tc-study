# Counts

The maps answer "where does this appear, and how much" without the books. Every count says what it counts, and an
answer says whether a missing count means "none" or "nobody looked".

## Units

| Table | Unit | One is… |
| --- | --- | --- |
| `xmap` `strong` | occurrences | a word of the original whose Strong key (`ids.md`) is the key |
| `xmap` `links` | links | an English word link (tWL row) whose concept is the key |
| `xmap` `notes` | notes | an English note (tN row) whose SupportReference is the key |
| `map` `usage` | notes | a note of this language whose SupportReference is the key |

Each table also gives **distinct verses**: how many different verse ids its rows cover in that book. Counts and
verses are different numbers on purpose:

- a Strong three times in one verse is 3 occurrences and 1 verse;
- a note on 1:2-4 is 1 note and 3 verses;
- two notes on the same verse are 2 notes and 1 verse.

## What a row covers

- A row covers every verse of its range: every verse id the original has between the first and the last, both
  included. A range across chapters is expanded with the original's list of verses, so the builder needs the original.
- An introduction (`front:intro`, `2:intro`) covers its own id, verse 0 (`ids.md`).
- A row whose reference the builder cannot read covers no verse. It still counts, and the builder's report lists it.

## A note counts notes, not figures of speech

`notes` counts notes that point to an article, not the figures of speech in the text.

- A note can explain two metaphors, and two notes can explain the same one.
- No note on a verse does not mean the verse has no metaphor.

The words an app shows say this: "notas que remiten a Metáfora", not "metáforas".

## Sources are not added together

English notes (`xmap` `notes`) and a language's own notes (`map` `usage`) are different observations of different
texts. A reader shows them apart, each with its source, and never adds them.

## Zero, no source, partial

For a key and a book, a reader answers one of four states. Coverage (`coverage` in each map) says which:

| State | When | An app says |
| --- | --- | --- |
| A count | The source covers the book and has rows for the key | "12 notas en 9 versículos" |
| Zero | The source covers the book whole and has no row for the key | "ninguna" |
| No source | The source does not cover the book | "sin fuente": English tN does not cover Isaiah |
| Partial | The source covers only part of the book | the count, as "al menos" |

Today, English tN and tWL cover 59 books. Numbers, 1 and 2 Chronicles, Ecclesiastes, Isaiah, Jeremiah and Ezekiel
are "no source" in them. A map built on the device from an old pack covers what that pack had, as partial.

## Which revision an answer describes

A map describes what its catalog revision published, not what the device has installed (`catalog.md`). An answer
says which revision it describes. When the question is about installed content ("the notes I have of Ruth"), a reader
counts the installed book segment, not the map.
