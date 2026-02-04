# Resource Setup Guide

This guide explains how to download resources using the `resource-downloader` and convert them to your app's database format.

## Overview

The workflow consists of two main steps:
1. **Download Resources**: Use the `resource-downloader` to fetch resources from Door43
2. **Convert to App Database**: Use the built-in `app-db-converter` to convert data to match your app's SQLite schema

## Quick Start

### Option 1: Automated Setup (Recommended)
```bash
# Download resources and convert to app database in one command
npm run setup:resources
```

### Option 2: Manual Steps
```bash
# Step 1: Download resources using resource-downloader
npm run download:resources

# Step 2: Convert to app database format
npm run convert:resources
```

## What Each Command Does

### `npm run download:resources`
- Navigates to the `bt-toolkit/resource-downloader` directory
- Runs the complete downloader to fetch resources from Door43
- Downloads resources to `exports/uw-translation-resources/` directory
- Uses the configuration in `bt-toolkit/resource-downloader/config.ts`

### `npm run convert:resources`
- Navigates to the `bt-toolkit/resource-downloader` directory
- Runs the built-in `app-db-converter.ts` to convert downloaded resources
- Generates `{owner}-{language}-app-database.sql` file compatible with your `SimplifiedDrizzleStorageAdapter`
- Maps field names to match your app's database structure

## Database Schema Mapping

The converter maps the resource-downloader output to your app's database schema:

### Resource Metadata Table
| Resource-Downloader Field | App Database Field | Notes |
|---------------------------|-------------------|-------|
| `resourceKey` | `resource_key` | Primary key |
| `lastUpdated` | `last_updated` | Timestamp |
| `isAnchor` | `is_anchor` | Boolean as integer |
| `languageDirection` | `language_direction` | RTL/LTR |
| `languageTitle` | `language_title` | Display name |
| `languageIsGL` | `language_is_gl` | Gateway language flag |
| - | `commit_sha` | Not available from downloader |
| - | `file_hashes` | Not available from downloader |

### Resource Content Table
| Resource-Downloader Field | App Database Field | Notes |
|---------------------------|-------------------|-------|
| `resourceKey` | `resource_key` | Foreign key |
| `bookCode` | `book_code` | Book identifier |
| `articleId` | `article_id` | Article identifier |
| `lastFetched` | `last_fetched` | Timestamp |
| `cachedUntil` | `cached_until` | Cache expiration |
| `sourceSha` | `source_sha` | Git commit SHA |
| `sourceCommit` | `source_commit` | Git commit reference |

## Output Files

### Downloaded Resources
- **Location**: `exports/uw-translation-resources/`
- **Structure**: Organized by server/owner/language/resource-type
- **Format**: JSON files with metadata and content

### Converted Database
- **File**: `{owner}-{language}-app-database.sql` (e.g., `unfoldingWord-en-app-database.sql`)
- **Format**: SQLite-compatible SQL statements
- **Schema**: Matches your `SimplifiedDrizzleStorageAdapter`

## Importing into Your App

To import the converted data into your app's database:

```bash
# Import the SQL file into your app's database
sqlite3 your-app.db < unfoldingWord-en-app-database.sql
```

Or programmatically in your app:
```typescript
import { DatabaseManager } from './db/DatabaseManager';

const dbManager = DatabaseManager.getInstance();
await dbManager.initialize();

// Read and execute the SQL file
const sqlContent = await fs.readFile('unfoldingWord-en-app-database.sql', 'utf-8');
await dbManager.executeRaw(sqlContent);
```

## Configuration

### Resource Downloader Configuration
Edit `bt-toolkit/resource-downloader/config.ts` to configure:
- Server URL (default: `git.door43.org`)
- Owner (default: `unfoldingWord`)
- Language (default: `en`)
- Resources to download
- API token for higher rate limits

### Converter Configuration
The converter automatically detects the output directory from the resource-downloader. If you need to change the source directory, edit `bt-toolkit/resource-downloader/app-db-converter.ts`.

## Troubleshooting

### Common Issues

1. **Source directory not found**
   - Make sure to run `npm run download:resources` first
   - Check that the resource-downloader completed successfully

2. **Database import errors**
   - Ensure your app's database schema is up to date
   - Check that the SQL file was generated correctly

3. **Missing dependencies**
   - Run `npm install` to install required packages
   - Make sure `glob` and `tsx` are installed

### Debug Mode

To see detailed output during conversion:
```bash
# Run with verbose logging
DEBUG=1 npm run convert:resources
```

## File Structure

```
bt-synergy/
├── scripts/
│   └── RESOURCE_SETUP_GUIDE.md         # This guide
├── ../bt-toolkit/resource-downloader/
│   ├── app-db-converter.ts             # App database converter
│   ├── complete-downloader.ts          # Main downloader
│   └── exports/
│       └── uw-translation-resources/   # Downloaded resources
│           ├── git.door43.org/
│           │   └── unfoldingWord/
│           │       └── en/
│           │           ├── ult/
│           │           ├── tn/
│           │           └── ...
└── unfoldingWord-en-app-database.sql   # Converted database
```

## Next Steps

After successfully converting the resources:

1. **Test the import**: Verify the data imports correctly into your app
2. **Update your app**: Use the `SimplifiedDrizzleStorageAdapter` to access the data
3. **Schedule updates**: Set up periodic resource updates as needed
4. **Monitor usage**: Track storage usage and performance

## Support

If you encounter issues:
1. Check the console output for error messages
2. Verify the source directory contains the expected files
3. Ensure your app's database schema matches the converter output
4. Review the configuration files for any misconfigurations

