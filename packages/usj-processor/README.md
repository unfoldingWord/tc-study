# `@bt-synergy/usj-processor`

USFM → **USJ + AlignmentMap** (parse/cache SoT) → **`UsjScriptureViewModel`** (runtime identity).

Sole scripture process path in `@bt-synergy/scripture-loader` (usfm-js removed).

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

## Setup (`@usfm-tools/*` bridge)

`usj-processor` imports `@usfm-tools/parser` + `@usfm-tools/usj-core` (built dist from [usfm-ast](https://github.com/abelpz/usfm-ast)). Prefer the documented link — do **not** rely on ad-hoc sibling relative imports in app code.

**Layouts**

| Layout | How |
|--------|-----|
| Local sibling | `Git/Github/{bt-synergy,usfm-ast}` |
| Nested (CI) | checkout into `<repo>/usfm-ast` |
| Custom | `USFM_AST_ROOT=/path/to/usfm-ast` |

```bash
# 1) Build usfm-ast packages (from that repo)
bun install && bun run build --filter @usfm-tools/parser --filter @usfm-tools/types --filter @usfm-tools/usj-core

# 2) Link into bt-synergy node_modules (verifies dist exists)
bun run link:usfm-tools
# or: node packages/usj-processor/scripts/link-usfm-tools.cjs

# 3) Tests / app
bun test packages/usj-processor
```

**Vite (tc-study / e2e):** `apps/tc-study/scripts/usfm-tools-vite-aliases.cjs` resolves aliases to linked `node_modules` dist first, then `USFM_AST_ROOT` / nested / sibling. `build.commonjsOptions.include` covers usfm-ast CJS parser/types so Rollup does not leave bare `exports` (see `678c928`).

**Bun note:** `usfmTools.ts` loads usj-core via `node_modules/@usfm-tools/usj-core/dist/index.mjs` (not the package entry) so Bun does not evaluate type-only `AlignmentGroup` re-exports.

## Parity gates (QA)

- ViewModel identity + projection: `tests/usjViewModel.identity.test.ts`
- Titus vs legacy: `tests/titus-parity.test.ts`
- Cross-resource **Paul ↔ Παῦλος** (viewModel-first): `tests/cross-resource-alignment.test.ts`
- App cutover / soak: `apps/tc-study/docs/USJ_CUTOVER_CHECKLIST.md`, `USJ_SOAK_MATRIX.md`

