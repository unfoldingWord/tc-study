# The container

Every segment, and the catalog, is one file with the layout below. A transfer file (`transfer.md`) uses the same
first eight bytes with another kind.

## Layout

| Offset | Size | Field | Value |
| --- | --- | --- | --- |
| 0 | 4 | Magic number | `89 54 4C 50` (`\x89TLP`) |
| 4 | 1 | Major version | `03` |
| 5 | 1 | Minor version | `00` |
| 6 | 1 | Kind | `01` segment, `02` transfer file |
| 7 | 1 | Reserved | `00` |
| 8 | 4 | Header length `H` | Unsigned, big-endian |
| 12 | `H` | Header | A CBOR map, not compressed |
| 12 + `H` | `clen` | Body | The compressed body; `clen` is in the header |

The file ends right after the body: its length is exactly `12 + H + clen`.

The first byte is not ASCII, so a file damaged by a text-mode copy fails at once.

## Header

A CBOR map with these keys. The header can be read without decompressing anything, so an app can list a file's
contents cheaply.

| Key | Type | What |
| --- | --- | --- |
| `h` | map | The logical header (below). It MUST equal the body's `h` |
| `codec` | text | `deflate-raw`. No other value is defined in 3.0 |
| `clen` | uint | Length of the compressed body, in bytes |
| `ulen` | uint | Length of the uncompressed body, in bytes |
| `id` | bytes (32) | sha256 of the uncompressed body: the segment's identity |
| `sig` | array | Only in the catalog: its signatures (`catalog.md`) |

A reader ignores header keys it does not know: a minor version can add them. A `sig` of the wrong type, or in a segment that is not a
catalog, is ignored the same way: phase 3, which checks signatures, decides what it does with them.

## Body

The body, before compression, is a CBOR map that has the keys `h` and `t`:

- `h`: the logical header;
- `t`: the tables, a map from table name to table.

Any other key of the body map is ignored and is not output: a later minor version may add them. A body that lacks `h` or
`t`, or whose `h` or `t` is not a map, is `E_BODY`.

It is compressed with deflate-raw (RFC 1951, no zlib or gzip wrapper). Builders SHOULD use the highest compression level.
The compressed bytes are not part of the identity, so a better compressor never changes an id.

## Logical header

| Key | Type | In | What |
| --- | --- | --- | --- |
| `class` | text | all | `catalog`, `xmap`, `map`, `book`, `orig`, `art`, `lex`, `obs` or `gen` |
| `v` | uint | all | The class's schema version. 1 for every class in 3.0 |
| `tables` | map | all | Every table in `t`: name → `[version, required]` (uint, bool). A table in one and not the other is an error |
| `lang` | text | language classes | The language tag of the resources, as Door43 writes it (`es-419`) |
| `book` | text | `book`, `orig`, parts of `map` and `xmap` | The book code (`ids.md`) |
| `part` | text | `map`, `xmap` | `core`, or the book code of a per-book part |
| `group` | text | `art`, `lex` | Which group of articles or entries (`ids.md`) |
| `orig` | array | everything that names original positions | `[resource key, stamp]` of the original book those positions belong to (`ids.md`) |
| `res` | array | language classes | The resources whose data is inside: `[* [resource key, release stamp]]`. Tables name a resource by its index here |

The logical header has no dates and no builder version. Both would change the id without changing the content; the
catalog carries them.

## Identity

A segment's id is the sha256 of its uncompressed body, the exact bytes that were compressed.

- A reader MUST compute it after decompressing and compare it with the header's `id` and with the id the catalog
  gives.
- A reader does not need to encode CBOR again to check it.
- Two builds of the same content give the same bytes, so the same id (see "Deterministic encoding").

## Deterministic encoding

Builders MUST encode the header and the body as RFC 8949 §4.2.1 says ("core deterministic encoding"):

- integers and lengths in their shortest form;
- definite lengths only;
- map keys sorted by the bytes of their encoding.

They MUST also follow these rules:

- **No floats, no tags, no `null`, no `undefined`.** A missing value is a missing key, or an "absent" bit (below).
- **Text is kept as published.** It is valid UTF-8, without Unicode normalization or trimming, because the bytes are
  the translator's.
- **Ids are ASCII** (`ids.md`).
- **String tables** are in the order their schema gives: usually most used first, ties by code point.

**What a reader accepts.** Only builders are bound by the rules above about shortest forms and sorted keys: a reader accepts
an integer that is not in its shortest form and map keys that are not sorted. A reader rejects, anywhere in the header
(`E_HEADER`) or in the body (`E_BODY`): indefinite lengths, floats, tags, `null`, `undefined` and any other simple value
(only `false` and `true` are accepted), a map key that is not text, and a map with the same key twice. The body is decoded
as a whole before any table is skipped, so these rules also apply inside an unknown optional table.

**Integers have one range.** A CBOR integer outside -(2^53 - 1) .. 2^53 - 1 (the numbers JavaScript reads exactly, the same distance each
way) is rejected anywhere: `E_HEADER` in a segment's header and in the index of a transfer file, `E_BODY` in the body. That includes a
header key the reader does not know, a root key of the body it ignores, and a table it skips. Builders write no integer outside it.

## Column encodings

Tables keep their data by columns, so that alike data sits together and compresses well. These encodings are used in
the schemas (`cddl/common.cddl`):

