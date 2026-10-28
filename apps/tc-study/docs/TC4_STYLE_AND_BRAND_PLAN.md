# tC Study family style and brand — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** tC Study carries the translationCore name and tC4's colours, type and shapes in light and dark,
with no change in behaviour.

**Architecture:** tC4's token values are set under tc-study's existing `--theme-*` names in
`src/index.css`, together with Tailwind 4 theme variables (radius, shadow, font). That restyles every
token utility at once. New small components in `src/components/ui/` carry tC4's control shapes, and
screens move from raw palette classes to tokens one area per PR. A ratchet test stops raw classes from
coming back.

**Tech Stack:** React 18, Tailwind CSS 4.1.18 (`@tailwindcss/vite`, CSS-first `@theme`), bun test with
`renderToStaticMarkup`, Playwright, Vite.

**Spec:** `apps/tc-study/docs/TC4_STYLE_AND_BRAND.md`. The section numbers below (§) refer to it. Read it
first: its tables hold every value this plan uses.

## Global Constraints

- One PR per part below (PR 1 … PR 5e, then the logo PR), each branched from `origin/master`.
  Nothing is pushed, merged or deployed without the owner's yes. Every merge to master deploys
  `tc-study.pages.dev`.
- Commits are in English, with a short title and a body that says why. Each ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never raise a `godSize` or `folderSize` budget. `CombinedHelpsViewer/index.tsx` (391/391) and
  `features/nav/useBcvNavigatorController.ts` (338/338) keep their exact line counts.
- `features/**` never imports from `components/**` (import-direction guard).
- Never rename storage keys (`tc-study:*`, `bt-synergy:*`), IndexedDB names, format ids
  (`bt-synergy-collection`, `bt-synergy-language-pack`) or `@bt-synergy/*` packages.
- Inspire `#31ADE3` is never a text colour on a light ground. Text in the accent colour is `accent`
  (Inspire 700 in light).
- Fonts are self-hosted in `apps/tc-study/public/fonts/`, with no CDN, and every `@font-face` uses
  `font-display: swap`.
- Dev-only paths, which are allowlisted from the raw-palette ratchet and not restyled:
  `components/test/**`, `components/examples/**`, `components/dev/**` and
  `components/WorkerTestPanel.tsx`.
- Before each PR, from `apps/tc-study`, run:
  - `bun test <touched test files>`
  - `bun run test:arch`
  - `bun run type-check`
  - `bun run lint`
  - `bun run build`

  CI runs everything else (unit, arch-freeze and E2E).
- Every PR description carries before and after screenshots of the screens it touches: light and dark,
  at 375 × 812 and 1280 × 900.

## Review Focus

1. **A saved theme preference** (`tc-study:theme-preference` = `dark`, or `system` on a dark OS). The
   boot script in `index.html` must still set `.dark` before first paint, and every dark text pair must
   stay readable. This is pinned by Task 2.1's contrast test.
2. **Greek and Hebrew original-language text, and RTL resources.** These must render in Noto Serif /
   Noto Serif Hebrew through `unicode-range`, not in a Latin face. They are pinned by Task 2.2's font
   test and by E2E `07-rtl-smoke` staying green.
3. **Opacity modifiers on tokens in dark** (`bg-highlight/15`, `bg-muted/50`, `bg-panel-*-soft/70`).
   They only keep their look if every dark value is solid hex. This is pinned by Task 2.1.
4. **A collection exported by the new build and imported by an older one.** Only the README prose may
   change; the manifest format id stays `bt-synergy-collection`. This is pinned by Task 1.2.
5. **Touch targets on phones.** `Button` and `IconButton` must reach 44 px under `pointer: coarse`.
   This is pinned by Task 4.1.

---

## PR 1 — Names and brand (§5.1)

Branch: `brand/tc-study-names`.

### Task 1.1: User-visible names in the app shell

**Files:**
- Modify: `apps/tc-study/index.html:5,7`
- Modify: `apps/tc-study/public/manifest.json`
- Modify: `apps/tc-study/src/pages/Settings.tsx:101`
- Modify: `apps/tc-study/src/components/Layout.tsx:21-25`
- Modify: `apps/tc-study/src/pages/Home.tsx:32`
- Modify: `apps/tc-study/package.json:5`
- Modify: `apps/tc-study/README.md:1-3`
- Modify: `apps/tc-study/docs/STYLE_MANUAL.md:1`
- Test: `apps/tc-study/src/utils/brandNameGuards.test.ts` (new; the `Guards` suffix puts it in the arch
  lane)

