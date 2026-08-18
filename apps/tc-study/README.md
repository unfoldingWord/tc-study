# tc-study

Translation Core study app in the bt-synergy monorepo.

```bash
bun install
bun run dev --filter=tc-study
bun run check
```

`/test/panels` is available in **DEV builds only** (`import.meta.env.DEV`).

## Docs

- **Registries** (resource types, panel entries, panel modes): [docs/extending-registries.md](./docs/extending-registries.md)
- **Theme** (light / dark): [docs/THEME.md](./docs/THEME.md)

Theme tokens + preference store. Toggle: Sun/Moon in the app header and read navigation chrome. Preference: Settings → Appearance (light / dark / system). Storage key: `tc-study:theme-preference`.
