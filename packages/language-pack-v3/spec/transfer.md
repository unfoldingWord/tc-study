# The transfer file

A transfer file carries segments and complements from one device to another without a network: SD card, USB,
Bluetooth. It holds whole segment files, each one self-verifying, behind an index that is not compressed. Its schema is
`cddl/transfer.cddl`.

Extension: **`.tcpack`** (proposed; the name of the format is still Abel's decision). It is not a zip, so the old
`.langpack.zip` and the new file cannot be confused.

## Layout

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 8 | As a segment file (`container.md`), with kind `02` |
| 8 | 4 | Index length `I`, unsigned, big-endian |
| 12 | `I` | Index: a CBOR map, not compressed |
| 12 + `I` | … | The entries, one after the other, at the offsets the index gives |

- Offsets in the index count from `12 + I`.
- Entries are in offset order, with no gaps and no overlaps.
- The file ends with the last entry: its length is `12 + I` plus the sum of the entries' sizes.

## Index

| Key | Type | What |
| --- | --- | --- |
| `mode` | text | `full` or `update` |
| `catalogs` | array | The ids of the catalogs inside. They come first among the entries |
| `base` | array | In `update` mode: `[catalog, revision]` for each catalog the receiver must already have |
| `entries` | array | Each entry: `id`, `kind` (`segment` or `complement`), `offset`, `size`, and the `class` of a segment |
| `made` | text | When the file was written (RFC 3339). Informative |
| `by` | text | The app and version that wrote it. Informative |

The publisher, revision and units of every segment are in the catalogs inside. An app can list what the file brings,
and how much of it the device already has, by reading only the index and the catalogs.

## Modes

- **`full`**: everything needed to read from an empty device. That is:
  - the language and common catalogs;
  - the language map and the common map;
  - for each chosen book, its segment and its original;
  - the article groups those books need;
  - optionally the lexicon, OBS and complements.
- **`update`**: only the segments that changed since the `base` revisions, and the new catalogs. A receiver without a
  base revision cannot use it and says so.

## Receiving

1. Check the first 12 bytes and the index: `E_MAGIC`, `E_VERSION`, `E_KIND`, `E_HEADER`.
2. Read the catalogs and check their ids and signatures (`catalog.md`).
3. Check every entry as if it had been downloaded (`container.md`): an entry whose id does not match is rejected
   (`E_ID`).
4. Activate the units that are complete (`catalog.md`).

**Order of checks.** A reader of a transfer file checks in this order and stops at the first defect of the file:

1. The first 12 bytes, as for a segment file (`container.md`): `E_MAGIC`, `E_VERSION`, `E_KIND` (the kind is not `02`),
   and `E_TRUNCATED` for a file that ends before byte 12 while every byte present matches.
2. The index: fewer than `12 + I` bytes is `E_TRUNCATED`. There is no limit on `I` in 3.0. Then a CBOR map that is not
   exactly the `I` bytes, or not a map, is `E_HEADER`; nested deeper than 64 levels is `E_LIMIT`.
3. The index against `cddl/transfer.cddl` and the layout, `E_HEADER` for any of these:
   - `mode` is not `full` or `update`;
   - `catalogs` is not a list of at least one id of 32 bytes, or repeats an id;
   - `entries` is not a list of at least one map; an entry has no `id` of 32 bytes, repeats the `id` of another, has a
     `kind` other than `segment` and `complement`, or an `offset` or a `size` that is not an unsigned integer;
   - an entry's `offset` is not the sum of the sizes of the entries before it (the first is 0), or that sum goes beyond
     2^53 − 1;
   - an entry has a `class` and is a complement, or the `class` is not a class name;
   - an id of `catalogs` is not an entry, is not among the first as many entries as `catalogs` has, is a complement, or
     has a `class` other than `catalog`;
   - `base` is not a list of `[text, unsigned integer]`, or `made` or `by` is not text.

   Keys of the index that are not listed are ignored. A reader does not check that an `update` has its `base`: that is the
   app's job.
4. The length of the file against the entries, with `available` the bytes after the index: less than the end of the last
   catalog (`offset + size`) is `E_TRUNCATED`; more than the end of the last entry is `E_TRAILING`.
5. Every entry in the order of the index, each one whole in the file: the catalogs first. A catalog is checked as a segment
   file (`container.md`) with its `id` of the index as the id the catalog gives, against the tables of a catalog; its
   error, whichever it is, rejects the file. Any other entry only gets its status (`tests/README.md`), and does not stop
   the others.
6. Then the tables of each catalog against `catalog.cddl`, in the order of `catalogs` (`E_BODY`; their tables were known in
   step 5): the first that fails rejects the file.

**A file cut short.** Each entry checks itself, so a cut file loses only what was cut.

- A receiver MAY keep every complete entry whose id is right, and report the rest as missing.
- Units whose segments are all present are activated; the others wait for another file or a network.
- A file cut before the end of its catalogs is rejected (`E_TRUNCATED`).

## Old packs

An app may still receive a format 2.0 or 1.1 `.langpack.zip`. It converts it on the device (`src/bridge/fromV2.ts`,
phase 1):

- The converted segments are byte for byte what the publisher's builder would make from the same inputs.
- They go into a **local catalog** (`origin: local`, `publisher: local:` and the device), unsigned, with coverage
  partial where the old pack lacked something.
- A later published catalog replaces them.
- An old pack that brings no originals waits for them, as format 2.0 does today.
