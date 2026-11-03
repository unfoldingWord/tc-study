# Test data of the row sources

Real files from phase 0, copied as they are (the lists are trimmed, see below). The tests of `src/source/` read them;
later tasks build segments from them. Whole-language checks use the full phase 0 sample of the language packs project instead.

## License

These are unfoldingWord resources (Translation Notes, Translation Questions, Translation Words Links, Translation
Words, the Literal and Simplified Bridge Texts of es-419, the Greek Lexicon and the UGNT), under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Whoever reuses them must credit unfoldingWord and keep
the same license. The package's own license (MIT) does not cover this folder.

## Releases

The resources of the lists, with the release each row was made from (`resources[].stamp`):

| Resource key | Release stamp | Subject |
| --- | --- | --- |
| `es-419_gl/es-419/glt` | `v42#2026-08-11T12_22_03Z` | Aligned Bible |
| `es-419_gl/es-419/gst` | `v40#2024-07-17T20_13_11Z` | Aligned Bible |
| `es-419_gl/es-419/tn` | `v66#2024-07-17T20_13_08Z` | TSV Translation Notes |
| `es-419_gl/es-419/tq` | `v38#2024-07-17T20_13_05Z` | TSV Translation Questions |
| `es-419_gl/es-419/tw` | `v37#2024-07-17T20_12_37Z` | Translation Words |
| `es-419_gl/es-419/twl` | `v18#2024-07-17T20_13_06Z` | TSV Translation Words Links |
| `es-419_gl/es-419/ugl` | `60a78e039b#2026-10-27T11_47_33Z` | Greek Lexicon |
| `unfoldingWord/en/ta` | `v91#2026-09-26T15_47_36Z` | Translation Academy |
| `unfoldingWord/en/tn` | `v91#2026-09-26T15_47_18Z` | TSV Translation Notes |
| `unfoldingWord/en/tw` | `v91#2026-09-26T15_47_38Z` | Translation Words |
| `unfoldingWord/en/twl` | `v91#2026-09-26T15_47_29Z` | TSV Translation Words Links |
| `unfoldingWord/el-x-koine/ugnt` | `v0.34#2023-09-27T02_19_31Z` | Greek New Testament |

## Layout

- `es-419/list.json`, `en/list.json`, `originals/list.json`: the parts lists, schema 2, trimmed to the parts below. Every other field is
  as the source has it (`code`, `compat`, `versions`, `units`, `stamps`, `originals`), and so is each resource's `stamp`
  and `metadata`, with its release. `resources` keeps the resources that have a part here (the full list does not list a
  resource with no part either). Two fields name things that are not in this folder: `originals.sha256` of the es-419
  list is the sha256 of the *full* originals list, and `units` names every unit of the language.
- `parts/<sha256>.part.gz`: the part files, under their own names (the sha256 of the file). Gzip of JSONL
  `{layer, key, value}`.
- `es-419-tit.langpack.zip`: the format 1.1 pack of es-419 Titus (`kind: book`, books `["tit"]`).

## What is here, and where each file comes from

The files come from the phase 0 sample of the language packs project, which was built from the Door43 releases of the table above
and of the lists (`resources[].stamp`). Sizes are in bytes; the sha256 of each file is given, so a copy can be checked.

### Parts

Each one is a part file of the phase 0 sample, under its own name (the sha256 of the file; it was checked when copied).

