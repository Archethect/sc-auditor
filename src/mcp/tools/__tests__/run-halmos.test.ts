/**
 * Tests for run-halmos MCP tool registration and execution.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../../server.js";
import { executeHalmos, registerRunHalmosTool } from "../run-halmos.js";
import { createEnoentError, mockExecFile } from "./exec-test-utils.js";

// Mock child_process for unit tests
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

/**
 * Creates and connects an MCP client/server pair for testing.
 */
async function setupMcpTest(): Promise<{
  tools: Tool[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<{ content: unknown[]; isError?: boolean }>;
  cleanup: () => Promise<void>;
}> {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  registerRunHalmosTool(server);
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

describe("run-halmos tool registration", () => {
  it("registers on the MCP server", async () => {
    const { tools, cleanup } = await setupMcpTest();
    try {
      const tool = tools.find((t) => t.name === "run-halmos");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Halmos");
    } finally {
      await cleanup();
    }
  });

  it("has required input schema with rootDir parameter", async () => {
    const { tools, cleanup } = await setupMcpTest();
    try {
      const tool = tools.find((t) => t.name === "run-halmos");
      const schema = tool?.inputSchema as { properties?: Record<string, unknown> };
      expect(schema.properties?.rootDir).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});

describe("executeHalmos", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "halmos-test-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns available: false when halmos binary is not found", async () => {
    mockExecFile((_args, cb) => {
      cb(createEnoentError("which: halmos not found"), "", "");
    });

    const result = await executeHalmos({ rootDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.available).toBe(false);
    expect(result.error).toContain("not installed");
  });

  it("returns error for invalid rootDir when binary is available", async () => {
    let callCount = 0;
    mockExecFile((_args, cb) => {
      callCount++;
      if (callCount === 1) {
        cb(null, "/usr/local/bin/halmos", "");
        return;
      }
      cb(null, "", "");
    });

    const result = await executeHalmos({ rootDir: "/nonexistent/path" });

    expect(result.success).toBe(false);
    expect(result.available).toBe(true);
    expect(result.error).toContain("ERROR: INVALID_PATH");
  });

  it("parses halmos output with counterexamples", async () => {
    let callCount = 0;
    mockExecFile((_args, cb) => {
      callCount++;
      if (callCount === 1) {
        cb(null, "/usr/local/bin/halmos", "");
        return;
      }
      const stdout = [
        "[PASS] check_balance(uint256)",
        "[FAIL] check_withdraw(uint256)",
        "Counterexample: x = 0xff",
        "elapsed: 1500 ms",
      ].join("\n");
      cb(null, stdout, "");
    });

    const result = await executeHalmos({ rootDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.available).toBe(true);
    expect(result.results).toBeDefined();
    expect(result.results!.properties_checked).toBe(2);
    expect(result.results!.counterexamples).toHaveLength(2);
    expect(result.results!.verification_time_ms).toBe(1500);
  });

  it("does not crash when binary not found", async () => {
    mockExecFile((_args, cb) => {
      cb(createEnoentError(), "", "");
    });

    const result = await executeHalmos({ rootDir: tempDir });

    expect(result).toBeDefined();
    expect(result.available).toBe(false);
  });
});

describe("Integration: run-halmos tool end-to-end", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "halmos-e2e-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns available: false through MCP when binary not found", async () => {
    mockExecFile((_args, cb) => {
      cb(createEnoentError(), "", "");
    });

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("run-halmos", { rootDir: tempDir });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.available).toBe(false);
      expect(parsed.success).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
