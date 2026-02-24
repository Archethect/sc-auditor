/**
 * Tests for search_findings MCP tool registration and integration.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../../server.js";
import { registerSearchFindingsTool } from "../search-findings.js";

/**
 * Creates and connects an MCP client/server pair for testing.
 * Returns tools list, callTool function, and cleanup function.
 */
async function setupMcpTest(): Promise<{
  tools: Tool[];
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ content: unknown[]; isError?: boolean }>;
  cleanup: () => Promise<void>;
}> {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  registerSearchFindingsTool(server);
  const client = new Client({ name: "test-client", version: "0.0.1" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    tools: (await client.listTools()).tools,
    callTool: async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      return result as { content: unknown[]; isError?: boolean };
    },
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

/**
 * Sets up a temp directory with config.json for testing.
 */
function setupConfigDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "search-findings-"));
  fs.writeFileSync(path.join(tempDir, "config.json"), JSON.stringify({}));
  return tempDir;
}

/**
 * Creates a mock successful API response with optional findings data.
 */
function mockSuccessResponse(
  findings: unknown[] = [],
  rateLimitRemaining = "100",
): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "x-ratelimit-remaining": rateLimitRemaining }),
    json: async () => ({ findings }),
  } as Response;
}

/**
 * Creates a mock error API response.
 */
function mockErrorResponse(
  status: number,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: false,
    status,
    headers: new Headers(headers),
    json: async () => ({}),
  } as Response;
}

/**
 * Creates a standard test finding object for API responses.
 */
function createTestFinding(overrides: Partial<{
  slug: string;
  title: string;
  impact: string;
  category: string;
  quality_score: number;
  issues_issuetagscore: Array<{ tags_tag: { title: string } }>;
}> = {}): object {
  return {
    slug: "test-slug",
    title: "Test Finding",
    impact: "HIGH",
    category: "DeFi",
    quality_score: 4,
    issues_issuetagscore: [],
    ...overrides,
  };
}

/**
 * Parses the JSON text content from an MCP tool result.
 */
function parseResultContent(result: { content: unknown[] }): unknown {
  const textContent = result.content[0] as { type: string; text: string };
  return JSON.parse(textContent.text);
}

/**
 * Gets the text content from an MCP tool result.
 */
function getResultText(result: { content: unknown[] }): string {
  const textContent = result.content[0] as { type: string; text: string };
  return textContent.text;
}

describe("AC9: Tool name is search_findings (underscore)", () => {
  let tempDir: string;
  let originalCwd: string;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    tempDir = setupConfigDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    savedApiKey = process.env["SOLODIT_API_KEY"];
    process.env["SOLODIT_API_KEY"] = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["SOLODIT_API_KEY"];
    } else {
      process.env["SOLODIT_API_KEY"] = savedApiKey;
    }
    vi.restoreAllMocks();
  });

  it("registers tool with underscore name search_findings", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const searchFindingsTool = tools.find((t) => t.name === "search_findings");

      expect(searchFindingsTool).toBeDefined();
      expect(searchFindingsTool?.name).toBe("search_findings");
    } finally {
      await cleanup();
    }
  });

  it("has description mentioning Solodit findings search", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const searchFindingsTool = tools.find((t) => t.name === "search_findings");

      expect(searchFindingsTool?.description).toContain("Solodit");
      expect(searchFindingsTool?.description).toContain("findings");
    } finally {
      await cleanup();
    }
  });

  it("has required query input parameter", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const searchFindingsTool = tools.find((t) => t.name === "search_findings");
      const schema = searchFindingsTool?.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };

      expect(schema?.properties?.query).toBeDefined();
      expect(schema?.required).toContain("query");
    } finally {
      await cleanup();
    }
  });

  it("has optional severity input parameter as enum", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const searchFindingsTool = tools.find((t) => t.name === "search_findings");
      const schema = searchFindingsTool?.inputSchema as {
        properties?: Record<string, { enum?: string[] }>;
        required?: string[];
      };

      expect(schema?.properties?.severity).toBeDefined();
      expect(schema?.properties?.severity?.enum).toEqual([
        "Critical",
        "High",
        "Medium",
        "Low",
        "Gas",
        "Informational",
      ]);
      expect(schema?.required ?? []).not.toContain("severity");
    } finally {
      await cleanup();
    }
  });

  it("has optional limit input parameter with range 1-100", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const searchFindingsTool = tools.find((t) => t.name === "search_findings");
      const schema = searchFindingsTool?.inputSchema as {
        properties?: Record<string, { minimum?: number; maximum?: number }>;
        required?: string[];
      };

      expect(schema?.properties?.limit).toBeDefined();
      expect(schema?.properties?.limit?.minimum).toBe(1);
      expect(schema?.properties?.limit?.maximum).toBe(100);
      expect(schema?.required ?? []).not.toContain("limit");
    } finally {
      await cleanup();
    }
  });

  it("has optional tags input parameter as string array", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const searchFindingsTool = tools.find((t) => t.name === "search_findings");
      const schema = searchFindingsTool?.inputSchema as {
        properties?: Record<string, { type?: string; items?: { type?: string } }>;
        required?: string[];
      };

      expect(schema?.properties?.tags).toBeDefined();
      expect(schema?.properties?.tags?.type).toBe("array");
      expect(schema?.required ?? []).not.toContain("tags");
    } finally {
      await cleanup();
    }
  });
});

