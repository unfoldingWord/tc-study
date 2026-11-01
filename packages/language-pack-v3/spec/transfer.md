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
