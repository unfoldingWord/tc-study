# Sources of the maps

Every source the maps are built from. Versions and licenses come from the `metadata` of the phase 0 sample lists
(`en/list.json`, `es-419/list.json`, `originals/list.json`); "to confirm" means the source does not say. The release
of each source is kept in the core of the maps and in the catalog, never in a part (`cddl/map.cddl`).

| Source | Version or release | License | What it gives | Map | Status |
| --- | --- | --- | --- | --- | --- |
| UHB (`unfoldingWord/hbo/uhb`) | v3.0.0 | CC BY-SA 4.0 | The Hebrew and Aramaic text, with Strong keys | `xmap` (`strong`), `orig` | in the sample |
| UGNT (`unfoldingWord/el-x-koine/ugnt`) | v0.34 | CC BY-SA 4.0 | The Greek text, with Strong keys | `xmap` (`strong`), `orig` | in the sample |
| MACULA (`Biblica/hbo/macula`, `Biblica/el-x-koine/macula`) | 3b8aa380e8 (2026-10-15) | CC BY 4.0 | Syntax trees and referents of the original | `orig` (not counted in the maps) | in the sample |
| English tN (`unfoldingWord/en/tn`) | v91, 59 books | CC BY-SA 4.0 | English notes: which Academy article each points to | `xmap` (`notes`, `strong` of quotes) | in the sample |
| English tWL (`unfoldingWord/en/twl`) | v91, 59 books | CC BY-SA 4.0 | English word links: which tW article each original word points to | `xmap` (`links`, `strongs`, `concepts`) | in the sample |
| tW (`unfoldingWord/en/tw`) | v91 | CC BY-SA 4.0 | Translation Words articles: the concepts and their category (`kt`, `names`, `other`) | `xmap` (`concepts`), `map` (`names`) | in the sample |
| tA (`unfoldingWord/en/ta`) | v91 | CC BY-SA 4.0 | Translation Academy articles and their titles and questions | `xmap` (`notes` keys), `map` (`names`, `subtitles`, `usage`) | in the sample |
| es-419 resources (`es-419_gl/es-419/` glt v42, gst v40, tn v66, tq v38, tw v37, twl v18, ta v4) | as listed | CC BY-SA 4.0 | The language's own books, notes, word links and articles | `map` (`books`, `names`, `subtitles`, `coverage`, `usage`) | in the sample |
| STEPBible TIPNR | to confirm | CC BY 4.0 | People, places and their relations, with the verses | `xmap` (`concepts`, `relations`, `topics`) | needs Abel's approval and a download |
| Theographic Bible Metadata | to confirm | CC BY-SA 4.0 | People, places, events and their relations | `xmap` (`concepts`, `relations`, `topics`) | needs Abel's approval and a download |
| English OBS | to confirm | to confirm | Open Bible Stories in English, the story and frame references | `xmap` (`concepts` of kind story), `map` (`obs`) | needs Abel's approval and a download |
| Nave's Topical Bible | to confirm | Public domain | Topics with their verse references | `xmap` (`topics`) | needs Abel's approval and a download |

The sample also lists other resources (Berean Standard Bible `Worldview/en/bsb`, Translation for Translators
`unfoldingWord/en/t4t`, the lexicons `ugl` and `uhl`, `ult`, `ust`, `tq`, `gst`): the maps do not count them.
