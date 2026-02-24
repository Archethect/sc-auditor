/**
 * Checklist service for fetching and processing Cyfrin audit checklist.
 *
 * Handles fetching from GitHub, local caching with 24h TTL, and flattening
 * the nested category structure into a flat array of ChecklistItem.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ChecklistItem } from "../../types/index.js";

/** Cyfrin checklist source URL. */
const CHECKLIST_URL =
  "https://raw.githubusercontent.com/Cyfrin/audit-checklist/refs/heads/main/checklist.json";

/** Cache TTL in milliseconds (24 hours). */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Cache directory name under home. */
const CACHE_DIR_NAME = ".sc-auditor";

/** Cache file name. */
const CACHE_FILE_NAME = "checklist.json";

/** Cache timestamp file name. */
const CACHE_TIMESTAMP_FILE_NAME = "checklist-fetched-at.txt";

/**
 * Raw checklist node from Cyfrin JSON.
 * Can be either a category node (has data array) or a leaf item.
 */
interface RawChecklistNode {
  category?: string;
  description?: string;
  data?: RawChecklistNode[];
  id?: string;
  question?: string;
  remediation?: string;
  references?: string[];
  tags?: string[];
}

/**
 * Type guard to check if a value is an array of strings.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Creates a validation error with the standard error format.
 */
function validationError(message: string): Error {
  return new Error(`ERROR: CHECKLIST_VALIDATION - ${message}`);
}

/**
 * Type guard for valid leaf items with all required fields.
 */
function isValidLeafItem(
  node: RawChecklistNode
): node is Required<Pick<RawChecklistNode, "id" | "question" | "description" | "remediation" | "references" | "tags">> {
  return (
    typeof node.id === "string" &&
    typeof node.question === "string" &&
    typeof node.description === "string" &&
    typeof node.remediation === "string" &&
    isStringArray(node.references) &&
    isStringArray(node.tags)
  );
}

/**
 * Recursively walks the nested category tree and flattens it.
 * Attaches the parent category name to each leaf item.
 * Warns about malformed nodes that are neither valid leaf items nor category nodes.
 */
function walkTree(nodes: RawChecklistNode[], parentCategory: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  for (const node of nodes) {
    // Leaf items have an id field
    if (typeof node.id === "string") {
      if (!isValidLeafItem(node)) {
        throw validationError("Checklist leaf item is missing required fields");
      }
      items.push({
        id: node.id,
        category: parentCategory,
        question: node.question,
        description: node.description,
        remediation: node.remediation,
        references: node.references,
        tags: node.tags,
      });
    } else if (Array.isArray(node.data)) {
      // Category nodes have a data array - recurse into children
      const categoryName =
        typeof node.category === "string" ? node.category : parentCategory;
      items.push(...walkTree(node.data as RawChecklistNode[], categoryName));
    } else {
      // Node is neither a valid leaf nor a category - warn and skip
      console.warn(
        `Skipping malformed checklist node in category "${parentCategory}": missing both 'id' and 'data' properties`
      );
    }
  }

  return items;
}

/**
 * Flattens the nested Cyfrin checklist JSON into a flat array of ChecklistItem.
 * Walks the 3-level nested category tree and attaches the immediate parent
 * category name to each leaf item.
 *
 * @param raw - Raw JSON array from Cyfrin checklist
 * @returns Flat array of ChecklistItem with category attached
 */
export function flattenChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) {
    throw validationError("Checklist data is not an array");
  }

  if (raw.length === 0) {
    return [];
  }

  // Validate root is an array of objects
  if (!raw.every((node) => typeof node === "object" && node !== null)) {
    throw validationError("Checklist root is not an array of objects");
  }

  return walkTree(raw as RawChecklistNode[], "");
}

/**
 * Filters checklist items by category using case-insensitive substring matching.
 *
 * @param items - Array of ChecklistItem to filter
 * @param category - Category substring to match (case-insensitive). If undefined, returns all items.
 * @returns Filtered array of ChecklistItem
 */
