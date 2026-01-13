import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '../..');
const baseTempDir =
  process.env.GIT_VIBE_DATA_DIR ||
  (process.platform === 'win32'
    ? path.join(process.env.TEMP || 'C:\\Temp', 'git-vibe')
    : path.join('/tmp', 'git-vibe'));

export const STORAGE_CONFIG = {
  baseDir: baseTempDir,
  dataDir: path.join(baseTempDir, 'data'),
  dbPath: path.join(baseTempDir, 'data', 'db.sqlite'),
  logsDir: path.join(baseTempDir, 'logs'),
  patchesDir: path.join(baseTempDir, 'patches'),
  worktreesDir: path.join(baseTempDir, 'worktrees'),
  projectRoot,
} as const;

export type StorageConfig = typeof STORAGE_CONFIG;
