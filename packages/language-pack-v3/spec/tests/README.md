# Conformance cases

Every reader of format 3 MUST give, for each case, the output written here. The TypeScript reader and the Python reader
(`spec/reader-py/`) are written apart, and the two must agree on every case. A case is a folder with its `.seg` or
`.tcpack` files and, beside each file, a `<name>.expected.json` with the output a reader gives for it (`minimal.seg`
and `minimal.expected.json`).

## Where the bytes come from

- **Container examples** (`container/`) come from `make_examples.py`, a small encoder kept apart from the builder.
  Status: written.
- **The other cases** are built by `build-cases.ts` from the inputs described below: the sample of `data/` (its
  README says where each file comes from) and, for cases 9 and 10, `container/minimal.seg`. The build has no clock:
  every date, device name and registry in it is fixed in the script, so the same builders give the same bytes. Their
  bytes are frozen once both readers give the expected output. From then on a builder change that alters them fails the
  tests, until someone decides the new bytes are right and freezes them again (`--refreeze`, below).

**License.** The sample data under `data/`, the `.expected.json` outputs of the cases (they hold the text of unfoldingWord resources) and
`src/build/lex.uhl-rows.fixture.json` carry CC BY-SA 4.0 text, like `data/` (see its README): whoever reuses them credits unfoldingWord and keeps
the license. The package's own license does not cover them.

## Building and comparing

From `packages/language-pack-v3`:

```
bun spec/tests/build-cases.ts [--refreeze] [--check]
bun spec/tests/compare.ts [--python <path>] [--built] [--reader <path>]
```

- **`build-cases.ts`** builds the files of every case but those of `container/`, and writes each one with its
  `<name>.expected.json`: what the TypeScript reader (`readerOutput`) says of it, in the form of "Reader output" below.
  It **refuses to overwrite a frozen case**: if a file exists and the bytes now built differ, or an `.expected.json`
  exists and the output now read differs, it prints which one and exits 1, and writes nothing for it. `--refreeze`
  writes the new bytes and outputs; use it when somebody has decided that they are right, and say why in the commit.
  `--check` writes nothing and also reports a file that is missing. Running it twice changes nothing.
- **`compare.ts`** runs both readers on every `.seg` and `.tcpack` under `spec/tests/` (not `data/`): `readerOutput`
  and `spec/reader-py/lp3read.py`. It compares the parsed values by their canonical text, and the exit code of the
  Python reader with whether the TypeScript output is an error object. It prints one line per file that disagrees (the
  file, the first JSON path that differs, both values cut to 80 characters) and exits 0 when all agree, 1 when one does
  not, and 2 when the interpreter is missing or older than Python 3.11. The interpreter is `--python`, else the
  environment variable `LP3_PYTHON`, else `python`. `--reader` is the Python script to run, `spec/reader-py/lp3read.py` unless given
  (the tests use it to show that a difference is found). With `--built` it also builds the big segments of the sample in
  memory (the Titus original, the `tw:kt` art group, the lexicon group `G0`, the language catalog and the common
  catalog, the es-419 map core and part, the xmap of Titus from the English fixture, an OBS segment from a synthetic story, and a `full` transfer file of them, whole and cut in the middle of
  its last entry), writes them under the temporary folder of the system and compares them the same way. Those are not
  frozen and have no expected file.
- **`src/conformance.test.ts`** checks that `readerOutput` gives each `.expected.json`, that `build-cases.ts` finds the
  frozen bytes when it builds again, the numbers of the table below, and that `compare.ts` finds no difference (this
  last one needs Python 3.11 or later: it runs with `LP3_PYTHON`, or with `python` if that is new enough, and is skipped
  with a message otherwise).

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
  `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)` writes in Python. Outputs are compared
  as the canonical text of the **parsed** value: a reader parses the `expected.json` of a case and writes both in the
  canonical text, so the whitespace of the file does not matter. The `expected.json` files are the same thing indented by
  two spaces, except an error object, which is written on **one line**: `{"error": "<code>"}`. Their line ends are LF
  (`spec/.gitattributes` keeps them so in a checkout that converts text files).

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
`lex`, `obs` and `catalog`. For `map`, `xmap` and `gen` it knows no table at all (a phase 2 reader knows those of `map` and `xmap`: see
"`map`, `xmap`" below), so **a segment of
these classes is `E_TABLE`** for a phase 1 reader, even if its tables are all optional, once the checks of `container.md` up to
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
| `attrs` | list of `[event, {name: value}]` | `text.attrs`, as in a book | no node has attributes (an empty map counts as a node with attributes, as in a book) |
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
| `index` | object | The index as the file has it (`cddl/transfer.cddl`): `mode`, `catalogs` (list of hex ids), `entries` (list of `{id, kind, offset, size}` and `class` when the entry has it; `id` in hex), and when the file has them `base` (list of `[catalog, revision]`), `made`, `by`, and every other top-level key of the index as it is: those are not checked, and a byte string in one is hex. A key inside an index **entry** that `transfer.cddl` does not list is ignored and not output: an entry has only `id`, `kind`, `class`, `offset` and `size` in the output |
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
every entry has been checked, so a failing catalog entry later in the file comes first.

