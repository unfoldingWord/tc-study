# `@bt-synergy/usj-processor`

USFM → **USJ + AlignmentMap** (parse/cache SoT) → **`UsjScriptureViewModel`** (runtime identity).

Sole scripture process path in `@bt-synergy/scripture-loader` (usfm-js removed).

## Setup (`@usfm-tools/*`) — one supported path

Depend on published npm packages. No sibling `usfm-ast` checkout, Vite path aliases, or CI nested clone required for day-to-day work.

```bash
# From bt-synergy root
bun install
bun test packages/usj-processor
```

Pinned in this package’s `package.json` (also hoisted at monorepo root for Vite):

| Package | Role |
|---------|------|
| `@usfm-tools/parser` | USFM → USJ (`USFMParser` / `toJSON`) |
| `@usfm-tools/usj-core` | strip alignments, chapter slice, gateway tokenize |
| `@usfm-tools/types` | shared USJ / alignment types |

**Vite (tc-study):** resolve from `node_modules`. Keep `optimizeDeps.needsInterop` + `build.commonjsOptions.include` for the CJS parser/types dist (Rollup otherwise leaves bare `exports` — e2e Journey 4/8).

### Optional: local usfm-ast override

Only when developing unpublished changes in a sibling/nested [usfm-ast](https://github.com/abelpz/usfm-ast) checkout:

```bash
# Build usfm-ast first, then:
bun run link:usfm-tools:local
# or: USFM_AST_ROOT=/path/to/usfm-ast bun run link:usfm-tools:local
```

This junctions `node_modules/@usfm-tools/*` over the npm install. Re-run `bun install` to restore published packages.

## Runtime API (for Viewer / Panels)

```ts
import {
  USJProcessor,
  semanticIdFor,
  buildUsjViewModel,
  projectToProcessedScripture,
  type UsjScriptureViewModel,
  type UsjWordToken,
} from '@bt-synergy/usj-processor'

const proc = new USJProcessor()
const { viewModel, scripture, usj, alignmentMap } = await proc.processUSFM(
  usfmText,
  bookCode, // e.g. 'tit' from Door43
  bookName
)

// Preferred: viewModel.chapters[].verses[].tokens[]
// token.semanticId === semanticIdFor(token.verseRef, token.content, token.occurrence)
// token.alignedOriginalWordIds → OL ids for cross-resource highlight

// Transitional UI: scripture (ProcessedScripture projection)
```

### Identity

`semanticId = ${verseRef}:${content}:${occurrence}`

- `content` from USJ `\w` (not lemma, not `tokenizeGatewayUsj`)
- occurrence verse-wide, 1-based, case-insensitive
- match with `.toLowerCase()`

See plan: `usj_base_format_migration.plan.md` → **Authoritative runtime contract**.

## Cache

`toUsjCacheContent(result)` → `UsjScriptureCacheContent` for `scripture-usj:` keys.  
`fromUsjCacheContentFull(cached)` → full `{ viewModel, scripture, usj, alignmentMap }`.

## Parity gates (QA)

- ViewModel identity + projection: `tests/usjViewModel.identity.test.ts`
- Titus vs legacy: `tests/titus-parity.test.ts`
- Cross-resource **Paul ↔ Παῦλος** (viewModel-first): `tests/cross-resource-alignment.test.ts`
- App cutover / soak: `apps/tc-study/docs/USJ_CUTOVER_CHECKLIST.md`, `USJ_SOAK_MATRIX.md`