describe("AC1: Request body matches Solodit API spec", () => {
  let tempDir: string;
  let originalCwd: string;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    tempDir = setupConfigDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    savedApiKey = process.env["SOLODIT_API_KEY"];
    process.env["SOLODIT_API_KEY"] = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["SOLODIT_API_KEY"];
    } else {
      process.env["SOLODIT_API_KEY"] = savedApiKey;
    }
    vi.restoreAllMocks();
  });

  it("sends POST request to correct Solodit API endpoint", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "reentrancy" });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://solodit.cyfrin.io/api/v1/solodit/findings",
        expect.objectContaining({
          method: "POST",
        }),
      );
    } finally {
      await cleanup();
    }
  });

  it("includes X-Cyfrin-API-Key header with API key", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "reentrancy" });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Cyfrin-API-Key": "test-api-key",
          }),
        }),
      );
    } finally {
      await cleanup();
    }
  });

  it("includes Content-Type application/json header", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "reentrancy" });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );
    } finally {
      await cleanup();
    }
  });

  it("sends query in request body", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "reentrancy" });

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.filters.keywords).toBe("reentrancy");
    } finally {
      await cleanup();
    }
  });

  it("sends pageSize in request body (default 10)", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "reentrancy" });

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.pageSize).toBe(10);
    } finally {
      await cleanup();
    }
  });

  it("sends custom pageSize when limit provided", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "reentrancy", limit: 50 });

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.pageSize).toBe(50);
    } finally {
      await cleanup();
    }
  });
});

describe("AC2: Tags sent as Array<{ value: string }> (not plain strings)", () => {
  let tempDir: string;
  let originalCwd: string;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    tempDir = setupConfigDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    savedApiKey = process.env["SOLODIT_API_KEY"];
    process.env["SOLODIT_API_KEY"] = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["SOLODIT_API_KEY"];
    } else {
      process.env["SOLODIT_API_KEY"] = savedApiKey;
    }
    vi.restoreAllMocks();
  });

  it("sends severity as impact filter in uppercase array format", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "reentrancy", severity: "High" });

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.filters.impact).toEqual(["HIGH"]);
    } finally {
      await cleanup();
    }
  });

  it("converts severity to uppercase for API", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "test", severity: "Critical" });

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.filters.impact).toEqual(["CRITICAL"]);
    } finally {
      await cleanup();
    }
  });

  it("does not include impact field when severity not provided", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "test" });

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.filters.impact).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("sends tags as Array<{ value: string }> format", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "test", tags: ["reentrancy", "oracle"] });

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.filters.tags).toEqual([{ value: "reentrancy" }, { value: "oracle" }]);
    } finally {
      await cleanup();
    }
  });

  it("does not include tags field when tags not provided", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "test" });

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.filters.tags).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("does not include tags field when empty array provided", async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "test", tags: [] });

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.filters.tags).toBeUndefined();
    } finally {
      await cleanup();
    }
  });
});

