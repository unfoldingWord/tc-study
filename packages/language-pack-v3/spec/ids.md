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
| `per:` | A person | `per:abraham` | The id: TIPNR's unique name. The name shown: the language's `topics` names, else the English title in `xtopics` |
| `lug:` | A place | `lug:jerusalem` | As `per:` |
| `ev:` | An event | `ev:plagues-of-egypt` | The id: Theographic's title or the builder's list. The name shown: the language's outline, else the English title in `xtopics` |
| `tema:` | A topic (kind 4) | `tema:faith` | The builder's list; the language's name is in its `map` `names` (`map.cddl`). Part B builds no `tema:` id yet: the list is empty |
| `sec:` | A section of a book, from its outline | `sec:exo/7-12` | Chapters it spans |
| `obs:` | An OBS story or frame | `obs:10`, `obs:10:3` | Its number |
| `{lang}:tema/` | A topic only one language has, from its own outlines | `es-419:tema/la-gracia-que-educa` | That language's builder |

- **Ids of people and places** (`per:`, `lug:`): the slug of TIPNR's unified name before `@`: lowercase, spaces and `'` to `-`, any other character outside `[a-z0-9-]` dropped. People and places with the same name (there are several Zechariahs) get different ids by this rule: when two TIPNR records of one kind give the same slug, every one of them takes `-{book}-{chapter}-{verse}` of the first reference after `@` (`per:zechariah-2ki-14-29`). The book is the format-3 book code of the TIPNR book: TIPNR writes the USFM code with a capital (`2Ki`, `Jhn`, `Mrk`, `Sng`), and that text in lowercase is the code of the list above for every book TIPNR uses. Chapter and verse are the numbers of the reference as TIPNR writes it (English versification, not converted: the suffix is part of the id and must not change with a conversion), digits only: a verse letter (`a`, `b`) or an occurrence letter is dropped (`Psa.3.0` gives `psa-3-0`). Records of one slug that still give the same suffix take `-2`, `-3` after it, in the order of the TIPNR file. The TIPNR `uStrong` is kept beside the id (`xtopics` `topics.ustrong`), so an id can be derived again.
- **Ids of events** (`ev:`): the slug of the Theographic title by the same rule, with `-2`, `-3` after it on a clash, in the order of the `eventID`; the `eventID` is kept beside the id as the topic's `ref`, and the title as its `title` (the English name shown when a language has none; for an event of the builder's list, that list's title). An event Theographic lacks comes from a short list the builder owns (source `builder`, confidence 100); it starts with `ev:plagues-of-egypt`, Exodus 7:14-12:36.
- **Sections and stories.** `sec:{book}/{range}` comes from the outline of the English tN introduction (`sec:exo/7-12`); `obs:{n}` from English OBS v9, with the verse ranges of the story's closing line. The outline is the list under the first heading of the introduction (`front:intro`) whose text contains `Outline` or `Esquema` (English and Spanish, any case), up to the next heading of the same or a higher level. A source in format 2.0 has no `front:intro`: its introduction is the first note marked `isIntro` that has such a heading. Each item is a title and a verse range (`3:1-24`, `1:1-2:3`); of a label after the range, only the form `(3:1-24) - label` (a parenthesized range, a dash, then letters) is stripped from the title. A heading in another language is not recognised: that introduction gives no sections and no names, no local topics, and the build report says `no Outline section`; so does an item the builder cannot read as a range. An entry of a language's outline whose range equals that of an English `sec:` gives that section a name in the language; one that equals none becomes `{lang}:tema/{slug}`.
- **Relation types of `xtopics`** (the `type` of a relation; the end that is `from` is named first):
  - `parent-of` (parent to child), `sibling-of` and `partner-of` (symmetric), `founder-of` (founder to the place or tribe) and `inhabitant-of` (inhabitant to the place), from TIPNR;
  - `tribe`: from the person to the tribe (or people) TIPNR names for them;
  - `part-of` (an event to the larger event) and `follows` (an event to its predecessor), from Theographic;
  - `participant`: from the event to a person, and `place`: from the event to a place, both from Theographic's participants and places, only when the name and at least one verse of the event match exactly one TIPNR record of that kind (confidence 80); a match that is not exactly one goes to the review list, and no relation is made;
  - `occurs-in`: from a story (`obs:`) or a section (`sec:`) to an event, when any verse of the event is also a verse of one of the story's or section's ranges (confidence 60). The test is overlap of any size, not containment: an event that begins in a story and ends outside it is listed, and a story can occur in several events (the Plagues of Egypt overlap OBS stories 10, 11, 12 and 48);
  - `same-as`: from a `tw:names/` concept to the one person or place whose Strong keys it shares and whose verses overlap (confidence 70); a match that is not exactly one goes to the review list.
  A TIPNR relation whose other end is a unique name shared by several records goes to the person's record when there is one, and is not reported as a review case.
- **A TIPNR dStrong as a Strong key** (`topics.strongs`). TIPNR writes the Strong number of a name with STEPBible's capital disambiguation letter: `H2148P`, `G2197H`. The builder writes it as the key of the original (see "Strong keys"): Hebrew `H` and four digits, keeping a lowercase suffix when TIPNR has one (`H2148P` gives `H2148`, `H7462b` stays); Greek `G`, the number in four digits and a final `0`, which makes the five digits the UGNT writes (`G2197H` gives `G21970`; a disambiguation letter is dropped). Two comparisons use the keys. To take a name from the alignment, a word of the original matches when it has the same letter and number, and the same suffix when the key has one (`H2148` matches `H2148` and `H2148a`; `H2148a` only `H2148a`); for Greek only the first four digits of the number are compared, because the UGNT may end a number in a digit other than `0` (`G21970` and `G21971` both match a TIPNR `G2197`). To join a `tw:names/` concept to a person or place (`same-as`), only the letter and the four digits of the number are compared (`H2148a`, `H2148` and `G21970` against `G2197`). A text of another form is not a Strong key and goes to the build report.
- **`ev:` concepts get no name from the alignment.** An event is named by its title (English, from Theographic) and by the language's outline; no name is taken for it from the aligned text.
- **Concepts are never merged.** Two ids for the same thing are joined by a `same-as` relation: in the common map for concepts of part A, and in `xtopics` `relations` when one end is a topic (an end that is a concept of the map is named there by its id, so the map never depends on the topics),
  with its source and confidence.
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
