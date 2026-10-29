# tC Study — Style Manual

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

The colours are translationCore 4's, from its design system. Light values are tC4's own; dark values follow tC4's dark-ground rules on Ocean surfaces ([TC4_STYLE_AND_BRAND.md](./TC4_STYLE_AND_BRAND.md) §5.2, §5.3). The source of truth is `src/index.css`, whose `var(--uw-…)` / `var(--tc-…)` names resolve in `src/styles/tc4-tokens.css`. `src/styles/themeContrast.test.ts` pins every value below and checks the text pairs reach 4.5:1. Utilities are Tailwind v4 `@theme` names: `--color-X` → `bg-X` / `text-X` / `border-X`.

### Shell & surfaces

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `canvas` | `#f7fafc` paper | `#071e2c` | App background (`body`) |
| `surface` | `#ffffff` | `#0c2a3c` | Cards, modal panels, resource viewer headers (`ResourceViewerHeader`) |
| `elevated` | `#ffffff` | `#12364c` | Raised panels / dialogs |
| `tab-selected` | `#ffffff` | `#05141e` | Active `SortableTab` on `panel-*-soft` strip (elevated in light; darker than strip in dark) |
| `muted` | `#ecf2f5` frost | `#1f3b4c` | Soft fills, hover chips |
| `border` | `#e2e4e6` | `#415967` | Primary borders |
| `border-subtle` | `#e8ebed` | `#294453` | Hairline / soft separators |

### Foreground

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `fg` | `#1e2c36` ink | `#ffffff` | Primary text |
| `fg-secondary` | `#4f5e6a` slate | `#c2cace` | Secondary labels, inactive tab text on soft strips |
| `fg-muted` | `#626f78` steel | `#9eaab1` | Placeholders, disabled, de-emphasized (still 4.5:1 on surface and muted) |

