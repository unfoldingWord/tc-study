# Phase 3 local run (Task 13), round 2: result OK with a reduced en

Base 335f413e. Scratch folder `C:/Users/LENOVO/Git/Github/wt/lp3-phase3-local2/` (parts union, bucket, work dirs, logs, `es-419.tcpack`).
Key generated for the run, deleted. Server (th-v3-publish `scripts/packs-v3-local.ts`, 127.0.0.1:8790) stopped.

## Earlier run (5 books, folder `lp3-phase3-local/`)
`en --books tit,rut,psa,mat,1ch` published (common rev 1 a2aba46f..., en rev 1 bc1c8f6a..., 56 segments, 36 s); verify en failed only on the fixed query
`ruth-keyterms` (answer tw:kt/faithful, expected tw:kt/yahweh); es-419 was not published (17 parts missing from muestra/parts).

## Round 2: what could and could not be done
- Parts folder = union of `muestra/parts`, `parts-real/parts` (the 17 es-419 parts) and `fase2b-fuentes/aligned/parts` (111 en parts): 0 es-419 parts missing.
- en WITHOUT `--books` is not possible on this machine: `muestra/en/list.json` names 595 parts and 288 are on no disk
  (bsb 62, t4t 61, tq 55, tn alignments 55, twl alignments 55; ult/ust are complete). publish-v3 stops at the first (`Part 007fdf46... is neither in ... nor in the bucket`).
- `--books` 5 gives a common without orig:neh, so es-419 fails (`common catalog lacks orig:neh`).
- What was run: en with a copy of the en list reduced to the 307 parts that exist (all originals, ult/ust all books, the other resources for the five
  books); no source change. This common holds all 66 originals, so es-419 publishes. It is NOT the real common catalog: the en resources other than ult/ust are partial.

## Results (all with `--aligned --topics fase2b-fuentes --sign-key`, `--pubkey` for verify)
- publish en: `published`, 188 s, 386 segments uploaded. common rev 1 id 2f4e21dbe78483194c9131d66a1a62e30e307c59cb12578573f5a1378fe11abe;
  en rev 1 id 5ed6efaaea659b80f69e619e2cc266fa73b9859a22121521e74370be94a59017.
- publish es-419: `published`, 17 s, 56 segments uploaded (57 segments, 5097.5 KB built). es-419 rev 1 id ecb52fd0e770ca27c8781bce8b42472222b25eab31a6e4f0bde1e3ac53d86e77.
- Bucket: 447 files, 38554769 bytes. Catalogs: common 14544, en 16314, es-419 5470 bytes.
- verify-v3 en: `ok:true`, 386 segments, 24328667 bytes, 258 s. verify-v3 es-419: `ok:true`, 238 segments, 12755792 bytes, 137 s.
  Fixed queries: 1 asked, 9 left out for both (the catalogs do not hold the books of the others, ruth included), so `ruth-keyterms` was not asked: the
  question of the 5-book run stays open (nothing shows whether TS, Python or the expected file disagrees).
- Second publish, unchanged: en `unchanged` 392 s, es-419 `unchanged` 21 s, 0 uploaded; sha256 of the 447 bucket files identical before and after.
- Transfer: `export --mode full` of es-419 v3-out: 1 catalog, 56 segments, 5224787 bytes; `import` into an empty folder: complete, 0 missing/rejected;
  the imported folder equals the build byte for byte (diff -rq: only report files are only in the build). `spec/tests/compare.ts --built`: 60 files, 0 mismatches
  (it compares the sample's cases and its own built segments, not the imported folder).
