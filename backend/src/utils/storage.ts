import fs from 'node:fs/promises';
import path from 'node:path';
import { STORAGE_CONFIG } from '../config/storage.js';

export async function ensureStorageDirectories(): Promise<void> {
  const dirs = [
    STORAGE_CONFIG.baseDir,
    STORAGE_CONFIG.dataDir,
    STORAGE_CONFIG.logsDir,
    STORAGE_CONFIG.patchesDir,
    STORAGE_CONFIG.worktreesDir,
    STORAGE_CONFIG.projectsDir,
  ];

  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directory ${dir}: ${error}`);
    }
  }
}

export async function cleanupDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    throw new Error(`Failed to cleanup directory ${dirPath}: ${error}`);
  }
}
