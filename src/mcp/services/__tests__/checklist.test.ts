/**
 * Tests for checklist service functions.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchChecklist,
  filterByCategory,
  flattenChecklist,
  getCategories,
} from "../checklist.js";

/** Project root resolved from this test file location. */
const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");

/** Load test fixture. */
function loadFixture(): unknown[] {
  const raw = fs.readFileSync(path.resolve(ROOT, "tests/fixtures/checklist.json"), "utf-8");
  return JSON.parse(raw) as unknown[];
}

describe("AC1: flattenChecklist correctly walks 3-level nested category tree, attaches category to each leaf", () => {
  it("flattens 3-level nested structure into flat array", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);

    // Should have 4 items total from fixture
    expect(items).toHaveLength(4);
  });

  it("attaches category name from parent to each leaf item", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);

    // Items under "Denial-Of-Service Attack" category
    const dosItem = items.find((item) => item.id === "SOL-AM-DOSA-1");
    expect(dosItem?.category).toBe("Denial-Of-Service Attack");

    // Items under "Reentrancy Attack" category
    const reentItem = items.find((item) => item.id === "SOL-AM-REEN-1");
    expect(reentItem?.category).toBe("Reentrancy Attack");

    // Items under "Access Control" category
    const acItem = items.find((item) => item.id === "SOL-AC-1");
    expect(acItem?.category).toBe("Access Control");
  });

  it("preserves leaf item data correctly", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);

    const item = items.find((i) => i.id === "SOL-AM-DOSA-1");
    expect(item).toBeDefined();
    expect(item?.question).toBe("Can external calls cause DOS?");
    expect(item?.description).toBe("External calls may revert and block execution");
    expect(item?.remediation).toBe("Use pull over push pattern");
    expect(item?.references).toEqual(["https://example.com/dos"]);
    expect(item?.tags).toEqual(["dos", "external-call"]);
  });

  it("returns empty array for empty input", () => {
    const items = flattenChecklist([]);
    expect(items).toEqual([]);
  });

  it("throws validation error for non-array input", () => {
    expect(() => flattenChecklist({ data: "not an array" })).toThrow(
      "ERROR: CHECKLIST_VALIDATION - Checklist data is not an array"
    );
    expect(() => flattenChecklist("string")).toThrow(
      "ERROR: CHECKLIST_VALIDATION - Checklist data is not an array"
    );
    expect(() => flattenChecklist(null)).toThrow(
      "ERROR: CHECKLIST_VALIDATION - Checklist data is not an array"
    );
  });

  it("throws validation error for non-object elements in root array", () => {
    expect(() => flattenChecklist(["invalid", 123, null])).toThrow(
      "ERROR: CHECKLIST_VALIDATION - Checklist root is not an array of objects"
    );
  });

  it("throws validation error for leaf items missing required fields", () => {
    const invalidData = [
      {
        category: "Test",
        data: [
          {
            id: "TEST-1",
            // Missing question, description, remediation, references, tags
          },
        ],
      },
    ];
    expect(() => flattenChecklist(invalidData)).toThrow(
      "ERROR: CHECKLIST_VALIDATION - Checklist leaf item is missing required fields"
    );
  });

  it("warns and skips malformed nodes that are neither leaf nor category", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const dataWithMalformedNode = [
      {
        category: "Test",
        data: [
          {
            id: "TEST-1",
            question: "Test question?",
            description: "Test desc",
            remediation: "Test fix",
            references: [],
            tags: [],
          },
          {
            // Malformed: no id and no data array
            category: "Orphan Category",
          },
        ],
      },
    ];

    const items = flattenChecklist(dataWithMalformedNode);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("TEST-1");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping malformed checklist node")
    );

    warnSpy.mockRestore();
  });

  it("uses parent category when category node has non-string category value", () => {
    const dataWithInvalidCategory = [
      {
        category: "Parent Category",
        data: [
          {
            category: 123, // Non-string category should be ignored
            data: [
              {
                id: "TEST-1",
                question: "Test question?",
                description: "Test desc",
                remediation: "Test fix",
                references: [],
                tags: [],
              },
            ],
          },
        ],
      },
    ];

    const items = flattenChecklist(dataWithInvalidCategory);

    expect(items).toHaveLength(1);
    // Should use "Parent Category" since 123 is not a string
    expect(items[0].category).toBe("Parent Category");
  });
});

