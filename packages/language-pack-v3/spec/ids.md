# Ids

Everything has a name that does not change between builds or between languages. That is what lets the map of one
language talk about the book of another, and a citation still resolve after an update.

Ids are lowercase ASCII: letters, digits and `- . _ / : # ~` (`~` marks a repeated row id: `a1b2~2`).

## Books

A book is its USFM code in lowercase (`tit`). Its number is its place in this canonical order, from 1:

```
 1 gen   2 exo   3 lev   4 num   5 deu   6 jos   7 jdg   8 rut   9 1sa  10 2sa  11 1ki  12 2ki  13 1ch  14 2ch
15 ezr  16 neh  17 est  18 job  19 psa  20 pro  21 ecc  22 sng  23 isa  24 jer  25 lam  26 ezk  27 dan  28 hos
29 jol  30 amo  31 oba  32 jon  33 mic  34 nam  35 hab  36 zep  37 hag  38 zec  39 mal  40 mat  41 mrk  42 luk
43 jhn  44 act  45 rom  46 1co  47 2co  48 gal  49 eph  50 php  51 col  52 1th  53 2th  54 1ti  55 2ti  56 tit
57 phm  58 heb  59 jas  60 1pe  61 2pe  62 1jn  63 2jn  64 3jn  65 jud  66 rev
```

Numbers 67 to 99 are reserved for other books (deuterocanonical, front and back matter). Format 3.0 does not use them.

## Verses

A verse is the integer `LLCCCVVV`: book number, chapter, verse. Tito 2:11 is `56002011`.

- **Introductions.** Verse 0 is a chapter's introduction (`56002000`); chapter 0 is the book's (`56000000`). A note
  whose reference is `front:intro` points to `56000000`, and `2:intro` points to `56002000`. The notes and links of
  Psalms publish the title of a psalm as `3:front`: a builder reads it as `3:intro` (the title is the words of the original
  before `\v 1`, verse 0) and keeps the published text in `refText`.
- **Verses as published.** A verse published as `1-2` takes the id of its first number; the text keeps its label
  `1-2`.
- **Ranges.** A range is two ids, both included; a list (`1:1,3`) is several ranges.
- **Numbering.** Ids in a book segment follow that text's numbering, and quotes and alignment follow the original's.
  The equivalences between them go in the language map (`numbering`, defined in phase 2).

### Reference text

The canonical text of the range of verse ids `from` to `to` in a book (`from` ≤ `to`, both in that book) is:

| Range | Text | Example |
| --- | --- | --- |
| The book's introduction (chapter 0, verse 0) | `front:intro` | `front:intro` |
| A chapter's introduction (verse 0) | `C:intro` | `2:intro` |
| One verse | `C:V` | `2:11` |
| Verses of one chapter | `C:V1-V2` | `1:2-4` |
| Verses across chapters | `C1:V1-C2:V2` | `1:12-2:3` |

Numbers have no leading zeros and the text has no spaces. A range has no canonical text when its ends are not both in the
book, when `from` is after `to`, when an introduction (chapter 0 or verse 0) is at either end (`from` or `to`) of a range
of several verses, or when it is a verse of chapter 0 other than `front:intro`. A range cannot have an introduction
inside it, because the ids between `from` and `to` are not verses. A row whose reference text is not the canonical text of its
range (a list `1:1,3`, `1:1b`, `10:03`) keeps its text as published (`refText` in the schemas). A reader that needs the
text of a row that has no `refText` and finds no canonical text for its range rejects the segment (`E_BODY`).

## Positions in the original

A word of the original is its position in the book: its index, from 0, among all the `\w` of that book of the UHB or
the UGNT, in document order. Words inside footnotes count, and a ketiv or qere word is a word. In prose it is written
`tit:412`.

- **The stamp.** A position means something only with the original book it was counted in. Every segment that writes
  positions names that book in its header (`orig`: resource key and stamp). The stamp is the book file's blob
  (`g` + its git blob hex), as format 2.0 writes it, or the release tag when no blob was recorded.
- **A stamp the device does not have.** A reader with an original book of another stamp MUST NOT use those positions.
  It shows the text and the notes without alignment or quotes, and the app offers the matching original. A change in
  one book of the original moves the positions of that book only.

## Resources and pieces

A resource is its Door43 key, `owner/language/abbreviation`: `es-419_gl/es-419/tn`. Two owners can publish the same
resource in the same language (es-419 has a second tW from `es-419_obt`), so the owner is part of the key.

A **piece** is anything that can be cited. Its id starts with its resource key:

| Piece | Id | Example |
| --- | --- | --- |
| A note, question or word link | key / book / row id | `es-419_gl/es-419/tn/tit/a1b2` |
| A verse of a text | key / book / chapter:verse | `es-419_gl/es-419/glt/tit/2:11` |
| A section of an article | key / article path # section id | `es-419_gl/es-419/tw/kt/grace#definition` |
| An OBS frame | key / story:frame | `es-419_gl/es-419/obs/10:3` |

A row id is the ID column of the TSV.

