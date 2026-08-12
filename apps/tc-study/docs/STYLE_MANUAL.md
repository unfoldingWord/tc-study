# TC Study — Style Manual

Broader visual language for `apps/tc-study`: palette, type, layers, and reading/chrome conventions.

Token how-to (add a token, preference store, FOUC boot, modal/chip/link specifics) lives in **[THEME.md](./THEME.md)**. Prefer that doc for mechanics; use this manual for design intent and the full token inventory.

Source of truth for color values: `src/index.css` (`:root` / `.dark` + `@theme` mapping).

---

## Layers (boneless / lifeless / headless)

| Layer | Location | Role |
|-------|----------|------|
| **Boneless** | `src/index.css` | Design tokens as CSS variables → Tailwind utilities (`bg-canvas`, `text-fg`, …) |
| **Lifeless** | `src/features/theme/` | Preference store + `useTheme` — no markup |
| **Headless / skin** | `ThemeToggle`, `ThemePreferenceButtons` | Behavior + a11y; styled with tokens |

Switching: `class="dark"` on `<html>` (also `data-theme` and `color-scheme`). Preference: `light` \| `dark` \| `system`, key `tc-study:theme-preference`. Details in [THEME.md](./THEME.md).

**Rule:** components use semantic utilities only — no scattered hard-coded `gray-*` / `blue-*` / one-off `dark:` pairs for chrome that already has a token.

---

## Color palette

Values below match `src/index.css` as of the dark-mode theme work. Utilities are Tailwind v4 `@theme` names: `--color-X` → `bg-X` / `text-X` / `border-X`.

### Shell & surfaces

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `canvas` | `#f4f2ef` | `#17191c` | App background (`body`) |
| `surface` | `#ffffff` | `#212428` | Cards, modal panels, resource viewer headers (`ResourceViewerHeader`) |
| `elevated` | `#ffffff` | `#2a2e34` | Raised panels / dialogs |
| `muted` | `#ebe8e4` | `#2f343b` | Soft fills, hover chips, scrollbar track |
| `border` | `#e0dcd6` | `#3a4048` | Primary borders |
| `border-subtle` | `#efece8` | `#2c3138` | Hairline / soft separators |

### Foreground

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `fg` | `#1c1917` | `#ece8e3` | Primary text |
| `fg-secondary` | `#57534e` | `#b0aaa3` | Secondary labels, inactive tab text on soft strips |
| `fg-muted` | `#a8a29e` | `#7a7470` | Placeholders, disabled, de-emphasized |

### Accent & feedback

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `accent` | `#2563eb` | `#6eb0ff` | Primary actions, focus ring, `rc://` links |
| `accent-hover` | `#1d4ed8` | `#93c5fd` | Hover on accent |
| `accent-soft` | `#eff6ff` | `#1a2f4a` | Soft accent fill |
| `accent-fg` | `#1e40af` | `#93c5fd` | Text on accent-soft |
| `danger` | `#dc2626` | `#f87171` | Errors / destructive |
| `danger-soft` | `#fef2f2` | `#3f1d1d` | Soft error fill |
| `highlight` | `#fef08a` | `#5c4a14` | Verse / note selection wash |
| `highlight-strong` | `#fde047` | `#7a641c` | Stronger selection border/fill |
| `underline` | `#a8a29e` | `#9a948c` | Dotted scripture underlines |
| `overlay` | `rgb(0 0 0 / 0.5)` | `rgb(0 0 0 / 0.55)` | Modal/dialog scrim (`bg-overlay`) |

### Scripture paper

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `scripture` | `#fffef9` | `#1c1f24` | Scripture pane background |
| `scripture-fg` | `#1c1917` | `#e8e4df` | Scripture body text |
| `scripture-muted` | `#78716c` | `#9a948c` | Empty / italic / secondary scripture |

### Panels & helps

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `panel-1` / `panel-1-soft` / `panel-1-fg` | `#2563eb` / `#eff6ff` / `#1d4ed8` | `#6eb0ff` / `#1a2f4a` / `#93c5fd` | Panel 1 chrome (blue scheme) |
| `panel-2` / `panel-2-soft` / `panel-2-fg` | `#7c3aed` / `#f5f3ff` / `#6d28d9` | `#a78bfa` / `#2a2438` / `#c4b5fd` | Panel 2 chrome (purple scheme) |
| `helps` / `helps-soft` / `helps-fg` | `#7c3aed` / `#f5f3ff` / `#5b21b6` | `#a78bfa` / `#2a2438` / `#c4b5fd` | Combined Helps accents |