| Name | Encoding |
| --- | --- |
| `uvarints` | Unsigned LEB128 numbers, one after the other in a byte string: 7 bits per byte, low bits first, high bit set on every byte but the last. Minimal form: the last byte of a number of two or more bytes is not `00`. Values up to 2^53 − 1, so that JavaScript reads them exactly |
| `svarints` | Signed numbers as `uvarints` after zigzag: `n ≥ 0 → 2n`, `n < 0 → −2n − 1` |
| `deltas` | `svarints` of each value minus the previous one; the first minus 0 |
| `bits` | A byte string of `ceil(n / 8)` bytes; row `i` is bit `i mod 8` (least significant first) of byte `i div 8`. Unused bits are 0 |
| `texts` | `{ "utf8": bytes, "len": uvarints }`: the strings joined in UTF-8, and the byte length of each. Each string must be valid UTF-8 by itself: a boundary inside a multi-byte character is `E_BODY` |
| `strtab` | An array of text strings, numbered from 0 |

**Absent values.** A column that some rows lack has a `has` bit column. Its values list only the rows whose bit is 1.

## Required and optional tables

Each class's schema says which tables are required and what each optional one depends on.

- A reader that does not know a **required** table, or its version, MUST NOT open the segment (`E_TABLE`).
- An **optional** table it does not know is skipped. So is everything its schema says depends on it. For example, a
  reader that cannot read `align` shows the texts without alignment; it does not read them half-way.
- A table can be required and empty: a language with no notes still has its texts.

## Limits

| What | Limit |
| --- | --- |
| Header length `H` | 65 536 bytes |
| `ulen` and `clen` | 67 108 864 bytes (64 MiB) each |
| Nesting of CBOR arrays and maps | 64 levels |

Nesting counts the outermost map or array as level 1. A reader MUST reject anything beyond these limits (`E_LIMIT`).

A table whose declared row count `n` is larger than the segment's `ulen` is not a limit error: it is `E_BODY` (checked
with the tables, `tests/README.md`), because a reader allocates no more rows than the body has bytes.

## Errors

A reader that finds one of these MUST reject the whole file and use nothing from it. The codes are what the conformance
cases expect.

| Code | When |
| --- | --- |
| `E_MAGIC` | The first four bytes are not the magic number |
| `E_VERSION` | Unknown major version |
| `E_KIND` | The kind is not the one expected. A reader that is asked for a segment file and finds kind `02` (or the reverse) gives `E_KIND`. A generic reader that accepts both kinds (the conformance readers do) reads the kind byte, dispatches, and gives `E_KIND` only for a kind other than `01` and `02` |
| `E_TRUNCATED` | The file is shorter than `12 + H + clen` |
| `E_TRAILING` | The file is longer than `12 + H + clen` |
| `E_HEADER` | The header (the `H` bytes) is not exactly one CBOR map, or lacks `h`, `codec`, `clen`, `ulen` or `id`, or one of them has the wrong type (`id` is not 32 bytes, `clen` is not an unsigned integer, ...) |
| `E_CODEC` | The codec is not `deflate-raw` |
| `E_INFLATE` | Inflating fails, does not end exactly at the end of the body, or gives other than `ulen` bytes |
| `E_ID` | The sha256 of the uncompressed body is not `id`, or not the id the catalog gives |
| `E_BODY` | The body does not match its class's schema. The logical header must have the types of the "Logical header" table, and table names are lowercase ASCII letters, digits and `-`, starting with a letter. A table listed in `tables` and missing from `t` (or the reverse) is `E_BODY` too |
| `E_HMISMATCH` | The body's `h` differs from the header's `h` |
| `E_TABLE` | A required table, or its version, is unknown |
| `E_LIMIT` | A limit above is exceeded |

**Order of checks.** A file can have more than one defect. So that two readers give the same code, a reader checks in
this order and stops at the first defect:

1. The fixed bytes, each one as soon as it is present: the magic number (`E_MAGIC`), the major version (`E_VERSION`),
   the kind (`E_KIND`). A file that ends before byte 12, while every byte present matches, is `E_TRUNCATED`. The
   reserved byte and the minor version are not checked: a reader ignores the reserved byte and reads any minor version
   of its major.
2. `H` over the limit (`E_LIMIT`). Then fewer than `12 + H` bytes (`E_TRUNCATED`). Then the header (`E_HEADER`; CBOR
   nested deeper than 64 levels is `E_LIMIT`).
3. `clen` or `ulen` over the limit (`E_LIMIT`). Then the file's length against `12 + H + clen`: shorter is `E_TRUNCATED`,
   longer is `E_TRAILING`.
4. Then, in this order: `E_CODEC`, `E_INFLATE`, `E_ID`, `E_BODY`, `E_HMISMATCH`, `E_TABLE`. Here `E_BODY` is the general shape of the
   body: a map with `h` and `t` (other keys are ignored), the logical header, and `h.tables` and `t` listing the same
   tables. The whole body is decoded here, so CBOR nested deeper than 64 levels in it is `E_LIMIT`, raised while it is decoded, in the
   place of `E_BODY`. A catalog inside a transfer file has one more check here: its class (`transfer.md`).
5. Then the tables of the class, which only a reader that knows the class can check: each table against its schema
   (`cddl/`) and the further checks `tests/README.md` lists ("Checks of the tables"), `E_BODY` again. A segment of a class
   the reader does not decode (in phase 1: `map`, `xmap` and `gen`) is `E_TABLE` at this step if it was not before, because
   the reader has no known table for it, even if all its tables are optional. A segment inside a transfer file
   (`transfer.md`) gets this `E_TABLE` too, but not the rest of the step: the shape of its tables is checked when the
   app opens it.

A file that came cut short over Bluetooth or a full SD card fails `E_TRUNCATED` or `E_INFLATE`. The app keeps what it
had and asks for the file again.

## Examples

`tests/container/` has three files and what a reader gets from each. `make_examples.py` writes them.

- `minimal.seg`: a valid `book` segment with one verse and no helps;
- `truncated.seg`: the same file without its last 10 bytes (`E_TRUNCATED`);
- `bad-id.seg`: a valid file whose `id` was changed (`E_ID`).
