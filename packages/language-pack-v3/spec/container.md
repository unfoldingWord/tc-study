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

A reader ignores header keys it does not know: a minor version can add them.

## Body

The body, before compression, is a CBOR map with two keys:

- `h`: the logical header;
- `t`: the tables, a map from table name to table.

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

## Column encodings

Tables keep their data by columns, so that alike data sits together and compresses well. These encodings are used in
the schemas (`cddl/common.cddl`):

| Name | Encoding |
| --- | --- |
| `uvarints` | Unsigned LEB128 numbers, one after the other in a byte string: 7 bits per byte, low bits first, high bit set on every byte but the last. Minimal form: no trailing `80` bytes. Values up to 2^53 − 1, so that JavaScript reads them exactly |
| `svarints` | Signed numbers as `uvarints` after zigzag: `n ≥ 0 → 2n`, `n < 0 → −2n − 1` |
| `deltas` | `svarints` of each value minus the previous one; the first minus 0 |
| `bits` | A byte string of `ceil(n / 8)` bytes; row `i` is bit `i mod 8` (least significant first) of byte `i div 8`. Unused bits are 0 |
| `texts` | `{ "utf8": bytes, "len": uvarints }`: the strings joined in UTF-8, and the byte length of each |
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
| Nesting of CBOR arrays and maps | 16 levels |

A reader MAY reject anything beyond them (`E_LIMIT`).

## Errors

A reader that finds one of these MUST reject the whole file and use nothing from it. The codes are what the conformance
cases expect.

| Code | When |
| --- | --- |
| `E_MAGIC` | The first four bytes are not the magic number |
| `E_VERSION` | Unknown major version |
| `E_KIND` | The kind is not the one expected (a transfer file where a segment was expected, or the reverse) |
| `E_TRUNCATED` | The file is shorter than `12 + H + clen` |
| `E_TRAILING` | The file is longer than `12 + H + clen` |
| `E_HEADER` | The header is not a CBOR map, or lacks `h`, `codec`, `clen`, `ulen` or `id` |
| `E_CODEC` | The codec is not `deflate-raw` |
| `E_INFLATE` | Inflating fails, does not end exactly at the end of the body, or gives other than `ulen` bytes |
| `E_ID` | The sha256 of the uncompressed body is not `id`, or not the id the catalog gives |
| `E_BODY` | The body does not match its class's schema |
| `E_HMISMATCH` | The body's `h` differs from the header's `h` |
| `E_TABLE` | A required table, or its version, is unknown |
| `E_LIMIT` | A limit above is exceeded |

A file that came cut short over Bluetooth or a full SD card fails `E_TRUNCATED` or `E_INFLATE`. The app keeps what it
had and asks for the file again.

## Examples

`tests/container/` has three files and what a reader gets from each. `make_examples.py` writes them.

- `minimal.seg`: a valid `book` segment with one verse and no helps;
- `truncated.seg`: the same file without its last 10 bytes (`E_TRUNCATED`);
- `bad-id.seg`: a valid file whose `id` was changed (`E_ID`).
