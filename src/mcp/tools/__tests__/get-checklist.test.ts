/**
 * Tests for get_checklist MCP tool registration and integration.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../../server.js";
import { registerGetChecklistTool } from "../get-checklist.js";

/**
 * Creates and connects an MCP client/server pair for testing.
 * Returns tools list, callTool function, and cleanup function.
 */
async function setupMcpTest(): Promise<{
  tools: Tool[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<{ content: unknown[]; isError?: boolean }>;
  cleanup: () => Promise<void>;
}> {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  registerGetChecklistTool(server);
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

describe("AC7: Tool name is get_checklist (underscore)", () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "checklist-tool-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("registers tool with underscore name get_checklist", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const getChecklistTool = tools.find((t) => t.name === "get_checklist");

      expect(getChecklistTool).toBeDefined();
      expect(getChecklistTool?.name).toBe("get_checklist");
    } finally {
      await cleanup();
    }
  });

  it("has description mentioning Cyfrin checklist", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const getChecklistTool = tools.find((t) => t.name === "get_checklist");

      expect(getChecklistTool?.description).toContain("checklist");
    } finally {
      await cleanup();
    }
  });

  it("has optional category input parameter", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const getChecklistTool = tools.find((t) => t.name === "get_checklist");
      const schema = getChecklistTool?.inputSchema as { properties?: Record<string, unknown>; required?: string[] };

      expect(schema?.properties?.category).toBeDefined();
      // category should not be in required array (optional)
      expect(schema?.required ?? []).not.toContain("category");
    } finally {
      await cleanup();
    }
  });
});

describe("Integration: get_checklist tool end-to-end flow", () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "checklist-tool-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns checklist items as JSON", async () => {
    const mockData = [
      {
        category: "Test Category",
        data: [
          {
            id: "TEST-1",
            question: "Test question?",
            description: "Test description",
            remediation: "Test remediation",
            references: [],
            tags: [],
          },
        ],
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("get_checklist", {});

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.type).toBe("text");

      const parsed = JSON.parse(textContent.text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe("TEST-1");
      expect(parsed[0].category).toBe("Test Category");
    } finally {
      await cleanup();
    }
  });

  it("filters by category when provided", async () => {
    const mockData = [
      {
        category: "Category A",
        data: [{ id: "A-1", question: "Q?", description: "D", remediation: "R", references: [], tags: [] }],
      },
      {
        category: "Category B",
        data: [{ id: "B-1", question: "Q?", description: "D", remediation: "R", references: [], tags: [] }],
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("get_checklist", { category: "Category A" });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe("A-1");
    } finally {
      await cleanup();
    }
  });

  it("returns empty array when category matches nothing", async () => {
    const mockData = [
      {
        category: "Category A",
        data: [{ id: "A-1", question: "Q?", description: "D", remediation: "R", references: [], tags: [] }],
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("get_checklist", { category: "nonexistent" });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});