### Accent & feedback

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `accent` | `#156d91` Inspire 700 | `#31ade3` Inspire | Accent text, focus ring, `rc://` links. Inspire itself is never text on light (2.6:1). |
| `accent-hover` | `#0c4f6b` | `#7acded` | Hover on accent |
| `accent-soft` | `#eaf6fc` | `#144761` | Soft accent fill (BCV pill, badges) |
| `accent-fg` | `#014263` Ocean | `#cfecf8` | High-contrast text on accent-soft |
| `accent-fill` / `-hover` / `-press` | `#31ade3` / `#2599cc` / `#1f8cba` | same | Filled pill buttons, white label at weight 800 (tC4's brand pairing) |
| `accent-fill-fg` | `#ffffff` | `#ffffff` | Label on `accent-fill` (tC4 `--t-accent-on-fill`, 2.56:1: only at 13.5 px weight 800 or larger) |
| `danger` | `#a21309` | `#f2938a` | Errors / destructive |
| `danger-soft` | `#faedeb` | `#313b48` | Soft error fill |
| `warning` | `#e59d33` Kindle | `#e59d33` | Saturated warning |
| `warning-fg` | `#8a5b12` | `#f2ce99` | High-contrast amber text (TA footers; pair with `accent-fg` for TW) |
| `warning-soft` | `#fcf6ea` | `#313b48` | Soft warning fill (warning `Badge`) |
| `valid-soft` / `valid-fg` | `#e8f7ed` / `#327547` | `#184246` / `#9bdaaf` | Valid `Badge` fill and text (tC4 valid surface and strong) |
| `highlight` | `#fff1b8` | `#5b4b12` | Verse / note selection wash; Helps filter value pill fill |
| `highlight-strong` | `#fdd910` | `#7a641c` | Stronger selection border/fill; filter × hover wash |
| `underline` | `#b7c2c9` haze | `#9eaab1` | Dotted scripture underlines (decorative) |
| `overlay` | `rgb(1 38 56 / 0.55)` | `rgb(0 10 16 / 0.65)` | Modal/dialog scrim (`bg-overlay`) |

### Scripture paper

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `scripture` | `#ffffff` | `#0f3044` | Scripture pane background |
| `scripture-fg` | `#231f20` | `#ffffff` | Scripture body text |
| `scripture-muted` | `#626f78` | `#9eaab1` | Empty / italic / secondary scripture |

### Panels & helps

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `panel-1` / `panel-1-soft` / `panel-1-fg` | `#31ade3` / `#eaf6fc` / `#156d91` | `#31ade3` / `#144761` / `#cfecf8` | Panel 1 chrome (Inspire) |
| `panel-2` / `panel-2-soft` / `panel-2-fg` | `#e59d33` / `#fcf6ea` / `#8a5b12` | `#e59d33` / `#333f3a` / `#f2ce99` | Panel 2 chrome (Kindle) |
| `helps` / `helps-soft` / `helps-fg` | `#014263` / `#ecf2f5` / `#014263` | `#a8def4` / `#1f3b4c` / `#ffffff` | Combined Helps accents (Ocean, as tC4's helps panel) |
| `helps-border` | `#014263` | `#415967` | Outline `Button` stroke: Ocean, white 22% in dark |

Panel 2 is Kindle rather than Cultivate. Under simulated tritanopia (Machado 2009), the Inspire and Cultivate strips sit at ΔE 1.2, below a just-noticeable difference. Inspire and Kindle stay at ΔE ≥ 7.4 under normal vision, deuteranopia and tritanopia.

### Reading chips

| Token | Light | Dark | Typical use |
|-------|-------|------|-------------|
| `chip-quote` / `chip-quote-hover` / `chip-quote-fg` | `#eaf6fc` / `#cfecf8` / `#014263` | `#123f57` / `#154964` / `#cfecf8` | Scripture / OBS quote chips |

Verse/ref group headers use shared `muted/50` + `fg-secondary` (see `helpsCardStyles` — `HELPS_VERSE_HEADER`), not a tinted chip.

Ring offset uses `canvas` (`--color-ring-offset`).

---

## Typography

### Fonts

tC4's faces, self-hosted in `public/fonts/` with their OFL licences so the app works offline (`src/styles/tc4-fonts.css`). Each face loads only for the characters in its `unicode-range`.

- **UI chrome:** Mulish, the `font-ui` utility, set on `body`.
- **Scripture:** Charis SIL, the `font-scripture` utility, on the scripture and OBS panes. Greek falls to Noto Serif and Hebrew to Noto Serif Hebrew. Arabic-script text keeps the system fallback for now.
- **Mono:** `font-mono` for code / raw USFM snippets in cards and admin tools.

Do not hard-code faces in components; use `font-ui` / `font-scripture`.

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
| `chrome-bar` | `2.5rem` (40px) | `h-chrome-bar` | Fixed panel header strip height |
| `chrome-control` | `1.75rem` (28px) | `h-chrome-control`, `w-chrome-control` | Tab / compact control height |
| `content` | `0.75rem` (12px) | `p-content` | Helps lists & card padding |
| `content-lg` | `1rem` (16px) | `p-content-lg` | Scripture reading pad |
| `stack` / `stack-lg` | `0.5rem` / `0.75rem` | `space-y-stack`, `gap-stack` | Card & group vertical rhythm |
| `micro` / `caption` / `chrome` (text) | `10px` / `11px` / `12px` | `text-micro`, `text-caption`, `text-chrome` | Badges, meta, tabs |

Prefer these over ad-hoc `p-2` / `text-[10px]` in reading chrome. Avoid double borders + heavy card shadows; hairline `border-border-subtle` and flat `rounded-md` keep the iOS-like hierarchy.

---

## Components

`src/components/ui/` holds small components with tC4's control shapes, built only from tokens ([TC4_STYLE_AND_BRAND.md](./TC4_STYLE_AND_BRAND.md) §5.5). Reach for these before a raw `<button>` or a hand-styled box. `features/**` must not import them (import-direction guard).

| Component | Use | tC4 reference |
|-----------|-----|---------------|
| `Button` | Text actions. `fill` for the main action, `outline` beside it, `quiet` and `danger` as text actions. 36 px (`md`) or 44 px (`lg`), always 44 px under `pointer: coarse`. | Button / Action |
| `IconButton` | Icon-only actions. `label` becomes `aria-label` and `title`. 30 / 36 / 44 px squares, 44 px on touch. | IconButton |
| `Badge` | Short status or count, in the `accent`, `valid`, `danger`, `warning` or `neutral` tone. | Badge |
| `Card` | A bordered box on `surface`, radius 16, with the card shadow. `as` sets the element, `padded={false}` drops the padding. | Card / Surface |
| `SectionLabel` | "BOOKS · 1"-style overlines and box headings (`as="h2"`). | Overline |
| `Switcher` | Tabs (`indicator="underline"`) or a segmented control (`indicator="pill"`), with arrow, Home and End keys. | Switcher |
| `Dialog` | Modals: `bg-overlay` scrim, radius-16 `elevated` panel, title in `helps-fg`, close `IconButton`. Escape and a scrim press close it. | Modal |
| `TextField` | A labelled input: `SectionLabel` label, radius 9, 36 px (44 px on touch). | TextField / Field |

---

## Reading & chrome conventions

- **Scripture pane:** `bg-scripture text-scripture-fg`; selection via `highlight` / `highlight-strong`; underlines via `underline`. In dark, scripture paper must sit clearly above `canvas` (avoid near-black-on-black).
- **BCV pill (`NavigationBarCompact`):** `bg-accent-soft` + `text-accent-fg` — soft fill must clear canvas; accent-fg is the readable chrome text on that fill (not `text-accent` alone).
- **Resource viewer headers:** `ResourceViewerHeader` uses `bg-surface` with a hairline `border-b`; Helps list panels also use `bg-surface` (`HELPS_LIST_PANEL`) so verse chips sit on white (dark: the Ocean surface) — not the `canvas` paper.
- **Helps verse headers:** `bg-muted/50` + `text-fg-secondary` (+ book icon, ref, count on `bg-surface`) — neutral muted chips (lighter than full `muted`), not lavender `chip-verse`.
- **Helps cards:** idle `surface` + border; quote chips use `chip-quote*`; selected TN/TWL use light yellow `bg-highlight/15` + even `border-border` (no left bar / ring / blue or purple wash). TA vs TW footers use `warning-fg` (amber) vs `accent-fg` (blue) — not `helps-fg` purple (blue/purple fails tritanopia). Prose links per [THEME.md](./THEME.md) (accent / fg-secondary — not rainbow hover chips).
- **Helps filter pill:** `bg-highlight text-scripture-fg` (borderless `h-7` capsule) — same wash as highlighted scripture tokens (`TokenRenderer`), so filter ↔ selection feel related.
- **Modals:** `bg-overlay` scrim; panel `bg-surface` / `bg-elevated`, `border-border`, `text-fg`. New modals use `Dialog`.
- **Panel tabs:** soft strip `bg-panel-*-soft/70` at fixed `h-chrome-bar`; tabs `h-chrome-control` (icon-only and labeled share one height); selected `bg-tab-selected`; inactive label `text-fg-secondary`.
- **Focus:** global `ring-accent` + `ring-offset-canvas` on `:focus-visible`.

---

## Checklist for UI changes

- [ ] Colors from semantic tokens (or add a token in both `:root` and `.dark`)
- [ ] No new hard-coded light-only greys/purples for shared chrome
- [ ] Icon-first actions with `title` + `aria-label`
- [ ] Scripture vs UI contrast preserved in both themes
- [ ] Spot-check light and dark after chrome density changes

---

## Restyle progress

Screens moving from raw palette classes to tokens ([TC4_STYLE_AND_BRAND_PLAN.md](./TC4_STYLE_AND_BRAND_PLAN.md), PR 5). `utils/rawPaletteFreeze.test.ts` holds the count; each PR lowers it.

- [ ] 5a Shell and shared pieces
- [ ] 5b Read
- [ ] 5c Home, Library, Collections, Passage sets
- [ ] 5d Studio
- [ ] 5e Settings remainder, wizards, Catalog, Create package, Data
