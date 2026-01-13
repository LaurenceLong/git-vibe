import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { STORAGE_CONFIG } from '../config/storage.js';
import { ensureStorageDirectories } from '../utils/storage.js';

let db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!db) {
    await ensureStorageDirectories();

    const sqlite = new Database(STORAGE_CONFIG.dbPath);
    sqlite.pragma('journal_mode = WAL');

    db = drizzle(sqlite);
  }

  return db;
}

export function getSqlite() {
  return new Database(STORAGE_CONFIG.dbPath);
}
