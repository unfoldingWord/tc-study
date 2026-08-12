# `@bt-synergy/usj-processor`

Adapter: Door43 USFM → `@usfm-tools/parser` USJ → `@usfm-tools/usj-core` `stripAlignments` → `ProcessedScripture` / `WordToken` shapes compatible with today’s tc-study interactivity contract.

**P1/P2:** Wired behind `USE_USJ_PIPELINE` in `@bt-synergy/scripture-loader` (default **off**).  
When on, loader persists USJ SoT under `scripture-usj:…` (`processingVersion` `2.0.0-usj`) and still returns `ProcessedScripture` to the app.

## Local `usfm-ast` wiring

Sibling clone required:

```text
Git/Github/bt-synergy
Git/Github/usfm-ast
```

`@usfm-tools/*` cannot be linked via Bun `file:` / workspace deps from this monorepo: those packages use internal `workspace:*` references that only resolve inside **usfm-ast**.

Spike bridge: `src/usfmTools.ts` imports compiled output by relative path:

- `../../../../usfm-ast/packages/usfm-parser/dist/index.js`
- `../../../../usfm-ast/packages/usfm-usj-core/dist/index.mjs`

Build those packages first (from `usfm-ast`):

```bash
bun install
# ensure @usfm-tools/types, @usfm-tools/parser, @usfm-tools/usj-core dist/ exist
bun run build
```

Then from `bt-synergy`:

```bash
bun install
bun test packages/usj-processor
```

**P1 status:** Relative `dist/` bridge retained — Bun `file:` / `workspace:*` for `@usfm-tools/*` still blocked by usfm-ast internal `workspace:*` deps. Prefer publishing `@usfm-tools/*` (or a Bun workspace that includes usfm-ast packages) before P2 default-on.

## Tokenization rule (locked by P0)

Walk USJ `char` / `marker: "w"` nodes with verse `sid` context (sibling `\v` markers).  
Do **not** use `tokenizeGatewayUsj` for semantic IDs — whitespace splits keep trailing punctuation (`Paul,`) and break parity with `usfm-js` `\w` tokens.

Occurrences are verse-wide, 1-based, **case-insensitive** on surface (same as `@bt-synergy/usfm-processor`).

Semantic ID schema unchanged: `verseRef:content:occurrence` (case-insensitive match).

## Fixtures

Committed under `fixtures/`:

- `en_ult_TIT.usfm` — unfoldingWord English ULT Titus
- `el-x-koine_ugnt_TIT.usfm` — unfoldingWord UGNT Titus
- `en_tn_TIT.tsv` — English TN Titus (for later QuoteMatcher / underline checks)

## Run parity tests

```bash
bun test packages/usj-processor
# or
cd packages/usj-processor && bun test
```