**Interfaces:** Produces `BRAND_SHORT = 'tC Study'` and `BRAND_FULL = 'translationCore Study'`, exported
from `apps/tc-study/src/config/brand.ts`. Settings, Layout and Home render these constants rather than
literals.

- [ ] **Step 1: Write the failing test `brandNameGuards.test.ts`.** It covers four things:
  - **Production sources.** Scanning production `src/**/*.{ts,tsx}` (skipping `.test.`, `.spec.` and
    the dev allowlist) finds no `Translation Companion`, no `Translation Core` (capital C, spaced) and
    no `BT Synergy`.
  - **`index.html`.** `<title>` is exactly `tC Study`. There is no `/vite.svg`. A
    `<meta name="description">` contains `translationCore Study`.
  - **`public/manifest.json`.** `name === 'translationCore Study'`, `short_name === 'tC Study'`,
    `theme_color === '#014263'`, and `description` is a non-empty string.
  - **`package.json`.** `description` starts with `translationCore Study`.
- [ ] **Step 2: Run it and expect failure.** Run `bun test src/utils/brandNameGuards.test.ts`. It
  should FAIL on the title, the manifest, `Settings.tsx:101` and the export services.
- [ ] **Step 3: Create `src/config/brand.ts` and make the edits** in the files above, with the
  copy from the §5.1 table:
  - Layout drops the `BookOpen` tile, and the wordmark becomes `{BRAND_SHORT}` alone.
  - The About line becomes `{BRAND_SHORT}` in `<strong>`, then ` — ` and `{BRAND_FULL}`.
  - Do not touch `CollectionExportService.ts` or `collectionExport.worker.ts` here; they are Task 1.2.
- [ ] **Step 4: Run the guard test.** It now fails only on the two export files, which Task 1.2 fixes.

### Task 1.2: Exported collection README

**Files:**
- Modify: `apps/tc-study/src/lib/services/CollectionExportService.ts:281,304,332`
- Modify: `apps/tc-study/src/workers/collectionExport.worker.ts:457,480,508`
- Test: `apps/tc-study/src/workers/collectionExportReadme.test.ts` (new)

**Interfaces:** Consumes `BRAND_SHORT` from Task 1.1. Produces
`export function generateCollectionReadme(manifest, hasContent): string` in
`apps/tc-study/src/lib/services/collectionReadme.ts`.

The two copies of `generateReadme` are moved into that one module, so both the service and the worker
import it. The worker is bundled by Vite, so a plain module import works. This removes the duplication
instead of fixing the text twice.

- [ ] **Step 1: Write the failing test.** For a manifest with `formatVersion: '1.0.0'`, the README
  contains:
  - `**Format:** tC Study collection v1.0.0`
  - `1. Open tC Study`
  - `Generated by tC Study`

  It does not contain `BT Synergy`.
- [ ] **Step 2: Run it and expect failure.** Run `bun test src/workers/collectionExportReadme.test.ts`.
  It should FAIL because the module does not exist yet.
- [ ] **Step 3: Implement the shared module.**
  - Create `collectionReadme.ts` with the existing body and the new copy.
  - Delete both private `generateReadme`s, and call the shared function from both files.
  - Check with `grep -rn "README" src/features/collections src/components/collections` that no
    importer reads the README.
  - Leave the manifest `format` id exactly `bt-synergy-collection`.
- [ ] **Step 4: Run the checks.** Run:
  - `bun test src/workers/collectionExportReadme.test.ts src/utils/brandNameGuards.test.ts`
  - `bun run test:arch`

  Expect both tests to PASS.
- [ ] **Step 5: Run the pre-PR checks and take screenshots.** Run the Global Constraints checks.
  Screenshot the header, Home and Settings.
- [ ] **Step 6: Commit and stop.** Commit
  `Name the app tC Study, as the translationCore family names its apps`. Then stop for the owner's
  review of PR 1.

---

## PR 2 — Tokens, fonts and ratchet (§5.2, §5.3, §5.7, §6)

Branch: `style/tc4-tokens`. Merge together with PR 3 (§7).

### Task 2.1: Light and dark token values

