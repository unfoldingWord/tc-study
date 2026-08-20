# tc-study-next

Experimental app forked from tc-study Epic #21. `apps/tc-study` remains the production study app.

```bash
bun install
bun run dev --filter=tc-study-next
bun run check
```

Dev server: http://localhost:3021 (tc-study stays on :3000).

Do **not** deploy this app to the `tc-study` Cloudflare Pages project. Use `tc-study-next`.

`/test/panels` is available in **DEV builds only** (`import.meta.env.DEV`).

## Theme (light / dark)

Design tokens + preference store. See [docs/THEME.md](./docs/THEME.md).

- Toggle: Sun/Moon in the app header and read navigation chrome
- Preference: Settings → Appearance (light / dark / system)
- Storage key: `tc-study:theme-preference`
