import fs from 'node:fs/promises';
import path from 'node:path';

export interface RepoFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

/**
 * Service for Git file operations
 */
export class GitFileService {
  async listFiles(repoPath: string, relativePath: string = ''): Promise<RepoFile[]> {
    const files: RepoFile[] = [];
    const fullPath = path.join(repoPath, relativePath);

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip .git directory
        if (entry.name === '.git') {
          continue;
        }

        const entryPath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          files.push({
            name: entry.name,
            path: entryPath,
            type: 'directory',
          });
          // Recursively get files in subdirectory
          const subFiles = await this.listFiles(repoPath, entryPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          try {
            const stats = await fs.stat(path.join(fullPath, entry.name));
            files.push({
              name: entry.name,
              path: entryPath,
              type: 'file',
              size: stats.size,
            });
          } catch {
            // If we can't get stats, still include the file without size
            files.push({
              name: entry.name,
              path: entryPath,
              type: 'file',
            });
          }
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to list files in ${fullPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return files;
  }

  async getFileContent(repoPath: string, filePath: string): Promise<string> {
    const fullPath = path.join(repoPath, filePath);
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to read file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
