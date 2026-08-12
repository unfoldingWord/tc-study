# Theme system (tc-study)

Layered UI (boneless / lifeless / headless) for light + dark, with room for more themes later.

Broader style guide (full palette tables, typography, chrome conventions): **[STYLE_MANUAL.md](./STYLE_MANUAL.md)**.

## Layers

| Layer | Location | Role |
|-------|----------|------|
| **Boneless** | `src/index.css` (`:root` / `.dark` + `@theme`) | Design tokens as CSS variables → Tailwind utilities (`bg-canvas`, `text-fg`, …) |
| **Lifeless** | `src/features/theme/` | Preference store + `useTheme` — no markup |
| **Headless / skin** | `ThemeToggle`, `ThemePreferenceButtons` | Behavior + a11y; styled with tokens |

Switching mechanism: `class="dark"` on `<html>` (also `data-theme` and `color-scheme`).

## Preference

- Values: `light` \| `dark` \| `system`
- Persisted: `localStorage` key `tc-study:theme-preference`
- Applied before paint via inline script in `index.html` (avoids FOUC)
- `ThemeBootstrap` listens to `prefers-color-scheme` when preference is `system`

## Toggle

- Read chrome / app header: `ThemeToggle` (Sun/Moon; sets explicit light/dark)
- Settings: `ThemePreferenceButtons` (Sun / Moon / Monitor)

## Add a token

1. Add `--theme-my-token` under `:root` and `.dark` in `src/index.css`.
2. Map it in `@theme`: `--color-my-token: var(--theme-my-token);`
3. Use utilities: `bg-my-token`, `text-my-token`, `border-my-token`, etc.

Prefer semantic tokens over scattering `dark:` one-offs or baking theme into business logic.

## Modal overlays

Dialogs use a shared scrim token so backdrops stay consistent in light and dark:

| Token | Utilities | Use |
|-------|-----------|-----|
| `overlay` | `bg-overlay` | Full-screen modal/dialog backdrop (optionally with `backdrop-blur-sm`) |

Modal panels themselves use `bg-surface` / `bg-elevated`, with `border-border`, `text-fg`, `text-fg-secondary`, `bg-muted` for chrome — not hard-coded `bg-white` / `text-gray-*`.

## Helps reading chips

Verse group headers and quote buttons on Combined Helps / TN / TWL cards use dedicated chip tokens (solid fills — not hard-coded `*-50` gradients):

| Token | Utilities | Use |
|-------|-----------|-----|
| `chip-verse` / `chip-verse-fg` | `bg-chip-verse`, `text-chip-verse-fg` | Verse/ref group headers + count badges |
| `chip-quote` / `chip-quote-hover` / `chip-quote-fg` | `bg-chip-quote`, `hover:bg-chip-quote-hover`, `text-chip-quote-fg` | Scripture / OBS quote chips on note & word-link cards |
| `filter-chip` / `filter-chip-fg` | `bg-filter-chip`, `text-filter-chip-fg` | Helps header filter value pill (`TokenFilterBanner`) — borderless capsule tuned to contrast against `surface` headers (do not reuse pale `accent-soft` there) |

`ResourceViewerHeader` (scripture titles + Helps chrome strip) uses `bg-surface` so it stays lighter than the surrounding `bg-canvas` content in light mode, and remains distinct (not near-black-on-black) in dark mode.

Pair with shared `surface`, `fg`, `fg-secondary`, `fg-muted`, `border`, `helps*` for card chrome and entry links.

## Helps inline markdown links

TN / Combined Helps prose links are rendered in `src/lib/markdown/remarkRenderer.tsx`. Use shared semantic colors (no purple/blue/green `*-50` hover chips):

| Link kind | Classes | Notes |
|-----------|---------|--------|
| `rc://` (TA / TW / other) | `text-accent hover:text-accent-hover hover:bg-muted` | Type distinguished by icon (`GraduationCap` / `Hash` / `BookOpen`), not tint |
| Relative (`../`, `./`) | `text-fg-secondary hover:text-fg hover:bg-muted` | e.g. verse ranges like `3:12–15` |
| External `http(s)` | `text-accent hover:text-accent-hover underline` | |
| Invalid `rc://` | `text-fg-muted` | Disabled span |

Resource tabs (`SortableTab`) on `from-panel-*-soft` headers use `text-fg-secondary` when inactive so labels stay readable in dark mode (avoid `text-fg-muted` on the soft strip).

## Add another theme later

Option A — extra root class (e.g. `.sepia`) with its own `--theme-*` block, resolve in the store.

Option B — `data-theme="sepia"` selectors instead of/in addition to `.dark`.

Keep preference resolution in `resolveEffectiveTheme` / the store; keep components on token utilities only.
