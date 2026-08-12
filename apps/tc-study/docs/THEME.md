# Theme system (tc-study)

Layered UI (boneless / lifeless / headless) for light + dark, with room for more themes later.

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

## Add another theme later

Option A — extra root class (e.g. `.sepia`) with its own `--theme-*` block, resolve in the store.

Option B — `data-theme="sepia"` selectors instead of/in addition to `.dark`.

Keep preference resolution in `resolveEffectiveTheme` / the store; keep components on token utilities only.
