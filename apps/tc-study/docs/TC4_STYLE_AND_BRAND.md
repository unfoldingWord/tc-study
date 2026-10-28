# tC Study on the translationCore family style and brand — design spec

Status: **design, approved in conversation 2026-10-28; awaiting review of this written spec.**
Nothing here is built yet. An implementation plan follows once this spec is approved.

Sources read on 2026-10-28:
- this repository at `868a7cc`;
- `unfoldingWord/translationCore4` `main` at `bc510508`;
- the GitHub repositories `unfoldingWord/tc-admin-app`, `tc-mobile`, `tc-website` and `tc-create-app`.

## 1. Why

"TC" in tc-study stands for **translationCore**, unfoldingWord's product family. The app today reads it
as "Translation Companion" (tab title, About, `package.json`) or "Translation Core" (README). Its
look, a warm stone palette with Tailwind blue and the system font, shares nothing with the rest of
the family.

The goal is that a translator who knows translationCore 4 recognises tC Study as part of the same
family, by its name, its colours, its type and its controls. Nothing the app does should change.

## 2. Decisions (owner, 2026-10-28)

| # | Decision |
|---|---|
| D1 | The app is named **tC Study**. Its full name is **translationCore Study**. |
| D2 | **Dark mode stays.** Its values come from tC4's own dark-ground rules (§5.3), not from a palette invented here. |
| D3 | Scope is **`apps/tc-study` only**. `apps/tc-study-next`, `apps/mobile` (Expo) and the packages are not touched. |
| D4 | **No logo until unfoldingWord approves one.** The wordmark is text. The broken favicon link goes. A later PR adds the approved mark. |
| D5 | **Approach A:** tC4's token values go *under the token names tc-study already uses*. Components are migrated screen by screen. tC4's components are not ported; they are a visual reference only. |

Out of scope, and to be decided separately if wanted:
- tC4's Understand / Translate / Check navigation model;
- i18n (tc-study has none);
- the hard-coded "Version 0.1.0" in Settings;
- the `bt-synergy-cache` / `tc-study-cache` IndexedDB name mismatch seen in
  `CollectionExportDialog.tsx:49`, `SaveCollectionDialog.tsx:65` and `useCollectionImport.ts:110`.

## 3. The family

| App | Repository | Name used | Look |
|---|---|---|---|
| translationCore (tC3) | unfoldingWord/translationCore | translationCore | previous desktop app |
| translationCore 4 | unfoldingWord/translationCore4 | translationCore® 4, "tC4" | the tC4 design system (§4) |
| tC Admin | unfoldingWord/tc-admin-app | tC Admin | copies the tC4 tokens it uses into one `app.css`; Mulish |
| tC Mobile | unfoldingWord/tc-mobile | tC Mobile / translationCore Mobile | own dark palette and system font; does not follow tC4 |
| translationCore Create | unfoldingWord/tc-create-app | translationCore Create | older web app |
| Website | unfoldingWord/tc-website | translationCore® Suite | marketing site for the family |

Naming rules:
- Write "translationCore" with a lower-case t and a capital C, with no space.
- The short form is "tC" + name.
- Marketing copy carries ®.
- tC4's licence says the translationCore name and logo need unfoldingWord's written permission. D4
  follows from that.

## 4. The tC4 style, as tokens

