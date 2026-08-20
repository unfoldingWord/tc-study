# WordsLinksViewer

Translation Words Links viewer component with organized folder structure.

## Structure

```
WordsLinksViewer/
├── components/          # UI components
│   ├── WordsLinksHeader.tsx
│   ├── TokenFilterBanner.tsx
│   ├── WordLinkCard.tsx
│   └── index.ts
├── hooks/              # React hooks
│   ├── useWordsLinksContent.ts      # Loads TWL content
│   ├── useOriginalLanguageContent.ts # Loads original language scripture
│   ├── useTWTitles.ts               # Fetches TW article titles
│   ├── useQuoteTokens.ts            # Builds quote tokens from origWords
│   └── index.ts
├── utils/              # Utility functions
│   ├── parseTWLink.ts      # Parses TW link strings
│   ├── buildQuoteTokens.ts # Matches origWords to tokens
│   └── index.ts
├── types.ts            # TypeScript type definitions
├── index.tsx           # Main component
└── README.md
```

## Features

- **Content Loading**: Loads TWL TSV data for current book
- **Title Fetching**: Dynamically fetches TW article titles from TOC
- **Quote Building**: Matches `origWords` to original language tokens (in progress)
- **Token Filtering**: Filters links based on clicked tokens from scripture
- **Inter-panel Communication**: Sends/receives signals for token clicks and entry links

## Testing Quote Building

The quote building functionality is being implemented in steps:

1. ✅ **Step 1**: `useOriginalLanguageContent` - Test that we can access original language scripture content
2. ✅ **Step 2**: `buildQuoteTokens` - Test that we can match `origWords` to original language tokens
3. ⏳ **Step 3**: Integrate quote display in UI (showing original language quote for each link)

## Usage

```tsx
import { WordsLinksViewer } from './components/resources'

<WordsLinksViewer
  resourceId="unfoldingWord/en/twl"
  resourceKey="unfoldingWord/en/twl"
  onEntryLinkClick={(resourceKey, entryId) => {
    // Handle opening Translation Words article
  }}
/>
```
