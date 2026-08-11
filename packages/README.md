# BT Synergy packages

## Panel container dependency (tc-study)

**Source of truth for panel messaging / LinkedPanels:** the npm package [`linked-panels`](https://www.npmjs.com/package/linked-panels) (`linked-panels` in `apps/tc-study/package.json`).

Do **not** use the workspace package `@bt-synergy/linked-panels` — it has no `src/` and is archived. Apps must depend on the published npm package only.

## Archived / quarantine

Packages marked with `ARCHIVED.md` are **not live** for the tc-study critical path. Each has `private: true` and a `[ARCHIVED]` `package.json` description. Prefer not adding new dependents; do not delete without checking secondary apps/tools that may still list them.

| Package | Notes |
|---|---|
| `@bt-synergy/linked-panels` | Empty stub — use npm `linked-panels` |
| `@bt-synergy/resource-signals` | Orphan signal stack — use `resource-panels` |
| `@bt-synergy/study-store` | Stub — app owns stores |
| `@bt-synergy/resource-selection` | Quarantine |
| `@bt-synergy/package-creator-core` | Quarantine |
| `@bt-synergy/package-creator-state` | Quarantine |
| `@bt-synergy/passage-sets-cli` | Quarantine / out of scope |

## Dual-stack freeze (tc-study)

Chosen defaults until a deliberate migration:

| Concern | Keep (SoT for tc-study) | Do not grow for tc-study |
|---|---|---|
| USFM | `@bt-synergy/usfm-processor` | `resource-parsers` USFM path |
| Loading | `*-loader` + `catalog-manager` | `resource-adapters` / `package-builder-engine` |
| Signals | `resource-panels` | `resource-signals` (orphaned) |
| Catalog IndexedDB | `@bt-synergy/catalog-adapter-indexeddb` | In-app adapter forks |