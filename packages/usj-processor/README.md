# `@bt-synergy/usj-processor`

USFM → **USJ + AlignmentMap** (parse/cache SoT) → **`UsjScriptureViewModel`** (runtime identity).

Replaces unmaintained usfm-js as the default scripture process path in `@bt-synergy/scripture-loader`.

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

## Rollback

Loader opt-out: `USE_USJ_PIPELINE=0` (lazy usfm-js). Not the end state.

## Setup

```bash
# sibling usfm-ast must be built
node packages/usj-processor/scripts/link-usfm-tools.cjs
bun test packages/usj-processor
```