describe("AC2: Each ChecklistItem has: id, question, description, remediation, references, tags, category", () => {
  it("every item has all required fields", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);

    for (const item of items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("question");
      expect(item).toHaveProperty("description");
      expect(item).toHaveProperty("remediation");
      expect(item).toHaveProperty("references");
      expect(item).toHaveProperty("tags");
      expect(item).toHaveProperty("category");
    }
  });

  it("id field is a non-empty string", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);

    for (const item of items) {
      expect(typeof item.id).toBe("string");
      expect(item.id.length).toBeGreaterThan(0);
    }
  });

  it("references and tags are arrays", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);

    for (const item of items) {
      expect(Array.isArray(item.references)).toBe(true);
      expect(Array.isArray(item.tags)).toBe(true);
    }
  });

  it("handles items with empty references and tags", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);

    // SOL-AM-REEN-2 has empty references array in fixture
    const itemWithEmptyRefs = items.find((i) => i.id === "SOL-AM-REEN-2");
    expect(itemWithEmptyRefs?.references).toEqual([]);
  });
});

describe("AC3: filterByCategory case-insensitive substring match", () => {
  it("returns all items when category is undefined", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);
    const filtered = filterByCategory(items, undefined);

    expect(filtered).toHaveLength(4);
    expect(filtered).toEqual(items);
  });

  it("filters by exact category name (case-insensitive)", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);

    // Exact match with different case
    const filtered = filterByCategory(items, "REENTRANCY ATTACK");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.category === "Reentrancy Attack")).toBe(true);
  });

  it("filters by substring match (case-insensitive)", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);

    // Substring "reentrancy" should match "Reentrancy Attack"
    const filtered = filterByCategory(items, "reentrancy");
    expect(filtered).toHaveLength(2);

    // Substring "attack" should match multiple categories
    const attackItems = filterByCategory(items, "attack");
    expect(attackItems).toHaveLength(3); // DOS + Reentrancy items
  });

  it("returns empty array when no category matches", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);
    const filtered = filterByCategory(items, "nonexistent");

    expect(filtered).toEqual([]);
  });

  it("handles empty items array", () => {
    const filtered = filterByCategory([], "any");
    expect(filtered).toEqual([]);
  });

  it("returns all items when category is empty string", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);
    const filtered = filterByCategory(items, "");

    // Empty string includes() is always true, so returns all items
    expect(filtered).toHaveLength(4);
    expect(filtered).toEqual(items);
  });

  it("matches categories containing whitespace when filter is a single space", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);
    // Single space filter matches categories containing spaces
    const filtered = filterByCategory(items, " ");

    // "Denial-Of-Service Attack", "Reentrancy Attack" contain space; "Access Control" contains space
    // All 3 categories contain a space, so all 4 items should match
    expect(filtered).toHaveLength(4);
    expect(filtered.every((i) => i.category.includes(" "))).toBe(true);
  });
});

describe("AC4: getCategories returns unique sorted names", () => {
  it("returns unique category names", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);
    const categories = getCategories(items);

    // Fixture has 3 unique categories
    expect(categories).toHaveLength(3);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it("returns categories sorted alphabetically", () => {
    const raw = loadFixture();
    const items = flattenChecklist(raw);
    const categories = getCategories(items);

    expect(categories).toEqual(["Access Control", "Denial-Of-Service Attack", "Reentrancy Attack"]);
  });

  it("returns empty array for empty items", () => {
    const categories = getCategories([]);
    expect(categories).toEqual([]);
  });
});

