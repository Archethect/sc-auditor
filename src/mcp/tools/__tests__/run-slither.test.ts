/**
 * Tests for run-slither MCP tool registration and integration.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../../server.js";
import { registerRunSlitherTool } from "../run-slither.js";
import { createEnoentError, getJsonOutputPath, mockExecFile } from "./exec-test-utils.js";

// Mock child_process for integration tests
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

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
  registerRunSlitherTool(server);
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

describe("AC9: Tool registered on MCP server via server.registerTool()", () => {
  it("registers run-slither tool on the server", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const runSlitherTool = tools.find((t) => t.name === "run-slither");

      expect(runSlitherTool).toBeDefined();
      expect(runSlitherTool?.description).toContain("Slither");
    } finally {
      await cleanup();
    }
  });

  it("has required input schema with rootDir parameter", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const runSlitherTool = tools.find((t) => t.name === "run-slither");

      expect(runSlitherTool?.inputSchema).toBeDefined();
      const schema = runSlitherTool?.inputSchema as { properties?: Record<string, unknown> };
      expect(schema.properties?.rootDir).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});

describe("Integration: run-slither tool end-to-end flow", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slither-integration-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns findings through full flow: tool handler -> executor -> parser", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        const slitherOutput = {
          success: true,
          results: {
            detectors: [
              {
                check: "reentrancy-eth",
                impact: "High",
                confidence: "High",
                description: "Reentrancy in Vault.withdraw()",
                elements: [
                  {
                    type: "function",
                    name: "withdraw",
                    source_mapping: {
                      filename_relative: "contracts/Vault.sol",
                      lines: [10, 11, 12],
                      starting_column: 5,
                      ending_column: 6,
                    },
                  },
                ],
              },
            ],
          },
        };
        fs.writeFileSync(outputPath, JSON.stringify(slitherOutput));
      }
      cb(null, "", "");
    });

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("run-slither", { rootDir: tempDir });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.type).toBe("text");

      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(true);
      expect(parsed.findings).toHaveLength(1);
      expect(parsed.findings[0].title).toBe("reentrancy-eth");
      expect(parsed.findings[0].severity).toBe("HIGH");
      expect(parsed.findings[0].confidence).toBe("Confirmed");
      expect(parsed.findings[0].source).toBe("slither");
      expect(parsed.findings[0].affected_files).toEqual(["contracts/Vault.sol"]);
      expect(parsed.findings[0].affected_lines).toEqual({ start: 10, end: 12 });
    } finally {
      await cleanup();
    }
  });

  it("propagates executor errors to tool response", async () => {
    mockExecFile((_args, cb) => {
      cb(createEnoentError(), "", "");
    });

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("run-slither", { rootDir: tempDir });

      expect(result.isError).toBeFalsy();
      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("TOOL_NOT_FOUND");
    } finally {
      await cleanup();
    }
  });

  it("returns empty findings array for success with no detectors", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        fs.writeFileSync(outputPath, '{"success": true, "results": {"detectors": []}}');
      }
      cb(null, "", "");
    });

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("run-slither", { rootDir: tempDir });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(true);
      expect(parsed.findings).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});
