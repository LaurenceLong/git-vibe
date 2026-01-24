import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '../..');
const baseTempDir =
  process.env.GIT_VIBE_DATA_DIR ||
  (process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Local', 'git-vibe')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'git-vibe')
      : path.join(os.tmpdir(), 'git-vibe'));

export const STORAGE_CONFIG = {
  baseDir: baseTempDir,
  dataDir: path.join(baseTempDir, 'data'),
  dbPath: path.join(baseTempDir, 'data', 'db.sqlite'),
  logsDir: path.join(baseTempDir, 'logs'),
  patchesDir: path.join(baseTempDir, 'patches'),
  worktreesDir: path.join(baseTempDir, 'worktrees'),
  projectsDir: path.join(baseTempDir, 'projects'),
  mirrorsDir: path.join(baseTempDir, 'mirrors'),
  projectRoot,
} as const;

export type StorageConfig = typeof STORAGE_CONFIG;
