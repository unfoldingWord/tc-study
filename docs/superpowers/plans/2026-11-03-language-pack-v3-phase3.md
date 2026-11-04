# Language packs format 3, phase 3: publish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The packs Worker serves format 3 next to format 2.0 (`/v3/packs/{lang}/catalog`, `/v3/packs/common/catalog`, `/v3/packs/seg/{id}`), the pipeline builds and uploads format 3 in the same run as the 2.0 parts, catalogs are signed, a transfer file can be exported and imported, and what is published is checked with both readers — all proven locally first, then in staging one approved step at a time.

**Architecture:**
- **Two repositories, two worktrees.**
  - translation-helps-mcp: `C:/Users/LENOVO/Git/Github/wt/th-v3-publish`, branch `feat/packs-v3-routes` from `uw/v2` (`f9752707`). The 2.0 packs code (`src/api/routes/packs.ts`, `src/packs/`) is on `uw/v2`, not on `origin/main`, so the worktree starts there.
  - bt-synergy (remote `unfoldingWord/tc-study`): `C:/Users/LENOVO/Git/Github/wt/lp3-publish`, branch `feat/language-pack-v3-publish` from `feat/language-pack-v3-phase2` (`959533cc`).
- **The Worker only reads.** A new route file serves catalogs and segments from the existing `LANGUAGE_PACKS` R2 bucket under the prefix `v3/`, behind a switch `PACKS_V3` (on in staging and previews, off in production). It never dispatches a build.
- **The pipeline writes.** A new step after the 2.0 parts build runs `build-v3` on the parts the run just made, and uploads segments first and catalogs last. A failure of the v3 step never changes the 2.0 outcome.
- **Local first.** A directory stands in for R2 (same keys), a small Node server runs the Worker's real route over that directory, and `verify-v3` downloads everything over HTTP and checks it with both readers. Staging uses the same three commands against the real bucket and a Worker Preview.

**Tech Stack:**
- translation-helps-mcp: TypeScript, Cloudflare Workers, vitest (`npm test`).
- bt-synergy: Bun, TypeScript, `bun test`, `@bt-synergy/language-pack-v3`, `@bt-synergy/resource-pipeline`, GitHub Actions.
- The Python 3.11 reader with the standard library only (`spec/reader-py/lp3read.py`).

**Spec:** `packages/language-pack-v3/spec/` in the bt-synergy worktree, as phase 2 part C left it, plus **`spec/serving.md`**, written with this plan: the HTTP contract, the R2 keys and the upload order. The spec is the authority; where this plan and the spec disagree, the spec wins and the controller records a ruling. The source of the phase is the section "Fase 3: publicar" of the proposal document (tab Plan, steps 3.1 to 3.6).

**Earlier phases:** phase 1 and 2 ledgers and their Global Constraints are in `C:/Users/LENOVO/Git/Github/wt/langpack-v3/.superpowers/sdd/` (folders `2026-11-01-…-phase1`, `…-phase2`, `…-phase2-partB`, `…-phase2-partC`).

## Scope

In this phase (steps 3.1 to 3.5 of the proposal):

| Step | Part |
| --- | --- |
| 3.1 Routes in the Worker | A: Tasks 1–2 |
| 3.2 The pipeline builds and uploads format 3 | B: Tasks 3–8 |
| 3.3 Signatures | C: Tasks 9–11 |
| 3.5 Transfer file, export and import | D: Task 12 |
| 3.4 Staging, both readers | E: steps S1–S6, each waiting for Abel's yes |

Not in this phase:
- **3.6 Production.** The production Worker keeps `PACKS_V3=off`; nothing is published to the `language-packs` bucket; the workflow refuses a v3 publish to production.
- **The C2 complements** (classifiers, language detector, CLDR numbers) that step 3.2 also names: C2 has not been built. When it is, its upload is a small task on top of Task 5 (the complement kind already exists in `catalog.cddl`).
- **Deleting unnamed v3 segments.** They stay; a v3 cleanup is a later task (open item, `serving.md`).
- **Starting a build from a v3 request.** A v2 request starts the run that builds both (`serving.md`).

## Decisions for Abel before this runs