describe("AC3: Response parser extracts slug, title, severity, flattened tags, quality_score", () => {
  let tempDir: string;
  let originalCwd: string;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    tempDir = setupConfigDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    savedApiKey = process.env["SOLODIT_API_KEY"];
    process.env["SOLODIT_API_KEY"] = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["SOLODIT_API_KEY"];
    } else {
      process.env["SOLODIT_API_KEY"] = savedApiKey;
    }
    vi.restoreAllMocks();
  });

  it("extracts slug from response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([createTestFinding({ slug: "test-slug-123" })]),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { results: Array<{ slug: string }> };

      expect(parsed.results[0].slug).toBe("test-slug-123");
    } finally {
      await cleanup();
    }
  });

  it("extracts title from response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([createTestFinding({ title: "Reentrancy Vulnerability" })]),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { results: Array<{ title: string }> };

      expect(parsed.results[0].title).toBe("Reentrancy Vulnerability");
    } finally {
      await cleanup();
    }
  });

  it("maps API impact to SoloditSeverity (capitalized)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([createTestFinding({ impact: "HIGH" })]),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { results: Array<{ severity: string }> };

      expect(parsed.results[0].severity).toBe("High");
    } finally {
      await cleanup();
    }
  });

  it("extracts quality_score from response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([createTestFinding({ impact: "MEDIUM", quality_score: 5 })]),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { results: Array<{ quality_score: number }> };

      expect(parsed.results[0].quality_score).toBe(5);
    } finally {
      await cleanup();
    }
  });

  it("extracts protocol_category from response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([createTestFinding({ impact: "LOW", category: "Lending", quality_score: 3 })]),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { results: Array<{ protocol_category: string }> };

      expect(parsed.results[0].protocol_category).toBe("Lending");
    } finally {
      await cleanup();
    }
  });
});

describe("AC4: Tags flattened from issues_issuetagscore[].tags_tag.title", () => {
  let tempDir: string;
  let originalCwd: string;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    tempDir = setupConfigDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    savedApiKey = process.env["SOLODIT_API_KEY"];
    process.env["SOLODIT_API_KEY"] = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["SOLODIT_API_KEY"];
    } else {
      process.env["SOLODIT_API_KEY"] = savedApiKey;
    }
    vi.restoreAllMocks();
  });

  it("flattens tags from issues_issuetagscore[].tags_tag.title", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([
        createTestFinding({
          issues_issuetagscore: [
            { tags_tag: { title: "reentrancy" } },
            { tags_tag: { title: "access-control" } },
          ],
        }),
      ]),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { results: Array<{ tags: string[] }> };

      expect(parsed.results[0].tags).toEqual(["reentrancy", "access-control"]);
    } finally {
      await cleanup();
    }
  });

  it("returns empty array when issues_issuetagscore is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([createTestFinding()]),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { results: Array<{ tags: string[] }> };

      expect(parsed.results[0].tags).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("handles missing issues_issuetagscore gracefully", async () => {
    const finding = createTestFinding();
    // Remove issues_issuetagscore to test missing field handling
    delete (finding as Record<string, unknown>).issues_issuetagscore;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse([finding]));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { results: Array<{ tags: string[] }> };

      expect(parsed.results[0].tags).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("handles malformed tags_tag entries gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([
        {
          ...createTestFinding(),
          issues_issuetagscore: [
            { tags_tag: { title: "valid-tag" } },
            { tags_tag: null },
            { tags_tag: { title: "another-valid-tag" } },
            {},
          ],
        },
      ]),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { results: Array<{ tags: string[] }> };

      expect(parsed.results[0].tags).toEqual(["valid-tag", "another-valid-tag"]);
    } finally {
      await cleanup();
    }
  });
});

describe("AC5: Rate limit warning when remaining < 3", () => {
  let tempDir: string;
  let originalCwd: string;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    tempDir = setupConfigDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    savedApiKey = process.env["SOLODIT_API_KEY"];
    process.env["SOLODIT_API_KEY"] = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["SOLODIT_API_KEY"];
    } else {
      process.env["SOLODIT_API_KEY"] = savedApiKey;
    }
    vi.restoreAllMocks();
  });

  it("includes rate limit warning when remaining < 3", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([createTestFinding()], "2"),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { warning?: string };

      expect(parsed.warning).toContain("rate limit");
      expect(parsed.warning).toContain("2");
    } finally {
      await cleanup();
    }
  });

  it("does not include warning when remaining >= 3", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([createTestFinding()], "50"),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { warning?: string };

      expect(parsed.warning).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("includes warning at exactly remaining = 2", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse([], "2"));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { warning?: string };

      expect(parsed.warning).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it("includes warning at remaining = 1", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse([], "1"));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { warning?: string };

      expect(parsed.warning).toBeDefined();
      expect(parsed.warning).toContain("1");
    } finally {
      await cleanup();
    }
  });

  it("includes warning at remaining = 0", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse([], "0"));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { warning?: string };

      expect(parsed.warning).toBeDefined();
      expect(parsed.warning).toContain("0");
    } finally {
      await cleanup();
    }
  });

  it("does not include warning when remaining = 3 (exact threshold)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([createTestFinding()], "3"),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { warning?: string };

      expect(parsed.warning).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  it("handles missing x-ratelimit-remaining header gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({}),
      json: async () => ({ findings: [createTestFinding()] }),
    } as Response);

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { warning?: string; results: unknown[] };

      expect(parsed.warning).toBeUndefined();
      expect(parsed.results).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});

