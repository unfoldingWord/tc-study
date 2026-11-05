# Sources of the maps

Every source the maps are built from. Versions and licenses come from the `metadata` of the phase 0 sample lists
(`en/list.json`, `es-419/list.json`, `originals/list.json`); "to confirm" means the source does not say. The release
of each source is kept in the core of the maps and in the catalog, never in a part (`cddl/map.cddl`).

| Source | Version or release | License | What it gives | Map | Status |
| --- | --- | --- | --- | --- | --- |
| UHB (`unfoldingWord/hbo/uhb`) | v3.0.0 | CC BY-SA 4.0 | The Hebrew and Aramaic text, with Strong keys | `xmap` (`strong`), `orig` | in the sample |
| UGNT (`unfoldingWord/el-x-koine/ugnt`) | v0.34 | CC BY-SA 4.0 | The Greek text, with Strong keys | `xmap` (`strong`), `orig` | in the sample |
| MACULA (`Biblica/hbo/macula`, `Biblica/el-x-koine/macula`) | 3b8aa380e8 (2026-10-15) | CC BY 4.0 | Syntax trees and referents of the original | `orig` (not counted in the maps) | in the sample |
| English tN (`unfoldingWord/en/tn`) | v91, 59 books | CC BY-SA 4.0 | English notes: which Academy article each points to | `xmap` (`notes`) | in the sample |
| English tWL (`unfoldingWord/en/twl`) | v91, 59 books | CC BY-SA 4.0 | English word links: which tW article each original word points to | `xmap` (`links`, `strongs`, `concepts`) | in the sample |
| tW (`unfoldingWord/en/tw`) | v91 | CC BY-SA 4.0 | Translation Words articles: the concepts and their category (`kt`, `names`, `other`) | `xmap` (`concepts`), `map` (`names`) | in the sample |
| tA (`unfoldingWord/en/ta`) | v91 | CC BY-SA 4.0 | Translation Academy articles and their titles and questions | `xmap` (`notes` keys), `map` (`names`, `subtitles`, `usage`) | in the sample |
| es-419 resources (`es-419_gl/es-419/` glt v42, gst v40, tn v66, tq v38, tw v37, twl v18, ta v4) | as listed | CC BY-SA 4.0 | The language's own books, notes, word links and articles | `map` (`books`, `names`, `subtitles`, `coverage`, `usage`) | in the sample |
| STEPBible TIPNR (`STEPBible/STEPBible-Data`, `Proper Nouns/TIPNR - Translators Individualised Proper Names with all References - STEPBible.org CC BY.txt`) | commit `be4191f0082aeedddb0eff0c02c966292b2bd641` of 2026-10-24 (message "24-Oct-2026"); no releases. sha256 of the file: `d595b9163d32a400bb0ef96b27a6de58335a63da840b82531fe9f5e1d16a318c` | CC BY 4.0 (README, file name and header). Credit: "STEP Bible", linked to www.STEPBible.org, with the changes made | About 3 100 people and 1 000 places: their verses, their family and tribe relations (places: founder, inhabitants), and the Strong keys of each name (uStrong, dStrong, eStrong) | `xmap` (`concepts`, `relations`), the topics module | approved by Abel (2026-11-02) |
| Theographic Bible Metadata (`robertrouse/theographic-bible-metadata`) | commit `744355c7a5f38efd407bc67a5257c99aca9532bc` (master, 2026-10-22 20:49 -0500 = 2026-10-23 UTC), the last of master on or before 2026-10-23; no releases or tags. sha256: `events.json` `ca1005dbf96231fbbe328d6fdd9a3fe2ab7d616e97d8283f36aef763cc7dfc27`, `people.json` `5f0f259ea0b2acb94aeea02d0f1bd3e771adbcb3451cf5f93d32fb090a0c1a1c`, `places.json` `f7b02819fcea85f4faf04710b026c554abac54168573c9327a22a9cd6e267d6e`, `verses.json` `a82fe1322125ae57448abb87b0057b146e9c3000dae45dd00e9aa7b0cef45bfa` | CC BY-SA 4.0 (LICENSE file). Its README asks to cite the original sources too (`docs/data-source-bibliography.md`) | **Events only** (about 450): participants, places, `partOf`, `predecessor` and verses. People and places come from TIPNR, which Theographic partly derives from | the topics module | approved by Abel, events only |
| English OBS (`unfoldingWord/en_obs`) | tag v9, commit `d39a1dc7a7557ac54e4a8fecc3462147fe7eec3b` (2023-03-03), from `https://git.door43.org/unfoldingWord/en_obs` (not on GitHub); `content/01.md` … `50.md`, per-file sha256 in the list below | CC BY-SA 4.0. Attribution: "The original work by unfoldingWord is available from https://openbiblestories.org" | **The story references only**: the closing line `_A Bible story from: …_` of each of the 50 stories (story 50 has several, separated by `;`). No text, no images (the images are Sweet Publishing's, CC BY-SA 3.0) | the topics module (`obs:` stories and their verse ranges) | approved by Abel, references only |

**Line endings of the Theographic and OBS hashes.** The sha256 values of the Theographic files and of the OBS files are those of the files as checked out on Windows with CRLF line endings (git autocrlf), not of the bytes the servers send (LF). To check a download, convert LF to CRLF first. `cli/topic-sources.json` of `resource-pipeline` keeps both hashes (`rawSha256` for the download, `sha256` for the value here). The TIPNR hash is of the raw file.

**sha256 of the OBS files** (`content/NN.md`, v9):

```
9630208edc523029def201fb531cf2aba1bd52574d30e9a1ce6af7c1bace8b02  01.md
4c609363ad5fc7d4bcddeebf69a9cb3fac45e8a44eea84172f523ee3e7a024f5  02.md
95e9287e2f55596bd1bcff162ad61b8d5a1b183f59986ba2996060ee3545dcd2  03.md
374be8143984e71acc1b04d92969f6339d54834f10e70ee4ad72cac45c1b604f  04.md
2e4ba4730f1d6dac72a8f3ca7e52ed66f9804ea831c90fbafa5ec9cf8e75a10f  05.md
01d979d259cd47a70083f9a0d88a2822cf27de965370d76c51385b40110fcb5e  06.md
66d7213d26cf1bb44df27d1484dfb384cbe29254968c58aee5802fd12a981eeb  07.md
57cd35a13583dbc4060828d1ef5f3cf4755383fb731d5907ecf66487e1ff4d26  08.md
b8a626e59ff54d27406a00f79a8b04139edacb47dd69b122eecc07ee6fcbef1f  09.md
d8e2c91048e94b070dbf6358832ab659eb2395ed6f195815fa2c9b469342a68d  10.md
119fdb7d2516bad459d4237332a5212ec364d5b4595d69bcc26576b037f8ae1e  11.md
3fc6178b713678cea01332b655bac5ba827400a4291fbe026c8a73d919dfbf43  12.md
8eb000a3a0b48ec4dcbebc84869b418d367fc8613a51a335ab680d15b2a79e4a  13.md
94bd6148c1005914dd3139e6016cc9b2069ac8514ea21acbbb7a68fb02e0b80b  14.md
f5401b777a16d9ea1fd9ebc3bba71e7a35fb8bc69747aac3fbd2c1abab58ef6a  15.md
669560eae2a8ec8e22dfeb5f072305ea2739c1ac6d2ae72e4daeb59837fd14e2  16.md
b4eb8a3a29a6f7fee6cde0aa2b25562792e0baca653d4b66071d7aaaa62238a4  17.md
58cdf07661e145d84e29d5f247923a098f0c62b33aa356838ea7e9d86a9f40c8  18.md
c0ef2fb0e910841b7e55aa9b4a04d49216068ecc5e580b076de42ffff173360f  19.md
122b0e4c315abb53dc505a3689283245d2c47ae819fe50e1a3dd5ecc22c51ca8  20.md
bf1bc97e5a4192c525774bfcaa3c026793d98234991f6f9200845dcc2126fa29  21.md
ed470a466c352f1b0abdeeaa59561c49a864aaded2df6ebac16a86a4abf055e7  22.md
f6cf5757b5c6c80ba5febb540290cf929d1e1f9cb71dfb36b62e25749beef217  23.md
c78b3770987962dd7e3ceb424a0384bbfc9851ef03ddabfebdec6ab9f1c590d0  24.md
657217c2b797b7ca2d73addaf45977a6dabf5dc7a6f7d8bf321f9db01af11a5a  25.md
78fb24d8f999346814dcdda52f7f084d83403b3b9ef29d5f064846985ebb5e6c  26.md
855ad2166211432b451075f76b6bacfd3d65d0aeb75a329dd46665eccda5c292  27.md
4517f60717d6a81b1d3ffe438899d8276ebac542bcca67379e43ded8d1790e6a  28.md
b123ed6b5ed42286fd9d8161c060cc35a372095e764a63ca598f01dfba76ada8  29.md
38e6b737824f3c044de0c45ea579440c35cc26eb6019e3021c9f5d67af717e0e  30.md
3d9be791875ac412d8da02fc7b5fcb079ae87d0324a00442232a1a9ef255490a  31.md
f857236aa375a90e807589c9a560674b96b25330504dba0accde699b7904f87e  32.md
3d3939273d89d19294c4f2321d4836fa1f5ef7881e1be360f2cef6192e2173f2  33.md
b9b4fac871a3b8b71f6f40d1624198dbdb4bb38cf704e68cd0d776500d5b44fb  34.md
4809d9ca59cbad7293bd78c7c8af568847024eea572cab6822f6213103d1c819  35.md
e3b4b161d09223df3db6132c3d4bd84de011e5a8b49b1b7e23958b5d65582c95  36.md
ae225a0156534662a8d6bd0c4f7dba378e331e5c58bbf7f0af3455178c6d6b78  37.md
42bacdec6399ff32707d2e44efa1e793f9ee37123669e2003142ab62c2c0ddc8  38.md
f32fc7972df625ac6c3c05adc231896175a50c997dfd8d52c22086365818c2ee  39.md
a475fca91c8753ea933f725cfb77c92d58859b830544ff3da318336919b03fd8  40.md
f5049108596b4c6923567d5f06978d0cb2cd25f097e083fb35ff967674a7c7f7  41.md
8e5d3f21a89e000d56752b52787b85f7c93448fe1b2c014a7630c66178a5b579  42.md
8462ff995ee7f2dd1edee1fa87a0c5fff14d27b3d0cc4a811eaa43986a0bd012  43.md
b031c2c13a4ea10ccce353567ea19be4da3f80c55a39565a3196a4c953e2b463  44.md
33691f53aff3d4610f3e5c7ec0262ad6c2ce66bc27e8712075c9047b4eda09e9  45.md
8c6f3269aaa2197506270f1729602fd3f3c5689fdb11bca3ea07579290d87b83  46.md
baa0a1a5658e4621c50fad9d99c856174c8ce75b40a794c6cbc424b97c75ff24  47.md
514fa8a1b9776e0a9ee002f46554a3e99c586011b8dcfd3a1c1e8e05c1eafa55  48.md
93a47559f4fc0d917674400dc3e2bab58de034578546cf720b07b5af1315208f  49.md
01b968d791967da9ca345e406ad64632bc223da8e95b2bdf7647d2dde65fc0b8  50.md
```

**Conditions of use**, binding on every builder and every fixture:

- The TIPNR file itself is never committed or shipped: a pack carries only what is extracted from it, and the fixtures in
  the repository are small subsets. Its header asks "please do not post copies of this data file elsewhere".
- TIPNR's `@Brief`, `@Short` and `@Article` fields are left out: an AI wrote them (Claude 3 Opus, April 2024). Its column
  of translated names follows the ESV spelling and is not used for any name a reader shows.
- From Theographic, no Easton text (`dictText`, `dictionaryText`, `easton.json`: CCEL asks for permission to republish)
  and no dates or chronology (they come from Floyd Nolen Jones's book, whose license is not confirmed). Its verse references (the OSIS of `verses.json`)
  are read as the original's (UHB) numbering, with no conversion. Its tables link by Airtable ids (`rec…`); verses join through `verses.json`.
- No derived work carries the unfoldingWord® mark: a derived work's own name and title never contain it. Naming the
  original source by its own title (for example "unfoldingWord® Translation Notes" in a catalog's `resources`) is a
  citation of that source, not a name of ours, and is allowed.

**Left out.** Nave's Topical Bible: no clean digital edition was found. CCEL restricts republishing, the SWORD module comes
from CCEL, and the CC BY CSV of `BradyStephenson/bible-data` does not say which edition it comes from. Abel left it out
on 2026-11-02 ("deja Nave fuera").

The sample also lists other resources (Berean Standard Bible `Worldview/en/bsb`, Translation for Translators
`unfoldingWord/en/t4t`, the lexicons `ugl` and `uhl`, `ult`, `ust`, `tq`, `gst`): the maps do not count them.
