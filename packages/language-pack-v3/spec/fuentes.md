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
| STEPBible TIPNR (`STEPBible/STEPBible-Data`, `Proper Nouns/TIPNR - Translators Individualised Proper Names with all References - STEPBible.org CC BY.txt`) | the commit of 2026-10-24 (message "24-Oct-2026"); no releases. The hash is written here when the file is downloaded | CC BY 4.0 (README, file name and header). Credit: "STEP Bible", linked to www.STEPBible.org, with the changes made | About 3 100 people and 1 000 places: their verses, their family and tribe relations (places: founder, inhabitants), and the Strong keys of each name (uStrong, dStrong, eStrong) | `xmap` (`concepts`, `relations`), the topics module | approved by Abel (2026-11-02) |
| Theographic Bible Metadata (`robertrouse/theographic-bible-metadata`) | a pinned commit (no releases or tags): the last of master is of 2026-10-23, the last that touches `json/` of 2026-10-13. The hash is written here when downloaded | CC BY-SA 4.0 (LICENSE file). Its README asks to cite the original sources too (`docs/data-source-bibliography.md`) | **Events only** (about 450): participants, places, `partOf`, `predecessor` and verses. People and places come from TIPNR, which Theographic partly derives from | the topics module | approved by Abel, events only |
| English OBS (`unfoldingWord/en_obs`) | v9 (2023-03-03) | CC BY-SA 4.0. Attribution: "The original work by unfoldingWord is available from https://openbiblestories.org" | **The story references only**: the closing line `_A Bible story from: …_` of each of the 50 stories (story 50 has several, separated by `;`). No text, no images (the images are Sweet Publishing's, CC BY-SA 3.0) | the topics module (`obs:` stories and their verse ranges) | approved by Abel, references only |

**Conditions of use**, binding on every builder and every fixture:

- The TIPNR file itself is never committed or shipped: a pack carries only what is extracted from it, and the fixtures in
  the repository are small subsets. Its header asks "please do not post copies of this data file elsewhere".
- TIPNR's `@Brief`, `@Short` and `@Article` fields are left out: an AI wrote them (Claude 3 Opus, April 2024). Its column
  of translated names follows the ESV spelling and is not used for any name a reader shows.
- From Theographic, no Easton text (`dictText`, `dictionaryText`, `easton.json`: CCEL asks for permission to republish)
  and no dates or chronology (they come from Floyd Nolen Jones's book, whose license is not confirmed). Its verses are in
  KJV versification (the OSIS of `verses.json`): a builder converts them to the original's numbering and lists the ones
  it cannot convert. Its tables link by Airtable ids (`rec…`); verses join through `verses.json`.
- No derived work carries the unfoldingWord® mark.

**Left out.** Nave's Topical Bible: no clean digital edition was found. CCEL restricts republishing, the SWORD module comes
from CCEL, and the CC BY CSV of `BradyStephenson/bible-data` does not say which edition it comes from. Abel left it out
on 2026-11-02 ("deja Nave fuera").

The sample also lists other resources (Berean Standard Bible `Worldview/en/bsb`, Translation for Translators
`unfoldingWord/en/t4t`, the lexicons `ugl` and `uhl`, `ult`, `ust`, `tq`, `gst`): the maps do not count them.
