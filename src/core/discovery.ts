import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import type { AuditScopeEntry } from "../types/scope.js";

/**
 * Warnings from the most recent discovery run (module-level mutable state).
 *
 * Safe for sequential calls (synchronous I/O, single-threaded event loop).
 * If concurrent discovery is needed, refactor to return warnings in the result.
 */
let lastWarnings: string[] = [];

/**
 * Returns warnings from the most recent discoverSolidityFiles() call.
 */
export function getDiscoveryWarnings(): readonly string[] {
  return [...lastWarnings];
}

const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  "out",
  "artifacts",
  "cache",
  "dist",
  "build",
  ".git",
  ".cache",
]);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Counts lines: \\n occurrences + 1, or 0 for empty content.
 * A trailing newline adds an extra line compared to `wc -l` (intentional per AC4).
 */
function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return content.split("\n").length;
}

function toRelativePosix(repoRoot: string, absPath: string): string {
  return relative(repoRoot, absPath).split(sep).join("/");
}

/**
 * Recursively walks a directory, collecting .sol file paths.
 * Does not follow symlinks. Skips excluded and unreadable directories.
 */
function walkDir(
  dir: string,
  repoRoot: string,
  isRoot: boolean,
  results: string[],
  warnings: string[],
): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err: unknown) {
    const msg = errorMessage(err);
    if (isRoot) {
      throw new Error(`ERROR: REPO_UNREADABLE - ${msg}`);
    }
    warnings.push(`Could not read directory ${toRelativePosix(repoRoot, dir)}: ${msg}`);
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        walkDir(fullPath, repoRoot, false, results, warnings);
      }
    } else if (entry.isFile() && entry.name.endsWith(".sol")) {
      results.push(fullPath);
    }
  }
}

/**
 * Discovers all Solidity (.sol) files in the given repository root directory.
 *
 * - Searches the entire repo, not just typical directories
 * - Excludes: node_modules, out, artifacts, cache, dist, build, .git, .cache
 * - Does not follow symlinks
 * - Returns repo-relative paths using / separators
 * - Results are sorted lexicographically by path
 * - Line count = number of \\n + 1; empty file = 0 lines
 *
 * @param repoRoot - Absolute path to the repository root
 * @throws Error with "ERROR: INVALID_ROOT" if repoRoot is not an absolute path
 * @throws Error with "ERROR: REPO_UNREADABLE" if the root directory cannot be read
 * @throws Error with "ERROR: NO_SOLIDITY_FILES - nothing to audit" if zero files found
 * @throws Error with "ERROR: ALL_FILES_UNREADABLE" if files were found but none could be read
 */
export function discoverSolidityFiles(repoRoot: string): AuditScopeEntry[] {
  if (!isAbsolute(repoRoot)) {
    throw new Error(
      "ERROR: INVALID_ROOT - repoRoot must be an absolute path",
    );
  }
  // Clear stale warnings so callers never see data from a prior run.
  lastWarnings = [];

  const warnings: string[] = [];
  const absolutePaths: string[] = [];
  walkDir(repoRoot, repoRoot, true, absolutePaths, warnings);

  if (absolutePaths.length === 0) {
    lastWarnings = warnings;
    throw new Error("ERROR: NO_SOLIDITY_FILES - nothing to audit");
  }

  const entries: AuditScopeEntry[] = [];
  for (const absPath of absolutePaths) {
    const relPath = toRelativePosix(repoRoot, absPath);
    let content: string;
    try {
      content = readFileSync(absPath, "utf-8");
    } catch (err: unknown) {
      warnings.push(`Could not read file ${relPath}: ${errorMessage(err)}`);
      continue;
    }
    entries.push({
      file: relPath,
      line_count: countLines(content),
      description: "",
      risk_level: "Medium",
      audited: false,
    });
  }

  if (entries.length === 0) {
    lastWarnings = warnings;
    throw new Error(
      "ERROR: ALL_FILES_UNREADABLE - discovered .sol files but none could be read",
    );
  }

  entries.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  lastWarnings = warnings;
  return entries;
}
