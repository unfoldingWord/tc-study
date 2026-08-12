# tc-study

Translation Core study app in the bt-synergy monorepo.

```bash
bun install
bun run dev --filter=tc-study
bun run check
```

`/test/panels` is available in **DEV builds only** (`import.meta.env.DEV`).

## Theme (light / dark)

Design tokens + preference store. See [docs/THEME.md](./docs/THEME.md).

- Toggle: Sun/Moon in the app header and read navigation chrome
- Preference: Settings → Appearance (light / dark / system)
- Storage key: `tc-study:theme-preference`
