# Phase 3 local run (Task 13): result FAILED, partial

Base 3053c5ee. Scratch folder `C:/Users/LENOVO/Git/Github/wt/lp3-phase3-local/` (logs, bucket, work dirs). Key generated for the run, deleted.

## Done
- publish `en --books tit,rut,psa,mat,1ch` (signed, aligned, topics): `published`, 36 s. 56 segments uploaded.
  common: revision 1, id a2aba46f4799fe3b40fd36d7b842c74af6b4f36a099414de27c2198faf877afb.
  en: revision 1, id bc1c8f6ab33d76a844391b08e3b7044145d7f359041bbfcebfd7b00173319ab5. Bucket: 59 files, about 9 MB on disk (4569679 bytes of segments).
  Catalog sizes: en 3997 bytes, common 2540 bytes.
- local server (th-v3-publish `scripts/packs-v3-local.ts`, 127.0.0.1:8790): up after about 20 s; stopped afterwards.
- verify-v3 en (with `--pubkey`, `--built`): 43 s, exit 1. All checks ok (signatures, sizes, 56 segments, 58 files equal to build, 304, 206, both
  readers agree) except fixed queries: `ruth-keyterms: $.candidates[0].concept: answer "tw:kt/faithful" / expected "tw:kt/yahweh"`.
- second publish of en: `unchanged`, 57 s, 0 uploaded; sha256 of the 59 bucket files equal before and after.

## Failed / not done
- publish `es-419`: exit 1 at once: `Part 0aceb455...f6f0 is neither in .../muestra/parts nor in the bucket` (alignments, es-419_gl/es-419/twl, 3jn).
  The sample `es-419/list.json` names 82 parts, 17 are not in `muestra/parts` (alignments tn/twl for 3jn, jon, ...). So es-419 was not
  published, and steps 3 (es-419), 4 (es-419) and 5 (transfer export/import, compare --built) were not run.
- The fixed query failure may come from the 5-book subset (ruth key terms) or be a real divergence; not investigated (no source edits).