The order of the checks of a transfer file is in `transfer.md`, "Order of checks". A file cut inside its index or before
the end of any catalog is `{"error": "E_TRUNCATED"}`. Activating units is the app's job and is not part of the output: it
also depends on what the device already has.

Example, for a file cut inside its last entry:

```json
{"index": {"mode": "full", "catalogs": ["9ee2…"], "entries": [{"class": "catalog", "id": "9ee2…", "kind": "segment", "offset": 0, "size": 1065}, {"class": "orig", "id": "595b…", "kind": "segment", "offset": 1065, "size": 9906}], "made": "2026-11-01T10:00:00Z", "by": "test 1"},
 "entries": [{"class": "catalog", "id": "9ee2…", "kind": "segment", "status": "ok"}, {"class": "orig", "id": "595b…", "kind": "segment", "status": "missing"}],
 "catalogs": [{"id": "9ee2…", "h": {…}, "about": {…}, "resources": […], "segments": […], "units": […]}]}
```

### `map`, `xmap`

`coverage` (both cores) is `{source: {"whole": [books], "partial": [books]}}`: books as codes in canonical order
(`ids.md`); `partial` is absent when the file has none. The source is the resource key.

What decides coverage, in the `xmap`: the `notes` table is covered by `unfoldingWord/en/tn`, `links` by
`unfoldingWord/en/twl`, and `strong` by the keys of the originals (`unfoldingWord/hbo/uhb`, `unfoldingWord/el-x-koine/ugnt`).
In the `map`, the coverage of `usage` is decided by the language's `tn` entry alone.

A **counts table** (`strong`, `links`, `notes` of `xmap`; `usage` of `map`) is `{"unit": text, "rows": {key: {book:
[count, verses]}}}`: `count` is the number of occurrences, links or notes, and `verses` the number of distinct verses.
The book is its code. Example: `{"unit": "notes", "rows": {"ta:translate/figs-metaphor": {"tit": [1, 3]}}}`.

**`xmap` core** (`part` is `"core"`):

| Key | Type | Absent when |
| --- | --- | --- |
| `coverage` | as above | never |
| `strong` | counts table | never |
| `concepts` | `{id: {"kind": k, "tw": t, "source": res key}}` | never. `k` is one of `none person place event topic story` (0 to 5), `t` one of `none kt names other` (0 to 3) |
| `links`, `notes` | counts tables | the table is not in the file |
| `relations` | list of `{"from", "to", "type", "source", "confidence"}`: `from`, `to` the concept ids, `type` the type's text, `source` the res key (text), `confidence` an integer 0 to 100 | the table is not in the file |
| `aliases` | `{id: id}` as the file has it | the table is not in the file |
| `strongs` | `{concept id: [Strong keys]}` as the file has it | the table is not in the file |
| `topics` | as the file has it (`any`; bytes in hex) | the table is not in the file or not read |

**`xmap` part** (`part` is a book code): `strong`, `links`, `notes` as `{key: [verse ids]}`, each verse id the full
`LLCCCVVV` (the book number times 1 000 000 plus the verse offset, which is the running sum of the stored values within that key), in the order of the file. `links` and `notes` are
absent when the file lacks them.

**`map` core**:

| Key | Type | Absent when |
| --- | --- | --- |
| `books` | list of 66 `[name, short, abbreviation, source]`, in canonical order | never |
| `names` | `{id: [names]}` as the file has it | never |
| `subtitles` | `{id: text}` as the file has it | the table is not in the file |
| `coverage` | as above | never |
| `usage` | counts table | the table is not in the file |
| `obs` | list of `[story, title]` | the table is not in the file |
| `topics`, `numbering` | as the file has them (bytes in hex) | the table is not in the file or not read |

**`map` part**: `usage` as `{key: [verse ids]}`, full ids; absent when the file lacks it.

**What a phase 2 reader knows.** `map`: `books names subtitles coverage usage obs` at version 1. `xmap`: `coverage strong
concepts links notes relations aliases strongs` at version 1. `topics` and `numbering` are not known yet: they are optional,
so they are skipped (listed in `h.tables`, not in the output). `gen` stays `E_TABLE`.

