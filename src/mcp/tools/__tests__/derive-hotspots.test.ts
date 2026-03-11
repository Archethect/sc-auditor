/**
 * Tests for derive-hotspots MCP tool registration and integration.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../../server.js";
import { registerDeriveHotspotsTool } from "../derive-hotspots.js";

let tempDir: string;

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
  registerDeriveHotspotsTool(server);
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

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "derive-hotspots-tool-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("AC1: Tool registered with correct schema", () => {
  it("registers derive-hotspots tool on the server", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const tool = tools.find((t) => t.name === "derive-hotspots");
      expect(tool).toBeDefined();
      expect(tool?.description).toContain("hotspot");
    } finally {
      await cleanup();
    }
  });

  it("has required rootDir and optional mode in schema", async () => {
    const { tools, cleanup } = await setupMcpTest();

    try {
      const tool = tools.find((t) => t.name === "derive-hotspots");
      const schema = tool?.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
      expect(schema.properties?.rootDir).toBeDefined();
      expect(schema.properties?.mode).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});

describe("AC2: Happy path returns Hotspot[]", () => {
  it("returns hotspots for directory with Solidity files", async () => {
    fs.writeFileSync(
      path.join(tempDir, "Vault.sol"),
      `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Vault {
    mapping(address => uint256) public balances;

    function withdraw(uint256 amt) external {
        balances[msg.sender] -= amt;
        (bool ok, ) = msg.sender.call{value: amt}("");
    }
}
`,
    );

    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("derive-hotspots", { rootDir: tempDir });

      expect(result.isError).toBeFalsy();
      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(true);
      expect(Array.isArray(parsed.hotspots)).toBe(true);
    } finally {
      await cleanup();
    }
  });
});

describe("AC3: Failure path returns error", () => {
  it("returns error for non-existent directory", async () => {
    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("derive-hotspots", { rootDir: "/nonexistent/path" });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("ERROR:");
    } finally {
      await cleanup();
    }
  });

  it("returns error for directory with no Solidity files", async () => {
    const { callTool, cleanup } = await setupMcpTest();

    try {
      const result = await callTool("derive-hotspots", { rootDir: tempDir });

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("ERROR:");
    } finally {
      await cleanup();
    }
  });
});