**Files:**
- Create: `apps/tc-study/src/styles/tc4-tokens.css`
- Modify: `apps/tc-study/src/index.css`, in the `:root` block, the `.dark` block and the `@theme`
  mapping
- Test: `apps/tc-study/src/styles/themeContrast.test.ts` (new)

**Interfaces:**
- Produces `--theme-accent-fill`, `--theme-accent-fill-hover` and `--theme-accent-fill-press`, mapped
  in `@theme` as `--color-accent-fill*`. The utilities are `bg-accent-fill`, `hover:bg-accent-fill-hover`
  and `active:bg-accent-fill-press`.
- `tc4-tokens.css` declares tC4's own names on `:root`:
  - the `--uw-*` brand and neutral values;
  - the `--tc-*` status values;
  - tC4's shadows, renamed `--tc4-shadow-chip`, `--tc4-shadow-card`, `--tc4-shadow-hover`,
    `--tc4-shadow-hero` and `--tc4-shadow-modal` so they don't collide with Tailwind's `--shadow-*`.

  Each block carries a comment naming its tC4 source file
  (`crates/tc-ui/assets/ds/tokens/<file>.css` at `bc510508`).
- `index.css` imports it after `tailwindcss`. The `--theme-*` values reference the tC4 names where a
  value is a straight tC4 value, and use the hex from the spec's tables where the value is composited.

- [ ] **Step 1: Write the failing test `themeContrast.test.ts`.** It parses the `:root` and `.dark`
  blocks of `index.css`, resolving `var(--uw-…)`/`var(--tc-…)` through `tc4-tokens.css`, and asserts
  four things:
  - **(a) Exact values.** Every `--theme-*` value equals the §5.2 table in light and the §5.3 table in
    dark. Keep the expected values as one `const EXPECTED = { light: {...}, dark: {...} }`.
  - **(b) Text pairs reach 4.5:1** by the WCAG formula, in both themes: fg/surface, fg/canvas,
    fg-secondary/surface, fg-muted/surface, fg-muted/muted, accent/surface, accent-fg/accent-soft,
    scripture-fg/scripture, scripture-muted/scripture, danger/danger-soft, warning-fg/surface,
    panel-1-fg/panel-1-soft, panel-2-fg/panel-2-soft, helps-fg/helps-soft, chip-quote-fg/chip-quote,
    scripture-fg/highlight.
  - **(c) Solid hex in dark.** Every `.dark` value except `overlay` is a 6-digit hex.
  - **(d) No Inspire as accent text.** Light `accent` is not `#31ADE3`.
- [ ] **Step 2: Run it and expect failure.** Run `bun test src/styles/themeContrast.test.ts`. It should
  FAIL on the values.
- [ ] **Step 3: Write `tc4-tokens.css`, then set the values and the three `accent-fill` tokens** in
  `index.css`.
- [ ] **Step 4: Choose panel 2's colour.** Run `bun run dev`, open `/read` with two panels, and apply
  Chromium DevTools → Rendering → Emulate vision deficiencies → deuteranopia, then tritanopia.
  - If the panel 1 and panel 2 strips can't be told apart, switch panel 2 to the Kindle tone from §5.2
    and update `EXPECTED`.
  - Record the outcome in a line of `STYLE_MANUAL.md`.
- [ ] **Step 5: Run the test.** Run `bun test src/styles/themeContrast.test.ts`. Expect PASS.

### Task 2.2: Self-hosted fonts and font tokens

**Files:**
- Create: `apps/tc-study/public/fonts/*.woff2` and the four `OFL-*.txt` files
- Create: `apps/tc-study/src/styles/tc4-fonts.css`
- Modify: `apps/tc-study/src/index.css` (`@import`, `@theme` font variables, `body`)
- Modify: `apps/tc-study/src/components/resources/ScriptureViewer/index.tsx:434` and
  `ObsViewer/ObsViewer.tsx:134`, adding `font-scripture` on the same line
- Test: `apps/tc-study/src/styles/fonts.test.ts` (new)

**Interfaces:** Produces the Tailwind utilities `font-ui` and `font-scripture` (`--font-ui`,
`--font-scripture` in `@theme`). The values are tC4's `--font-ui` and `--font-scripture` stacks.
Greek and Hebrew are separate `@font-face` families (`"Noto Serif"`, `"Noto Serif Hebrew"`) appended to
the scripture stack after Charis SIL.