### Checks of the tables (`E_BODY`)

After the checks of `container.md` have passed (including `E_TABLE`), a reader decodes the tables of the class. A table that
is not what its schema says is `E_BODY`, and nothing of the file is used. The schema is `cddl/*.cddl`; a map may have
keys the schema does not list (a later minor version adds them): they are ignored and are not in the output. Beyond the
types, these are `E_BODY` too:

- **Rows.** A table whose declared row count `n` is larger than the segment's `ulen`: a reader allocates no more rows than
  the body has bytes.
- **Columns.** A `uvarints` column that is cut short, longer than 8 bytes for a number, not minimal (the last byte of a number of two or more bytes is `00`)
  or above 2^53 − 1. An `ev` column whose length is not a multiple of 3. A `bits` column that is not `ceil(n / 8)` bytes
  or has an unused bit set. A `texts` column whose
  lengths do not add up to the bytes of `utf8`, or one of whose strings is not valid UTF-8 by itself (a boundary
  inside a multi-byte character). A column whose number of values is not the
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
  `missing` entry that names a piece that does not exist, has a position, or is listed twice (in either list); a `-1`
  position of a quote that is in neither list (every `-1` is in exactly one of `quoteKinds` and `quoteMissing`).
- **`orig`.** `words.cols` columns of different lengths; a number outside a word table; word pieces in `text.tok` that
  are not as many as the words; `macula.release` that is not text.
- **`obs`.** A help row whose story is outside 1 to 50 or whose frame is outside 0 to 99; a story number outside 1 to 50 or twice; a story with no frame; a frame outside 0 to 99 or twice in a story; a
  table of helps with an empty id, an id twice, `id.strings` with a count other than `n`, a `concept` column that is
  `flags`, or a `frame` column of another length than `n`.
- **`art`.** An article with an empty `id`; an article with no section; a role that is not in the list of `art.cddl`; an empty `sid`; a `sid` twice in an
  article; an `id` twice in the group.
- **`lex`.** A Strong number that is not `G` or `H` and a number, or of another group than the header's; a `refs` pair that
  runs backwards.
- **`map`, `xmap`.** The header needs `part` (both) and `lang` (`map`). A part whose `res` is not `[]`; a core of `xmap` whose `res` is empty. A part whose `book` is not its `part`; a core with a `book`; a
  core table in a part, or a part table shape in a core.
  - Counts: keys not sorted or repeated; a `counts` column cut short, or with numbers left over; a book number outside 1..66 or not
    increasing within its key; `count = 0` (`verses` above `count` is valid: a note on 1:2-4 is 1 note and 3 verses; `verses = 0` is valid too); a key with no book; a `unit` other than the table's (`xmap`
    `strong` "occurrences", `links` "links", `notes` "notes"; `map` `usage` "notes").
  - Verse lists: `keys` not sorted or repeated; a key with `n = 0` (a key with no verse in the book is not in the part); a verse offset, rebuilt as the
    running sum of the stored values of its key, that is not strictly increasing within its key or reaches 1 000 000 (the
    first offset may be 0: `front:intro`); a `verses` column cut short or with numbers left over. A part's keys that are not
    in the core's counts table, or whose number of verses is not the `verses` of the core's row for this book, are not checked by
    a reader of the part alone.
  - `concepts`: columns of different lengths; `kind` above 5; `tw` above 3; a `source` outside `h.res`.
  - `relations`: a concept outside `concepts`, a type outside `types`, a `source` outside `h.res`; a `confidence` above 100.
  - `xmap` `strongs`: keys repeated or not in `concepts`; a list of Strong keys that is empty, not sorted by code
    point or has a repeat. `aliases`: keys repeated; a value that is not in `concepts` (a key need not be: it is
    an id that moved).
  - `map` `books`: not 66 entries; a `source` outside `text list none`.