1. **Signature rules (Part C).** The spec fixes the algorithm (Ed25519 over the catalog's 32-byte id) and leaves the rest to phase 3. Proposed:
   - `sig.key` is the first 16 hex digits of the sha256 of the 32-byte public key.
   - A reader with **no** trusted keys ignores `sig`, as today. A reader **given** trusted keys rejects a `published` catalog with `E_SIGNATURE` when `sig` is missing, malformed, from an unknown key, or does not verify. A `local` catalog is never signed and never rejected for it.
   - The reader output gains `"sig": {"key": …, "valid": true}` only when the reader was given keys.
   - Abel creates one key for staging and, later, one for production, outside the repositories, and loads the private key as the secret `PACKS_V3_SIGNING_KEY` (PKCS#8 PEM) of the GitHub Environment `packs-staging`. Claude never sees it. The public key (raw 32 bytes, hex) is committed under `packages/language-pack-v3/keys/`.
   - If Abel prefers, Part C waits and catalogs go to staging unsigned: Tasks 9–11 are then skipped and S4 publishes without `--sign-key`.
2. **The transfer file's extension and name** (open item in `spec/README.md`, "before the builder publishes"). Task 12 uses `.tcpack` unless Abel picks another.
3. **The MACULA licence** (open item, "before the common pack is published"). The common catalog goes to **staging** in S4; the plan assumes staging is not "published" for this item. If Abel disagrees, S4 publishes only the language catalogs' segments that do not need MACULA, which in practice means waiting.

## Global Constraints

Everything in the phase 1 and phase 2 Global Constraints still holds (`C:/Users/LENOVO/Git/Github/wt/langpack-v3/.superpowers/sdd/2026-11-01-language-pack-v3-phase1/global-constraints.md` and the phase 2 ones). In addition:

- **Branches.** translation-helps-mcp: `feat/packs-v3-routes` in `wt/th-v3-publish`. bt-synergy: `feat/language-pack-v3-publish` in `wt/lp3-publish`. Never touch `C:/Users/LENOVO/Git/Github/translation-helps-mcp` (it has someone else's uncommitted changes), the shared bt-synergy checkout, `wt/langpack-v3` or `wt/lp3-client`.
- **Commits** in English, a title and a body that says why, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Local only: no push, PR, merge, deploy or upload without Abel's yes.
- **No secrets.** No key, token or credential in a file, a commit, a log or a brief. Tests generate their own Ed25519 keys at run time. R2 credentials and the signing key come from the environment only.
- **Production is not touched.** `wrangler.toml` `[env.production]` gets `PACKS_V3 = "off"`. No command in this plan writes to the bucket `language-packs`. The workflow refuses `target=production` for v3.
- **The 2.0 path does not change.** No change to `/v2/packs`, to `src/packs/*.ts`, to `publish-language.ts`'s outcomes or exit codes, or to the 2.0 upload order. A v3 failure never fails the 2.0 step. The existing test suites of both repositories pass unchanged.
- **R2 keys and HTTP answers are those of `spec/serving.md`**, verbatim: `v3/seg/{id}.seg`, `v3/catalog/{lang}.seg`, `v3/catalog/common.seg`, `v3/registry/{lang}.json`; the headers, statuses and JSON bodies of its tables.
- **A segment's id is the sha256 of its uncompressed body** (`container.md`), not of the file. Every check that compares a download with a build compares ids **and** file bytes.
- **External sources** (`spec/fuentes.md`): the TIPNR file and every other source file is never uploaded, committed or copied into an upload folder; only builder output is. Pinned commits and sha256 values are those `fuentes.md` gives.
- **The common catalog** is built over all 66 books and published only by the run of the map language (`en`). Other languages build against the published common catalog (Task 3). `--books` on the common catalog is for local tests only.
- **Revisions.** Each catalog's `about.revision` is one more than the published one, `about.previous` is the published id; a build whose catalog equals the published one apart from `about` uploads nothing for that catalog.
- **Tests.** translation-helps-mcp: `npx vitest run <file>`; bt-synergy: `bun test <file>` in the package. Implementers send full output to a file and read only the summary (`.claude/lp3-controller.md`). The cross-reader checks run with `LP3_PYTHON=C:\Users\LENOVO\Git\Github\wt\lp3-venv\Scripts\python.exe`.
- **Real data** for local runs: `C:/Users/LENOVO/Git/Github/wt/fase0-paquetes/muestra` (`en/list.json`, `es-419/list.json`, `originals/list.json`, `parts/`). Topic sources: the `LP3_SOURCES` folder phase 2 part B used (its path is in that part's ledger).

## Review Focus

1. **A v3 catalog or segment under a key the 2.0 cleanup reads** would abort every cleanup run or be deleted (`src/packs/cleanup.ts` treats any `f3.*` folder under `catalog/` as a parts compat and deletes unnamed `parts/*`). Task 2 adds a cleanup test with v3 keys in the fake bucket: cleanup names nothing under `v3/`, deletes nothing under it and does not abort.
2. **A run cut short** (network drop, cancelled job) between segments and catalogs must leave the published catalogs pointing only at segments that exist. Task 4 tests a bucket that fails on the Nth put: the catalog is not written, and a second run completes it.
3. **The language run before any common catalog exists** (es-419 published before en). Task 3/5: the v3 step reports `skipped: no common catalog`, exits 0 for the workflow, writes nothing, and the 2.0 outcome is unchanged.
4. **Same inputs, second run**: nothing is uploaded and no revision grows. Task 4 tests it; S5 repeats it in staging.
5. **A segment served with altered bytes** (a proxy recompressing, a `Content-Encoding` added): Task 1 asserts the route sends no `Content-Encoding` and `no-transform`; Task 7's `verify-v3` checks every downloaded file's id and length against the catalog and the local build.

## Execution with specialized agents

As in phases 1 and 2 (`.claude/lp3-controller.md`, copied into both worktrees):

| Agent | Model | Use |
| --- | --- | --- |
| `lp3-implementer` | sonnet | one task or fix round, from its brief file |
| `lp3-reviewer` | sonnet | one task's review, from brief, report and diff |
| `lp3-runner` | haiku | any test or build run the controller needs |
| final reviewers | opus | three in parallel at the end |

- **One controller** runs the whole plan; it works in both worktrees by absolute paths and names the worktree in every brief. Tasks 1–2 are translation-helps-mcp; Tasks 3–12 are bt-synergy; Task 13 runs both. No two implementers run at once.
- **Ledger:** `C:/Users/LENOVO/Git/Github/wt/lp3-publish/.superpowers/sdd/2026-11-03-language-pack-v3-phase3/progress.md`, with `plan-path` and `global-constraints.md` (this plan's section, verbatim) beside it. Briefs, reports and review diffs go in the same folder.
- **Handoffs** after 3 or 4 tasks (`RELEVO`), as `lp3-controller.md` says. Expected relevos: after Task 3, Task 7, Task 11.
- **Codex** reviews read-only, after its task's own review: Task 1 (the route against `serving.md`) and Tasks 9–10 (signing and the Python Ed25519 check). Recipe: `C:\Users\LENOVO\.claude\projects\C--Users-LENOVO-Git-Github-servos\memory\codex-cli-windows.md`.
- **Final review:** three Opus reviewers in parallel: (1) translation-helps-mcp, Tasks 1–2, against `serving.md`; (2) the pipeline, Tasks 3–8 and 12; (3) spec, signing and readers, Tasks 9–11, plus `serving.md`. Each gets its part of the diff, the ledger's deferred items and the rulings.

---

## Part A: the Worker (translation-helps-mcp, `wt/th-v3-publish`)

### Task 1: The `/v3/packs` routes

**Files:**
- Create: `src/api/routes/packsV3.ts`
- Modify: `src/worker.ts` (mount next to the `/v2` packs prefix, `:243-251`), `wrangler.toml` (`PACKS_V3` in the top level `[vars]`, `[previews]`, `[env.preview]`: `"on"`; `[env.production]`: `"off"`)
- Test: `tests/unit/packs-v3.test.ts`

**Interfaces:**
- Consumes from `src/api/routes/packs.ts`: `PacksEnv`, `normalizePackLanguage`, and its header helpers (`parseIfNoneMatch`, `parseRange`, the CORS table). Export them from `packs.ts` if they are not exported; do not change their behaviour.
- Produces: `export async function handlePacksV3Request(request: Request, env: PacksEnv & { PACKS_V3?: string }, ctx: ExecutionContext, path: string): Promise<Response>`, where `path` is what follows `/v3/packs/`, still percent-encoded. `export function parseV3Path(path: string): { route: 'catalog'; lang: string; key: string } | { route: 'seg'; id: string; key: string } | null`. Task 2 uses both.
- Mounting: in `src/worker.ts`, a hard-coded prefix `/v3/packs/` (not built from `BASE_PATH`), checked before SvelteKit, as `isMcpV3` is.

- [ ] **Step 1: Write the failing tests.** Copy `fakeBucket` and `setup` from `tests/unit/packs.test.ts` (they are not exported) into the new test file, with `call(path)` hitting `https://tc-helps.example/v3/packs/${path}`. Tests, each asserting status, the exact JSON body or bytes, `Content-Type`, `Cache-Control` and the CORS headers of `serving.md`:
  - `serves the language catalog` — key `v3/catalog/es-419.seg`; `Cache-Control: no-cache, no-transform`; `ETag` present.
  - `es is an alias of es-419`, `ES-419 is lowercased`.
  - `serves the common catalog` — key `v3/catalog/common.seg`.
  - `serves a segment` — key `v3/seg/<64 hex>.seg`; `Cache-Control: public, max-age=31536000, immutable, no-transform`; `Accept-Ranges: bytes`; no `Content-Encoding` even when the stored object has one.
  - `If-None-Match → 304 with CORS` for a catalog and a segment (single tag, list, `W/`, `*`).
  - `Range on a segment → 206`, `bytes=-0 → 416 with Content-Range: bytes */size`, `Range on a catalog is ignored → 200`.
  - `HEAD has headers and no body`; `OPTIONS → 204`; `POST → 405 with Allow`.
  - Bad paths → 400 `{"error":"bad pack path"}`: uppercase hex, 63 hex digits, `es-419/catalog/`, `es-419/catalog/x`, `es-419`, `seg`, `seg/<hex>/x`, `common/x`, `x_y/catalog`.
  - `missing catalog → 404 {"error":"catalog not found"}` and `missing segment → 404 {"error":"segment not found"}`; both `Cache-Control: no-store`.
  - `PACKS_V3 off → 404 {"state":"unavailable","reason":"v3-off"}` (also when unset).
  - `no bucket → 503 {"error":"packs are not configured"}`.
  - `never dispatches`: the fake deps' build request is never called on a miss.
  - `segments use the parts rate-limit scope`, `catalogs the packs one` (as `packs.test.ts` tests it for v2).
  - `an analytics point per answer`: blobs `["pack", "v3-catalog" | "v3-seg", lang or "", outcome]`.
  - `the v2 routes are unchanged`: run `tests/unit/packs.test.ts` as is (Step 4).
- [ ] **Step 2: Run** `npx vitest run tests/unit/packs-v3.test.ts > <ledger>/t1-run.txt 2>&1`; expected: FAIL (module not found).
- [ ] **Step 3: Implement** `packsV3.ts` per `serving.md`. The 304, 206, 416 and HEAD answers follow `packs.ts`'s code paths (copy the logic through the shared helpers, do not fork the regexes). The 429 answer adds `Cache-Control: no-store` and the CORS headers. Mount it in `worker.ts`; add `PACKS_V3` to `wrangler.toml`.
- [ ] **Step 4: Run** the new test file, then `npx vitest run tests/unit/packs.test.ts tests/unit/packs-*.test.ts`; expected: all PASS, the v2 counts unchanged.
- [ ] **Step 5: Commit** `packs: serve format 3 catalogs and segments under /v3/packs` (body: why a separate prefix and the switch).

### Task 2: Local server, cleanup safety and infra notes

**Files:**
- Create: `scripts/packs-v3-local.ts`, `src/packs/dirBucket.ts`
- Modify: `docs/LANGUAGE_PACKS_INFRA.md` (a section "Format 3": routes, keys, `PACKS_V3`, local server, staging steps)
- Test: `tests/unit/packs-v3-local.test.ts`, `tests/unit/packs-cleanup.test.ts` (one added test)

**Interfaces:**
- Consumes: `handlePacksV3Request` (Task 1).
- Produces: `export function dirBucket(root: string): R2Bucket` — the subset `get` (with `onlyIf.etagDoesNotMatch` and `range`) and `head` that `packsV3.ts` uses, reading `<root>/<key>`; the etag is the hex sha256 of the file bytes. `scripts/packs-v3-local.ts --dir <root> [--port 8790]` serves `/v3/packs/*` through `handlePacksV3Request` with `PACKS_V3=on`, `LANGUAGE_PACKS=dirBucket(root)`, a fake KV and no analytics, using `node:http`; it prints `listening on http://127.0.0.1:<port>` and runs until killed. Task 7 and Task 13 use it.

- [ ] **Step 1: Write the failing tests.**
  - `dirBucket get/head/range/etag` over a temp folder with `v3/catalog/en.seg` and `v3/seg/<id>.seg`; a key with `..` or a backslash is `null`.
  - `local server serves a catalog and a segment` — start the script's exported `startLocalServer({dir, port: 0})`, fetch both, compare bytes; fetch a missing id → 404 body of `serving.md`; close it.
  - In `packs-cleanup.test.ts`: `ignores format 3 keys` — the fake bucket also holds `v3/catalog/en.seg`, `v3/catalog/common.seg`, `v3/seg/<id>.seg`, `v3/registry/en.json`; the run names nothing under `v3/`, deletes nothing under it, does not abort, and its other outcomes equal the run without them.
- [ ] **Step 2: Run** them; expected: FAIL.
- [ ] **Step 3: Implement** `dirBucket.ts` and the script (export `startLocalServer` for the test; the CLI calls it). Do not change `cleanup.ts` unless the new test fails; if it does, stop and report (it is a 2.0 change and needs a ruling).
- [ ] **Step 4: Run** the three files and the whole suite (`npm test > <ledger>/t2-suite.txt 2>&1`, through `lp3-runner`); expected: PASS, no other test changed.
- [ ] **Step 5: Write** the infra section (in English, as the rest of the file): the three routes, the R2 keys, `PACKS_V3` per environment, `npx tsx scripts/packs-v3-local.ts --dir <folder>` (or the runner the repo already uses for `scripts/*.ts`), and that production stays off in this phase.
- [ ] **Step 6: Commit** `packs: local format 3 server over a folder, and a cleanup test for v3 keys`.

## Part B: the pipeline (bt-synergy, `wt/lp3-publish`)

### Task 3: `build-v3` revisions, previous ids and a published common catalog

**Files:**
- Modify: `packages/resource-pipeline/cli/build-v3.ts`, and in `packages/language-pack-v3/src/build/` only what `buildLanguage` needs to take an already-built common part
- Test: `packages/resource-pipeline/cli/build-v3.test.ts`

**Interfaces:**
- New options of `build-v3` (and of its exported `runBuildV3(args)` if the test file uses one; keep the existing exports):
  - `--revision-common <n>`, `--revision-lang <n>`, `--previous-common <hex id>`, `--previous-lang <hex id>`. `--revision <n>` stays and sets both when the specific ones are absent.
  - `--common <dir>`: a folder with `catalog-common.seg` and `segments/<id>.seg` of a **published** common build. With it, the common part is not built: the language is built against that catalog (its `requires` names its revision and id), and the command fails with exit 2 and `common catalog lacks <unit id>` when a unit the language needs (`orig:<book>`, `xmap`) is not in it. Nothing of the common part is written under `--out`: no `catalog-common.seg` and no common segment.
  - Every run empties `--out/segments/` first (the phase 1 finding: old segments were never removed).
- Produces for Task 4: the out folder of the existing header, plus, with `--common`, no `catalog-common.seg`.

- [ ] **Step 1: Write the failing tests** (on the existing small fixtures of `build-v3.test.ts`):
  - `separate revisions` — `--revision-common 3 --revision-lang 7 --previous-lang <id>`: the read catalogs say 3 and 7, the language's `previous` is the id, the common one has none.
  - `--revision alone sets both` (existing behaviour kept).
  - `builds against a published common catalog` — build common+lang once into A; build the language again with `--common A` into B: B has no `catalog-common.seg`, B's language catalog `requires` A's common id and revision, and B's language segments are byte-equal to A's.
  - `a common catalog without the book's orig fails` — common built with `--books tit`, language with `--books rut --common`: exit 2, message names `orig:rut`.
  - `old segments are removed` — a stray `segments/ff….seg` in `--out` is gone after a run.
- [ ] **Step 2: Run** `bun test cli/build-v3.test.ts`; expected: FAIL.
- [ ] **Step 3: Implement.** Read the published common catalog with the package's reader; take the common segments `buildLanguage` needs from `--common/segments/`.
- [ ] **Step 4: Run** the file, then the whole `language-pack-v3` and `resource-pipeline` suites through `lp3-runner`, with `LP3_PYTHON` set; expected: PASS.
- [ ] **Step 5: Commit** `build-v3: a revision per catalog, previous ids, and builds against a published common catalog`.

### Task 4: `publishV3`, the upload of a built folder

**Files:**
- Create: `packages/resource-pipeline/src/language/publishV3.ts`, `packages/resource-pipeline/src/language/dirBucket.ts`
- Test: `packages/resource-pipeline/src/language/publishV3.test.ts`

**Interfaces:**
- Consumes: `PackBucket` from `src/language/publishLanguage.ts` (`getJson`, `has`, `stat`, `getBytes`, `put(key, body, {contentType, cacheControl})`), its `IMMUTABLE` and `NO_CACHE` constants, and the v3 reader's catalog read (`@bt-synergy/language-pack-v3`).
- Produces:
  - `export function dirBucket(root: string): PackBucket` — writes and reads `<root>/<key>`; refuses a key with `..`.
  - `export const V3_KEYS = { seg: (id: string) => \`v3/seg/${id}.seg\`, catalog: (name: string) => \`v3/catalog/${name}.seg\`, registry: (lang: string) => \`v3/registry/${lang}.json\` }`.
  - `export async function readPublishedV3(bucket: PackBucket, lang: string): Promise<{ common?: { revision: number; id: string; bytes: Uint8Array }; lang?: { revision: number; id: string; bytes: Uint8Array }; registry?: unknown }>`.
  - `export async function publishV3(o: { bucket: PackBucket; outDir: string; lang: string; publishCommon: boolean; log: (line: string) => void }): Promise<{ outcome: 'published' | 'unchanged'; uploaded: string[]; skipped: string[] }>` — uploads the folder Task 3 wrote.

- [ ] **Step 1: Write the failing tests** (build a small out folder with `build-v3` on the fixtures, as `build-v3.test.ts` does, in `beforeAll`):
  - `uploads segments, then common, then the language catalog, then the registry` — record the order of `put` keys on a recording bucket; every key matches `^v3/(seg/[0-9a-f]{64}\.seg|catalog/(common|[a-z0-9-]+)\.seg|registry/[a-z0-9-]+\.json)$`.
  - `content types and cache` — segments `application/octet-stream` + `IMMUTABLE`, catalogs `application/octet-stream` + `NO_CACHE`, registry `application/json` + `NO_CACHE`.
  - `skips segments already present` (`has` true → no put).
  - `checks every named segment exists before a catalog` — a bucket whose `has` says false after the put (a lost write): no catalog is put, the call throws.
  - `a failed put stops before the catalogs`, then `a second run completes it` (Review Focus 2).
  - `unchanged` — the published catalogs equal the built ones apart from `about`: outcome `unchanged`, zero puts (Review Focus 4).
  - `publishCommon false never writes common` even when the folder has `catalog-common.seg`.
  - `uploads only builder output` — files placed in `outDir` other than `segments/*.seg`, `catalog-*.seg`, `registry-<lang>.json` (for example `report.txt`, a `tipnr/x.txt`) are never put.
  - `each uploaded segment's id equals sha256 of its decompressed body and its file name` (read back from the bucket).
- [ ] **Step 2: Run** `bun test src/language/publishV3.test.ts`; expected: FAIL.
- [ ] **Step 3: Implement.** Compare catalogs "apart from `about`" by reading both and comparing their `resources`, `segments`, `units`, `requires` and `complements` tables.
- [ ] **Step 4: Run** it and `bun test src/language/` through `lp3-runner`; expected: PASS.
- [ ] **Step 5: Commit** `pipeline: upload a format 3 build, segments first and catalogs last`.

### Task 5: `cli/publish-v3.ts`

**Files:**
- Create: `packages/resource-pipeline/cli/publish-v3.ts`
- Modify: `packages/resource-pipeline/package.json` (script `publish-v3`)
- Test: `packages/resource-pipeline/cli/publish-v3.test.ts`

**Interfaces:**
- Consumes: Task 3's `build-v3` options, Task 4's `publishV3`, `readPublishedV3`, `dirBucket`, and the R2 bucket of `publishLanguage.ts` (`r2Bucket`, from the same four env variables `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, all or none).
- Usage:

```text
bun packages/resource-pipeline/cli/publish-v3.ts --lang <tag> --list <list.json> --originals <originals list.json> --parts <dir> --work <dir>
  [--bucket-dir <dir>] [--no-upload] [--map-lang en] [--map-list <list.json>] [--topics <dir>] [--aligned] [--sign-key <pem file>]
  [--books <list>]   (local tests only: refused with --lang equal to --map-lang unless --bucket-dir is given)
```

- Behaviour, in order:
  1. Bucket: `--bucket-dir` → `dirBucket`; else the four env variables → `r2Bucket`; else only `--no-upload` is allowed (exit 2 otherwise).
  2. Fetch any part the lists name that is missing from `--parts` from the bucket's `parts/<sha>.part.gz` into `--parts` (a `--parts` run uploads only new parts, so the folder may be incomplete). A missing part in both → exit 1.
  3. `readPublishedV3`. If `--lang` ≠ `--map-lang` and there is no published common catalog → print the result `{"outcome":"skipped","reason":"no common catalog"}`, exit 0 (Review Focus 3). Otherwise download the published common catalog and the segments it names into `<work>/common/` for `--common`.
  4. Download `v3/registry/<lang>.json` if present into `<work>/registry/`.
  5. Run the build (call `build-v3`'s exported function in process, not a child process) into `<work>/v3-out/` with `--revision-*` = published + 1 (1 when none), `--previous-*` = published ids, `--registry <work>/registry`, `--common` when not the map language, and the pass-through options.
  6. `publishV3` with `publishCommon = (lang === mapLang)`, unless `--no-upload`.
- Output as `publish-language.ts`: log on stderr, last stdout line the result JSON `{"outcome": "published"|"unchanged"|"built"|"skipped", "lang", "catalogs": {"common"?: {revision, id}, "lang": {revision, id}}, "segments": {"uploaded": n, "present": n}, "reason"?}`. Exit 0 for those outcomes, 1 build or upload failure, 2 usage.

- [ ] **Step 1: Write the failing tests** with `--bucket-dir` temp folders and the fixtures:
  - `publishes en then es-419` — en run writes common and en catalogs; es-419 run writes only the es-419 catalog, whose `requires` names en's common id.
  - `es-419 before en is skipped` — outcome `skipped`, exit 0, the bucket folder unchanged.
  - `second run is unchanged` — same inputs: outcome `unchanged`, no file in the bucket folder changes (compare mtimes and bytes).
  - `revision grows on change` — a changed list (one part sha changed in the fixture copy): the language catalog's revision is 2 and its `previous` is the first id.
  - `fetches missing parts from the bucket` — a part present only under `<bucket-dir>/parts/`.
  - `no credentials and no --no-upload → exit 2`; `partial R2 env → exit 2`.
  - `--books with the map language and real R2 env → exit 2`.
- [ ] **Step 2: Run** `bun test cli/publish-v3.test.ts`; expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file and the package suite through `lp3-runner`; expected: PASS.
- [ ] **Step 5: Commit** `pipeline: publish-v3, format 3 next to the 2.0 parts of a run`.

### Task 6: Topic sources for the pipeline, pinned and never uploaded

**Files:**
- Create: `packages/resource-pipeline/cli/fetch-topic-sources.ts`, `packages/resource-pipeline/cli/topic-sources.json`
- Test: `packages/resource-pipeline/cli/fetch-topic-sources.test.ts`

**Interfaces:**
- `topic-sources.json`: for each source in `spec/fuentes.md` that `--topics` reads (TIPNR files, Theographic `events`, `verses`, `people`, `places`, English OBS `content/NN.md`): repository, the pinned commit, path, the sha256 `fuentes.md` gives where it gives one, and the target path under the topics folder (`tipnr/…`, `theographic/…`, `en_obs/obs-repo/content/…`). Copy commits and hashes from `fuentes.md` verbatim; where `fuentes.md` has a commit but no file hash, record the hash measured from the files in `LP3_SOURCES` and say so in the report.
- `fetch-topic-sources.ts --out <dir>`: downloads each file at its pinned commit (raw GitHub URL or the Door43 raw URL), checks its sha256, writes it under `<out>`; any mismatch → exit 1 and nothing left in `<out>`. `<out>` must not be inside a folder `publish-v3` uploads (Task 4 already only uploads builder output; this is the second guard): refuse `--out` under `--work/v3-out`.
- Produces for Task 8: `bun packages/resource-pipeline/cli/fetch-topic-sources.ts --out $RUNNER_TEMP/topics`.

- [ ] **Step 1: Write the failing tests** with an injected `fetch`: `writes every file at its target`, `a wrong hash fails and leaves nothing`, `refuses an out folder inside the upload folder`, `the pins equal fuentes.md` (parse the commit values from `spec/fuentes.md` and compare with the JSON).
- [ ] **Step 2: Run**; expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests; then one real fetch into a temp folder through `lp3-runner` and compare its files with `LP3_SOURCES` (same bytes); expected: PASS and equal.
- [ ] **Step 5: Commit** `pipeline: fetch the pinned topic sources for format 3`.

### Task 7: `verify-v3`, both readers over HTTP

**Files:**
- Create: `packages/resource-pipeline/cli/verify-v3.ts`
- Test: `packages/resource-pipeline/cli/verify-v3.test.ts`

**Interfaces:**
- Usage: `bun packages/resource-pipeline/cli/verify-v3.ts --base <url> --lang <tag> --out <dir> [--built <v3-out dir>] [--python <path>] [--pubkey <hex>]` (`--pubkey` is added by Task 11).
- Behaviour:
  1. `GET {base}/v3/packs/{lang}/catalog` and `/v3/packs/common/catalog`; then every segment both catalogs name, by `GET {base}/v3/packs/seg/{id}`, saved under `<out>/segments/<id>.seg` and `<out>/catalog-*.seg` (the `build-v3` folder shape).
  2. For each segment: the id from its header equals the URL id and the sha256 of its decompressed body; its length equals the catalog's `size`; the response had no `Content-Encoding`.
  3. With `--built`: every downloaded file is byte-equal to the built one (the language catalog and, when the common catalog was built in that folder, the common one).
  4. Both readers over `<out>`: `bun spec/tests/compare.ts --built <out> --python <path>` (exit 0 when they agree), and the fixed queries of `spec/tests/queries/` whose books are in the catalog give the same answers from both readers.
  5. Checks the HTTP contract on the way: a second catalog GET with `If-None-Match` gets 304; one `Range` request on a segment gets 206 with the right bytes.
- Prints one line per check and a final JSON `{"ok": bool, "segments": n, "bytes": n, "failures": [..]}`; exit 0 when ok, 1 when a check fails, 2 usage or network.
- Produces for Task 13 and staging step S5.

- [ ] **Step 1: Write the failing tests** with a fake server: a `Bun.serve` that implements `serving.md` over a folder (this is also the reference fake server for C1; keep it in `cli/verify-v3.test.ts` as an exported helper `fakeV3Server(dir)` only if C1 asks for it, otherwise local to the test):
  - `passes on a correct publication` (fixture build published with Task 5 into a folder).
  - `fails on a segment whose body was altered`, `on a wrong length`, `on Content-Encoding`, `on a byte difference with --built`, `on a 200 where a 304 is due`.
  - `fails when the readers disagree` — point `--python` at a stub script that prints a different output.
- [ ] **Step 2: Run**; expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** with `LP3_PYTHON` through `lp3-runner`; expected: PASS.
- [ ] **Step 5: Commit** `pipeline: verify-v3 checks a format 3 publication over HTTP with both readers`.

### Task 8: The workflow step

**Files:**
- Modify: `.github/workflows/language-packs.yml`, `.github/workflows/packs-builder.yml` only if its path filter must include `packages/language-pack-v3/**`
- Test: `packages/resource-pipeline/cli/workflow-v3.test.ts` (parses the YAML)

**Interfaces:**
- A new input `v3` (`'true'`/`'false'`, default `'true'`) and two steps after "Build and publish" and before "Status result":
  - "Topic sources (format 3)": runs Task 6 into `$RUNNER_TEMP/topics`, `continue-on-error: true`.
  - "Build and publish format 3": `if: inputs.parts == 'true' && inputs.v3 == 'true' && inputs.target == 'staging'` (production refused in this phase: `PACKS_V3_PRODUCTION` is not read); `continue-on-error: true`; same env R2 secrets as the 2.0 step; `PACKS_V3_SIGNING_KEY` written to `$RUNNER_TEMP/sign.pem` with `umask 077` only when the secret is set (Task 11 adds the use); `::stop-commands::` as the 2.0 step; the paths of the 2.0 work folder mapped to `publish-v3` (`--list <work>/catalog/<compat>/<lang>.json`, `--originals` the originals list that language list names, `--parts <work>/parts`), `--aligned`, `--topics $RUNNER_TEMP/topics` when the topics step succeeded (a language other than `en` builds against the published common catalog, so it needs no `--map-list`); `--no-upload` when `mode` is `no-upload`.
  - The v3 result goes into the job summary and the result artifact, never into `status/<compat>/<lang>.json`; the "Status result" step's `ok`/`failed` stays the 2.0 outcome.
- [ ] **Step 1: Write the failing tests** (`yaml` package already in the repo or `Bun.YAML` if available): the steps exist in that order; `continue-on-error: true` on both; the `if` refuses production; the status step does not reference the v3 step's outcome; no secret is echoed (`run` scripts contain no `echo $PACKS_V3_SIGNING_KEY`, `set -x` absent); the 2.0 steps are byte-identical to before (compare with `git show HEAD:.github/workflows/language-packs.yml` minus the added lines).
- [ ] **Step 2: Run**; expected: FAIL.
- [ ] **Step 3: Implement.** Run `actionlint` if installed (through `lp3-runner`); if it is not, say so in the report.
- [ ] **Step 4: Run**; expected: PASS.
- [ ] **Step 5: Commit** `workflow: build and publish format 3 after the 2.0 parts, staging only`.

## Part C: signatures (bt-synergy) — only if Abel approves the rules above

### Task 9: Spec ruling, signing in the builder, checking in the TS reader

**Files:**
- Modify: `spec/container.md`, `spec/catalog.md`, `spec/README.md` (open item closed), `spec/tests/README.md` (`sig` in the output), `src/build/catalog.ts`, `src/read/catalog.ts`, `src/read/output.ts`, `src/codec/errors.ts` (`E_SIGNATURE`)
- Create: `packages/language-pack-v3/src/sign.ts`, `packages/language-pack-v3/keys/README.md`
- Test: `packages/language-pack-v3/src/sign.test.ts`; new conformance cases under `spec/tests/` (`catalog-signed`, `catalog-bad-sig`, `catalog-unknown-key`, `catalog-unsigned-published`)

**Interfaces:**
- `export function keyId(publicKey: Uint8Array): string` (16 hex digits of sha256).
- `export async function signCatalog(catalogFile: Uint8Array, privateKeyPkcs8: Uint8Array): Promise<Uint8Array>` — returns the catalog file with `sig` in its header (the body and therefore the id do not change; only the header and `H` do).
- `export async function verifyCatalog(catalogFile: Uint8Array, trusted: Record<string, Uint8Array>): Promise<{ key: string; valid: true }>` — throws `E_SIGNATURE` per the rules.
- The reader's options gain `trustedKeys?: Record<string, Uint8Array>`; with it, `readerOutput` adds `sig`. WebCrypto Ed25519 (`crypto.subtle`, available in Bun, browsers and Workers); no new dependency.
- The spec commit comes first and alone: `spec: catalog signatures (key id, when a reader rejects)`.

- [ ] **Step 1: Spec commit** with the rules of "Decisions for Abel" (as approved).
- [ ] **Step 2: Write the failing tests:** `sign then verify`, `the id is unchanged by signing`, `a flipped bit in s → E_SIGNATURE`, `unknown key → E_SIGNATURE`, `published and unsigned with keys → E_SIGNATURE`, `local and unsigned with keys → ok`, `no keys → sig ignored, output unchanged` (the existing frozen outputs do not move), `sig on a non-catalog segment is ignored`. Keys generated in the test.
- [ ] **Step 3: Run**; expected: FAIL.
- [ ] **Step 4: Implement**; freeze the four new cases with a test key generated **once by `build-cases.ts`** and committed as a **public** key only, the private one discarded after signing (the signed bytes are frozen; nothing secret is kept).
- [ ] **Step 5: Run** the package suite with `LP3_PYTHON`; expected: PASS except the four new cases in the Python reader (Task 10), which `compare.ts` must report as "Python: not yet" — mark them so, do not skip silently.
- [ ] **Step 6: Commit** `language-pack-v3: sign catalogs and check signatures in the TS reader`.

### Task 10: Ed25519 in the Python reader

**Agent:** `lp3-pyreader` (the Python reader is written from the spec alone, as in phase 1).

**Files:**
- Modify: `spec/reader-py/lp3read.py`
- Create: `spec/reader-py/ed25519.py` (RFC 8032 verification only, standard library, the RFC's reference algorithm)
- Test: `spec/reader-py/test_lp3read.py` (signature tests), the four cases of Task 9

**Interfaces:**
- `lp3read.py <file> [--trusted <hex key>…]`; with keys, the same rules and the same `sig` output as the TS reader; exit 1 with `{"error":"E_SIGNATURE"}` on a rejection.
- `ed25519.verify(public_key: bytes, message: bytes, signature: bytes) -> bool`.

- [ ] **Step 1: Write the failing tests:** the RFC 8032 section 7.1 test vectors 1–3 verify; a flipped bit fails; the four conformance cases give the frozen outputs.
- [ ] **Step 2: Run** with the venv's pytest; expected: FAIL.
- [ ] **Step 3: Implement** from the spec and RFC 8032 only.
- [ ] **Step 4: Run** pytest and `bun spec/tests/compare.ts --python <venv python>`; expected: PASS, the readers agree on every case.
- [ ] **Step 5: Commit** `reader-py: check catalog signatures (Ed25519, RFC 8032)`.

### Task 11: Signing in the pipeline and in verify-v3

**Files:**
- Modify: `cli/build-v3.ts` (`--sign-key <pem file>`: signs both catalogs it writes), `cli/publish-v3.ts` (passes `--sign-key`), `cli/verify-v3.ts` (`--pubkey <hex>`: both readers check the signatures), `.github/workflows/language-packs.yml` (pass `$RUNNER_TEMP/sign.pem` when present, delete it in an `always()` step)
- Test: the three CLI test files, `workflow-v3.test.ts`

- [ ] **Step 1: Write the failing tests:** `build-v3 --sign-key` gives catalogs that verify with the key's public half and segments byte-equal to an unsigned build; `publishV3 unchanged` holds when only the signature would differ (a re-run with the same key is `unchanged`); `verify-v3 --pubkey` fails on an unsigned or wrongly signed publication; the workflow deletes the key file in an `always()` step and never prints it.
- [ ] **Step 2: Run**; expected: FAIL.
- [ ] **Step 3: Implement.** The key is read from the file and kept in memory only; it never enters a log line, an error message or the work folder.
- [ ] **Step 4: Run** the suites through `lp3-runner`; expected: PASS.
- [ ] **Step 5: Commit** `pipeline: sign format 3 catalogs when a key is given`.

## Part D: the transfer file (bt-synergy)

### Task 12: `transfer-v3` export and import

**Files:**
- Create: `packages/resource-pipeline/cli/transfer-v3.ts`
- Test: `packages/resource-pipeline/cli/transfer-v3.test.ts`

**Interfaces:**
- Consumes: `writeTransfer`, `readTransfer` (`packages/language-pack-v3/src/transfer.ts`).
- Usage:
  - `transfer-v3 export --from <folder in build-v3 shape> --mode full|update [--base <catalog file>…] --out <file.tcpack>` — `full`: both catalogs and every segment they name; `update`: the catalogs and only the segments not named by the `--base` catalogs.
  - `transfer-v3 import --file <file.tcpack> --into <folder>` — reads with `readTransfer`, writes each whole, verified entry as `segments/<id>.seg` and the catalogs as `catalog-*.seg`; a cut file imports its whole entries and lists the missing ones; exit 1 when a catalog is cut (`E_TRUNCATED`).
- [ ] **Step 1: Write the failing tests** (no network): `full export then import into an empty folder` gives byte-equal files and both readers read it (`compare.ts --built`); `update` from revision 1 to 2 carries only the changed segments and imports on top of the revision 1 folder to give the revision 2 folder; `a file cut in a segment` imports the others and names the missing one; `a file cut in a catalog` → exit 1, nothing written.
- [ ] **Step 2: Run**; expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** through `lp3-runner`; expected: PASS.
- [ ] **Step 5: Commit** `pipeline: export and import format 3 transfer files`.

## Part E: proof

### Task 13: Local end to end

**Agent:** `lp3-implementer`, with commands only (no source change; a failure becomes a fix task).

- [ ] **Step 1:** In a scratch folder outside both repos (`C:/Users/LENOVO/Git/Github/wt/lp3-phase3-local/`), publish with Task 5 into `bucket/` from `fase0-paquetes/muestra`: `en` with `--books tit,rut,psa,mat,1ch` (the local-only common), then `es-419`, both with `--aligned` and `--topics <LP3_SOURCES>`, and with `--sign-key` of a key generated for this run in the scratch folder when Part C is done.
- [ ] **Step 2:** Start the local server of Task 2 over `bucket/` (from `wt/th-v3-publish`, in the background).
- [ ] **Step 3:** `verify-v3 --base http://127.0.0.1:8790 --lang en --built <en v3-out>` and the same for `es-419` (with `--pubkey` when Part C is done). Expected: `ok: true` for both.
- [ ] **Step 4:** Run Task 5 again for both languages: outcome `unchanged`, no file in `bucket/` changed.
- [ ] **Step 5:** Export a `full` transfer file for es-419 and import it into an empty folder; `compare.ts --built` on it passes.
- [ ] **Step 6:** Write the results (sizes, segment counts, the two catalogs' ids and revisions, timings) to the ledger and to `docs/superpowers/plans/2026-11-03-language-pack-v3-phase3-local-run.md`; commit `plan: phase 3 local run`. Stop the server; delete the scratch key.

## Phase 3 gate (local)

- Every task reviewed; the three final Opus reviews done and their findings fixed or ruled.
- Task 13 passes: both languages served by the Worker's own route over a folder, every file equal to the build, both readers agree, a second run uploads nothing.
- No change to the 2.0 outcomes: the full suites of both repositories pass.

## Staging (each step waits for Abel's yes, asked separately)

The supervisor asks Abel one step at a time and does nothing until he says yes.

- **S1. Push** `feat/packs-v3-routes` to `uw` (unfoldingWord/translation-helps-mcp) and `feat/language-pack-v3-publish` to the tc-study remote.
- **S2. Pull requests**, as drafts: translation-helps-mcp into `v2`; tc-study into the branch Abel names (phase 2 has no PR yet). Note in the translation-helps-mcp PR that merging into `v2` deploys production, where `PACKS_V3` is `off`.
- **S3. Staging Worker.** A Worker Preview of the translation-helps-mcp branch (`npx wrangler preview --config wrangler.toml`): it binds `language-packs-staging`, runs no crons and has `PACKS_V3=on`. Run with Abel's own `wrangler` login; Claude does not handle a token.
- **S4. Publish to staging.** Abel runs `publish-v3` for `en` (66 books) and then `es-419`, in his own terminal with the `packs-staging` R2 credentials (and the staging signing key when Part C is done) in the environment, and `--parts` from a `publish-language --parts --no-upload` run of the same day. The workflow route (a dispatch from `master`) needs the tc-study PR merged and is for later.
- **S5. Verify staging.** `verify-v3 --base <preview URL> --lang en --built …` and the same for `es-419` (with `--pubkey`), then S4 again: `unchanged`.
- **S6. Transfer on staging data.** Export `full` and `update` files from what S5 downloaded and import them between two folders with no network (step 3.5).

Production (3.6) is not in this phase.

## Deviations from this plan

(The controller records them here as they happen.)
