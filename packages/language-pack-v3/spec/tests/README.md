# Conformance cases

Every reader of format 3 MUST give, for each case, the output written here. The TypeScript reader and the Python reader
(`spec/reader-py/`) are written apart, and the two must agree on every case. A case is a folder with its file or files
and `expected.json`.

## Where the bytes come from

- **Container examples** (`container/`) come from `make_examples.py`, a small encoder kept apart from the builder.
  Status: written.
- **The other cases** are built in step 1.7 from the inputs described below. Their bytes are frozen once both readers
  give the expected output. From then on a builder change that alters them fails the tests, until someone decides the
  new bytes are right and freezes them again.

## Reader output

What a reader prints for a file, so that two readers can be compared on the same bytes. The TypeScript reader
(`readerOutput` in `src/read/output.ts`) is the first; the Python reader follows this section together with
`container.md`, `ids.md`, `transfer.md` and `cddl/`, and nothing else.

A reader prints one JSON value. For a file it rejects, that is `{"error": "<code>"}` with the code of `container.md`
(and `transfer.md` for a transfer file). For a file it accepts, it is the object below.

The kind byte (offset 6) says how to read the file: `01` is a segment file and `02` a transfer file. Any other kind is
`E_KIND`, once the magic number and the major version have been checked.

Two readers' outputs are compared as the **canonical text** defined below, never as the `JSON.stringify` of an object: an
engine lists keys that look like array indexes (`"10"`) before the others, whatever order they were added in.

### Rules for every output

- **Only these JSON values:** objects, arrays, strings, booleans and integers. There is no `null`, and no number with a
  fraction or an exponent.
- **Numbers are integers**, written without a decimal point, from −(2^53 − 1) to 2^53 − 1. A position, a count, a verse id
  (`56001001`) and a size are all integers. `-1` is written for a piece of a quote that has no position (see `quote`).
- **Byte strings are lowercase hex**, two digits per byte: a segment's id (64 digits), a hash (64), a book set (18, for
  9 bytes). A byte string inside a value the schema calls `any` (the `trees` of `macula`) is hex too.
- **An absent optional value is an absent key.** Never `null`, never `""` or `[]` standing for "absent". A value the file
  holds as an empty string or an empty list is kept: it is not absent.
- **Text is the text of the file**: no Unicode normalization, no trimming, no escaping beyond what JSON needs.
- **Keys are sorted at every depth by code point** (the order of Unicode scalar values, not of UTF-16 code units: U+FFFF
  comes before U+1D538). Lists keep the order of the file.
- **Resources are named by their key**, never by their index in `h.res`: `res` is `"es-419_gl/es-419/glt"`, not `0`.
- **The tables are decoded.** The output shows what the tables say, not how they say it:
  - the string tables (`strings`, `seps`) are not in the output; wherever a table holds a string number, the output has
    the string, never the number;
  - a `texts` column gives its strings, a `flags` column gives `true` and `false`, a `uints` column gives the number in
    decimal as a **string** (`"12"`: it is a column of values, and values are text), and a `has` column gives absent keys;
  - a column of `deltas` gives the values it adds up to, a `ranges` gives `from` and `to`, and a position is absolute.