The source files are in `C:\Users\LENOVO\Git\Github\translationCore4\src\ds\assets\fonts\` at
`11437da9`. Copy exactly these:
- `mulish-{latin,latin-ext,cyrillic,cyrillic-ext,vietnamese}-wght-normal.woff2`
- `charis-sil-{latin,latin-ext,cyrillic,vietnamese}-{400,700}-normal.woff2`
- `charis-sil-{latin,latin-ext}-400-italic.woff2`
- `noto-serif-greek{,-ext}-{400,700}-normal.woff2`
- `noto-serif-hebrew-hebrew-{400,700}-normal.woff2`
- `OFL-{Mulish,CharisSIL,NotoSerif,NotoSerifHebrew}.txt`

That is about 510 KB on disk, of which a Latin-only page loads about 75 KB. The matching `@font-face`
rules come from that commit's `src/ds/tokens/fonts.css`, with `url()` rewritten to `/fonts/<file>`.

- [ ] **Step 1: Write the failing test `fonts.test.ts`.** It checks that:
  - every `url()` in `tc4-fonts.css` exists under `public/fonts/`;
  - every `@font-face` has `font-display: swap` and a `unicode-range`;
  - the families `Mulish`, `Charis SIL`, `Noto Serif` and `Noto Serif Hebrew` each have an
    `OFL-*.txt`;
  - the `Noto Serif` rules cover `U+0370-03FF` (Greek), and `Noto Serif Hebrew` covers `U+0590-05FF`;
  - `index.css` contains no `fonts.googleapis`.
- [ ] **Step 2: Run it and expect failure.** Run `bun test src/styles/fonts.test.ts`.
- [ ] **Step 3: Implement.**
  - Copy the files.
  - Write `tc4-fonts.css` and import it from `index.css`.
  - Add `--font-ui` and `--font-scripture` to `@theme`.
  - Set `body` to `font-ui`.
  - Add `font-scripture` to the two scripture roots, without changing their line counts.
- [ ] **Step 4: Run the checks.** Run `bun test src/styles/fonts.test.ts` and then
  `bun run test:arch`. Expect PASS.

### Task 2.3: Raw-palette ratchet and docs

**Files:**
- Create: `apps/tc-study/src/utils/rawPaletteFreeze.test.ts`
- Modify: `apps/tc-study/docs/STYLE_MANUAL.md` (palette tables, Typography, and a "Restyle progress"
  checklist with one line per PR 5a–5e)
- Modify: `apps/tc-study/docs/THEME.md` (values come from `tc4-tokens.css`; how to copy a tC4 change)

**Interfaces:** Produces `RAW_PALETTE_BASELINE` (a number), which each PR 5 task lowers.

- [ ] **Step 1: Write `rawPaletteFreeze.test.ts`.** Copy the pattern of `consoleLogFreeze.test.ts`:
  - Count matches of `\b(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b`
    plus `\b(bg|text|border)-(white|black)\b`, with any variant prefix and any `/NN` opacity suffix.
  - Count over production `src/**/*.{ts,tsx}`, skipping tests and the dev allowlist.
  - Assert `≤ RAW_PALETTE_BASELINE`.
- [ ] **Step 2: Set the baseline.** Run it once with the baseline at 0 to read the current count, then
  set `RAW_PALETTE_BASELINE` to that count. Run `bun run test:arch`; expect PASS.
- [ ] **Step 3: Update the two docs.**
- [ ] **Step 4: Run the pre-PR checks and take screenshots.** Run the Global Constraints checks.
  Screenshot `/read`, Home, Library and Studio in both themes. Also run the E2E journeys locally
  (`bun run test:e2e`): the token values move `bg-highlight/15`, so confirm journey 04 still passes.
- [ ] **Step 5: Commit and stop.** Commit
  `Take tC4's colours and type under tc-study's own token names`. Stop for the owner's review; PR 3
  follows on top of this branch.

---

## PR 3 — Shape (§5.4)

Branch: `style/tc4-shape`, cut from `style/tc4-tokens`.

### Task 3.1: Radius, shadows, scrollbars and focus

**Files:**
- Modify: `apps/tc-study/src/index.css`: `@theme` radius and shadow variables, the `.dark` shadow
  overrides, the `@layer base` scrollbars and `:focus-visible`
- Test: `apps/tc-study/src/styles/shape.test.ts` (new)

**Interfaces:** Consumes the `--tc4-shadow-*` values from Task 2.1. It sets the Tailwind 4.1.18
variables listed in §5.4: `--radius-xs`, `--radius`, `--radius-sm` … `--radius-4xl`, and `--shadow-2xs`
… `--shadow-2xl`, `--shadow`.

- [ ] **Step 1: Write the failing test `shape.test.ts`.** It parses `@theme` and checks that:
  - the radius values equal the §5.4 table (4, 4, 4, 8, 10, 12, 16, 16, 16 px);
  - each shadow variable references the `--tc4-shadow-*` that §5.4 assigns it;
  - no light shadow contains `rgb(0 0 0` (they are Ocean-tinted);
  - the `.dark` block redefines the `--tc4-shadow-*` values with black at the same alpha.
- [ ] **Step 2: Run it and expect failure.** Run `bun test src/styles/shape.test.ts`.
- [ ] **Step 3: Implement.**
  - Set the variables.
  - Replace the scrollbar rules with tC4's capsule (`tokens/base.css`): 10 px, a 2 px transparent
    border, the thumb `rgb(1 66 99 / .18)`, rising to `.32` on hover and `.42` while pressed.
  - In `.dark`, the thumb is `rgb(255 255 255 / .22)`.
  - Add the `@supports not selector(::-webkit-scrollbar-thumb)` fallback exactly as tC4 has it.
  - Keep `:focus-visible` on `ring-accent`.
- [ ] **Step 4: Run the test, the pre-PR checks and screenshots.** Run `bun test src/styles/shape.test.ts`
  and expect PASS. Then run the Global Constraints checks, and take the same screenshots as PR 2.
- [ ] **Step 5: Commit and stop.** Commit
  `Give tc-study tC4's corners, Ocean-tinted shadows and scrollbars`. Stop; the owner merges PR 2 and
  PR 3 together.

---

## PR 4 — Base components (§5.5)

Branch: `style/tc4-components`, from master after PR 2 and PR 3 are merged.

### Task 4.1: `Button` and `IconButton`

**Files:**
- Create: `apps/tc-study/src/components/ui/Button.tsx`
- Create: `apps/tc-study/src/components/ui/IconButton.tsx`
- Test: `apps/tc-study/src/components/ui/Button.test.ts`
- Test: `apps/tc-study/src/components/ui/IconButton.test.ts`

**Interfaces:**
- `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'fill' | 'outline' | 'quiet' | 'danger'; size?: 'md' | 'lg' }): JSX.Element`.
  - The default variant is `fill` and the default size is `md`.
  - Classes: `rounded-full font-extrabold` with `text-[13.5px]`. Height is `h-9` at `md` and `h-11` at
    `lg`, plus `pointer-coarse:h-11` on both. Padding is `px-5`.
  - `fill`: `bg-accent-fill text-white hover:bg-accent-fill-hover active:bg-accent-fill-press`.
  - `outline`: `border-[1.5px] border-helps-fg text-helps-fg`.
  - `quiet`: `text-fg-secondary hover:bg-muted`.
  - `danger`: `text-danger hover:bg-danger-soft`.
  - A `type` default of `button`.
- `IconButton(props: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' | 'lg'; children: ReactNode }): JSX.Element`.
  - `aria-label` and `title` are `label`.
  - Sizes are square: `size-[30px]`, `size-9` and `size-11`, plus `pointer-coarse:size-11`.
  - Radius is `rounded-md` (8 px).

- [ ] **Step 1: Write the failing tests.** They use `renderToStaticMarkup`, as in
  `EmptyPanelState.test.ts`:
  - Each variant renders its fill or text class.
  - `type="button"` is the default.
  - Both components contain `pointer-coarse:h-11` / `pointer-coarse:size-11`.
  - `IconButton` renders `aria-label` and `title` from `label`.
  - A `className` passed in is appended, not replacing the base classes.
- [ ] **Step 2: Run them and expect failure.** Run `bun test src/components/ui/Button.test.ts
  src/components/ui/IconButton.test.ts`.
- [ ] **Step 3: Implement both,** joining classes with `clsx` (already a dependency).
- [ ] **Step 4: Run them.** Run the same command; expect PASS.

### Task 4.2: `Badge`, `Card` and `SectionLabel`

**Files:**
- Create: `apps/tc-study/src/components/ui/Badge.tsx`
- Create: `apps/tc-study/src/components/ui/Card.tsx`
- Create: `apps/tc-study/src/components/ui/SectionLabel.tsx`
- Test: `apps/tc-study/src/components/ui/surfaces.test.ts`

**Interfaces:**
- `Badge({ tone = 'accent', children }: { tone?: 'accent' | 'valid' | 'danger' | 'warning' | 'neutral'; children: ReactNode })`.
  - Classes: `inline-flex h-5 items-center rounded-full px-2 text-[10px] font-extrabold uppercase
    tracking-[0.06em]`.
  - Tone fill / text pairs:
    - accent: `bg-accent-soft` / `text-accent-fg`;
    - valid: `bg-valid-soft` / `text-valid-fg`;
    - danger: `bg-danger-soft` / `text-danger`;
    - warning: `bg-warning-soft` / `text-warning-fg`;
    - neutral: `bg-muted` / `text-fg-secondary`.
  - Three new tokens go into `index.css` (`:root`, `.dark` and the `@theme` mapping) and into Task
    2.1's `EXPECTED`:

    | Token | Light | Dark | tC4 source |
    |---|---|---|---|
    | `--theme-valid-soft` | `#E8F7ED` | `#184246` | `--tc-valid-surface`; dark is valid 16% on surface |
    | `--theme-valid-fg` | `#327547` | `#9BDAAF` | `--tc-valid-strong`; dark is valid's light end. The pairs measure 5.0:1 and 6.8:1. |
    | `--theme-warning-soft` | `#FCF6EA` | `#313B48` | `--tc-warn-surface` |
- `Card({ as = 'div', padded = true, className, ...rest })`:
  `rounded-2xl border border-border bg-surface shadow-sm`, plus `p-6` when padded.
- `SectionLabel({ children })`: an element with `text-[11px] font-extrabold uppercase tracking-[0.13em]
  text-fg-muted`.

- [ ] **Step 1: Write the failing tests.**
  - Each `Badge` tone renders its pair.
  - `Card` renders `as="section"` as `<section`.
  - `SectionLabel` carries its classes.
  - Task 2.1's contrast test gets the pairs valid-fg/valid-soft and warning-fg/warning-soft, and its
    solid-hex check covers the three new dark values.
- [ ] **Step 2: Run them and expect failure.** Run `bun test src/components/ui/surfaces.test.ts
  src/styles/themeContrast.test.ts`.
- [ ] **Step 3: Implement the three components and the three tokens.**
- [ ] **Step 4: Run them.** Run the same command; expect PASS.

### Task 4.3: `Switcher`

**Files:**
- Create: `apps/tc-study/src/components/ui/Switcher.tsx`
- Create: `apps/tc-study/src/components/ui/switcherKeys.ts`
- Test: `apps/tc-study/src/components/ui/Switcher.test.ts`

**Interfaces:**
- `nextSwitcherIndex(current: number, key: string, count: number, dir: 'ltr' | 'rtl'): number | null`
  handles `ArrowRight`/`ArrowLeft` (swapped in rtl) with wrap-around, plus `Home` and `End`. Any other
  key returns `null`.
- `Switcher<T extends string>({ items, value, onChange, indicator = 'underline', label, dir = 'ltr' }: { items: { value: T; label: string; icon?: ReactNode }[]; value: T; onChange(v: T): void; indicator?: 'underline' | 'pill'; label: string; dir?: 'ltr' | 'rtl' })`:
  - The container is `role="tablist"` with `aria-label={label}`.
  - Each item is a `role="tab"` button with `aria-selected`, and `tabIndex` 0 only on the selected
    item.
  - `underline` gives the selected item `border-b-2 border-accent text-fg` and the others
    `text-fg-secondary`.
  - `pill` gives the container `rounded-full bg-muted p-1`, and the selected item
    `rounded-full bg-surface shadow-xs text-fg`.

- [ ] **Step 1: Write the failing tests.**
  - For `nextSwitcherIndex`: `(0,'ArrowRight',3,'ltr') → 1`, `(2,'ArrowRight',3,'ltr') → 0`,
    `(0,'ArrowRight',3,'rtl') → 2`, `(1,'Home',3,'ltr') → 0`, `(0,'End',3,'ltr') → 2`,
    `(0,'a',3,'ltr') → null`.
  - Static markup has one `tabindex="0"`, `aria-selected="true"` on the value, and the indicator
    classes per mode.
- [ ] **Step 2: Run them and expect failure.** Run `bun test src/components/ui/Switcher.test.ts`.
- [ ] **Step 3: Implement.** `onKeyDown` calls `nextSwitcherIndex`, then `onChange`, then focuses the
  new tab by ref.
- [ ] **Step 4: Run them.** Expect PASS.

### Task 4.4: `Dialog` and `TextField`

**Files:**
- Create: `apps/tc-study/src/components/ui/Dialog.tsx`
- Create: `apps/tc-study/src/components/ui/TextField.tsx`
- Test: `apps/tc-study/src/components/ui/Dialog.test.ts`
- Test: `apps/tc-study/src/components/ui/TextField.test.ts`

**Interfaces:**
- `Dialog({ open, onClose, title, closeLabel, children, footer }: { open: boolean; onClose(): void; title: string; closeLabel: string; children: ReactNode; footer?: ReactNode })`.
  - It renders through the existing `components/shared/ModalPortal`; read its props before use.
  - The scrim is `bg-overlay`.
  - The panel is `role="dialog" aria-modal="true" aria-labelledby` the title, with `rounded-2xl
    bg-elevated shadow-xl max-w-[520px]`.
  - The title is `text-xl font-extrabold text-helps-fg`.
  - The close button is an `IconButton` labelled with `closeLabel`.
  - Escape and a scrim press call `onClose`.
  - It renders nothing when `!open`.
- `TextField({ id, label, ...input }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string })`.
  - The label is `htmlFor={id}`, styled like `SectionLabel`.
  - The input has `h-9 pointer-coarse:h-11 rounded-[9px] border border-border bg-surface px-3
    text-sm`.
  - The focus ring is `ring-accent`.

- [ ] **Step 1: Write the failing tests.**
  - Closed renders `''`.
  - Open has `role="dialog"`, `aria-modal`, and `aria-labelledby` matching the title's id.
  - The close button carries `closeLabel`.
  - TextField's `label[for]` equals the input's `id`.
- [ ] **Step 2: Run them and expect failure.** Run `bun test src/components/ui/Dialog.test.ts
  src/components/ui/TextField.test.ts`.
- [ ] **Step 3: Implement both.**
- [ ] **Step 4: Run them.** Expect PASS.

### Task 4.5: First use on Settings

**Files:**
- Modify: `apps/tc-study/src/pages/Settings.tsx`: `Card` for the three boxes; `Button` for the two
  buttons at `:61` (danger) and `:81` (outline); `SectionLabel` for the box headings
- Modify: `apps/tc-study/docs/STYLE_MANUAL.md`: a component table with name, use and tC4 reference

**Interfaces:** Consumes Tasks 4.1–4.4.

- [ ] **Step 1: Make the edits.** Lower `RAW_PALETTE_BASELINE` by what Settings drops.
- [ ] **Step 2: Run the checks and screenshots.** Run the Global Constraints checks. Screenshot
  Settings in both themes, at 375 and 1280.
- [ ] **Step 3: Commit and stop.** Commit `Add tC4-shaped base components and use them on Settings`.
  Stop for review.

---

## PR 5 — Screens (§5.6)

Each part is one PR from master, made with the same task shape:
1. **Before.** Note `RAW_PALETTE_BASELINE` and take the "before" screenshots.
2. **Migrate.** Replace every raw palette class in the listed files with a token utility or a
   `components/ui` component, using this table:

   | Raw class | Token class |
   |---|---|
   | `gray-900/800` text | `text-fg` |
   | `gray-600/500` text | `text-fg-secondary` |
   | `gray-400` text | `text-fg-muted` |
   | `bg-white` | `bg-surface` |
   | `bg-gray-50/100` | `bg-muted` or `bg-canvas` |
   | `border-gray-*` | `border-border` or `border-border-subtle` |
   | `blue-*` | `accent*` |
   | `red-*` | `danger*` |
   | `amber/yellow-*` | `warning*` or `highlight*` |
   | `green-*` | `valid-*` (Task 4.2) |
   | `purple/violet-*` | `helps*` |

   Raw `<button>`s whose look matches a `Button` or `IconButton` variant become that component. The
   others keep their element and get token classes.
3. **Line counts.** Keep the count of every file in `godSize` at or below its budget. Where a change
   would add lines to a file at its budget, move the markup into a new sibling component instead.
4. **Tests.**
   - Update any unit test that asserts a changed class string.
   - Update an E2E class selector only if this PR removes that class, and then replace it with a role
     or a `data-*` attribute.
5. **Lower `RAW_PALETTE_BASELINE`** to the new count. Run `bun run test:arch`, `bun test` on the
   touched tests, and `bun run test:e2e`.
6. **Close out.** Tick the area in STYLE_MANUAL's "Restyle progress". Take the "after" screenshots,
   commit, and stop for review.

### Task 5a: Shell and shared pieces

**Files:**
- `src/components/Layout.tsx`: the header becomes `bg-[var(--uw-ocean)]` with `data-on="dark"` and
  `h-14`. The wordmark is `text-white font-extrabold text-[15.5px]`, and the header icons are white or
  white/60. The menu panel is `Card`-styled.
- `src/components/ErrorBoundary.tsx`
- `src/shared/LoadingSpinner.tsx`
- `src/components/common/**`, `src/components/shared/**` and `src/components/ui/MarkdownRenderer.tsx`
- `src/lib/markdown/**`
- `src/components/BackgroundDownloadPanel.tsx`
- `src/components/LanguagePicker.tsx`

Commit: `Put the app shell on tC4's Ocean bar and tokens`.

### Task 5b: Read

**Files:**
- `src/components/read/**`
- `src/components/read-v1/**`
- `src/components/resources/**`, including the viewers. Helps cards follow tC4's HelpCard: a `Badge`
  for the type (NOTE, WORD, QUESTION), the title in `text-helps-fg font-extrabold`, and the quoted
  phrase in `font-scripture`. The selected-card classes `bg-highlight/15 border-border` stay
  unchanged, because E2E 04 expects them.
- `src/features/nav/**` and `src/features/dnd/**`, with token classes only (no `components/ui`
  imports, per the guard).
- Panel tab strips move to `Switcher` (`indicator="underline"`) where the strip is a plain tab list.
  Sortable tabs keep their element and get the underline classes.

Commit: `Bring the reading view to tC4's helps and tab styles`.

### Task 5c: Home, Library, Collections and Passage sets

**Files:**
- `src/pages/Home.tsx`
- `src/pages/Library.tsx`
- `src/pages/Collections.tsx`
- the passage-sets page and its components
- `src/components/library/**`, `src/components/collections/**`
- `src/features/library/**`, with tokens only

Library rows follow tC4's OptionCard: `Card` with `rounded-[10px]`, and `border-[1.5px] border-accent`
when selected. Section headings use `SectionLabel`.

Commit: `Move Home, Library and Collections to tC4 cards and tokens`.

### Task 5d: Studio

**Files:** `src/components/studio/**`. This is the largest area, at about 139 lines with raw classes.

Commit: `Move Studio to tC4 tokens and components`.

### Task 5e: Settings remainder, wizards, Catalog, Create package and Data

**Files:**
- `src/pages/DataManagement.tsx`
- the catalog and create-package pages
- `src/components/wizard/**`. `WizardProgressIndicator` dots become `size-2 rounded-full`, filled
  `bg-accent-fill` when done or current and `bg-muted` when ahead.
- `src/components/catalog/**`, `src/components/data/**`
- `src/features/data/**`, with tokens only

After this PR the ratchet should count 0 outside the allowlist. Change `rawPaletteFreeze.test.ts` to
`toBe(0)` with a comment that it is now a ban.

Commit: `Finish the move to tC4 tokens; ban raw palette classes`.

---

## Logo PR (D4)

This is its own track. A separate session designs the mark from the tC4 mark, the tC Admin favicon
and the tC Mobile icon, and the owner chooses one. With the chosen files:
- `public/favicon.svg`, `public/icons/icon-192.png`, `icon-512.png` and `icon-maskable-512.png`;
- the `<link rel="icon">`, `<link rel="manifest">` and `apple-touch-icon` in `index.html`;
- the manifest `icons` (with `purpose: "maskable"` on the maskable file);
- the symbol beside the wordmark in `Layout.tsx`.

`brandNameGuards.test.ts` gains checks that each icon file exists and that each manifest icon path
resolves.

Commit: `Give tC Study its mark`.
