import type { Config } from 'drizzle-kit';
import { STORAGE_CONFIG } from './src/config/storage.js';

export default {
  schema: './src/models/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || STORAGE_CONFIG.dbPath,
  },
} satisfies Config;