### Reading chips

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `chip-verse` / `chip-verse-fg` | `#eeeaf8` / `#5b21b6` | `#2f2a3d` / `#c4b5fd` | Verse/ref group headers + count badges |
| `chip-quote` / `chip-quote-hover` / `chip-quote-fg` | `#eef4ff` / `#e0eaff` / `#1e40af` | `#1e2a3d` / `#243548` / `#93c5fd` | Scripture / OBS quote chips |
| `filter-chip` / `filter-chip-fg` | `#dbeafe` / `#1e40af` | `#243548` / `#93c5fd` | Helps header filter value capsule (stronger than `accent-soft` on `surface` headers) |

Ring offset uses `canvas` (`--color-ring-offset`).

---

## Typography

### Fonts

The app does **not** load a custom webfont today. UI and scripture use the **browser / Tailwind default sans** stack (effectively system UI sans). Body applies `antialiased`.

- **UI chrome:** default sans via Tailwind text utilities.
- **Scripture:** same sans family; distinguished by `text-scripture-fg` / `bg-scripture` and layout (verse blocks / USJ para styles), not a separate face.
- **Mono:** `font-mono` for code / raw USFM snippets in cards and admin tools.

If a branded or reading-optimized face is added later, define it as a boneless token (e.g. `--font-ui` / `--font-scripture`) in `index.css` and map through `@theme` — do not hard-code faces in components.

### Size scale (as used today)

Tailwind defaults; common app usage:

| Role | Classes | Notes |
|------|---------|--------|
| Micro badges | `text-[10px]`, occasionally `text-[9px]`–`text-[11px]` | Chip counts, nav meta |
| Caption / meta | `text-xs` | Secondary chrome, admin labels |
| UI body | `text-sm` | Forms, lists, panel summaries |
| Default / helps prose | `text-base` + `leading-relaxed` | TN / TWL / markdown body |
| Section titles | `text-lg`–`text-xl` + `font-semibold` | Entry headers, browser titles |
| Page / book titles | `text-2xl` + `font-bold` | Scripture book title, wizard headings |
| Weight | `font-medium` / `font-semibold` / `font-bold` | Hierarchy; avoid all-caps walls of text |

Markdown headings in `remarkRenderer` map `h1`→`text-2xl` … `h6`→`text-xs`.

**Icon-first:** prefer Lucide icons + `title` / `aria-label` over visible text labels (see repo `.cursorrules`).

---

## Spacing & type hierarchy tokens

Defined in `src/index.css` `@theme` (Tailwind utilities):

| Token | Value | Utilities | Use |
|-------|-------|-----------|-----|
| `chrome` | `0.5rem` (8px) | `p-chrome`, `px-chrome`, `gap-chrome` | Read bar / panel header insets |
| `chrome-tight` | `0.375rem` (6px) | `py-chrome-tight`, `gap-chrome-tight` | Compact vertical chrome |
| `content` | `0.75rem` (12px) | `p-content` | Helps lists & card padding |
| `content-lg` | `1rem` (16px) | `p-content-lg` | Scripture reading pad |
| `stack` / `stack-lg` | `0.5rem` / `0.75rem` | `space-y-stack`, `gap-stack` | Card & group vertical rhythm |
| `micro` / `caption` / `chrome` (text) | `10px` / `11px` / `12px` | `text-micro`, `text-caption`, `text-chrome` | Badges, meta, tabs |

Prefer these over ad-hoc `p-2` / `text-[10px]` in reading chrome. Avoid double borders + heavy card shadows; hairline `border-border-subtle` and flat `rounded-md` keep the iOS-like hierarchy.

---

## Reading & chrome conventions

- **Scripture pane:** `bg-scripture text-scripture-fg`; selection via `highlight` / `highlight-strong`; underlines via `underline`.
- **Resource viewer headers:** `ResourceViewerHeader` uses `bg-surface` (near-white light / elevated charcoal dark) so titles + Helps chrome lift off `bg-canvas` list areas — not transparent/`canvas` gray.
- **Helps cards:** `surface` + chip tokens for verse/quote; prose links per [THEME.md](./THEME.md) (accent / fg-secondary — not rainbow hover chips).
- **Helps filter pill:** `bg-filter-chip text-filter-chip-fg` (borderless `h-7` capsule) — not `accent-soft`, which washes out on header chrome.
- **Modals:** `bg-overlay` scrim; panel `bg-surface` / `bg-elevated`, `border-border`, `text-fg`.
- **Panel tabs:** soft strip `from-panel-*-soft`; inactive label `text-fg-secondary`.
- **Focus:** global `ring-accent` + `ring-offset-canvas` on `:focus-visible`.

---

## Checklist for UI changes

- [ ] Colors from semantic tokens (or add a token in both `:root` and `.dark`)
- [ ] No new hard-coded light-only greys/purples for shared chrome
- [ ] Icon-first actions with `title` + `aria-label`
- [ ] Scripture vs UI contrast preserved in both themes
- [ ] Spot-check light and dark after chrome density changes
