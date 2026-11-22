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
| `per:` | A person | `per:abraham` | The id: TIPNR's unique name. The name shown: "Names of people" below |
| `lug:` | A place | `lug:jerusalem` | As `per:` |
| `ev:` | An event | `ev:plagues-of-egypt` | The id: Theographic's title or the builder's list. The name shown: the language's outline, else the English title in `xtopics` |
| `tema:` | A topic (kind 4) | `tema:faith` | The builder's list; the language's name is in its `map` `names` (`map.cddl`). Part B builds no `tema:` id yet: the list is empty |
| `sec:` | A section of a book, from its outline | `sec:exo/7-12` | Chapters it spans |
| `obs:` | An OBS story or frame | `obs:10`, `obs:10:3` | Its number |
| `{lang}:tema/{book}/{slug}` | A topic only one language has, from its own outlines | `es-419:tema/tit/la-gracia-que-educa` | That language's builder |

- **Ids of people and places** (`per:`, `lug:`): the slug of TIPNR's unified name before `@`: lowercase, spaces and `'` to `-`, any other character outside `[a-z0-9-]` dropped. People and places with the same name (there are several Zechariahs) get different ids by this rule: when two TIPNR records of one kind give the same slug, every one of them takes `-{book}-{chapter}-{verse}` of the first reference after `@` (`per:zechariah-2ki-14-29`). The book is the format-3 book code of the TIPNR book: TIPNR writes the USFM code with a capital (`2Ki`, `Jhn`, `Mrk`, `Sng`), and that text in lowercase is the code of the list above for every book TIPNR uses. Chapter and verse are the numbers of the reference as TIPNR writes it (English versification, not converted: the suffix is part of the id and must not change with a conversion), digits only: a verse letter (`a`, `b`) or an occurrence letter is dropped (`Psa.3.0` gives `psa-3-0`). Records of one slug that still give the same suffix take `-2`, `-3` after it, in the order of the TIPNR file. The TIPNR `uStrong` is kept beside the id (`xtopics` `topics.ustrong`), so an id can be derived again.
- **Ids of events** (`ev:`): the slug of the Theographic title by the same rule, with `-2`, `-3` after it on a clash, in the order of the `eventID`; the `eventID` is kept beside the id as the topic's `ref`, and the title as its `title` (the English name shown when a language has none; for an event of the builder's list, that list's title). An event Theographic lacks comes from a short list the builder owns (source `builder`, confidence 100); it starts with `ev:plagues-of-egypt`, Exodus 7:14-12:36.
- **Sections and stories.** `sec:{book}/{range}` comes from the outline of the English tN introduction (`sec:exo/7-12`); `obs:{n}` from English OBS v9, with the verse ranges of the story's closing line. The outline is the list under the first heading of the introduction (`front:intro`) whose text contains `Outline` or `Esquema` (English and Spanish, any case), up to the next heading of the same or a higher level. The introduction is the first note, in the order of the source, whose reference is `front:intro` or that is marked `isIntro` and has such a heading (a source in format 2.0 has no `front:intro` and uses the second form). Each item is a title and a verse range (`3:1-24`, `1:1-2:3`); of a label after the range, only the form `(3:1-24) - label` (a parenthesized range, a dash, then letters) is stripped from the title. A heading in another language is not recognised: that introduction gives no sections and no names, no local topics, and the build report says `no Outline section`; so does an item the builder cannot read as a range. An entry of a language's outline whose range equals that of an English `sec:` gives that section a name in the language; one that equals none becomes `{lang}:tema/{book}/{slug}`, where `{book}` is the book of the outline and `{slug}` the title in lower case without accents, runs of other characters made `-`; a title that leaves no slug gives the first verse of the range as `{slug}` (`tema/tit/56001005`, the book not repeated). The id never depends on which other books are built. Two entries of one book whose titles give the same slug and whose ranges differ get `-2`, `-3` after the slug, in the order of the outline; two with the same range are one topic with both names.
- **The section map (`chunks`).** The unit `xtopics` of the common catalog has an optional table `chunks` (version 1) in its core: for each book, the sections of the English ULT (`unfoldingWord/en/ult`) as `[first verse id, last verse id]` pairs, in order. A section starts at the first verse at or after a `\ts\*` milestone of the ULT (the first one at the first verse of the book) and ends at the verse before the next; verse 0 and introductions are in none. A book whose ULT has no `\ts\*` has no entry (nothing is invented), and so has a book the ULT does not have. They are not the `sec:` topics, which come from the tN outlines and are much coarser. A client reads `chunks` from the `xtopics` core; the ULT is a resource of the core's `res` with its release. A reader that does not know the table skips it.
- **The verses of each OBS frame (`obs-frames`).** The unit `xtopics` of the common catalog has an optional table `obs-frames` (version 1) in its core: for each frame of Open Bible Stories, the verse ranges it tells, from Bible Story Builder (`bcv-commons/bible-story-builder`, MIT, `fuentes.md`). The key is the frame's reference text, `N:F` with no leading zeros (`10:3`), the same as the piece id of a frame without its resource key (`es-419_gl/es-419/obs/10:3`), and the same in every language, because the translations keep the frames of English OBS. Each range is within one chapter (the builder splits a range of the source that crosses chapters, with the chapter lengths of the originals), so a client counts a frame's verses without a table of chapter lengths. The verses are in the original's numbering (the source uses the English one, which is the UHB's: no conversion). The story ranges stay in `ranges` (`obs:10`): `obs-frames` is finer and comes from another source, so the two can disagree; the builder reports a frame whose verses are outside its story's ranges. A frame that tells no verse (a frame of the source with an empty `[[ref:]]`) has no key. A client builds the other direction, verse to frames, from this table; the pack does not carry it. A reader that does not know the table skips it, so older readers read the core as before.
- **Relation types of `xtopics`** (the `type` of a relation; the end that is `from` is named first):
  - `parent-of` (parent to child), `sibling-of` and `partner-of` (symmetric), `founder-of` (founder to the place or tribe) and `inhabitant-of` (inhabitant to the place), from TIPNR;
  - `tribe`: from the person to the tribe (or people) TIPNR names for them;
  - `part-of` (an event to the larger event) and `follows` (an event to its predecessor), from Theographic;
  - `participant`: from the event to a person, and `place`: from the event to a place, both from Theographic's participants and places, only when the name and at least one verse of the event match exactly one TIPNR record of that kind (confidence 80); a match that is not exactly one goes to the review list, and no relation is made;
  - `occurs-in`: from a story (`obs:`) or a section (`sec:`) to an event, when any verse of the event is also a verse of one of the story's or section's ranges (confidence 60). The test is overlap of any size, not containment: an event that begins in a story and ends outside it is listed, and a story can occur in several events (the Plagues of Egypt overlap OBS stories 10, 11, 12 and 48);
  - `same-as`: from a `tw:names/` concept to the one person or place whose Strong keys it shares and whose verses overlap (confidence 70); a match that is not exactly one goes to the review list. A concept this rule joins to no one may get a `same-as` from ACAI instead (source ACAI, confidence 75; "People of ACAI" below), and then it may be joined to several people (the article "Abijah" is about several Abijahs), and to a person **and** a place ("Israel"; "Builder rules of the maps").
  - `born-in` and `died-in`: from a person to a place, from Theographic's `birthPlace` and `deathPlace` (confidence 80), by the rules of "Builder rules of the maps"; a client shows them as «according to Theographic»;
  - `place` also covers the events whose place TIPNR names differently, by the distance rule and the list of names of "Builder rules of the maps";
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

## People of ACAI

ACAI (`BibleAquifer/ACAI`, `fuentes.md`) adds to the people of TIPNR what TIPNR lacks: the gender, the names in other
languages, other names (aliases) and the uW Translation Words article of a person. It never makes, changes or merges an id,
and none of its relations is used (the family relations come from TIPNR alone).

- **What is read.** Of each file of `people/json/` (an object, or a list whose first item is the object) whose `id` starts
  `person:`: `id`, `primary_id` (missing or empty: the `id`), `gender`, `alternate_sources.tipnr` (texts),
  `alternate_sources.aquifer` (texts `number|title|resource`: only those of exactly three pieces whose resource is
  `UWTranslationWords`, and of them the title), and `localizations.<code>.preferred_label` for the six codes below. Texts are
  trimmed and made NFC. `src/source/acai.ts` `trimAcai` writes exactly this, sorted by `id`, as `acai/people.json`; that file
  is what the builder reads, and its sha256 is pinned (`fuentes.md`). Not read: descriptions, word lists, references (ORG
  versification), roles, tribes, places and relations.
- **Join.** A record whose `primary_id` is its own id is joined to the `per:` topic whose `ref` is one of its TIPNR names, when
  they give exactly one topic (were two `per:` topics to share a `ref`, the last by id is the one joined, and the build reports
  it); none is not joined, several goes to the review list. Two records joined to one topic: the
  first by ACAI id (code point) is used, the second and its alias records go to the review list. A record whose `primary_id`
  is another record is an **alias record**: it belongs to the topic its primary record is joined to, and is not joined by its
  own TIPNR names. An alias record whose primary is not joined, or is itself an alias record, is left out and reported.
- **Gender** (`xtopics` `gender`): ACAI's `male` is 1, `female` 2; anything else, or a person ACAI does not join, is 0. A core
  where every value would be 0 has no table.
- **`same-as` of ACAI.** ACAI names a uW Translation Words article by its English title (`26734|Isaac|UWTranslationWords`;
  the number is Aquifer's, not an id of tW). The titles compared are those of the tW of the map language of the common build
  (`mapLang`, English: the rows `helps-text:tw-title:`), whose key and release are then inputs of the core; a build without a
  map language makes no `same-as` of ACAI and says so in its report. The title is folded (combining marks dropped after NFD,
  lowercase, only letters and digits kept) and compared with the folded slug of every `tw:names/` concept and with its
  folded English title and each comma-separated piece of it (`Jacob, Israel`). When exactly one concept matches, and the TIPNR
  rule above joined that concept to no one, the builder adds `same-as` from the concept to the person (source ACAI,
  confidence 75). A concept the TIPNR rule joined keeps only that: ACAI fills what is missing. Two ACAI people may each get
  the same concept this way. No match, several, and a concept joined by TIPNR to someone else go to the review list. A pair is
  never added twice.

### Names of people

The name a client shows for a person `P` in language `L` is, in this order:

1. `people.names[P]` of the `topics` core of `L`;
2. else the first name in the `map` `names` of `L` of the `tw:names/` concept joined to `P` by a `same-as` of the `xtopics`
   core (the first such concept by code point that has a name in `L`);
3. else the English title of `P` (`xtopics` `topics.title`).

The names of `L`'s `topics` `names` (taken from the alignment, often noisy: "he", "his son") are not part of this rule. A client
may still find a person by its first one.

The builder of `L` writes, for a person ACAI joins and names in `L` (the language's ACAI code: `en` eng, `es-419` spa, `fr`
fra, `id` ind, `hi` hin, `ar` arb; any other language has no table):
- **The label.** ACAI's preferred label is split into a name and a note: when it ends with `(`, a text with no parenthesis,
  `)` (white space around them ignored, Unicode white space included), and something that is not white space comes before the `(`, the name is what comes before and
  the note what is inside, each trimmed (`Jacob (padre de José)` is `Jacob` and `padre de José`); otherwise the whole label,
  trimmed, is the name and there is no note (`A (b) c`, `(x)`). An empty name gives nothing; an empty note is no note.
- **`names`**: the name, only when it is not, byte for byte, what steps 2 and 3 give. Both sides are NFC: ACAI's after
  trimming (above), the `map` names as `map.cddl` stores them; the English title is compared as `xtopics` stores it.
- **`aliases`**: the name of each alias record of `P` in `L` (its note dropped: `P` has its own), to `P`; only when it is not
  `P`'s name in `L` (the rule above, with `names`), its English title, or the first `map` name in `L` of a `tw:names/` concept
  joined to `P`. Two alias records with the same name are one key with all their people.
  - **Not an alias that mostly means someone else.** Let `Q` be, of the other people the name finds in `L` without the
    aliases (their name in `L`, their English title, the first `map` name of a `tw:names/` concept joined to them), the one in
    the most verses (the `xtopics` counts; ties: the first by id). The alias is left out when TIPNR calls `P` by it in at most
    a tenth of `Q`'s verses while `P` is in more than a tenth of them. "TIPNR calls `P` by it" counts the distinct verses of
    `P`'s TIPNR name lines whose name (the part before `|` of the line's key; a line may list several spellings, separated by
    commas) is the English name of the alias record, or whose dStrong has the Strong number of one of `Q`'s Strong keys (letter
    and four digits, as for `same-as`). Example: ACAI makes «David» an alias of Judah from a textual variant TIPNR lists in one
    verse (2 Chronicles 25:28), while David is in 964 verses and Judah in 1022: a client's ten-times rule on all their verses
    could not choose, so «David» is not stored for Judah. «Simon» for Peter (45 verses) and «Jehoram» for Joram (filed under
    Joram's line of H3088) stay. The build report lists what is left out.
    The rule does not apply (the alias stays) when the alias record has no English name, when `P` has no TIPNR record, or
    when `Q` is in no verse; a build without TIPNR records (none given, or an empty list) or without counts weighs no alias
    and says so. The names compared are those of `L`, so the result can differ between languages: in English «Saul» for
    Paul is left out (King Saul is in 327 verses, TIPNR calls Paul «Saul» in 22), while in Spanish «Saulo» finds no one else
    and stays. `notes` are decided after this, so an alias left out no longer makes a note.
- **`notes`**: the note of `P`'s label in `L`, only when `P`'s name in `L` is a name another person can also be found by in
  `L`: that person's name in `L`, an alias in `L`, the first `map` name in `L` of a `tw:names/` concept joined to it, or its
  English title; compared byte for byte. There the note tells the two apart.
- A table with nothing in its three maps is not written. No table means: every name comes from steps 2 and 3, no person has a
  note or an alias.

**Built against one common.** What `people` leaves out is what steps 2 and 3 give with the `xtopics` core the language was
built against, the common its catalog requires (`requires`, `catalog.md`); `notes` also depends on the people of that core. A
client that reads the table with another common (one installed before or after) is not wrong in kind, only less exact: a person
may show its tW title or English title instead of ACAI's name, two people may be told apart by no note, and an id the common
lacks is ignored. It is never an error. A client that keeps the common its language requires, as `install` does, sees the names
the builder meant.

A client that compares names folds them its own way; the pack does not fold.

### Verses of a family relation

The relations `parent-of`, `sibling-of` and `partner-of` of `xtopics` carry no verse. A client finds the verses that show one
from what the pack already has, the verses of each person in the `xtopics` parts (`occurrences` of the parts; the core has
only counts), with this rule (normative: every client gives the same verses):

1. Let `A` and `B` be the verse ids of the two people in the parts installed (all books). If they share verses, the first three
   shared ones in canonical order (verse id order), each as the pair `[v, v]`.
2. Else, of all pairs `a` of `A` and `b` of `B` in the same chapter with `|a - b| <= 3`, the one with the smallest `|a - b|`;
   on a tie, the one with the smallest `min(a, b)`, then the smallest `max(a, b)`. It is given as `[min(a, b), max(a, b)]`.
3. Else none.

The rule is symmetric: which end is `from` does not matter. A relation never joins a person to itself (the builder drops one).
A part that is not installed gives no verses of its book, and a client with the core alone gives none. The verses are not stored
in the pack because they can be derived (`language-pack-client` `kinVerses`); `tests/parentescos/versiculos.json` holds the
vectors every implementation must give.

## Builder rules of the maps

The tables `geo` and `routes` of the `xtopics` core, the relations `born-in` and `died-in`, the `places` table of a language's `topics` core and the complement `basemap` are built by the rules below (normative for the builder; a reader checks only the format, `xtopics.cddl`, `topics.cddl`, `catalog.md`). Sources: OpenBible.info Bible Geocoding Data (`data/ancient.jsonl`), TIPNR's own link, the ACAI places, Theographic and Natural Earth (`fuentes.md`). The version-1 tables are optional: a core without them is a core of an older build.

### Builder rules: geo

The table has one value per topic of `topics.ids` in four columns; a topic that is not a place has 0 in all four. For each place (kind place):

1. **Joining OpenBible.info.** Each `id` of the `linked_data` of a record of `ancient.jsonl` that contains `@` is a TIPNR unique name (any depth, under the keys `id` and `ids`). It is compared with the `ref` of the place with what follows the first `-` after the `@` taken away (`Bethel@Gen.12.8-Zec` is `Bethel@Gen.12.8`; in `Abel-meholah@Jdg.7.22` the `-` is before the `@` and nothing goes). A record that names no place that way is tried again by the name before the `@`, and joins only when exactly one place has that name. **A record that names more than one place is not joined** and goes to the report (`Bethel 1`, which lists `Bethel@Gen.12.8` and `Bethel@Jos.12.16`).
2. **One record per place.** Among the joined records that have at least one identification with a `lonlat` (the first resolution of the identification), the one whose `friendly_id` is the name before the `@` of the place's `ref` when exactly one is; else the one with the highest score (step 3); ties: the first of the file.
3. **The point.** Of the identifications of the chosen record that have a `lonlat`, the one with the highest `score.time_total` (ties: the first). The point is `lonlat` (longitude, latitude) in degrees, written as degrees x 100 as `Math.round` of the float64 product (half toward positive infinity) with a negative zero written as 0 (0.01 degrees, about 1 km); TIPNR's point is written the same way. Without OpenBible, the point of TIPNR's own link (the Google Maps link of the place record, `@lat,lon`); the point 0, 14 (TIPNR's «unknown») and no point at all give `sure` 0 and `lat` = `lon` = 0.
4. **Certainty (`sure`).** With OpenBible, let *s* be the score of the identification chosen and *n* the number of `identifications` of the record (all of them, with a point or not): 3 when *s* is 900 or more and *n* is 1; 2 when *s* is 500 or more (also *s* of 900 or more with *n* above 1); 1 below 500. With the point of TIPNR: 1. Without a point: 0.
5. **Form (`form`).** From the first of the ACAI types of the place (`place_types.acai`, the place joined by `joinAcaiPlaces`, "Builder rules: places names"), else the first type of OpenBible's record, through this table: **1** town, city, village, settlement, campsite, gate, well, structure, seaport, fortification, field, tree, road, wall, garden, hall, porch, tower, rock, altar, room, mine, ford, stone heap, canal, cliff, promontory, district in settlement, special, other; **2** region, nation, province, district, wilderness, territory, valley, plain, peninsula, island, natural area, people group, geographical feature, forest; **3** river, sea, lake, spring, body of water, pool, wadi; **4** mountain, hill, mountain range, mountain ridge, mountain pass. A type not in the table is form 1 and goes to the report; no type is form 1. A point of TIPNR in whole degrees (both numbers are integers: «22, 77» for India) is form 2. **Port:** when the form is 1 and **any** of the ACAI types of the place is `seaport`, the form is 5. OpenBible's types never make a 5.

The form says how a place is drawn (a point with its name, or only the name for an area), which places a passage lists (forms 1, 5, 3 and 4, not the areas) and when a distance is given (forms 1, 5 and 4).

### Builder rules: routes

`routes` has the routes of the builder's list, `src/build/topics/routes.json`: `[{ "event": "ev:…", "stops": ["lug:…", …] }]`, in the order they are shown, which the table keeps. The builder fails (it does not guess) when an `event` is not an event of the topics, a stop is not a place, a stop is the same as the one before it, or a route has fewer than two stops. A stop with no point is valid. An event may have more than one route (alternatives, such as the Exodus); a client shows them in the order of the table. The verse of a stop is not stored; a client derives it (`language-pack-client` `route`): let `E` be the verses of the event (its `xtopics` parts), sorted, and the "cursor" the first of them. For each stop in travel order, the verse is the smallest verse of the place that is in `E` and is **at or after the cursor**; the cursor then becomes that verse. A stop the event names nowhere at or after the cursor has no verse, and the cursor stays. So a place at the end of a journey (Jerusalem, or Antioch in 14:26) does not take the verse of the start, and two stops in one verse share it. The list is made by hand and checked once against a Bible atlas; the stops are the places the text names on the journey, not a reconstruction of the road.

### Builder rules: births and deaths, events and places

- **`born-in` and `died-in`** (from the person to the place; Theographic's `birthPlace` and `deathPlace`; confidence 80): made only when the name and at least one verse of the person match exactly one TIPNR person, and those of the place exactly one TIPNR place (the rules of `participant` and `place`, with the distance rule below). What does not match goes to the review list. Theographic's errors are on a list of exclusions of the builder, `src/build/topics/born-died-exclude.json` (`{ kind, person, place }` in Theographic's names; Joseph «born in Egypt» is on it). A client shows them as «according to Theographic» and never as proof: the verses of a birth are the verses where person and place both appear (`kinVerses`), which is not always the verse that says the birth.
- **Events and places.** For the `place` relation (and for births and deaths) when the name and a verse do not give exactly one place: if several TIPNR places have the name, the one whose point is less than 15 km from Theographic's own point of the place (OpenBible's, else Recogito's) when exactly one is; if no TIPNR place has the name, the place the builder's list `src/build/topics/place-names.json` gives for that name (Theographic's name to a `lug:` id: `Mount Sinai` is `lug:sinai`, `Melita` is `lug:malta`; made by hand, an id that is not a place is ignored).
- **`same-as` between a `tw:names/` article and a person or a place.** The two rules (TIPNR's, then ACAI's) are independent for people and for places, and give these cases (the article is `A`):

  | TIPNR joined `A` to | ACAI names `A` for | Result |
  |---|---|---|
  | a person | no person, no place | `A` same-as that person (TIPNR, 70) |
  | a person | a place | `A` same-as the person (TIPNR, 70) **and** `A` same-as the place (ACAI, 75) |
  | a person | another person | TIPNR's person only (reported) |
  | a place | a person | `A` same-as the place only (the rule for people leaves an article TIPNR joined to anything; reported) |
  | a place | another place | TIPNR's place only (reported) |
  | nobody | a person, a place, or both | `A` same-as each one ACAI names (ACAI, 75) |
  | nobody | ACAI names `A` for several persons (or several places) | `A` same-as **each** of them, none dropped (the article «Abijah» is about several Abijahs); the relations are made in the order of the ids |

  An article joined to both a person and a place is about both (the article «Israel»): **the tW title of `A` is the name of both** in the rule of names, as its first `map` name for each. A client that shows a name for the article shows both ends.

### Builder rules: places names

The `places` table of the `topics` core of a language has the shape and the rules of `people` ("Names of people"), with `lug:` ids in place of `per:` ids: the name shown for a place is `places.names[P]`, else the first name in the `map` `names` of the language of the `tw:names/` concept joined to `P` by a `same-as`, else the English title; the label is split into name and note as for people; `names` stores a name only when the rule without the table would not give it; `notes` only for a name another place (or the same name written differently) can be found by; `aliases` from the alias records of ACAI; a table with nothing in its three maps is not written. **Aliases of places, in order.** An alias record's name is left out when it is the place's own name in `L`, its English title, or the first `map` name of a `tw:names/` article joined to it (the place has it already); then the rule below applies to what is left. **The rule «not an alias that mostly means someone else», for places** (the same rule as for people, normative here). Let `P` be a place with an ACAI alias record whose name in language `L` is `N` (the label split into name and note, its note dropped). Let `Q` be, of the **other places** that `N` finds in `L` without the aliases (a place's name in `L` by "Names of people" step 1 to 3 applied to places, its English title, the first `map` name of a `tw:names/` article joined to it by a `same-as`), the one in the most verses (the `xtopics` counts; ties: the first by id). People are never `Q`: only places are compared with places. The alias is left out when TIPNR calls `P` by `N` in at most a tenth of `Q`'s verses while `P` is in more than a tenth of them. «TIPNR calls `P` by `N`» counts the distinct verses of the name lines of `P`'s TIPNR place record whose name (the text before `|` of the line's key; a line may list several spellings, separated by commas, each compared with underscores read as spaces) is the English name of the alias record, or whose dStrong has the Strong number (letter and four digits) of one of `Q`'s Strong keys (`topics.strongs`). The rule does not apply (the alias stays) when the alias record has no English name, `P` has no TIPNR record, or `Q` is in no verse; a build with no TIPNR records or no counts weighs no alias and says so. What is left out is in the build report. `notes` are decided after this.

**ACAI places joined to TIPNR.** A place record of ACAI (not an alias record) names TIPNR unique names, each `Other name|Unique@Ref-Range` or `Unique@Ref-Range`; the text after the last `|` is the unique name. **Step 1:** the `lug:` places whose `ref` is one of them exactly. **Step 2,** only for a record step 1 gives nothing for (ACAI names an older version of the record: `Jerusalem@Jos.10.1-Rev`): the place whose name before `@` is the name before `@` of one of them, when it is the only place with that name. A record whose names give more than one place is not joined and goes to the report. If two places have the same `ref`, the later by id (code point order) is the one ACAI's names join, and the earlier is reported (`review: acai … have the same TIPNR name`). An alias record gets the place of its primary. ACAI never makes or changes an id. With the pinned commit: 1 418 records, 1 215 primary, **961** joined (60 of them by step 2).

### Builder rules: basemap

The complement `basemap` (`catalog.md`, "The basemap complement") is cut from three Natural Earth 10m shapefiles (`fuentes.md`): `ne_10m_land` (every ring that touches the rectangle), `ne_10m_lakes` (the shapes whose `name` is `Dead Sea`, `Sea of Galilee`, `Lake Van` or `Lake Urmia`) and `ne_10m_rivers_lake_centerlines` (the shapes whose `name` is `Jordan`, `Nile`, `Rosetta Branch`, `Damietta Branch`, `Euphrates`, `Firat`, `Al Furat`, `Tigris`, `Dicle`, `Shatt al-Arab`, `Murat`, `Atshan` (the Orontes), `Kızılırmak` or `Tevere`). The rectangle is 8 to 52 degrees east and 22 to 43 north (`bbox` 800, 2200, 5200, 4300). Degrees are written x 100 as `Math.round` of the float64 product (half toward positive infinity), a negative zero as 0. A ring is cut with Sutherland-Hodgman, a line with Liang-Barsky (a line that leaves and returns is several paths); the paths are simplified with Douglas-Peucker at 0.015 degrees (a ring is split at its first point and the one farthest from it, so it never collapses) and rounded to 0.01 degrees, consecutive repeats dropped; a land ring of less than 0.05 square degrees (about 600 square kilometres: the islets of the Aegean) is dropped, a lake never is; a closed path that is left with fewer than 3 points or an open one with fewer than 2 is dropped. Order: land, lakes, rivers, each in the order of the shapefile. The builder never repeats the first point of a closed path at its end; a reader tolerates one (`catalog.md`). The land rings (holes included, such as the Caspian Sea) are painted with the even-odd rule. The names of the rivers and lakes are the builder's and are not stored. **Size** (the pinned sources): 15 land rings, 7 lake paths and 30 river paths, 4 051 points, 5.8 KB compressed. (The figure of a build is the one in its report; the renderer's prototype, which kept every sliver, measured about 7.4 KB with 235 paths.) The `id` of the complement is the sha256 of the file bytes as downloaded, that is of the compressed bytes (`catalog.md`), so it depends on the compressor: pako 2.1.0 at level 9 is part of the build. A catalog lists one `basemap`. Readers skip a path whose layer is above 3 (a later version's layer: not drawn, not an error); this builder writes only layers 1 to 3. One level only; the overview is made on the phone by simplifying, and the smoothing (Chaikin) is done by `drawMap`, not stored.

## Strong keys

The maps count Strong numbers by a key made from what the original publishes:

- Hebrew: the part after the last `:` (`b:H4999` → `H4999`), with its letter suffix (`H7462b`).
- Greek: as the UGNT writes it, five digits (`G54850`).

A reader looking up `G5485` also tries `G54850`.

The `macula` table of `orig` (v2, `cddl/orig.cddl`) uses both ideas: every word it names, a leaf of a tree or the word that
refers, is a position of this book (the section above), not a verse and a place in the verse; and the Strong of the
entities of its referents is a Strong key made as above. To fix an antecedent, `orig.cddl` compares the number of two
Strongs (letter and digits, as that file says), not the whole key.

## Sections of articles

A section id (`sid`) names a section within its article (`es-419_gl/es-419/tw/kt/grace#definition`). It is assigned
once and kept between builds, even when the heading is corrected, translated or moved.

- **The registry.** The builder keeps a registry per language and resource in the pipeline's output (not in the
  pack): for each article, its sections with their sid, heading, level, role and a fingerprint of their text. It also
  holds each section's aliases and its word trigrams (a sorted list of the first 32 bits of the sha256 of each
  distinct word trigram), so that the third rule can be checked without the old text. An entry whose role did not come
  from the heading table has `roleFrom`: `inherited` (from its parent section) or `hint` (from the map language's article);
  the field is absent for a table role, so a registry written before it reads as table roles.
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
- **An unplaced subheading takes a role from where it sits.** A heading no table places, when it sits under a section
  (the nearest earlier one with a lower level) whose role is known (not `unknown` or `intro`), takes that role. A
  translated article takes the roles of its `unknown` sections from the article with the same id in the map language
  when both have the same number of headed sections with the same sequence of levels (a role the table knows is kept);
  inheritance then runs for what is left. The role is stored apart from the sid, and an inherited or hinted role does not
  move sids: pass 2 above (same role, same place) counts only the roles the heading table gave, in the old entries (those without `roleFrom`) as in the new sections.

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
