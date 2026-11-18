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
| STEPBible TIPNR (`STEPBible/STEPBible-Data`, `Proper Nouns/TIPNR - Translators Individualised Proper Names with all References - STEPBible.org CC BY.txt`) | commit `be4191f0082aeedddb0eff0c02c966292b2bd641` of 2026-10-24 (message "24-Oct-2026"); no releases. sha256 of the file: `d595b9163d32a400bb0ef96b27a6de58335a63da840b82531fe9f5e1d16a318c` | CC BY 4.0 (README, file name and header). Credit (catalog `attribution`): "STEP Bible", linked to www.STEPBible.org, and says the data was changed (extracted, re-keyed, reduced) | About 3 100 people and 1 000 places: their verses, their family and tribe relations (places: founder, inhabitants), and the Strong keys of each name (uStrong, dStrong, eStrong) | `xmap` (`concepts`, `relations`), the topics module | approved by Abel (2026-11-02) |
| Theographic Bible Metadata (`robertrouse/theographic-bible-metadata`) | commit `744355c7a5f38efd407bc67a5257c99aca9532bc` (master, 2026-10-22 20:49 -0500 = 2026-10-23 UTC), the last of master on or before 2026-10-23; no releases or tags. sha256: `events.json` `ca1005dbf96231fbbe328d6fdd9a3fe2ab7d616e97d8283f36aef763cc7dfc27`, `people.json` `5f0f259ea0b2acb94aeea02d0f1bd3e771adbcb3451cf5f93d32fb090a0c1a1c`, `places.json` `f7b02819fcea85f4faf04710b026c554abac54168573c9327a22a9cd6e267d6e`, `verses.json` `a82fe1322125ae57448abb87b0057b146e9c3000dae45dd00e9aa7b0cef45bfa` | CC BY-SA 4.0 (LICENSE file). Its README asks to cite the original sources too (`docs/data-source-bibliography.md`): the catalog `attribution` says what was changed (events only, extracted, re-keyed, reduced) and cites that file by reference, at commit `744355c7a5f38efd407bc67a5257c99aca9532bc` | **Events only** (about 450): participants, places, `partOf`, `predecessor` and verses. People and places come from TIPNR, which Theographic partly derives from | the topics module | approved by Abel, events only |
| English OBS (`unfoldingWord/en_obs`) | tag v9, commit `d39a1dc7a7557ac54e4a8fecc3462147fe7eec3b` (2023-03-03), from `https://git.door43.org/unfoldingWord/en_obs` (not on GitHub); `content/01.md` … `50.md`, per-file sha256 in the list below | CC BY-SA 4.0. Attribution: "The original work by unfoldingWord is available from https://openbiblestories.org" | **The story references only**: the closing line `_A Bible story from: …_` of each of the 50 stories (story 50 has several, separated by `;`). No text, no images (the images are Sweet Publishing's, CC BY-SA 3.0) | the topics module (`obs:` stories and their verse ranges; never their titles: the xtopics `title` of an `obs:` id is "") | approved by Abel, references only |
| Bible Story Builder (`bcv-commons/bible-story-builder`) | commit `c07d45395d01b987c31f4e06871314f129c975e8` (2026-10-31, message "we now write \"Tanakh\" ..."); no releases. `templates/OBS/<category>/<story>.md`, per-file sha256 in the list below (the bytes GitHub serves) | MIT, "Copyright (c) 2024 unfoldingWord Box3" (`LICENSE`); the whole notice travels in the catalog resource's attribution | **The verses of each OBS frame only**: the `[[ref:...]]` tags after each `obs-en-SS-FF.jpg` picture, read as verse ids (`src/source/obsFrames.ts`). Its titles, locales, audio and the other templates (TGS, John, DBS) are not used | `xtopics` core (`obs-frames`) | not in the sample (a test builds a synthetic set) |
| ACAI (`BibleAquifer/ACAI`) | commit `5375d0d334bb6d635ef1813e4d3df58eb30efcca` (2026-11-06); no releases. The 3 426 files of `people/json/`, checked by the sha256 of their manifest (the sorted lines `path<TAB>sha256 of the file`): manifest sha256 `9ba49ab18be3a8feb01e467d537d464d7e7bcc4a33a85fe1330f5a58aac38633`; the file the builder reads (`acai/people.json`, made by `src/source/acai.ts` `trimAcai`): trimmed file sha256 `84d1f2dc8946a80c2d8d1cb9f5f54baf22dba3c38f331c39fed3f1be3f662ff4`. Both are pinned in `cli/topic-sources.json` of `resource-pipeline` | CC BY-SA 4.0, "ACAI Biblical Entity Data © 2024 by BiblioNexus" (`LICENSE.md`). Credit (catalog `attribution`): "ACAI Biblical Entity Data © 2024 BiblioNexus (https://github.com/BibleAquifer/ACAI), CC BY-SA 4.0. Changed: only the gender, the names and other names in six languages and the uW Translation Words titles of the people were read, joined to TIPNR" | **People only**: gender, preferred label in eng, spa, fra, ind, hin, arb, alias records, and the tW article titles (`ids.md`, "People of ACAI"). Not its descriptions, word lists, references, roles, tribes, places or relations | `xtopics` core (`gender`, `same-as`), `topics` core of a language (`people`) | approved by Abel (2026-11-18, `handoff/diseno-parentescos.md` §8) |
| Spanish (es-419) book names (`packages/resource-pipeline/data/book-names/es-419.json`) | written by Claude (2026-11-16), no outside source; the names of the books the es-419 GLT gives (`\toc1`..`\toc3`: Rut, Ester, Jonás, Tito, 3 Juan) are copied, the rest follow its style ("La carta de Pablo a los …", "El libro de …") with the short names and abbreviations usual in Latin American Bibles | none: our own list of 66 book names, no text of a Bible | The 66 names `[name, short, abbreviation]` | the language map (`bookNames`, source `list` for a book whose text has no `\toc`) | pending Abel's review |

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

**sha256 of the Bible Story Builder files** (`templates/OBS/<category>/<story>.md`, commit `c07d4539`; LF as GitHub serves them, no CRLF conversion):

```
618aff8cae3d1f45ab94bf1491bc57f5a9c74e6bf6840edc74738a7e5d55aeb9  01/01.md
a7b0c22f8022f43e3292023c292fd2f35211e2aeee0eab8d3d3a65eccf97d98a  01/02.md
1866d118f5e351280cc3cb486c6414cfbcf48f1058790edbf8c69c003ad4e1ad  01/03.md
a11f6690341a6d899447245c4a1d4820cb6a2f6bd6cb71615d87ea2167b60250  02/04.md
b6eba1f8b2f62c67828974d5374ce1b0ad37c0622081dce8d33d1508d86bed42  02/05.md
3f84a8dc4aa5d550d9fe39e7cd2cdf25b7daec8f5d1b5a3b820bda9e1d9ba6fb  02/06.md
4b92515399ae8b640ee8d185b611e22119c932d3c2592241745351af1fbaebe2  02/07.md
bf0a77e19cc62f1e59deb1bf7b3b09e11d19e23b51e0a120299939ca32e5625e  02/08.md
9d8552ba61c498255608dde71be55259bacf5f0b7fc1158f0996ce9e4da574ae  03/09.md
0569fbabd0f9af1d1dc23c2da27662874cec1e5e13dc5737fc81fc79427d2b13  03/10.md
344c9034ecf239a1afce0f8b9e95dd043a530a1f02357469d0bb08f5b94c8b2a  03/11.md
3c977cc127eafdf991821b04744715d4e17faf59bed39aa5cfb80e85796f0c72  03/12.md
04a2929717c92c00eae912f0147b222c7646ddc2f923406987cd05dfa7cc5579  03/13.md
f10b3ef52642067118f00bdfb40fdc8a0eb36aa94e466e59c3d4fa4ee9c3e6ce  03/14.md
5b8479a25eb330da67bde3a6e6602d7a3f672231df04642810e5638748d8a651  04/15.md
de377261e677f7d86011cd8424f4cd9690365763c21ef4f1d30e72cef2d7723c  04/16.md
db1ee17d3315e1243e93616ff2d7655956265a5bf3d0ebd0844c18e26d8790db  04/17.md
24016e70322add4ab7b1b2e302b1ccbbfe2031ba8a7a7d035d3dd5d938451331  04/18.md
65a836fabeacc0c3ee81013a22744bc0d6926a1c298434dabd831e29baba90b4  04/19.md
d3b56c0bdf6454c0971d1c24ecb06d69bc4d438f4d93911480e7129e40fa87f3  05/20.md
fac23f02124b4c752ec478c4431c815dd2b69c7402916292e6c85d5a8c563fe7  05/21.md
11fca9cd18719a535ce31ccfe82df6ec0db08adfa7609a1f1b8987e4b56dcf4c  05/22.md
1ae14b32b938be558bb56f46c4a8f5d975b70f7c89301c98018c590b36480319  06/23.md
7820d454b0ce43cb59f0089b37a4d98b60d989ffe241eab1ad5d59bf5485d1aa  06/24.md
0590ebabb3f93aa284f9b15474eb8e4a77ff040ac9df1e97a43589c68440f240  06/25.md
bf26021c55df226632046810cc36e49ca99cfaec3f128c001fe0992c36daa2b5  06/26.md
58e50afe187031bd349b6d8cc7797e89c7803450c2ed236809bc6f1f42397732  07/27.md
1560f1356602f274735585231a9191795386ec9c0777121e9fbb70fcfef7e918  07/28.md
d7940f22098bd11cc4444e7f615e5899c3ef43f5f8a3333f3a3aeef12c867b8e  07/29.md
68d0b718a0a6d39561ceee5868d4c5ecc45e9113ab6a5bad96070cce2cd95bc7  07/30.md
89bd975b710436cc68ad21300ec162081df750b80db16e512c86f772bf3a629d  07/31.md
3e875d31de32fe8fd262ed41250628df4d0917fa4c9385b1d8f96d50ba48bbe3  07/32.md
ae9419c1171acd58c3e2656c8870aa34ac3762bf1cf554778572458a65c8d5fd  07/33.md
b26ebbf54e5ae5919fdbe1c4f84edfd8cde2c5ab148b35e1db0920b57b2e415b  07/34.md
63417bf6d7a5ecd995f6fc259af1ed19fa7544059c4fd0c0b5509f61b79bbfee  07/35.md
7d3607f1060a43fac74053e019c494d4cedd53fd8ae969412d4f167a0a693f50  08/36.md
2ac729402169362248758a1ba1e1da1268c4dd439aa36be0f18ea648fcd41d58  08/37.md
925835e96e2424efef9e7b27d85925b4cfa743cd8afdbc271188c8cfaedf189a  08/38.md
10b1ba418fab59472ed281f8e46b7e56f0e11935d0f97ff8fb066e8a70b54d5e  08/39.md
c72bfb5b837cd9233f1cdb82f3441f95f646a00fabe68911734d90bf0ad52dfd  08/40.md
791b3d718d235436cacd10de00322a1c166abb133f461b6e5b945f68630bc538  08/41.md
f9cd326da14586dc82093916a093cf4fbbbd2a38eeef375783cbafaf475bb1d9  08/42.md
cd9fc708eccf2429a58c0e03a26bb2750cc915b43f6f138f8bd67fdb2db7e828  09/43.md
2bcb26a5c0ef9233a85305020cbec72f8a5b2a4294362c5bc1ad23767b008095  09/44.md
c39f4eab4c5bbe0b4a310bc722b3107dcbe584ce3ccca8d99c1a1f7ef2d37946  09/45.md
f09e1e93671c5b89fdff28c900131100547f5aca52fdb622a9d72ccf72359e31  09/46.md
820d5e5ea3d1356d85778c1be82464b5b2829d171c0e32345dbd9902295daccb  09/47.md
f881b84dfc7e1850d324a59d99008d036190dc424b1080a136cfe8d3fd8c65b0  10/48.md
cec87efe7d9b615420c923fba861964fee1f60a89f6dd82a88a366e846bf622f  10/49.md
7f1540afbc10fec70535ae1b8d7ed58550711c25bc6134617e425629f2bcb778  10/50.md
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

## OBS Theological Formation (5M)

| Source | Version or release | License | What it gives | Table | Status |
| --- | --- | --- | --- | --- | --- |
| OBS-TF (`unfoldingWord/en_obs-tf`) | v4 (Door43 production, 50 stories) | CC BY-SA 4.0 | The Five Movements session of each story: questions, translation terms, shared blocks, framing text | `tf-parts`, `tf-questions`, `tf-terms`, `tf-shared`, `tf-frames`, `tf-framework` | built (staging) |
| OBS-TF Indonesian (`unfoldingWord/id_obs-tf`) | v0.1.0 (tag; commit `f0219a72`; 16 of 50 stories) | CC BY-SA 4.0 (its manifest) | The same, converted from Indonesian PDFs into Door43 markdown; the frames, titles and images are the `obs` unit's (`bahtraku/id_obs`) | the same | draft |

The credit line is «unfoldingWord and Formation Stories». The method's framing text (`overview.md`) follows the license
of the manual: Abel said on 2026-11-17 that the license is open and to go on («La licencia es abierta, puedes seguir
trabajando»). The frames, titles and images are not taken from here but from `obs` (`en_obs` v9). A derived work never
carries the unfoldingWord® mark. `id_obs-tf` (latest, 16 stories, no release) is not read until it has a release.
