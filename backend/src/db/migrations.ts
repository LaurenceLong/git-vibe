import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { STORAGE_CONFIG } from '../config/storage.js';
import { ensureStorageDirectories } from '../utils/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function runMigrations() {
  await ensureStorageDirectories();

  const sqlite = new Database(STORAGE_CONFIG.dbPath);
  try {
    sqlite.pragma('journal_mode = WAL');

    const migrationsFolder = path.join(__dirname, '../../drizzle');
    const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');

    // If this project has been set up with drizzle-kit migrations (meta/_journal.json),
    // use Drizzle's migrator (recommended).
    if (await fileExists(journalPath)) {
      const db = drizzle(sqlite);
      migrate(db, { migrationsFolder });
      console.log('All migrations completed successfully! (drizzle migrator)');
      return;
    }

    // Fallback: raw .sql files without Drizzle meta journal.
    // Execute each migration as a whole script (no naive splitting),
    // and fail fast on any error so the server doesn't start with a broken schema.
    const files = (await fs.readdir(migrationsFolder))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.warn(
        `No migrations found in ${migrationsFolder}. ` +
          `Either generate drizzle-kit migrations (recommended) or add *.sql migrations.`,
      );
      return;
    }

    for (const file of files) {
      const fullPath = path.join(migrationsFolder, file);
      const sql = await fs.readFile(fullPath, 'utf-8');

      console.log(`Running migration (raw sql): ${file}`);
      sqlite.exec(sql);
      console.log(`Completed migration: ${file}`);
    }

    console.log('All migrations completed successfully! (raw sql)');
  } finally {
    sqlite.close();
  }
}