| File | Bytes | sha256 | What it holds |
| --- | ---: | --- | --- |
| `parts/64d750b4043d322cbad88ef2d76e1524156938f5138f7c9c33e8187bb776b17e.part.gz` | 10 061 | `64d750b4043d322cbad88ef2d76e1524156938f5138f7c9c33e8187bb776b17e` | es-419 tn alignments tit |
| `parts/fe7436204ed2e1790c5503f38267d2ee4209b11b93ca28ff9b6ed248cef032a6.part.gz` | 8 299 | `fe7436204ed2e1790c5503f38267d2ee4209b11b93ca28ff9b6ed248cef032a6` | es-419 twl alignments tit |
| `parts/66838536c27714e72349887f2f66b5ac3822288a5f4da329197fb02c42b40039.part.gz` | 70 017 | `66838536c27714e72349887f2f66b5ac3822288a5f4da329197fb02c42b40039` | es-419 glt book tit |
| `parts/dbba2fc02cbc1e7607443339386324c371ed38d7ee526afb415a84189be4f186.part.gz` | 94 592 | `dbba2fc02cbc1e7607443339386324c371ed38d7ee526afb415a84189be4f186` | es-419 gst book tit |
| `parts/f881774a7c98a285ecb652d66c9ce2566b0876c9ced7a5bd07be196af55658a9.part.gz` | 95 686 | `f881774a7c98a285ecb652d66c9ce2566b0876c9ced7a5bd07be196af55658a9` | es-419 tn book tit |
| `parts/8b24ed9de9b1d15ece57c1634c0087174a625c9b47ae0893c39413f95957eaee.part.gz` | 5 886 | `8b24ed9de9b1d15ece57c1634c0087174a625c9b47ae0893c39413f95957eaee` | es-419 tq book tit |
| `parts/5ce5a7cd5aff2cdd09c2fb75ac5c84a2c9509283f3f1566e37a4b6ca971d3769.part.gz` | 20 145 | `5ce5a7cd5aff2cdd09c2fb75ac5c84a2c9509283f3f1566e37a4b6ca971d3769` | es-419 twl book tit |
| `parts/88c8ef112349b971ac5e288656306ccc9cc774af2ec45b9b10c8fbcbcd02b9de.part.gz` | 261 670 | `88c8ef112349b971ac5e288656306ccc9cc774af2ec45b9b10c8fbcbcd02b9de` | es-419 ugl G1-G999 |
| `parts/bf259dfedad22a1e611bfd9133f03990942b4cea8b418988ccc264687772bcb0.part.gz` | 15 717 | `bf259dfedad22a1e611bfd9133f03990942b4cea8b418988ccc264687772bcb0` | es-419 tw titles |
| `parts/fde36ed877cac3535ba56ce4643e7fd097ec5f91d4c116e78f4289c80bd33634.part.gz` | 90 049 | `fde36ed877cac3535ba56ce4643e7fd097ec5f91d4c116e78f4289c80bd33634` | es-419 tw kt:0 (holds kt/grace) |
| `parts/d1ff8752fb229afd3c480b046e9c52d088d9e0141f531dea781732d6b9338405.part.gz` | 25 352 | `d1ff8752fb229afd3c480b046e9c52d088d9e0141f531dea781732d6b9338405` | ugnt tit |
| `parts/111a888bb7c86bcc93a80fc63165c9494de67a6fbab44283824525f4f759caa4.part.gz` | 83 567 | `111a888bb7c86bcc93a80fc63165c9494de67a6fbab44283824525f4f759caa4` | English tn book tit |
| `parts/b1a415d26290f7d3b3f743f7eb15dafd201d40c47ed83774ab6492dc80c78628.part.gz` | 13 504 | `b1a415d26290f7d3b3f743f7eb15dafd201d40c47ed83774ab6492dc80c78628` | English twl book tit |
| `parts/b6303b3e01bb8465c42facb2e37325dd68147ad2c6ffdd48826d18f0584ff1a5.part.gz` | 13 198 | `b6303b3e01bb8465c42facb2e37325dd68147ad2c6ffdd48826d18f0584ff1a5` | English tw titles |
| `parts/c24b5b852baaeb94d6a112841fd3c3f09e3058b0e44a5a86e67333158edf54a8.part.gz` | 4 237 | `c24b5b852baaeb94d6a112841fd3c3f09e3058b0e44a5a86e67333158edf54a8` | English ta titles |

`es-419 tw kt:0` is the tW part that holds `kt/grace` (the row `es-419_gl/es-419/tw/bible/kt/grace` and its two
prepared rows). `es-419 ugl G1-G999` is group `0` of the lexicon: `content/1.json` to `content/999.json` (981 rows).

### Lists and pack

| File | Bytes | sha256 | Source and what was done |
| --- | ---: | --- | --- |
| `es-419/list.json` | 186 072 | `d3c3c4b6741832c8d7d1ceb0aab89102b994dba8e3d86d095e58a5ace0df47fa` | the phase 0 sample's list of es-419: trimmed (source sha256 c6077a9f70dc88a8e5a151c39babe04c0bb4b302a2cc9289786bd83c45e65702, 81 parts, 9 resources): 10 parts, 7 resources |
| `en/list.json` | 244 546 | `62a0ed1dc7f1a52184a21f0a0bd8af161b1dba1de9a2343ecd57f92ac7130c32` | the phase 0 sample's list of English: trimmed (source sha256 37588b1990680594d169c86b480c7a745aadabe0e96d70e9dad171a0ace2c0f8, 595 parts, 11 resources): 4 parts, 4 resources |
| `originals/list.json` | 10 317 | `1516a779e6862a1bd846aa4e4fbf6eddd13fe73ab93e914d838d8efa748d5273` | the phase 0 sample's list of the originals: trimmed (source sha256 f0d6ca889d58fba47a0ad22597791596f6b368b5933931a30d39b037cd4983b8, 132 parts, 4 resources): 1 parts, 1 resources |
| `es-419-tit.langpack.zip` | 314 931 | `d3ecdff0ee9e329f58ec6652571bbebe6873784aa1c90e943a01e3c5299285c8` | the phase 0 sample's pack: format 1.1 pack, es-419 Titus |

Total: 1 567 846 bytes in 19 files.

## Not copied

These are in the phase 0 sample, and a later task may need them:

- the es-419 `ta` titles part (`helps-text:ta-title:…`), the part `57d3a13656ca0886adb91a6fdfc31575666b9d2acb2ec96c966c41824ac0e27f.part.gz` of the phase 0 sample;
- the MACULA Titus part of `Biblica/el-x-koine/macula`, the part `0c6f97e1352dbdd0c999e829c389022856aed65a9890ef48338642c8182621dc.part.gz` of the phase 0 sample
  (MACULA is published under its own license; check it before copying).

## topics/

- `topics/tipnr-subset.txt`: the header lines and 11 records (Abraham, Absalom, Isaac, Sarah, two Zechariahs, two Bethlehems,
  Egypt, Jerusalem, Ur) of TIPNR, "Translators Individualised Proper Names with all References", by STEPBible.org
  (www.STEPBible.org, based on work at Tyndale House Cambridge), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
  Copied without change from the file the header names; the reader test uses it. The whole file is not in the repository.
