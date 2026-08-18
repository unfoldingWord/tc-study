# Resource Type Plugins (tc-study SoT)

**Status:** Runtime source of truth is **app-owned** in `apps/tc-study`, not `packages/[name]-resource`.

Historical docs described self-contained `*-resource` packages (loader + viewer + signals). That layout is **aspirational / incomplete**. Contributors must follow the paths below.

## Where plugins live today

| Concern | Location |
|--------|----------|
| Plugin registration / type defs | `apps/tc-study/src/resourceTypes/**` |
| Viewers / UI | `apps/tc-study/src/components/resources/**` |
| Loader wiring into registries | `apps/tc-study` + `@bt-synergy/*-loader` packages (data loaders only) |
| Ready gate | `CatalogContext` + `ResourceTypeInitializer` (fail-closed) |

Do **not** add new viewers under `packages/*-resource` unless an extraction is explicitly finished and linked from tc-study.

## Loaders vs viewers

- **Loaders** may live in workspace packages (`scripture-loader`, `translation-notes-loader`, …) as data/parse modules.
- **Viewers, signals, and panel UX** are owned by the app (`components/resources/**`, messaging façades).
- Unused / archived packages (e.g. `scripture-resource` pulling old signals) are **not** the registration SoT.

## Adding a resource type

A resource type **loads**. A panel entry **paints**. Dual-register if the type should appear in a pane.

See **[apps/tc-study/docs/extending-registries.md](../apps/tc-study/docs/extending-registries.md)**.

## Related

- Extending registries: `apps/tc-study/docs/extending-registries.md`
- Catalog readiness guards: `apps/tc-study/src/utils/catalogReadiness.test.ts`
