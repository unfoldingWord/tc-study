/** Shared by rawPaletteFreeze and UI component markup tests — keep in sync with docs/TC4_STYLE_AND_BRAND.md §6. */
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTILITY = 'bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder'
/** Any variant prefix (hover:, dark:, md:…) is allowed by the leading class boundary; /NN opacity too. */
export const RAW_PALETTE_CLASS = new RegExp(
  `(?<![\\w-])(?:${UTILITY})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:\\/\\d{1,3})?(?![\\w-])`,
  'g'
)
