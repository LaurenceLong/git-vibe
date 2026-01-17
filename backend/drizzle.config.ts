import type { Config } from 'drizzle-kit';

// For drizzle-kit generation, we use a placeholder path
// The actual database path from STORAGE_CONFIG is only needed at runtime
export default {
  schema: './src/models/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || ':memory:',
  },
} satisfies Config;