- **Equal outputs.** Two outputs are equal when they are equal as JSON values (objects have no order of their own). To
  compare them as text, write both in the *canonical text*: JSON without whitespace, keys sorted as above, non-ASCII
  characters written as they are (UTF-8), and in a string only `"`, `\` and the characters up to U+001F escaped: `\b`,
  `\t`, `\n`, `\f` and `\r` by their short names, the others as `\u00xx` in lowercase hex. That is what
  `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)` writes in Python. The `expected.json`
  files of the cases are the same thing indented by two spaces.

### Always (a segment file)

| Key | Type | What |
| --- | --- | --- |
| `id` | text | The segment's id, lowercase hex |
| `h` | object | The logical header as the file has it (`container.md`): every key of the body's `h`, the ones this reader does not know included. `tables` lists every table of the file, **also the ones the reader skipped** (below). A byte string in it, if one ever appears, is hex |

Then the keys of the class. The rest of this section lists them.

### Tables a reader does not know

A reader skips an optional table it does not know (or whose version it does not know), and everything the schema says
depends on it (`container.md`, "Required and optional tables"). The output simply lacks the keys that table gives. A
required table it does not know is `E_TABLE`.

| A reader that does not know… | gives no… |
| --- | --- |
| `book` / `align` | `align` and `alignMissing` of the texts (the texts are there) |
| `book` / `notes` | `notes`, and the `quote`, `quoteKinds` and `quoteMissing` of its rows (they live in `quotes.notes`) |
| `book` / `links` | `links`, and the same three keys for its rows (`quotes.links`) |
| `book` / `quotes` | `quote`, `quoteKinds` and `quoteMissing` in any row |
| `book` / `questions` | `questions` |
| `orig` / `macula` | `macula` |
| `obs` / one of its five tables of helps | the key of that table |
| `catalog` / `requires`, `complements` | the key of that table |
| any table of any class that is not in the schema | nothing (it is only in `h.tables`) |

**What a phase 1 reader knows.** Every table of `cddl/<class>.cddl`, at version 1, for the classes `book`, `orig`, `art`,
`lex`, `obs` and `catalog`. For `map`, `xmap` and `gen` (read in phase 2) it knows no table at all, so **a segment of
these classes is `E_TABLE`**, even if its tables are all optional, once the checks of `container.md` up to
`E_HMISMATCH` have passed. The same holds for a segment inside a transfer file (below).

The case 9 files are built this way.

### `book`

| Key | Type | From | Absent when |
| --- | --- | --- | --- |
| `texts` | list | `texts` | never (`[]` when the language has notes and no text of this book) |
| `texts[].res` | text | `texts[].res` (the key in `h.res`) | never |
| `texts[].pieces` | list of `[text, is word]` | `tok`: for a number `n`, the piece is `strings[n div 2]` and it is a word when `n` is odd | never |
| `texts[].events` | list of `[position, kind, argument]` | `ev` | never |
| `texts[].attrs` | list of `[event, {name: value}]` | `attrs` | the text has no node with attributes (no `attrs` key, or an empty list) |
| `texts[].align` | list of lists of integers | `align[i].words` | see below |
| `texts[].alignMissing` | list of `[word, verse, original, occurrence]` | `align[i].missing` | the list is empty or absent |
| `notes`, `questions`, `links` | `{"res", "rows"}` | the table of that name | the table is not in the file, or the reader skipped it |

- **`pieces`.** The text is the pieces joined. Example: `[["Pablo", true], [", ", false], ["siervo", true]]`.
- **`events`.** `position` is the number of pieces before the event: the sum of the first number of each event up to it.
  `kind` is `"chapter"`, `"verse"`, `"open"` or `"close"` for the code 0, 1, 2 or 3. `argument` is the string the
  argument number names in `strings` (`"1"`, `"1-2"`, `"para:p"`); for `"close"` it is `""` (the file has the number 0
  there, and any other number is `E_BODY`). Example: `[[0, "chapter", "1"], [0, "open", "para:p"], [0, "verse", "1"],
  [7, "close", ""]]`.
- **`attrs`.** One pair per node that has attributes: the **index of the event** in `events` (from 0) that opens the node,
  and its attributes as an object of text. In the order of the event index. Example: `[[2, {"caller": "+"}]]`. An
  attribute map that is empty in the file is output as it is (`[2, {}]`): a builder never writes one, but a reader
  reproduces what the file has. Only a text with no pair at all (no `attrs` key, or an empty list) has no `attrs`.
- **`align`.** One list per **word** of the text (a piece that is a word, in order; the n-th item is the n-th word, not
  the n-th piece): the original positions it translates, as the numbers they stand for (the file writes them as
  differences). An empty list is a word that is not aligned. Example: `[[3], [], [1, 0]]` is three words: the first
  translates the original word 3, the second translates none, the third translates 1 and 0, in that order. The
  decoding: `words` is a column of `uvarints` that, for each word, has `k` and then `k` numbers; each of those is a
  zigzag difference from **the last position written anywhere in the column** (the first from 0), not from the last
  position of the same word.
  **`align` is there only when some word has a position or `alignMissing` has an entry.** A text whose words all have
  `k = 0` and nothing missing is a text without alignment: it has neither key, even if the file has an `align` entry
  for it.
- **`alignMissing`.** As the file has it: `[word, verse, original, occurrence]` with `word` the n-th word of the text.
- **A table of helps** is `{"res": "<resource key>", "rows": [row, …]}`, the rows in the order of the file.
  Example: `{"res": "es-419_gl/es-419/tn", "rows": [ … ]}`.

A help row (notes, questions and links):

| Key | Type | From | Absent when |
| --- | --- | --- | --- |
| `id` | text | `id`: `ascii4` is 4 ASCII characters per row, else the strings | never |
| `ref` | text | `refText` of the row if the table has one, else the canonical text of the range (`ids.md`, "Reference text") | never |
| `from`, `to` | integers | `ref.from` summed, and `from` plus `ref.span` | never |
| `concept` | text | `concept` | the row has no concept (the column lacks it) |
| `cols` | object | `cols`, below | never (`{}` when no column has the row) |
| `quote` | list of integers | `quotes.notes` or `quotes.links` | the table `quotes` is not in the file or not read, or has no entry for this table. In a table that has quotes, **every** row has it |
| `quoteKinds` | list of `[piece, kind]` | `quotes.*.kinds` | the row has none |
| `quoteMissing` | list of `[piece, verse, word, occurrence]` | `quotes.*.missing` | the row has none |

- **`cols`** has one key per column of the table's `cols` that has a value for the row, by the column's name. A text or
  a string column gives text, a `flags` column gives `true` or `false`, a `uints` column gives text. A column whose `has`
  bit is 0 for the row gives no key. Note the difference between a key whose value is `""` (the file has an empty
  value) and no key (the row lacks the column). A `flags` column lists a bit **per row that has a value**, not per row
  of the table.
- **`quote`** has one number per piece of the row's quote: the original position of the word, from the column `pos`
  (the file keeps the position plus 1, as differences; a reader subtracts 1). **`-1` is a piece without a position**:
  a piece that is not a word (an ellipsis), or a word this original edition does not have. A row with no quote, or
  whose quote was not found, has `"quote": []`. `quoteKinds` says what kind of piece each `-1` that is not a word is,
  and `quoteMissing` names the words that the edition does not have: **every `-1` is in exactly one of the two**. Both
  have `piece`, the index in `quote` (from 0).
- The file lists `quotes.*.kinds` and `.missing` with the row in each entry; the output moves them into their row and
  drops the row number.

A note with a quote that has all three shapes, from `Titus 1:1,3` (a list, so its `ref` comes from `refText`):

```json
{"id": "e5f6", "ref": "1:1,3", "from": 56001001, "to": 56001003,
 "concept": "ta:translate/figs-you",
 "cols": {"note": "z", "quote": "α … β γ", "tags": "k"},
 "quote": [-1, 5, -1],
 "quoteKinds": [[0, "ellipsis"]],
 "quoteMissing": [[2, 56001003, "Ἰησοῦ", 1]]}