- **`catalog`.** `format` other than `3.0`; an `origin` other than `published` and `local`; an id of another length than 32
  bytes; a `books` of another length than 9, or with any of the bits 66 to 71 set (both readers reject it); a unit that names a segment outside `segments`, or has none; a segment, a unit
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
| 4 | `tito-es419` (`book.seg`) | A real book, whole | The es-419 Titus of the format 2.0 parts on staging (GLT, GST, tN, tQ, tWL) | GLT: 1 913 pieces, 953 words, all aligned, 69 events. GST: 3 471 pieces, 1 732 words, all aligned, 69 events. 216 notes (212 with quote text, 203 of them with positions found in the original), 36 questions, 223 links (223 with quote text, all with positions). Both readers give the same output |
| 5 | `nota-varios-versiculos` (`book.seg`) | A range | Titus 1:1-4 in one text (the pieces, events and alignment of the real GLT, cut after verse 4); one note on `1:2-4` pointing to `ta:translate/figs-metaphor`, with a quote of three original words. `book.seg` is the book half; the map half is `map-core.seg` and `map-tit.seg`, built by `buildMap` over that book model | The note: `ref` "1:2-4", `from` 56001002, `to` 56001004. In the language map (`map-core.seg`): 1 note, 3 distinct verses (use of the concept in Titus `[1, 3]`) |
| 6 | `strong-repetido` (`xmap-core.seg`, `xmap-tit.seg`) | Counting occurrences against verses | A synthetic Titus original whose verse 1:1 holds the key `G54850` three times, and the common map `buildXmap` makes from it | In the common map: 3 occurrences, 1 distinct verse |
| 7 | `seccion-insertada` (`build1.seg`, `build2.seg`) | Section ids that last | An article built twice with the registry in between. The first time it has an intro, a definition and translation suggestions. The second time it has an examples section before the suggestions, and its definition heading is corrected | First build: `intro`, `definition`, `translation-suggestions`. Second build: `intro`, `definition`, `examples`, `translation-suggestions`, with the first three unchanged |
| 8 | `articulo-mal-titulado` (`art.seg`) | Articles that do not follow the pattern | An es-419 article with text before any heading, a heading no rule places, and a section whose heading is in English | `intro` with role `intro`; `s1` with role `unknown`; the English section with `lang` "en". Every section readable |
| 9 | `tabla-desconocida` (`future-x.seg`, `future-y.seg`) | Tables a reader does not know (a phase 1 case: a phase 2 reader gives the same, since `book` is a class both know) | Case 1 with an extra optional table `future-x` (`future-x.seg`), and again with an extra required table `future-y` (`future-y.seg`); each table is version 1 and holds a map | The first gives case 1's output, except for `h.tables` (which lists `future-x` too) and `id` (the body has another table); the second gives `E_TABLE` |
| 10 | `transferencia-cortada` (`cut.tcpack`) | A transfer file cut inside an entry | A `full` transfer file with three entries: a catalog that lists case 4's book segment as the unit `book:tit`, case 1's segment (it travels beside it: the catalog does not list it) and case 4's segment; `made` "2026-11-01T10:00:00Z", `by` "build-cases 1". Cut in the middle of case 4's segment | The catalog and case 1 have status `ok`; case 4 has status `missing` |
| 11 | `revisiones-mixtas` (`catalog.seg`, `map-core.seg`, `book-rut.seg`) | Published against installed | Catalog and language map of revision 4, where Ruth has 15 notes on metaphor; Ruth's book segment of revision 3, where it had 14 (Ruth is synthetic: the notes on metaphor of the sample's Titus relabeled to Ruth 1, since the data has no es-419 Ruth; the catalog lists the map core only) | From the map: 15, "revision 4". From the installed book: 14 |
| 12 | `idioma-parcial` (`map-core.seg`) | Zero against no source | An es-419 map whose tN covers tit, rut, 3jn and jon whole, with notes on metaphor in Titus only (those of case 5) | Use of `ta:translate/figs-metaphor` in Titus: the count. In Jonah with no such note: zero. In Isaiah: no source |
| 13 | `paquete-viejo` (`catalog.seg`) | The bridge from an old pack | `data/es-419-tit.langpack.zip`, format 1.1, with the originals from case 4, bridged on the device `test-device` at "2026-11-01T10:00:00Z" | The same book segment as case 4, with the same id; a local catalog (`origin` "local", `publisher` "local:test-device", unsigned). The folder holds only the catalog, `catalog.seg`: the book segment the bridge makes is not stored, because the test asserts that its bytes are those of case 4's `book.seg`. Since phase 2 the catalog also has the map unit: `catalog.seg` 758 -> 931 bytes, `expected.json` 2260 -> 2878 bytes |
| 14 | `entero-fuera-de-rango` (`header.seg`, `body.seg`) | An integer outside -(2^53 - 1) .. 2^53 - 1 (`container.md`, "What a reader accepts") | Case 1 twice: with a key `x` in the file header that holds 2^60 (`header.seg`), and with a root key `x` in the body that holds -2^53 (`body.seg`); the reader knows neither key | `header.seg`: `E_HEADER`; `body.seg`: `E_BODY` |

Cases 6, 11 and 12 and the map half of case 5 are built from the maps of phase 2; `src/conformance.test.ts` checks their numbers with `answer` (`src/query/maps.ts`).

Phase 2 also adds the fixed queries of the common map, with the answers phase 0 measured:
- G5485;
- `tw:names/abraham`;
- the notes on metaphor by book;
- Isaiah;
- the key terms of Ruth.
