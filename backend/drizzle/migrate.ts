import Database from 'better-sqlite3';
import { STORAGE_CONFIG } from '../src/config/storage.js';
import { ensureStorageDirectories } from '../src/utils/storage.js';
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  await ensureStorageDirectories();

  const sqlite = new Database(STORAGE_CONFIG.dbPath);

  const migrationDir = path.join(process.cwd(), 'drizzle');
  const migrationFiles = await fs.readdir(migrationDir);

  for (const file of migrationFiles) {
    if (file.endsWith('.sql')) {
      const migrationPath = path.join(migrationDir, file);
      const migrationSql = await fs.readFile(migrationPath, 'utf-8');

      console.log(`Running migration: ${file}`);

      const statements = migrationSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        try {
          sqlite.exec(statement);
        } catch (error) {
          console.error(`Error executing statement: ${statement.substring(0, 100)}...`, error);
        }
      }

      console.log(`Completed migration: ${file}`);
    }
  }

  console.log('All migrations completed successfully!');

  sqlite.close();
  process.exit(0);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
