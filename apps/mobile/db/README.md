# Database Setup with Drizzle ORM

This directory contains the database configuration and schema for the bt-synergy app using Drizzle ORM with SQLite.

## Structure

```
db/
├── DatabaseManager.ts      # Main database manager singleton
├── migration.ts           # Data migration utilities
├── schema/               # Database schema definitions
│   ├── index.ts         # Schema exports
│   ├── users.ts         # Users table
│   ├── workspaces.ts    # Workspaces table
│   ├── resources.ts     # Resources table
│   └── settings.ts      # Settings table
├── services/            # Database service layer
│   └── DatabaseService.ts
├── migrations/          # Generated migration files
└── README.md           # This file
```

## Setup

The database is automatically initialized when the app starts in `app/_layout.tsx`.

### Dependencies

- `expo-sqlite` - SQLite database for React Native/Expo
- `drizzle-orm` - TypeScript ORM
- `drizzle-kit` - Database toolkit for migrations
- `expo-drizzle-studio-plugin` - Database inspection tool (optional)

### Configuration

The database configuration is defined in `drizzle.config.ts` at the project root.

## Usage

### DatabaseManager

The `DatabaseManager` is a singleton that handles database initialization and provides access to the Drizzle instance:

```typescript
import { DatabaseManager } from '@/db/DatabaseManager';

const databaseManager = DatabaseManager.getInstance();
await databaseManager.initialize();
const db = databaseManager.getDb();
```

### DatabaseService

The `DatabaseService` provides high-level database operations:

```typescript
import { DatabaseService } from '@/db/services/DatabaseService';

const dbService = new DatabaseService();

// Create a user
const user = await dbService.createUser({
  username: 'john_doe',
  email: 'john@example.com',
  displayName: 'John Doe'
});

// Get user by ID
const foundUser = await dbService.getUserById(user[0].id);
```

### Direct Drizzle Usage

You can also use Drizzle directly for complex queries:

```typescript
import { eq } from 'drizzle-orm';
import { DatabaseManager } from '@/db/DatabaseManager';
import { users } from '@/db/schema';

const db = DatabaseManager.getInstance().getDb();

// Complex query example
const activeUsers = await db
  .select()
  .from(users)
  .where(eq(users.isActive, true))
  .limit(10);
```

## Schema Management

### Adding New Tables

1. Create a new schema file in `db/schema/` (e.g., `notes.ts`)
2. Export it from `db/schema/index.ts`
3. Generate migration: `npm run db:generate`
4. The migration will be applied automatically on app startup

### Modifying Existing Tables

1. Update the schema file
2. Generate migration: `npm run db:generate`
3. The migration will be applied automatically on app startup

## Available Scripts

- `npm run db:generate` - Generate migration from schema changes
- `npm run db:migrate` - Apply migrations (not needed in Expo, done automatically)
- `npm run db:push` - Push schema changes directly (development only)
- `npm run db:studio` - Open Drizzle Studio (web-based database browser)
- `npm run db:drop` - Drop all tables (destructive!)

## Drizzle Studio

Drizzle Studio is enabled in development mode and provides a web interface to inspect your database. It's automatically initialized in `_layout.tsx`.

If there are version conflicts, the studio will be disabled gracefully with a warning message.

## Migration Strategy

The app includes a migration system that can import data from legacy databases:

- `DataMigration.migrateFromLegacyDatabases()` - Migrates from old database files
- `DataMigration.createDefaultData()` - Creates default data if no legacy data exists

## Database File Location

The SQLite database file (`app.db`) is stored in the app's document directory and persists between app launches.

## Development Tips

1. **Schema Changes**: Always generate migrations after schema changes
2. **Data Inspection**: Use Drizzle Studio or the built-in database stats methods
3. **Performance**: Use indexes for frequently queried columns
4. **Transactions**: Wrap multiple operations in transactions for consistency
5. **Backup**: The database file can be backed up/restored as needed

## Troubleshooting

### Version Conflicts

If you encounter version conflicts with `expo-drizzle-studio-plugin`:

```bash
npm install --save-dev --legacy-peer-deps expo-drizzle-studio-plugin
```

### Migration Issues

If migrations fail, check the console logs and ensure your schema is valid.

### Performance Issues

- Add indexes to frequently queried columns
- Use `EXPLAIN QUERY PLAN` to analyze slow queries
- Consider pagination for large result sets