export function filterByCategory(items: ChecklistItem[], category: string | undefined): ChecklistItem[] {
  if (category === undefined) {
    return items;
  }

  const lowerCategory = category.toLowerCase();
  return items.filter((item) => item.category.toLowerCase().includes(lowerCategory));
}

/**
 * Returns unique category names from checklist items, sorted alphabetically.
 *
 * @param items - Array of ChecklistItem
 * @returns Sorted array of unique category names
 */
export function getCategories(items: ChecklistItem[]): string[] {
  const categories = new Set(items.map((item) => item.category));
  return [...categories].sort();
}

/**
 * Gets the cache directory path.
 *
 * Uses os.homedir() which is cross-platform:
 * - Unix: reads $HOME
 * - Windows: reads USERPROFILE (or HOMEDRIVE+HOMEPATH fallback)
 * The path.join() call also handles platform-specific path separators.
 */
function getCacheDir(): string {
  const home = os.homedir();
  return path.join(home, CACHE_DIR_NAME);
}

/**
 * Gets the cache file path.
 */
function getCacheFilePath(): string {
  return path.join(getCacheDir(), CACHE_FILE_NAME);
}

/**
 * Gets the cache timestamp file path.
 */
function getCacheTimestampPath(): string {
  return path.join(getCacheDir(), CACHE_TIMESTAMP_FILE_NAME);
}

/**
 * Checks if cached data is still fresh (within TTL).
 */
function isCacheFresh(): boolean {
  const timestampPath = getCacheTimestampPath();
  try {
    const timestamp = fs.readFileSync(timestampPath, "utf-8");
    const fetchedAt = Number.parseInt(timestamp, 10);
    if (Number.isNaN(fetchedAt)) {
      return false;
    }
    return Date.now() - fetchedAt < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Reads cached checklist data if available.
 */
function readCache(): unknown[] | null {
  const cachePath = getCacheFilePath();
  try {
    const data = fs.readFileSync(cachePath, "utf-8");
    return JSON.parse(data) as unknown[];
  } catch {
    return null;
  }
}

/**
 * Writes data to cache atomically using temp file + rename.
 * This prevents concurrent readers from seeing partial files.
 * Uses a unique temp filename to prevent race conditions between concurrent processes.
 */
function writeCache(data: unknown[]): void {
  const cacheDir = getCacheDir();
  const tempPath = path.join(cacheDir, `.${CACHE_FILE_NAME}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    // Write to uniquely-named temp file first, then rename atomically
    fs.writeFileSync(tempPath, JSON.stringify(data));
    const cachePath = getCacheFilePath();
    // On Windows, renameSync cannot replace an existing file, so remove it first
    fs.rmSync(cachePath, { force: true });
    fs.renameSync(tempPath, cachePath);
    // Only update timestamp after successful cache write
    fs.writeFileSync(getCacheTimestampPath(), Date.now().toString());
  } catch (err) {
    // Warn but don't fail if cache write fails
    console.warn("Failed to write checklist cache:", err);
    // Clean up temp file on failure
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Fetches the Cyfrin audit checklist with caching.
 *
 * Uses a local cache at ~/.sc-auditor/checklist.json with 24h TTL.
 * Falls back to stale cache on network errors.
 *
 * @returns Flat array of ChecklistItem
 * @throws Error if network fails and no cache is available
 */
export async function fetchChecklist(): Promise<ChecklistItem[]> {
  // Check for fresh cache first
  if (isCacheFresh()) {
    const cached = readCache();
    if (cached !== null) {
      try {
        return flattenChecklist(cached);
      } catch {
        // Cache contains valid JSON but fails structural validation
        // Delete corrupt cache and fall through to network fetch
        try {
          fs.unlinkSync(getCacheFilePath());
          fs.unlinkSync(getCacheTimestampPath());
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  // Try to fetch from network
  try {
    const response = await fetch(CHECKLIST_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as unknown[];
    writeCache(data);
    return flattenChecklist(data);
  } catch (err) {
    // Fall back to stale cache on network error
    const staleCache = readCache();
    if (staleCache !== null) {
      return flattenChecklist(staleCache);
    }
    throw new Error(`ERROR: CHECKLIST_FETCH - Failed to fetch checklist: ${err}`);
  }
}