- Row ids are unique within a book; in Tito 216 of 216 are.
- If one repeats, the builder keeps the first as it is and adds `~2`, `~3`… to the next ones, in the order of the
  file, and says so in its report.
- If a translator regenerates the ids, old citations stop resolving; the builder's report says how many.

## Concepts

A concept is something the resources talk about, the same in every language. Its id is a namespace and a name. The
name a person sees comes from each language's map.

| Namespace | What | Example | Where the name comes from |
| --- | --- | --- | --- |
| `tw:` | A word article | `tw:kt/grace`, `tw:names/abraham`, `tw:other/shepherd` | The tW path without `bible/` |
| `ta:` | An Academy article | `ta:translate/figs-metaphor` | The tA manual and slug |
| `per:` | A person | `per:abraham` | TIPNR's unique name (phase 2) |
| `lug:` | A place | `lug:jerusalem` | TIPNR's unique name (phase 2) |
| `ev:` | An event | `ev:plagues-of-egypt` | Theographic or the builder's list (phase 2) |
| `tema:` | A topic | `tema:faith` | The builder's list (phase 2) |
| `sec:` | A section of a book, from its outline | `sec:exo/7-12` | Chapters it spans |
| `obs:` | An OBS story or frame | `obs:10`, `obs:10:3` | Its number |
| `{lang}:tema/` | A topic only one language has, from its own outlines | `es-419:tema/la-gracia-que-educa` | That language's builder |

- **Concepts are never merged.** Two ids for the same thing are joined by a `same-as` relation in the common map,
  with its source and confidence.
- **People and places with the same name** (there are several Zechariahs) take TIPNR's id, which tells them apart.
- **An article that moved** (`other/` to `kt/`) keeps its old id as an alias in the common map: the old id still
  leads to it.
- **Ids are lowercase.** An article whose published name has capitals (`figs-orderHeb`) gets the lowercase id
  (`ta:translate/figs-orderheb`), and a link to it (`[[rc://*/ta/man/translate/figs-orderHeb]]`) is rewritten with the
  lowercase id (`[[ta:translate/figs-orderheb]]`).

## Strong keys

The maps count Strong numbers by a key made from what the original publishes:

- Hebrew: the part after the last `:` (`b:H4999` → `H4999`), with its letter suffix (`H7462b`).
- Greek: as the UGNT writes it, five digits (`G54850`).

A reader looking up `G5485` also tries `G54850`.

## Sections of articles

A section id (`sid`) names a section within its article (`es-419_gl/es-419/tw/kt/grace#definition`). It is assigned
once and kept between builds, even when the heading is corrected, translated or moved.

- **The registry.** The builder keeps a registry per language and resource in the pipeline's output (not in the
  pack): for each article, its sections with their sid, heading, level, role and a fingerprint of their text. It also
  holds each section's aliases and its word trigrams (a sorted list of the first 32 bits of the sha256 of each
  distinct word trigram), so that the third rule can be checked without the old text.
- **A new section** takes its role as sid if the article does not use it yet (`definition`), else the role and a
  number (`examples-2`). A section whose role is unknown takes `s` and the next free number (`s3`). The text before the
  first heading is `intro`.
- **An existing section** is recognized, in this order:
  1. by the same heading;
  2. by the same role and the same place among the sections of that role;
  3. by its text: at least half of its word trigrams in common.

  When none applies, it is new.
- **Splits and merges.** A section that splits keeps its sid in the first part. A merged section keeps the sid of the
  first, and takes the other as an alias.
- **Equal headings.** When two sections of one article would get the same sid, the later one (in the order of the
  article) gets `-2`, the next `-3`, unless the registry already gave it a sid.
- **A bridged article** starts with an empty registry: its section ids are those of a first build, local to the device,
  and a later published catalog replaces them. A map never names a section, so the maps do not depend on them.
- **The role is apart from the sid.** Correcting a role does not change the sid.
- A heading the builder cannot place gets the role `unknown`, and the builder's report lists it. The section stays
  readable and citable.

## Links inside text

Notes, questions and articles link with `rc://` addresses. The builder rewrites them as ids, so that they resolve
without a network and across segments:

| Today | In format 3 |
| --- | --- |
| `[[rc://*/ta/man/translate/figs-metaphor]]` | `[[ta:translate/figs-metaphor]]` |
| `[[rc://*/tw/dict/bible/kt/grace]]` | `[[tw:kt/grace]]` |
| `[text](rc://*/tn/help/tit/02/03)` | `[text](ref:tit 2:3)` |
| `[text](../02/03.md)` in a note of Tito | `[text](ref:tit 2:3)` |

The `*` of an address can also be a language tag (`rc://es-419/ta/man/…`), and the builder rewrites both the same way.

A link in any other form is kept as it is.

## Groups

- **Articles** travel by group: `tw:kt`, `tw:names` and `tw:other` (tW by category), and `ta:translate`,
  `ta:checking`, `ta:process` and `ta:intro` (tA by manual).
- **Lexicon entries** travel by the thousands of their Strong number: `G5` holds G5000 to G5999.
