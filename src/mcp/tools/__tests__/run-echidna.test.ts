/**
 * Tests for run-echidna MCP tool registration and execution.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpServer } from "../../server.js";
import { executeEchidna, registerRunEchidnaTool } from "../run-echidna.js";
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
  registerRunEchidnaTool(server);
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

describe("run-echidna tool registration", () => {
  it("registers on the MCP server", async () => {
    const { tools, cleanup } = await setupMcpTest();
    try {
      const tool = tools.find((t) => t.name === "run-echidna");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("Echidna");
    } finally {
      await cleanup();
    }
  });

  it("has required input schema with rootDir parameter", async () => {
    const { tools, cleanup } = await setupMcpTest();
    try {
      const tool = tools.find((t) => t.name === "run-echidna");
      const schema = tool?.inputSchema as { properties?: Record<string, unknown> };
      expect(schema.properties?.rootDir).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});

describe("executeEchidna", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echidna-test-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns available: false when echidna binary is not found", async () => {
    // Mock 'which echidna' to fail (binary not found)
    mockExecFile((_args, cb) => {
      cb(createEnoentError("which: echidna not found"), "", "");
    });

    const result = await executeEchidna({ rootDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.available).toBe(false);
    expect(result.error).toContain("not installed");
  });

  it("returns error for invalid rootDir when binary is available", async () => {
    let callCount = 0;
    mockExecFile((_args, cb) => {
      callCount++;
      if (callCount === 1) {
        // 'which echidna' succeeds
        cb(null, "/usr/local/bin/echidna", "");
        return;
      }
      cb(null, "", "");
    });

    const result = await executeEchidna({ rootDir: "/nonexistent/path" });

    expect(result.success).toBe(false);
    expect(result.available).toBe(true);
    expect(result.error).toContain("ERROR: INVALID_PATH");
  });

  it("parses echidna output with counterexamples", async () => {
    let callCount = 0;
    mockExecFile((_args, cb) => {
      callCount++;
      if (callCount === 1) {
        // 'which echidna' succeeds
        cb(null, "/usr/local/bin/echidna", "");
        return;
      }
      // Echidna output with a counterexample
      const stdout = [
        "echidna_test_withdraw: failed",
        "Call sequence: withdraw(100)",
        "tests: 50000",
        "echidna_test_balance: passed",
      ].join("\n");
      cb(null, stdout, "");
    });

    const result = await executeEchidna({ rootDir: tempDir });

    expect(result.success).toBe(true);
    expect(result.available).toBe(true);
    expect(result.results).toBeDefined();
    expect(result.results!.tests_run).toBe(50000);
    expect(result.results!.tests_failed).toBe(1);
  });

  it("does not crash when binary not found", async () => {
    mockExecFile((_args, cb) => {
      cb(createEnoentError(), "", "");
    });

    const result = await executeEchidna({ rootDir: tempDir });

    // Should return a nonfatal response, not throw
    expect(result).toBeDefined();
    expect(result.available).toBe(false);
  });
});

describe("Integration: run-echidna tool end-to-end", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "echidna-e2e-"));
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
      const result = await callTool("run-echidna", { rootDir: tempDir });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.available).toBe(false);
      expect(parsed.success).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