```

Piece 0 is the ellipsis, piece 1 is the original word 5, piece 2 is a word the original edition does not have (verse
56001003, the word, its occurrence 1). A plain note: `{"id": "a1b2", "ref": "1:1", "from": 56001001, "to": 56001001,
"concept": "ta:translate/figs-metaphor", "cols": {"isIntro": false, "note": "Hola\nmundo", "quote": "α", "tags": ""},
"quote": [3]}`.

### `orig`

| Key | Type | From | Absent when |
| --- | --- | --- | --- |
| `words` | list of objects | `words`, `cols` | never |
| `words[].form`, `.lemma`, `.strong`, `.morph` | text | the word's number in each table; `""` when the word lacks the attribute | never |
| `words[].other` | object of text | `other`; an empty map in the file is output as it is (`"other": {}`) | the word is not listed in `other` |
| `pieces` | list of `[text, is word]` | `text.tok`: 0 is the next word (its `form`, a word); a number `n > 0` is the string `seps[n - 1]` (not a word) | never |
| `events` | list of `[position, kind, argument]` | `text.ev`, as in a book; the argument of an event is the string `seps[arg]`, with **no** `- 1` (the number 0 is a string of `seps` too, and `"close"` has `""` as in a book) | never |
| `attrs` | list of `[event, {name: value}]` | `text.attrs`, as in a book | no node has attributes |
| `macula` | object | `macula` | the table is not in the file or not read |
| `macula.release` | text | `macula.release` | never |
| `macula.trees`, `.referents` | any | as the file has them, bytes in hex, objects sorted | the file lacks them |

Example: `{"form": "Παῦλος", "lemma": "Παῦλος", "morph": "Gr,N,,,,,NMS,", "strong": "G39720"}`. The word at position `n` is
`words[n]`. There is one word piece per word, in order, so `pieces` lists every word's form once.

### `art`

`articles`: the list of the table, in its order. Each article has the keys of `art.cddl` and only those:

| Key | Type | Absent when |
| --- | --- | --- |
| `id` | text | never |
| `res` | text | never (the resource key) |
| `title` | text | never |
| `subtitle` | text | the file lacks it |
| `related`, `aliases` | list of text | the file lacks them |
| `sections` | list of objects | never |

A section has `sid`, `level` (integer), `role` and `lang` and `md` (text), and, when the file has them, `title` (text) and
`aliases` (list of text). Example: `{"sid": "definition", "level": 2, "role": "definition", "title": "Definición", "lang": "es-419",
"md": "…"}`. The group and the language are in `h` (`group`, `lang`), not repeated.

### `lex`

`entries`: the list of the table, in its order. An entry has `res` (the resource key), `strong`, `lemma` (text) and `senses`
(list) always; and, when the file has them, `brief`, `long`, `source`, `review` (text), `pos`, `notes` (lists of text) and
`aramaic` (`true` or `false`: a key that is there, whatever its value). A sense has, when the file has them, `code`,
`definition`, `domain`, `domainCode`, `comments`, `etymology`, `lang`, `definitionLang` (text), `glosses` (list of text) and
`refs` (list of `[from, to]`, verse ids). `{}` is a valid sense.

### `obs`

| Key | Type | Absent when |
| --- | --- | --- |
| `stories` | list | never |
| `notes`, `questions`, `links`, `study-notes`, `study-questions` | `{"res", "rows"}` | the table is not in the file or not read |

- A **story** has `res` (the resource key), `n`, `title` (text) and `frames` (list) always, and `reference` (text) and
  `refs` (list of `[from, to]`) when the file has them. A **frame** has `n`, `text`, and `image` when the file has it.
- A **help row** of OBS has `id`, `frame`, `frameId`, `concept` and `cols`; `cols` and `concept` are as in a book.
  **`frame`** is text (`"10:3"`): the row's `refText` if the table has one for it, else the canonical text of the number
  below, `"N:F"` for story `N` and frame `F`, and `"N:intro"` for frame 0. **`frameId`** is the integer the file keeps,
  story × 100 + frame (`1003`). The row has no `ref`, `from` or `to`.

  ```json
  {"id": "ab12", "frame": "10:3", "frameId": 1003, "concept": "ta:translate/figs-metaphor", "cols": {"isIntro": false, "note": "A figure."}}
  {"id": "cd34", "frame": "10:03", "frameId": 1003, "cols": {"note": "padded"}}
  ```

  The second row has the text `10:03` in `refText`: it is kept as `frame`, and `frameId` still says where it is.

### `catalog`

The keys are those of `catalog.cddl`, with every byte string in hex and these differences:

| Key | Type | Absent when |
| --- | --- | --- |
| `about` | object | never. `format`, `catalog`, `publisher`, `origin`, `revision`, `built`, `builder`, and when the file has them `previous` (hex), `name`, `direction` |
| `resources` | list of objects | never. `key`, `title`, `subject`, `release`, `license`, `books` (hex of the 9 bytes: **18 digits**), and `rights`, `attribution` when the file has them |
| `segments` | list of objects | never. `id` (hex), `class`, `size`, `ulen`, `inputs` (hex), and `book`, `part`, `group` when the file has them |
| `units` | list of objects | never. `id`, `segments` (list of integers, indexes in `segments`), and `needs` (list of text) when the file has it |
| `requires` | list of `[catalog, revision, id]` | the table is not in the file or not read; `id` is hex |
| `complements` | list of objects | the table is not in the file or not read. `kind`, `id` (hex), `size`, `media`, `version`, and `lang`, `for`, `license` when the file has them |

`sig` (the signatures in the file header, `catalog.md`) is not in the output until a reader checks them (phase 3).
Example of a book set: Titus is book 56, so `"books": "000000000000800000"`. Example of a segment:
`{"book": "tit", "class": "book", "id": "12e4…", "inputs": "4144…", "size": 37713, "ulen": 70123}`.

### A transfer file (kind `02`, `transfer.md`)

The output has three keys and no `id` or `h`:

| Key | Type | What |
| --- | --- | --- |
| `index` | object | The index as the file has it (`cddl/transfer.cddl`): `mode`, `catalogs` (list of hex ids), `entries` (list of `{id, kind, offset, size}` and `class` when the entry has it; `id` in hex), and when the file has them `base` (list of `[catalog, revision]`), `made`, `by`, and every other top-level key of the index as it is: those are not checked, and a byte string in one is hex. A key of an index **entry** that `transfer.cddl` does not list is not output (the entry is closed: only `id`, `kind`, `class`, `offset`, `size`) |
| `entries` | list of objects | One per entry of the index, in its order: `id` (hex), `kind`, `class` (when the index entry has it) and `status` |
| `catalogs` | list of objects | The reader output of each catalog entry, as for a segment file, in the order of the index's `catalogs` |

`status` is:

- `"ok"` when the whole entry is in the file and it verifies like a downloaded file. A segment gets the same checks as a
  downloaded one (`container.md`, "Order of checks"), with the entry's `id` as the id the catalog gives and the known
  tables of the class named in the segment's own header (not the `class` of the index entry); `E_KIND` for another kind
  than 01. That includes step 5 as far as `E_TABLE`: a segment of a class the reader knows no tables of (`map`, `xmap`,
  `gen` in phase 1) is `E_TABLE` even when all its tables are optional. The shape of the tables against their schema (the
  `E_BODY` checks of step 5) is the one check that is not part of the status: the app makes it when it opens the segment.
  A complement is `ok` when the sha256 of its bytes is its `id`.
- `"missing"` when the file ends before the entry's end (`offset + size`, from the end of the index).
- Otherwise the code the entry fails with: `E_ID`, `E_INFLATE`, `E_TABLE`, …

A catalog entry that fails is not a status: it makes the whole output `{"error": code}`, because the catalog says what
the file is. The same goes for a catalog whose tables do not match `catalog.cddl` (`E_BODY`); this is checked after
every entry has been checked, so a failing entry later in the file comes first.

The order of the checks of a transfer file is in `transfer.md`, "Order of checks". A file cut inside its index or before
the end of any catalog is `{"error": "E_TRUNCATED"}`. Activating units is the app's job and is not part of the output: it
also depends on what the device already has.

Example, for a file cut inside its last entry:

```json
{"index": {"mode": "full", "catalogs": ["9ee2…"], "entries": [{"class": "catalog", "id": "9ee2…", "kind": "segment", "offset": 0, "size": 1065}, {"class": "orig", "id": "595b…", "kind": "segment", "offset": 1065, "size": 9906}], "made": "2026-11-01T10:00:00Z", "by": "test 1"},
 "entries": [{"class": "catalog", "id": "9ee2…", "kind": "segment", "status": "ok"}, {"class": "orig", "id": "595b…", "kind": "segment", "status": "missing"}],
 "catalogs": [{"id": "9ee2…", "h": {…}, "about": {…}, "resources": […], "segments": […], "units": […]}]}
