/**
 * Utilities for parsing git diff and extracting file information
 */

export interface ChangedFile {
  filepath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  raw: string;
}

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Parse a git diff string into structured file changes
 */
export function parseDiff(diffText: string): ChangedFile[] {
  if (!diffText || !diffText.trim()) {
    return [];
  }

  const files: ChangedFile[] = [];
  const lines = diffText.split('\n');
  let currentFile: ChangedFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let inHunk = false;
  let oldLineNum = 0;
  let newLineNum = 0;
  let hunkRawLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File header: diff --git a/path b/path
    if (line.startsWith('diff --git')) {
      // Save previous file
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
        currentHunk = null;
      }
      if (currentFile) {
        files.push(currentFile);
      }

      const match = line.match(/diff --git a\/(.+?)\s+b\/(.+)$/);
      if (match) {
        const oldPath = match[1];
        const newPath = match[2];
        const filepath = newPath !== '/dev/null' ? newPath : oldPath;
        const status =
          oldPath === '/dev/null' ? 'added' : newPath === '/dev/null' ? 'deleted' : 'modified';

        currentFile = {
          filepath,
          status,
          additions: 0,
          deletions: 0,
          hunks: [],
        };
        inHunk = false;
        oldLineNum = 0;
        newLineNum = 0;
      }
      continue;
    }

    if (!currentFile) continue;

    // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (currentHunk) {
        currentHunk.raw = hunkRawLines.join('\n');
        currentFile.hunks.push(currentHunk);
      }

      oldLineNum = parseInt(hunkMatch[1], 10);
      const oldLines = parseInt(hunkMatch[2] || '1', 10);
      newLineNum = parseInt(hunkMatch[3], 10);
      const newLines = parseInt(hunkMatch[4] || '1', 10);

      currentHunk = {
        oldStart: oldLineNum,
        oldLines,
        newStart: newLineNum,
        newLines,
        lines: [],
        raw: '',
      };
      hunkRawLines = [line];
      inHunk = true;
      continue;
    }

    // Diff content lines
    if (inHunk && currentHunk) {
      hunkRawLines.push(line);

      if (line.startsWith('+') && !line.startsWith('+++')) {
        // Added line
        currentHunk.lines.push({
          type: 'add',
          content: line.substring(1),
          newLineNumber: newLineNum++,
        });
        currentFile.additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Removed line
        currentHunk.lines.push({
          type: 'remove',
          content: line.substring(1),
          oldLineNumber: oldLineNum++,
        });
        currentFile.deletions++;
      } else if (line.startsWith(' ')) {
        // Context line
        currentHunk.lines.push({
          type: 'context',
          content: line.substring(1),
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
    }
  }

  // Save last file and hunk
  if (currentHunk) {
    currentHunk.raw = hunkRawLines.join('\n');
    if (currentFile) {
      currentFile.hunks.push(currentHunk);
    }
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

/**
 * Get file path from diff line number (for inline comments)
 */
export function getFilePathFromDiff(diffText: string, targetLine: number): string | null {
  const files = parseDiff(diffText);

  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.newLineNumber === targetLine) {
          return file.filepath;
        }
      }
    }
  }

  return null;
}

/**
 * Get code snippet around a specific line in the diff
 */
export function getCodeSnippetAroundLine(
  diffText: string,
  filepath: string,
  lineNumber: number,
  contextLines: number = 3
): string {
  const files = parseDiff(diffText);
  const file = files.find((f) => f.filepath === filepath);
  if (!file) return '';

  for (const hunk of file.hunks) {
    const relevantLines: string[] = [];
    let foundLine = false;

    for (const line of hunk.lines) {
      if (line.newLineNumber === lineNumber || line.oldLineNumber === lineNumber) {
        foundLine = true;
      }

      if (
        foundLine ||
        (line.newLineNumber && Math.abs(line.newLineNumber - lineNumber) <= contextLines)
      ) {
        relevantLines.push(line.content);
      }

      if (foundLine && line.newLineNumber && line.newLineNumber > lineNumber + contextLines) {
        break;
      }
    }

    if (foundLine) {
      return relevantLines.join('\n');
    }
  }

  return '';
}
