# ScriptureViewer

Primary render path: **UsjScriptureViewModel** / **UsjWordToken**.

## Load

```ts
const loader = loaderRegistry.getLoader(RESOURCE_TYPE_IDS.SCRIPTURE) as ScriptureLoader
const viewModel = await loader.loadViewModel(resourceKey, bookId)
```

`useContent` → `loadUsjViewModel()` (requires ScriptureLoader `loadViewModel` / `loadScriptureResult`).
No `loadContent` / ProcessedScripture fallback.

Helps QuoteMatcher path: `loadViewModel` + `viewModelToOptimizedChapters` (Helps DTO).
`ScriptureLoader.loadContent()` remains for the ResourceLoader contract only (ProcessedScripture projection).

## Helps DOM contract (Journey 4 / 8)

| Attr | Value |
|------|--------|
| `data-token-semantic-id` | `token.semanticId` (= `semanticIdFor(...)`) |
| `data-underlined` | `"true"` when TN/TWL coverage matches |
| `data-highlighted` | `"true"` when selected / cross-pane aligned |

## Messaging

- Click → `token-click` (`semanticId` + `alignedSemanticIds`)
- Underline ← `NOTES_TOKEN_GROUPS_TN` / `_TWL`
- Broadcast → `SCRIPTURE_TOKENS` via `extractUsjBroadcastTokens(viewModel)`

## Verify

```bash
cd apps/tc-study
bun test ./src/components/resources/ScriptureViewer/utils/tokenHighlight.test.ts ./src/components/resources/ScriptureViewer/utils/loadUsjViewModel.test.ts
bun run type-check
```