```

### `map`, `xmap` (phase 2)

Phase 1 readers do not decode these classes (`E_TABLE`, above). Phase 2 will give:

- each counts table as `{"unit", "rows": {key: {book: [count, distinct verses]}}}`;
- in a part, each verse list as `{key: [verse ids]}`;
- `coverage` as `{source: {"whole": [books], "partial": [books]}}`.

### Checks of the tables (`E_BODY`)

After the checks of `container.md` have passed (including `E_TABLE`), a reader decodes the tables of the class. A table that
is not what its schema says is `E_BODY`, and nothing of the file is used. The schema is `cddl/*.cddl`; a map may have
keys the schema does not list (a later minor version adds them): they are ignored and are not in the output. Beyond the
types, these are `E_BODY` too:

- **Columns.** A `uvarints` column that is cut short, longer than 8 bytes for a number, not minimal (trailing `80` bytes)
  or above 2^53 − 1. An `ev` column whose length is not a multiple of 3. A `bits` column that is not `ceil(n / 8)` bytes
  or has an unused bit set. A `texts` column whose
  lengths do not add up to the bytes of `utf8`, or that is not valid UTF-8. A column whose number of values is not the
  number of rows that have one. A `deltas` column that leaves 0 … 2^53 − 1 where a position, a quote piece or a verse id is expected.
  A column with none, or more than one, of `strings`, `texts`, `flags` and `uints`.
- **Numbers into tables.** A string number outside `strings` (or `seps`); a resource index outside `h.res`; an event whose
  position is beyond the pieces of its text; an event code that is not 0 to 3; `attrs` that name an event that does not
  exist, or one twice; a text piece of `tok` that is not in the table.
- **`book`.** `align` with a number of entries other than `texts`; a `words` column that does not give exactly `k` and its
  numbers for each word of the text, or has numbers left over; a position that is negative; an `alignMissing` entry whose
  word is outside the text; `ascii4` ids that are not 4 bytes per row or have a byte above 127, or `id.strings` with a
  count other than `n`; `ref.from` or `ref.span` with a count other than `n`; a `concept` column that is `flags` (a
  concept is text); a `refText` row outside
  the table or twice; a row with no `refText` whose range has no canonical text in the book (`ids.md`); `quotes` where
  `n` has not one number per row, or `pos` has not as many numbers as `n` adds up to, or a position below 0; a `kinds` or
  `missing` entry that names a piece that does not exist, has a position, or is listed twice (in either list).
- **`orig`.** `words.cols` columns of different lengths; a number outside a word table; word pieces in `text.tok` that
  are not as many as the words; `macula.release` that is not text.
- **`obs`.** A story number outside 1 to 50 or twice; a story with no frame; a frame outside 0 to 99 or twice in a story; a
  table of helps with an empty id, an id twice, `id.strings` with a count other than `n`, a `concept` column that is
  `flags`, or a `frame` column of another length than `n`.
- **`art`.** An article with an empty `id`; an article with no section; a role that is not in the list of `art.cddl`; an empty `sid`; a `sid` twice in an
  article; an `id` twice in the group.
- **`lex`.** A Strong number that is not `G` or `H` and a number, or of another group than the header's; a `refs` pair that
  runs backwards.
- **`catalog`.** `format` other than `3.0`; an `origin` other than `published` and `local`; an id of another length than 32
  bytes; a `books` of another length than 9; a unit that names a segment outside `segments`, or has none; a segment, a unit
  or a resource listed twice; a header `lang` that differs from `about.catalog` (the common catalog has none).
- **Every class.** The header must have the keys its class needs (`lang`, `book`, `orig`, `res` for `book`; `book`, `orig`
  for `orig`; `lang`, `group`, `res` for `art`; `lang`, `group` of the form `[GH]` and digits, `res` for `lex`; `lang`, `res` for
  `obs`), and `res` is not empty where it is needed.

The order of the checks between a defect in the container and one in a table is in `container.md`, "Order of checks".

## Cases

| # | Folder | What it checks | Input | Expected |
| --- | --- | --- | --- | --- |
| 1 | `container/minimal` | The container and the smallest valid book | Titus 1:1, "Pablo, siervo de Dios": one text, no helps | `minimal.expected.json` |
| 2 | `container/truncated` | A file cut short | `minimal.seg` without its last 10 bytes | `E_TRUNCATED` |
| 3 | `container/bad-id` | A wrong id | `minimal.seg` with its id changed | `E_ID` |
| 4 | `tito-es419` | A real book, whole | The es-419 Titus of the format 2.0 parts on staging (GLT, GST, tN, tQ, tWL) | GLT: 1 913 pieces, 953 words, all aligned, 69 events. GST: 3 471 pieces, 1 732 words, all aligned, 69 events. 216 notes (212 with quote text, 203 of them with positions found in the original), 36 questions, 223 links (223 with quote text, all with positions). Both readers give the same output |
| 5 | `nota-varios-versiculos` | A range | Titus 1:1-4 in one text; one note on `1:2-4` pointing to `ta:translate/figs-metaphor` | The note: `ref` "1:2-4", `from` 56001002, `to` 56001004. In the language map: 1 note, 3 distinct verses |
| 6 | `strong-repetido` | Counting occurrences against verses | An original verse where one Strong key appears three times | In the common map: 3 occurrences, 1 distinct verse |
| 7 | `seccion-insertada` | Section ids that last | An article built twice with the registry in between. The first time it has an intro, a definition and translation suggestions. The second time it has an examples section before the suggestions, and its definition heading is corrected | First build: `intro`, `definition`, `translation-suggestions`. Second build: `intro`, `definition`, `examples`, `translation-suggestions`, with the first three unchanged |
| 8 | `articulo-mal-titulado` | Articles that do not follow the pattern | An es-419 article with text before any heading, a heading no rule places, and a section whose heading is in English | `intro` with role `intro`; `s1` with role `unknown`; the English section with `lang` "en". Every section readable |
| 9 | `tabla-desconocida` | Tables a reader does not know | Case 1 with an extra optional table `future-x`, and again with an extra required table `future-y` | The first gives case 1's output, except for `h.tables` (which lists `future-x` too) and `id` (the body has another table); the second gives `E_TABLE` |
| 10 | `transferencia-cortada` | A transfer file cut inside an entry | A `full` transfer file of cases 1 and 4 and their catalog, cut in the middle of case 4's segment | The catalog and case 1 have status `ok`; case 4 has status `missing` |
| 11 | `revisiones-mixtas` | Published against installed | Catalog and language map of revision 4, where Ruth has 15 notes on metaphor; Ruth's book segment of revision 3, where it had 14 | From the map: 15, "revision 4". From the installed book: 14 |
| 12 | `idioma-parcial` | Zero against no source | An es-419 map whose tN covers tit, rut, 3jn and jon | Use of `ta:translate/figs-metaphor` in Titus: the count. In Jonah with no such note: zero. In Isaiah: no source |
| 13 | `paquete-viejo` | The bridge from an old pack | `es-419-tit.langpack.zip`, format 1.1, with the originals from case 4 | The same book segment as case 4, with the same id; a local catalog (`origin` "local", unsigned) |

Cases 6, 11 and 12, and the map half of case 5, need the maps, so they are built in phase 2.

Phase 2 also adds the fixed queries of the common map, with the answers phase 0 measured:
- G5485;
- `tw:names/abraham`;
- the notes on metaphor by book;
- Isaiah;
- the key terms of Ruth.