Source: `crates/tc-ui/assets/ds/tokens/*.css` on tC4 `main`. This is the vendored copy of the
"translationCore 4 Design System". Its master lives in a Claude Design project owned by tC4
(epic #104).

tC Study **copies the token values it uses**, as tC Admin does, under tC4's own names, in one file:
`src/styles/tc4-tokens.css`. Each block names the tC4 file it came from. A change to the design system
is then one edit there.

The values used:

- **Brand palette**
  - Ocean `#014263`.
  - Inspire `#31ADE3`, with its scale 50 `#eaf6fc`, 100 `#cfecf8`, 200 `#a8def4`, 300 `#7acded`,
    600 `#1f8cba`, 700 `#156d91` and 800 `#0c4f6b`.
  - Cultivate `#70C9CC`, with text `#2F6F72`.
  - Kindle `#E59D33`, with text `#8A5B12`.
  - Black `#231F20`.
- **Neutrals**
  - paper `#F7FAFC`
  - frost `#ECF2F5`
  - mist `#D9E2E8`
  - haze `#B7C2C9` (decorative only, 1.7:1)
  - steel `#626F78` (4.9:1 on paper)
  - slate `#4F5E6A`
  - ink `#1E2C36`
- **tC status**
  - valid `#58C17A` / `#327547`
  - invalid `#A21309`, with surface `#FAEDEB`
  - invalid on dark `#F2938A`
  - highlight `#FDD910`, soft `#FFF1B8`
- **Type**
  - Interface: Mulish.
  - Scripture: Charis SIL.
  - Greek: Noto Serif.
  - Hebrew: Noto Serif Hebrew.
  - Weights: 800 for labels and buttons, 900 for headings.
  - Scripture leading in px on a 4 px grid: 17.5/28, 19.5/32 and 22/36.
- **Shape**
  - radius 4 / 7 / 8 / 9 / 10 / 12 / 14 / 16 / pill;
  - control heights 30 / 36 / 44 (44 = touch target);
  - strokes 1 / 1.5 / 2;
  - Ocean-tinted shadows, never neutral black;
  - motion `cubic-bezier(.2,0,.2,1)` at 150 / 200 / 240 ms, with no bounce.
- **Contrast rules kept from tC4 and tC Admin**
  - Inspire is never text: it measures 2.6:1 on paper. Text in the accent colour is Inspire 700.
  - Focus rings and links use Inspire 700 or Ocean.

## 5. Layers

### 5.1 Names and brand (PR 1)

| Where | Today | After |
|---|---|---|
| `index.html:7` `<title>` | TC Study - Translation Companion | tC Study |
| `index.html:5` favicon | `/vite.svg` (404) | link removed (D4) |
| `index.html` | no description | `<meta name="description" content="translationCore Study — study the Bible with translation resources, offline.">` |
| `src/pages/Settings.tsx:101` About | TC Study - Translation Companion | tC Study — translationCore Study |
| `src/components/Layout.tsx:25` wordmark | TC Study, beside a BookOpen tile | tC Study, text only |
| `src/pages/Home.tsx:32` | Welcome to TC Study | Welcome to tC Study |
| `public/manifest.json:2-3` | TC Study / TC Study | name translationCore Study, short_name tC Study, add description, `theme_color` Ocean |
| `package.json:5` description | Translation Companion Study - … | translationCore Study — web app for Bible translation resources with offline capability |
| `README.md:1-3` | tc-study / Translation Core study app | tC Study (translationCore Study) |
| `docs/STYLE_MANUAL.md:1` | TC Study — Style Manual | tC Study — Style Manual |
| exported collection README: `src/lib/services/CollectionExportService.ts:281,304,332` and `src/workers/collectionExport.worker.ts:457,480,508` | BT Synergy Collection / Open BT Synergy application / Generated by BT Synergy | tC Study collection / Open tC Study / Generated by tC Study |

Not renamed, because changing them loses users' data or breaks files already exported:
- storage keys `tc-study:*` and `bt-synergy:*`;
- IndexedDB names;
- the format ids `bt-synergy-collection` and `bt-synergy-language-pack`;
- `@bt-synergy/*` package names;
- the Cloudflare project `tc-study`;
- CI job names.

PR 1 must confirm that the collection importer does not parse the README text. If it does, the
format line stays as it is.

### 5.2 Light tokens and type (PR 2)

`src/index.css` keeps its `--theme-*` names and its `@theme` mapping, so the 1,646 token utilities
change with no component edit. The values become tC4's:

| `--theme-*` | Light value | tC4 source |
|---|---|---|
| canvas | `#F7FAFC` | paper / `--surface-app` |
| surface, elevated, tab-selected | `#FFFFFF` | `--surface-card` |
| muted | `#ECF2F5` | frost / `--surface-muted` |
| border | `#E2E4E6` | `--border` (black 10%) composited on paper |
| border-subtle | `#E8EBED` | `--border-hair` (black 7%) composited on paper |
| fg | `#1E2C36` | ink / `--text-body` |
| fg-secondary | `#4F5E6A` | slate |
| fg-muted | `#626F78` | steel (was `#a8a29e`, which fails AA) |
| accent | `#156D91` | Inspire 700 / `--text-accent` (text, links, focus ring) |
| accent-hover | `#0C4F6B` | Inspire 800 |
| accent-soft | `#EAF6FC` | Inspire 50 |
| accent-fg | `#014263` | Ocean (`--t-accent-on-soft`) |
| scripture | `#FFFFFF` | `--surface-card` |
| scripture-fg | `#231F20` | `--text-scripture` |
| scripture-muted | `#626F78` | steel |
| highlight | `#FFF1B8` | `--tc-highlight-soft` |
| highlight-strong | `#FDD910` | `--tc-highlight` |
| underline | `#B7C2C9` | haze (decorative) |
| danger / danger-soft | `#A21309` / `#FAEDEB` | invalid / invalid surface |
| warning / warning-fg | `#E59D33` / `#8A5B12` | Kindle / `--tc-warn-text` |
| panel-1 / -soft / -fg | `#31ADE3` / `#EAF6FC` / `#156D91` | Inspire tone |
| panel-2 / -soft / -fg | `#70C9CC` / `#EEF9F9` / `#2F6F72` | Cultivate tone (replaces violet) |
| helps / -soft / -fg | `#014263` / `#ECF2F5` / `#014263` | Ocean, as tC4's helps panel headings |
| chip-quote / -hover / -fg | `#EAF6FC` / `#CFECF8` / `#014263` | Inspire 50 / 100, Ocean |
| overlay | `rgb(1 38 56 / 0.55)` | `--scrim-modal` |

Three new tokens go in the same file and the `@theme` block:
- `--theme-accent-fill`: Inspire `#31ADE3` for filled pill buttons, with `-hover` `#2599CC` and
  `-press` `#1F8CBA`. White on it is tC4's own 2.56:1 brand pairing, used only at 13.5 px weight 800
  or larger.
- `--font-ui`: Mulish.
- `--font-scripture`: Charis SIL. Greek and Hebrew fall back to Noto Serif and Noto Serif Hebrew
  through `unicode-range`.

Other changes in this PR:

- **Body** uses `font-ui`.
- **Scripture text** uses `font-scripture`. It is applied once, at the scripture pane root.
- **Panel 1 and panel 2 strips:** the STYLE_MANUAL asks that the two be told apart with colour-vision
  deficiency. This PR checks Inspire beside Cultivate with a CVD simulation (Chromium DevTools
  "Emulate vision deficiencies"). If they can't be told apart under deuteranopia or tritanopia,
  panel 2 takes the Kindle tone (`#E59D33` / `#FCF6EA` / `#8A5B12`) instead. Either way, the result
  is recorded in STYLE_MANUAL.
- **TA and TW footers** keep the amber/blue pair: `warning-fg` and `accent-fg`.

Fonts are self-hosted in `public/fonts/` as woff2, with their OFL licence texts. They are copied from
tC4's vendored set (`src/ds/assets/fonts/` at tC4 `11437da9`). The app must work offline, so there is
no CDN.

The faces are:
- Mulish variable (latin, latin-ext, cyrillic, cyrillic-ext, vietnamese);
- Charis SIL 400, 400 italic and 700 (latin, latin-ext, cyrillic, vietnamese);
- Noto Serif greek and greek-ext 400/700;
- Noto Serif Hebrew 400/700.

A Spanish or English page downloads about 60–100 KB of fonts.

Arabic-script scripture keeps the system fallback in this spec. Amiri and Awami Nastaliq are a
follow-up.

### 5.3 Dark tokens (PR 2)

tC4 has no dark app theme. It has a dark *ground*: `tokens/context.css` `[data-on="dark"]`, used on
the Ocean bar. Its rules are:
- text is white;
- muted text is white at 60%, faint text at 40%;
- lines are white at 22%;
- quiet fills are white at 8%, or 16% on hover;
- every tone's text uses its light end;
- invalid uses `#F2938A`.

The tC Study dark theme is that ground spread over the app, on Ocean-family surfaces. Translucent
values are composited to solid hex, so Tailwind opacity modifiers (`bg-muted/50`, `bg-highlight/15`,
`bg-panel-*-soft/70`) keep their meaning.

| `--theme-*` | Dark value | Rule |
|---|---|---|
| canvas | `#071E2C` | Ocean, darkened |
| surface | `#0C2A3C` | one step up |
| elevated | `#12364C` | two steps up |
| scripture | `#0F3044` | reading paper, between surface and elevated |
| tab-selected | `#05141E` | below canvas, as today |
| muted | `#1F3B4C` | white 8% on surface |
| border | `#415967` | white 22% on surface |
| border-subtle | `#294453` | white 12% on surface |
| fg, scripture-fg | `#FFFFFF` | `--fg` (14.9:1 on surface) |
| fg-secondary | `#C2CACE` | white 75% on surface (9.0:1) |
| fg-muted, scripture-muted, underline | `#9EAAB1` | `--fg-muted` white 60% (6.3:1) |
| accent, panel-1 | `#31ADE3` | Inspire is light enough on dark (5.8:1) |
| accent-hover | `#7ACDED` | Inspire 300 |
| accent-soft, panel-1-soft | `#144761` | Inspire 22% on surface |
| accent-fg, panel-1-fg, chip-quote-fg | `#CFECF8` | Inspire 100 (8.1:1 on accent-soft) |
| accent-fill | `#31ADE3` | unchanged; tC4 keeps fills in both contexts |
| chip-quote / -hover | `#123F57` / `#154964` | Inspire 16% / 24% on surface |
| panel-2 / -soft / -fg | `#70C9CC` / `#1E4756` / `#D4EFF0` | Cultivate (7.7:1), 18% tint, light end |
| helps / -soft / -fg | `#A8DEF4` / `#1F3B4C` / `#FFFFFF` | Ocean has no dark identity in tC4, so it degrades to light Inspire on a quiet fill |
| highlight / -strong | `#5B4B12` / `#7A641C` | a solid dark gold. A yellow tint over blue reads olive; tC4 notes the same effect for red. |
| danger / danger-soft | `#F2938A` / `#313B48` | `--tc-invalid-on-dark` (6.6:1) |
| warning / warning-fg | `#E59D33` / `#F2CE99` | Kindle (6.5:1) and its light end |
| overlay | `rgb(0 10 16 / 0.65)` | darker scrim over a dark app |

Every pair in this table that carries text clears 4.5:1. The values were measured with the WCAG
formula; PR 2 rechecks them in the browser. The dark theme is new to the family, so PR 2's
description asks for the tC4 design-system owner's opinion. A change they ask for is a value edit in
`index.css`.

### 5.4 Shape (PR 3)

- **Radius.** Tailwind 4.1.18's radius theme variables are overridden in `@theme`, so the 572
  existing `rounded-*` utilities follow tC4 with no component edit:

  | Variable (utility) | Tailwind now | After | tC4 token |
  |---|---|---|---|
  | `--radius-xs` (`rounded-xs`) | 2 px | 4 px | `--radius-xs` |
  | `--radius` (`rounded`), `--radius-sm` (`rounded-sm`) | 4 px | 4 px | `--radius-xs` |
  | `--radius-md` (`rounded-md`) | 6 px | 8 px | `--radius-sm` |
  | `--radius-lg` (`rounded-lg`) | 8 px | 10 px | `--radius-md` |
  | `--radius-xl` (`rounded-xl`) | 12 px | 12 px | `--radius-lg` |
  | `--radius-2xl`, `--radius-3xl`, `--radius-4xl` | 16 / 24 / 32 px | 16 px | `--radius-2xl` |
  | `rounded-full` | pill | pill | `--radius-pill` |

- **Shadows.** The shadow theme variables become tC4's Ocean-tinted shadows (`tokens/elevation.css`):

  | Variable | tC4 shadow |
  |---|---|
  | `--shadow-2xs`, `--shadow-xs` | `--shadow-chip` |
  | `--shadow`, `--shadow-sm` | `--shadow-card` |
  | `--shadow-md` | `--shadow-hover` |
  | `--shadow-lg` | `--shadow-hero` |
  | `--shadow-xl`, `--shadow-2xl` | `--shadow-modal` |

  `--shadow-inner` is left as it is. In dark, the same names take the tC4 values with
  `rgb(0 0 0 / …)` at the same alpha, because an Ocean tint is invisible on Ocean.
- **Scrollbars** become tC4's floating Ocean capsule, from `tokens/base.css`, with the white variant
  in dark.
- **Focus ring:** `ring-accent`. Inspire 700 in light and Inspire in dark both clear 3:1.
- **Text sizes are not remapped.** tc-study is read on phones, and tC4's 13.5 px desktop scale would
  shrink every screen. The base components (PR 4) use tC4's sizes where tC4 uses them for that
  control.

### 5.5 Base components (PR 4)

There is no shared Button today: there are 270 raw `<button>` elements. PR 4 adds small components
in `src/components/ui/`, each built only from tokens:

| Component | tC4 reference | Rules |
|---|---|---|
| `Button` | Button / Action | Pill. Heights 36 (desktop) and 44 (touch, `pointer: coarse`). Weight 800. Variants `fill` (accent-fill, white), `outline` (1.5 px Ocean in light, white 22% in dark), `quiet`, `danger`. |
| `IconButton` | IconButton | Square on the height ladder, radius 8. Requires `aria-label`. |
| `Badge` | Badge | Height 20–24, 10–11 px, weight 800, uppercase with 0.06 em tracking, soft tone fills. |
| `Card` | Card / Surface | `bg-surface`, 1 px border, radius 16, card shadow. |
| `Switcher` | Switcher | `indicator="underline"` (2 px accent bar, for tabs) and `indicator="pill"` (segmented control). Roving tab index. |
| `Dialog` | Modal | Overlay scrim, radius 16, modal shadow, title 20/800 in `helps-fg` (Ocean / white). Built on the existing `ModalPortal`. |
| `TextField` | TextField / Field | Radius 9, input border, label 11 px uppercase. |
| `SectionLabel` | Overline | 11 px, weight 800, uppercase with 0.13 em tracking, `fg-muted`. Used for "BOOKS · 1"-style labels. |

Each component gets a unit test of its accessible name and variants. PR 4 adopts them on the
Settings page only, so they have a first user and a visual check. Other screens adopt them in PR 5.

New files under `components/ui/` are not under a folder budget. `features/` code must not import them,
because the import-direction guard forbids `features/ → components/`.

### 5.6 Screens (PR 5a–5e)

Each PR moves one area from raw palette classes to tokens and the PR 4 components. The visible
structure and the behaviour stay the same.

| PR | Area | Notable |
|---|---|---|
| 5a | Shell: `Layout.tsx`, menus | The top bar becomes tC4's Ocean bar (dark ground, white wordmark in Mulish 800 at 15.5 px). Hidden on `/read` as today. |
| 5b | Read: panels, tabs, helps | Helps cards follow tC4's HelpCard: tone badge, Ocean title, quote in scripture face. Panel tabs use `Switcher`. |
| 5c | Home, Library, Collections, Passage sets | `Card` and `Button`. Library rows follow tC4's OptionCard. |
| 5d | Studio | Including `ResourceLibrarySidebar`. |
| 5e | Settings remainder, wizards, Catalog, Create package, Data | Wizard progress uses tC4's step dots. |

The about 210 raw classes in `components/test/`, `examples/`, `dev/` and `WorkerTestPanel.tsx` are
dev-only and stay. The ratchet in §6 allowlists them.

### 5.7 Docs

- **PR 2** updates `STYLE_MANUAL.md` (palette tables, fonts) and `THEME.md` (where values come from,
  `tc4-tokens.css`).
- **PR 4** adds the component table to STYLE_MANUAL.
- **Each screen PR** ticks its area off a checklist at the end of STYLE_MANUAL.

## 6. Guarding the result

PR 2 adds `utils/rawPaletteFreeze.test.ts`, an arch-freeze ratchet in the style of the existing
`*Freeze` tests:
- It counts Tailwind palette colour classes (`(bg|text|border|ring|from|to|via|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}`)
  and `bg-white`, `text-white`, `bg-black` and `text-black` in production `.tsx` files.
- It skips the dev allowlist.
- It fails when the count grows.

The baseline is the count measured in PR 2. Each screen PR lowers it. When it reaches 0 it becomes a
plain ban.

## 7. Risks and how each PR handles them

- **godSize at zero headroom.** `components/resources/CombinedHelpsViewer/index.tsx` is at 391/391 and
  `features/nav/useBcvNavigatorController.ts` at 338/338. A class edit there must keep the line count.
  If it can't, the markup moves into a new child component. A budget is never raised.
- **Tight folder budgets.** ScriptureViewer has about 6,149 lines against 6,237. CombinedHelpsViewer
  and WordsLinksViewer are also tight. Moving repeated class strings into PR 4 components lowers these
  folders' counts.
- **E2E class selectors.**
  - `e2e/journeys/04-helps-interaction.spec.ts:63-64` expects `bg-highlight/15` and `border-border`.
  - `07-rtl-smoke.spec.ts:30` uses the locator `div.h-full.flex.flex-col[dir="rtl"]`.
  - `highlighted-token` is checked in 04 and 08.

  Approach A keeps these classes. If PR 5b has to change one, it changes the spec in the same PR, to
  a role or data attribute rather than another class.
- **Unit tests that assert class strings.** About 14 do, for example `helpsCardStyles.test.ts`,
  `ReadPanelHeader.test.ts`, `LanguagePicker*.test.ts`, `EmptyPanelState.test.ts` and
  `PanelResizeDivider.test.ts`. They are updated in the PR that changes the class.
- **No visual tests.** Every PR attaches screenshots of the screens it touches: light and dark, at
  375 × 812 and 1280 × 900, before and after.
- **Every merge to master deploys `tc-study.pages.dev`.** Pull requests into any other branch get no
  CI. PRs 2 and 3 should be merged together, so the app is never half-way between palettes and shapes.
  Between PR 3 and PR 5e, screens not yet migrated show tC4 colours on the old component shapes. That
  is acceptable for a beta, but it is the owner's call when to start merging.
- **The design system has an owner.** tC Study becomes a second copy of the tokens, as tC Admin is.
  Before PR 2 merges, the tC4 owner is told, and is shown the dark theme (§5.3).

## 8. Order, size and testing

| PR | Content | Estimate |
|---|---|---|
| 1 | Names and brand (§5.1) | 0.5 day |
| 2 | Light and dark tokens, fonts, raw-palette ratchet, docs (§5.2, 5.3, 6) | 2 days |
| 3 | Radius, shadows, scrollbars, focus (§5.4) | 1 day |
| 4 | Base components, adopted on Settings (§5.5) | 2–3 days |
| 5a–5e | Screens (§5.6) | 3–5 days |
| later | Approved logo: favicon, manifest icons, wordmark mark (D4) | 0.5 day |

The total is about 9–12 days.

Per PR, locally:
- the unit tests of the files touched;
- the arch-freeze lane (`utils/*Freeze`, `godSize`, `folderSize`, guards);
- `tsc`, lint and the production build;
- the screenshots above.

CI runs the full unit, arch-freeze and E2E jobs. No PR is merged, deployed or published without the
owner's approval.

## 9. Done means

- No user-visible text in `apps/tc-study` says "Translation Companion", "Translation Core" or
  "BT Synergy".
- Every production component takes its colour from a token. The raw-palette ratchet is at 0 outside
  the dev allowlist.
- Interface text is in Mulish and scripture in Charis SIL / Noto Serif, loaded offline.
- Light and dark both pass AA for text in the screenshots of every main route. The one exception is
  tC4's white-on-Inspire filled button (2.56:1, §5.2), which unfoldingWord has kept as a brand
  pairing and which is used only at 13.5 px weight 800 or larger.
- CI is green: unit, arch-freeze and E2E.