describe("AC6: 429 error with reset timestamp (no retry)", () => {
  let tempDir: string;
  let originalCwd: string;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    tempDir = setupConfigDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    savedApiKey = process.env["SOLODIT_API_KEY"];
    process.env["SOLODIT_API_KEY"] = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["SOLODIT_API_KEY"];
    } else {
      process.env["SOLODIT_API_KEY"] = savedApiKey;
    }
    vi.restoreAllMocks();
  });

  it("returns error with reset timestamp on 429", async () => {
    const resetTimestamp = Math.floor(Date.now() / 1000) + 3600;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockErrorResponse(429, { "x-ratelimit-reset": String(resetTimestamp) }),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });

      expect(result.isError).toBe(true);
      expect(getResultText(result)).toContain("rate limit");
      expect(getResultText(result)).toContain("reset");
    } finally {
      await cleanup();
    }
  });

  it("does not retry on 429", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockErrorResponse(429, { "x-ratelimit-reset": "1234567890" }),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "test" });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });

  it("handles 429 without x-ratelimit-reset header", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockErrorResponse(429));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });

      expect(result.isError).toBe(true);
      expect(getResultText(result)).toContain("rate limit");
      expect(getResultText(result)).toContain("unknown");
    } finally {
      await cleanup();
    }
  });

  it("handles 429 with malformed x-ratelimit-reset header", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockErrorResponse(429, { "x-ratelimit-reset": "not-a-number" }),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });

      expect(result.isError).toBe(true);
      expect(getResultText(result)).toContain("rate limit");
      expect(getResultText(result)).toContain("unknown");
    } finally {
      await cleanup();
    }
  });
});

describe("AC7: 5xx errors trigger single retry, then error", () => {
  let tempDir: string;
  let originalCwd: string;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    tempDir = setupConfigDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    savedApiKey = process.env["SOLODIT_API_KEY"];
    process.env["SOLODIT_API_KEY"] = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["SOLODIT_API_KEY"];
    } else {
      process.env["SOLODIT_API_KEY"] = savedApiKey;
    }
    vi.restoreAllMocks();
  });

  it("retries once on 500 error then succeeds", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockErrorResponse(500))
      .mockResolvedValueOnce(mockSuccessResponse([createTestFinding()]));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.isError).toBeFalsy();
    } finally {
      await cleanup();
    }
  });

  it("returns error after two consecutive 5xx failures", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockErrorResponse(503))
      .mockResolvedValueOnce(mockErrorResponse(502));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.isError).toBe(true);
      expect(getResultText(result)).toContain("server error");
    } finally {
      await cleanup();
    }
  });

  it("handles 502 error with single retry", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockErrorResponse(502));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

describe("AC8: 401 returns clear API key error", () => {
  let tempDir: string;
  let originalCwd: string;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    tempDir = setupConfigDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    savedApiKey = process.env["SOLODIT_API_KEY"];
    process.env["SOLODIT_API_KEY"] = "invalid-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["SOLODIT_API_KEY"];
    } else {
      process.env["SOLODIT_API_KEY"] = savedApiKey;
    }
    vi.restoreAllMocks();
  });

  it("returns clear API key error on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockErrorResponse(401));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });

      expect(result.isError).toBe(true);
      expect(getResultText(result)).toContain("API key");
      expect(getResultText(result)).toContain("invalid");
    } finally {
      await cleanup();
    }
  });

  it("does not retry on 401", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(mockErrorResponse(401));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "test" });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });
});

describe("AC10: Handler reads API key from SOLODIT_API_KEY env var", () => {
  let tempDir: string;
  let originalCwd: string;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    tempDir = setupConfigDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    savedApiKey = process.env["SOLODIT_API_KEY"];
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["SOLODIT_API_KEY"];
    } else {
      process.env["SOLODIT_API_KEY"] = savedApiKey;
    }
    vi.restoreAllMocks();
  });

  it("uses API key from SOLODIT_API_KEY env var", async () => {
    process.env["SOLODIT_API_KEY"] = "env-api-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      await callTool("search_findings", { query: "test" });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Cyfrin-API-Key": "env-api-key",
          }),
        }),
      );
    } finally {
      await cleanup();
    }
  });

  it("returns SOLODIT_API_KEY_MISSING error when env var is not set", async () => {
    delete process.env["SOLODIT_API_KEY"];

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });

      expect(result.isError).toBe(true);
      expect(getResultText(result)).toContain("SOLODIT_API_KEY_MISSING");
    } finally {
      await cleanup();
    }
  });

  it("returns SOLODIT_API_KEY_MISSING error when env var is empty", async () => {
    process.env["SOLODIT_API_KEY"] = "";

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });

      expect(result.isError).toBe(true);
      expect(getResultText(result)).toContain("SOLODIT_API_KEY_MISSING");
    } finally {
      await cleanup();
    }
  });
});

