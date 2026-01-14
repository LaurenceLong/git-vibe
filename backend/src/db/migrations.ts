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
    
    // Create migrations tracking table if it doesn't exist
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename TEXT PRIMARY KEY NOT NULL,
        executed_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);

    const files = (await fs.readdir(migrationsFolder)).filter((f) => f.endsWith('.sql')).sort();

    if (files.length === 0) {
      console.warn(
        `No migrations found in ${migrationsFolder}. ` +
          `Either generate drizzle-kit migrations (recommended) or add *.sql migrations.`
      );
      return;
    }

    // Get already executed migrations
    const executedMigrations = sqlite
      .prepare('SELECT filename FROM _migrations')
      .all() as { filename: string }[];
    const executedSet = new Set(executedMigrations.map((m) => m.filename));

    // Clean up any old migration entries from previous incomplete runs
    // Since this project hasn't been released, we can safely reset migration tracking
    // if the schema is incomplete
    const requiredTables = ['projects', 'work_items', 'changesets', 'review_threads',
                            'review_comments', 'agent_runs', 'imports', 'target_repos'];
    const existingTables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const existingTableNames = new Set(existingTables.map(t => t.name));
    
    // Check if all required tables exist
    const allTablesExist = requiredTables.every(table => existingTableNames.has(table));
    
    // If we have migration records but tables are missing, reset the migration tracking
    if (executedSet.size > 0 && !allTablesExist) {
      console.log('Detected incomplete schema, resetting migration tracking');
      sqlite.prepare('DELETE FROM _migrations').run();
      executedSet.clear();
    }

    for (const file of files) {
      if (executedSet.has(file)) {
        console.log(`Skipping already executed migration: ${file}`);
        continue;
      }

      const fullPath = path.join(migrationsFolder, file);
      const sql = await fs.readFile(fullPath, 'utf-8');

      console.log(`Running migration (raw sql): ${file}`);
      sqlite.exec(sql);
      
      // Record this migration as executed
      sqlite.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
      console.log(`Completed migration: ${file}`);
    }

    console.log('All migrations completed successfully! (raw sql)');
  } finally {
    sqlite.close();
  }
}
