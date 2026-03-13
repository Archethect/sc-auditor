/**
 * Tests for run-aderyn MCP tool registration and integration.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../../server.js";
import { registerRunAderynTool } from "../run-aderyn.js";
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
  registerRunAderynTool(server);
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
  it("registers run-aderyn tool on the server", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const runAderynTool = tools.find((t) => t.name === "run-aderyn");

      expect(runAderynTool).toBeDefined();
      expect(runAderynTool?.description).toContain("Aderyn");
    } finally {
      await cleanup();
    }
  });

  it("has required input schema with rootDir parameter", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const runAderynTool = tools.find((t) => t.name === "run-aderyn");

      expect(runAderynTool?.inputSchema).toBeDefined();
      const schema = runAderynTool?.inputSchema as { properties?: Record<string, unknown> };
      expect(schema.properties?.rootDir).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});

describe("Integration: run-aderyn tool end-to-end flow", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aderyn-integration-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns findings through full flow: tool handler -> executor -> parser", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        const aderynOutput = {
          high_issues: {
            issues: [
              {
                title: "Centralization Risk",
                description: "Contracts have single owner",
                detector_name: "centralization-risk",
                instances: [
                  { contract_path: "contracts/Vault.sol", line_no: 10 },
                ],
              },
            ],
          },
          low_issues: { issues: [] },
        };
        fs.writeFileSync(outputPath, JSON.stringify(aderynOutput));
      }
      cb(null, "", "");
    });

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("run-aderyn", { rootDir: tempDir });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.type).toBe("text");

      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(true);
      expect(parsed.findings).toHaveLength(1);
      expect(parsed.findings[0].title).toBe("Centralization Risk");
      expect(parsed.findings[0].severity).toBe("HIGH");
      expect(parsed.findings[0].confidence).toBe("Likely");
      expect(parsed.findings[0].source).toBe("aderyn");
      expect(parsed.findings[0].affected_files).toEqual(["contracts/Vault.sol"]);
      expect(parsed.findings[0].affected_lines).toEqual({ start: 10, end: 10 });
    } finally {
      await cleanup();
    }
  });

  it("propagates executor errors to tool response", async () => {
    mockExecFile((_args, cb) => {
      cb(createEnoentError("spawn aderyn ENOENT"), "", "");
    });

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("run-aderyn", { rootDir: tempDir });

      expect(result.isError).toBeFalsy();
      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("TOOL_NOT_FOUND");
    } finally {
      await cleanup();
    }
  });

  it("returns empty findings array for success with no issues", async () => {
    mockExecFile((args, cb) => {
      const outputPath = getJsonOutputPath(args);
      if (outputPath) {
        fs.writeFileSync(outputPath, '{"high_issues": {"issues": []}, "low_issues": {"issues": []}}');
      }
      cb(null, "", "");
    });

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("run-aderyn", { rootDir: tempDir });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(true);
      expect(parsed.findings).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});