describe("Edge cases", () => {
  let tempDir: string;
  let originalCwd: string;
  let savedApiKey: string | undefined;

  beforeEach(() => {
    tempDir = setupConfigDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    savedApiKey = process.env["SOLODIT_API_KEY"];
    process.env["SOLODIT_API_KEY"] = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (savedApiKey === undefined) {
      delete process.env["SOLODIT_API_KEY"];
    } else {
      process.env["SOLODIT_API_KEY"] = savedApiKey;
    }
    vi.restoreAllMocks();
  });

  it("handles empty issues array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "nonexistent" });
      const parsed = parseResultContent(result) as { results: unknown[] };

      expect(Array.isArray(parsed.results)).toBe(true);
      expect(parsed.results).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it("handles 400 bad request without retry", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockErrorResponse(400));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "" });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.isError).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("maps all severity values correctly", async () => {
    const severities = [
      { input: "Critical", expected: "CRITICAL" },
      { input: "High", expected: "HIGH" },
      { input: "Medium", expected: "MEDIUM" },
      { input: "Low", expected: "LOW" },
      { input: "Gas", expected: "GAS" },
      { input: "Informational", expected: "INFORMATIONAL" },
    ];

    for (const { input, expected } of severities) {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockSuccessResponse());

      const { callTool, cleanup } = await setupMcpTest();

      try {
        await callTool("search_findings", { query: "test", severity: input });

        const call = fetchSpy.mock.calls[0];
        const body = JSON.parse(call[1]?.body as string);
        expect(body.filters.impact).toEqual([expected]);
      } finally {
        await cleanup();
      }

      vi.restoreAllMocks();
    }
  });

  it("maps all API impact values back to SoloditSeverity", async () => {
    const impacts = [
      { apiImpact: "CRITICAL", expected: "Critical" },
      { apiImpact: "HIGH", expected: "High" },
      { apiImpact: "MEDIUM", expected: "Medium" },
      { apiImpact: "LOW", expected: "Low" },
      { apiImpact: "GAS", expected: "Gas" },
      { apiImpact: "INFORMATIONAL", expected: "Informational" },
    ];

    for (const { apiImpact, expected } of impacts) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockSuccessResponse([createTestFinding({ impact: apiImpact, quality_score: 3 })]),
      );

      const { callTool, cleanup } = await setupMcpTest();

      try {
        const result = await callTool("search_findings", { query: "test" });
        const parsed = parseResultContent(result) as { results: Array<{ severity: string }> };

        expect(parsed.results[0].severity).toBe(expected);
      } finally {
        await cleanup();
      }

      vi.restoreAllMocks();
    }
  });

  it("defaults unknown API impact to Informational with warning", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockSuccessResponse([
        createTestFinding({
          slug: "test-unknown",
          title: "Test Unknown Impact",
          impact: "UNKNOWN_SEVERITY",
          quality_score: 3,
        }),
      ]),
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });
      const parsed = parseResultContent(result) as { results: Array<{ severity: string }> };

      expect(parsed.results[0].severity).toBe("Informational");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Unknown Solodit impact value: UNKNOWN_SEVERITY, defaulting to Informational",
      );
    } finally {
      await cleanup();
      consoleWarnSpy.mockRestore();
    }
  });

  it("handles malformed JSON response gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: vi.fn().mockRejectedValueOnce(new SyntaxError("Unexpected token '<'")),
    } as unknown as Response);

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });

      expect(result.isError).toBe(true);
      expect(getResultText(result)).toContain("SOLODIT_RESPONSE");
      expect(getResultText(result)).toContain("failed to parse API response");
    } finally {
      await cleanup();
    }
  });

  it("handles network errors gracefully without retry", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network connection failed"));

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("search_findings", { query: "test" });

      expect(result.isError).toBe(true);
      expect(getResultText(result)).toContain("SOLODIT_NETWORK");
      expect(getResultText(result)).toContain("Network connection failed");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  });
});