/**
 * Cache tests use process.env.HOME override for test isolation.
 * This works on Unix systems where os.homedir() reads $HOME.
 *
 * Production code uses os.homedir() which is cross-platform:
 * - Unix: reads $HOME environment variable
 * - Windows: reads USERPROFILE (or HOMEDRIVE+HOMEPATH fallback)
 *
 * The implementation is cross-platform; only the test isolation technique
 * is Unix-specific. Windows CI would need to mock os.homedir() directly
 * if testing cache behavior there.
 */
describe("AC5: Cache at ~/.sc-auditor/checklist.json with 24h TTL", () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "checklist-cache-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("fetches from network and caches result", async () => {
    const mockResponse = loadFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const items = await fetchChecklist();

    expect(items).toHaveLength(4);
    expect(fs.existsSync(path.join(tempDir, ".sc-auditor", "checklist.json"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, ".sc-auditor", "checklist-fetched-at.txt"))).toBe(true);
  });

  it("returns cached result when cache is fresh (< 24h)", async () => {
    // Set up cache
    const cacheDir = path.join(tempDir, ".sc-auditor");
    fs.mkdirSync(cacheDir, { recursive: true });
    const mockData = loadFixture();
    fs.writeFileSync(path.join(cacheDir, "checklist.json"), JSON.stringify(mockData));
    fs.writeFileSync(path.join(cacheDir, "checklist-fetched-at.txt"), Date.now().toString());

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const items = await fetchChecklist();

    expect(items).toHaveLength(4);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches from network when cache is stale (> 24h)", async () => {
    // Set up stale cache (25 hours old)
    const cacheDir = path.join(tempDir, ".sc-auditor");
    fs.mkdirSync(cacheDir, { recursive: true });
    const mockData = loadFixture();
    fs.writeFileSync(path.join(cacheDir, "checklist.json"), JSON.stringify(mockData));
    const staleTime = Date.now() - 25 * 60 * 60 * 1000;
    fs.writeFileSync(path.join(cacheDir, "checklist-fetched-at.txt"), staleTime.toString());

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const items = await fetchChecklist();

    expect(items).toHaveLength(4);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("creates cache directory with recursive: true", async () => {
    const mockResponse = loadFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    await fetchChecklist();

    const cacheDir = path.join(tempDir, ".sc-auditor");
    expect(fs.existsSync(cacheDir)).toBe(true);
  });

  it("fetches from network when cache is exactly 24h old (boundary condition)", async () => {
    // Set up cache that is exactly 24 hours old (at the boundary)
    const cacheDir = path.join(tempDir, ".sc-auditor");
    fs.mkdirSync(cacheDir, { recursive: true });
    const mockData = loadFixture();
    fs.writeFileSync(path.join(cacheDir, "checklist.json"), JSON.stringify(mockData));
    // Exactly 24h old: Date.now() - fetchedAt === CACHE_TTL_MS (not < CACHE_TTL_MS)
    const exactlyStaleTime = Date.now() - 24 * 60 * 60 * 1000;
    fs.writeFileSync(path.join(cacheDir, "checklist-fetched-at.txt"), exactlyStaleTime.toString());

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const items = await fetchChecklist();

    expect(items).toHaveLength(4);
    // Since exactly 24h is NOT < 24h, cache should be considered stale and network fetch should occur
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});

describe("AC6: Falls back to stale cache on network error", () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "checklist-cache-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("falls back to stale cache on network error", async () => {
    // Set up stale cache
    const cacheDir = path.join(tempDir, ".sc-auditor");
    fs.mkdirSync(cacheDir, { recursive: true });
    const mockData = loadFixture();
    fs.writeFileSync(path.join(cacheDir, "checklist.json"), JSON.stringify(mockData));
    const staleTime = Date.now() - 48 * 60 * 60 * 1000; // 48 hours old
    fs.writeFileSync(path.join(cacheDir, "checklist-fetched-at.txt"), staleTime.toString());

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const items = await fetchChecklist();

    expect(items).toHaveLength(4);
  });

  it("throws error on network error with no cache", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    await expect(fetchChecklist()).rejects.toThrow("ERROR: CHECKLIST_FETCH");
  });

  it("falls back to stale cache on non-ok response", async () => {
    // Set up stale cache
    const cacheDir = path.join(tempDir, ".sc-auditor");
    fs.mkdirSync(cacheDir, { recursive: true });
    const mockData = loadFixture();
    fs.writeFileSync(path.join(cacheDir, "checklist.json"), JSON.stringify(mockData));
    const staleTime = Date.now() - 48 * 60 * 60 * 1000;
    fs.writeFileSync(path.join(cacheDir, "checklist-fetched-at.txt"), staleTime.toString());

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const items = await fetchChecklist();

    expect(items).toHaveLength(4);
  });

  it("fetches from network when cache file is deleted but timestamp is fresh", async () => {
    // Set up fresh timestamp but no cache file (simulates race condition)
    const cacheDir = path.join(tempDir, ".sc-auditor");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "checklist-fetched-at.txt"), Date.now().toString());
    // No checklist.json file - simulates deletion between isCacheFresh() and readCache()

    const mockResponse = loadFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const items = await fetchChecklist();

    expect(items).toHaveLength(4);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("fetches from network when cache file contains malformed JSON", async () => {
    // Set up fresh timestamp with corrupted/malformed cache file
    const cacheDir = path.join(tempDir, ".sc-auditor");
    fs.mkdirSync(cacheDir, { recursive: true });
    // Write invalid JSON to cache file
    fs.writeFileSync(path.join(cacheDir, "checklist.json"), "{invalid json content}");
    // Fresh timestamp (cache should be considered valid but unreadable)
    fs.writeFileSync(path.join(cacheDir, "checklist-fetched-at.txt"), Date.now().toString());

    const mockResponse = loadFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    // Should not throw - should gracefully fall back to network fetch
    const items = await fetchChecklist();

    expect(items).toHaveLength(4);
    // Since malformed JSON should cause readCache() to return null, network fetch should occur
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("fetches from network when timestamp file contains non-numeric data", async () => {
    // Set up cache with valid JSON but non-numeric timestamp
    const cacheDir = path.join(tempDir, ".sc-auditor");
    fs.mkdirSync(cacheDir, { recursive: true });
    const mockData = loadFixture();
    fs.writeFileSync(path.join(cacheDir, "checklist.json"), JSON.stringify(mockData));
    // Write non-numeric data to timestamp file (should be treated as stale)
    fs.writeFileSync(path.join(cacheDir, "checklist-fetched-at.txt"), "invalid-timestamp");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const items = await fetchChecklist();

    expect(items).toHaveLength(4);
    // Non-numeric timestamp should be treated as cache miss, triggering network fetch
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("fetches from network when cache contains structurally invalid JSON (valid JSON but fails validation)", async () => {
    // Set up fresh cache with valid JSON that fails flattenChecklist validation
    // This tests CDX-I001: corrupt-but-JSON-valid cache should not block network fallback
    const cacheDir = path.join(tempDir, ".sc-auditor");
    fs.mkdirSync(cacheDir, { recursive: true });
    // Valid JSON but wrong structure (object instead of array)
    fs.writeFileSync(path.join(cacheDir, "checklist.json"), JSON.stringify({ invalid: "structure" }));
    // Fresh timestamp - this would normally prevent network fetch
    fs.writeFileSync(path.join(cacheDir, "checklist-fetched-at.txt"), Date.now().toString());

    const mockResponse = loadFixture();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    // Should not throw - should gracefully fall back to network fetch
    const items = await fetchChecklist();

    expect(items).toHaveLength(4);
    // Structurally invalid cache should trigger network fetch
    expect(globalThis.fetch).toHaveBeenCalled();
    // Corrupt cache should be deleted
    expect(fs.existsSync(path.join(cacheDir, "checklist.json"))).toBe(true); // New valid cache written
  });
});
