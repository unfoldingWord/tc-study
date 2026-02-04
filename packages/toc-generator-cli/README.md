# TOC Generator CLI

Command-line tool for generating Table of Contents (ingredients) files for Door43 resources. This tool is used as part of the release process to ensure accurate TOC files with proper titles extracted from markdown content.

## Features

- **Recursive Repository Scanning**: Automatically discovers all files in a repository
- **Title Extraction**: Extracts proper titles from markdown content (first `#` heading)
- **Extensible Builders**: Supports custom TOC builders for different resource types
- **Authentication**: Supports both token and username/password authentication
- **File Updates**: Automatically updates existing TOC files or creates new ones

## Installation

```bash
# From the workspace root
pnpm install
cd packages/toc-generator-cli
bun install
bun run build
```

## Running the CLI

Since the `@bt-synergy/door43-api` package uses TypeScript source files, you need to use `bun` to run the CLI:

```bash
# From the toc-generator-cli directory
bun dist/cli.js list-generators
bun dist/cli.js generate-tw --help

# Or use the start script
bun run start list-generators

# Or from workspace root
bun packages/toc-generator-cli/dist/cli.js list-generators
```

**Note**: The CLI requires `bun` to run because it depends on TypeScript source files. If you don't have `bun` installed, you can install it from <https://bun.sh>

## Configuration

### Environment Variables (.env file)

Create a `.env` file in the package directory (or workspace root) with your credentials:

```bash
# Option 1: Use a personal access token (recommended)
DOOR43_TOKEN=your_personal_access_token_here

# Option 2: Use username and password (token will be auto-generated)
DOOR43_USERNAME=your_username
DOOR43_PASSWORD=your_password

# Server URL (optional, defaults to git.door43.org)
DOOR43_SERVER=git.door43.org
```

The tool will automatically:

- Read credentials from `.env` file
- Auto-generate a token from username/password if no token is provided
- Use command-line options to override environment variables

## Usage

### Generate TOC for Translation Words

```bash
# Using .env file (no credentials needed in command)
toc-generator generate-tw \
  --owner unfoldingWord \
  --language en \
  --resource-id tw

# Using token from command line
toc-generator generate-tw \
  --owner unfoldingWord \
  --language en \
  --resource-id tw \
  --token YOUR_TOKEN

# Using username/password from command line
toc-generator generate-tw \
  --owner unfoldingWord \
  --language en \
  --resource-id tw \
  --username YOUR_USERNAME \
  --password YOUR_PASSWORD

# With specific release tag
toc-generator generate-tw \
  --owner unfoldingWord \
  --language en \
  --resource-id tw \
  --ref v37 \
  --token YOUR_TOKEN

# Custom TOC file path
toc-generator generate-tw \
  --owner unfoldingWord \
  --language en \
  --resource-id tw \
  --toc-file ingredients.json \
  --token YOUR_TOKEN
```

### Generate TOC with Specific Builder

```bash
# List all available generators
toc-generator list-generators

# Use a specific generator
toc-generator generate \
  --owner unfoldingWord \
  --language en \
  --resource-id tw \
  --builder tw \
  --token YOUR_TOKEN
```

### List Available Generators

```bash
toc-generator list-generators
```

This will show all registered generators with their IDs, names, and descriptions.

### Generate Personal Access Token

You can generate a token from username/password:

```bash
# Generate token and save to .env file
toc-generator generate-token --save

# Generate token and display it
toc-generator generate-token

# Using credentials from .env
toc-generator generate-token

# Using command-line credentials
toc-generator generate-token \
  --username YOUR_USERNAME \
  --password YOUR_PASSWORD \
  --save
```

## Options

### Common Options

- `-o, --owner <owner>` - Repository owner (required)
- `-l, --language <language>` - Resource language code (required)
- `-r, --resource-id <resourceId>` - Resource ID (required)
- `-s, --server <server>` - Door43 server URL (default: `git.door43.org`)
- `--ref <ref>` - Git reference (tag, branch, or commit). Defaults to latest release tag or master
- `--toc-file <path>` - Path for TOC file in repository (default: `toc.json`)

### Authentication Options

- `-t, --token <token>` - Door43 personal access token (preferred)
- `-u, --username <username>` - Door43 username
- `-p, --password <password>` - Door43 password

If authentication is not provided via command line, the tool will prompt for it interactively.

## TOC File Format

The generated TOC file has the following structure:

```json
{
  "version": "1.0.0",
  "generatedAt": "2024-01-01T00:00:00.000Z",
  "ref": "v37",
  "ingredients": [
    {
      "identifier": "bible/kt/god",
      "title": "God",
      "path": "bible/kt/god.md",
      "categories": ["kt"]
    },
    {
      "identifier": "bible/names/jesus",
      "title": "Jesus",
      "path": "bible/names/jesus.md",
      "categories": ["names"]
    }
  ]
}
```

## How It Works

1. **Repository Scanning**: Recursively scans the repository for files (starting from root or specified directory)
2. **File Processing**: For each file, fetches the content and extracts the title from markdown (first `#` heading)
3. **TOC Building**: Builds a structured ingredients list with proper titles
4. **File Creation/Update**: Creates or updates the TOC file in the repository using the Door43 API

## Integration with Resource Loaders

Resource loaders (like `TranslationWordsLoader`) automatically check for TOC files:

1. **First**: Attempts to load `toc.json` from the repository root
2. **If found**: Uses ingredients from TOC file (with proper titles)
3. **If not found**: Falls back to recursive scanning (using filenames as titles)

This ensures backward compatibility while allowing resources to have accurate TOC files.

## Creating Custom TOC Builders

The TOC generator uses a plugin-based architecture with a `generators` directory. To add a new generator:

### 1. Create a Generator File

Create a new file in `src/generators/` (e.g., `translation-notes.ts`):

```typescript
import type { TocBuilder, TocBuilderConfig, TocIngredient } from '../types.js';
import { extractMarkdownTitle } from './utils.js';

export class TranslationNotesTocBuilder implements TocBuilder {
  async buildIngredients(
    config: TocBuilderConfig,
    files: Array<{ name: string; path: string; type: 'file' | 'dir' }>,
    getFileContent: (filePath: string) => Promise<string>
  ): Promise<TocIngredient[]> {
    const ingredients: TocIngredient[] = [];
    
    // Your custom logic here
    // Filter files, extract titles, build ingredients...
    
    return ingredients;
  }
}
```

### 2. Register the Generator

Add it to `src/generators/index.ts`:

```typescript
import { TranslationNotesTocBuilder } from './translation-notes.js';

export const GENERATORS: Record<string, GeneratorInfo> = {
  // ... existing generators
  'tn': {
    id: 'tn',
    name: 'Translation Notes',
    description: 'Generates TOC for Translation Notes resources',
    builder: new TranslationNotesTocBuilder(),
  },
};
```

### 3. Use It

```bash
toc-generator generate --builder tn --owner unfoldingWord --language en --resource-id tn
```

See `src/generators/README.md` for detailed documentation and examples.

## Future: Web Admin App

The core TOC generation logic is designed to be reusable in a web admin application. The `TocGenerator` class can be imported and used in a web interface:

```typescript
import { TocGenerator, TranslationWordsTocBuilder } from '@bt-synergy/toc-generator-cli';

const generator = new TocGenerator({
  server: 'git.door43.org',
  owner: 'unfoldingWord',
  language: 'en',
  resourceId: 'tw',
  tocBuilder: new TranslationWordsTocBuilder(),
  token: userToken,
});

const result = await generator.generate();
```

## License

MIT
